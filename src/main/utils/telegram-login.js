/**
 * Telegram 模块全量代码 - 串行稳定版
 * 功能：登录、自动连接、状态检查、串行上传（确保视觉连续性）
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createSilentGramJsLogger } from "./gramjs-logger";
import { ipcMain } from "electron";
import path from "path";
import { getConfig, saveConfig } from "../modules/config";

// --- 全局状态 ---
let client = null;
let uploadCancelled = false;
let currentState = "disconnected";
let isLogining = false;
let currentAuthReject = null;

const logger = {
  info: (...args) => console.info("[TG-INFO]", ...args),
  error: (...args) => console.error("[TG-ERROR]", ...args),
};

const AUTH_KEY_DUPLICATED_PATTERN = /(AUTH_KEY_DUPLICATED|AUTHKEYDUPLICATED)/i;

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.errorMessage) return String(error.errorMessage);
  if (error?.message) return String(error.message);
  return String(error || "Unknown Error");
}

function isAuthKeyDuplicatedError(error) {
  return AUTH_KEY_DUPLICATED_PATTERN.test(getErrorMessage(error));
}

async function disposeClient(reason = "") {
  if (!client) return;

  try {
    await client.disconnect();
  } catch (disconnectError) {
    logger.error(
      `disconnect 失败${reason ? ` (${reason})` : ""}:`,
      getErrorMessage(disconnectError),
    );
  }

  try {
    const transport = client?._sender?._transport;
    if (transport && typeof transport.destroy === "function") {
      transport.destroy();
    }
  } catch (destroyError) {
    logger.error(
      `transport 销毁失败${reason ? ` (${reason})` : ""}:`,
      getErrorMessage(destroyError),
    );
  }

  client = null;
}

async function resetSessionAfterDupAuthKey(reason = "") {
  const cfg = getConfig();
  const didSave = await saveConfig({
    tg: { ...cfg.tg, session: "" },
    paths: cfg.paths,
  });

  if (didSave) {
    logger.info(
      `检测到 AUTH_KEY_DUPLICATED，已清空本地 session${reason ? ` (${reason})` : ""}`,
    );
  } else {
    logger.error(
      `检测到 AUTH_KEY_DUPLICATED，但 session 清理失败${reason ? ` (${reason})` : ""}`,
    );
  }

  await disposeClient("auth-key-duplicated");
  return didSave;
}

async function handleAuthKeyDuplicated(error, reason = "") {
  if (!isAuthKeyDuplicatedError(error)) return false;
  await resetSessionAfterDupAuthKey(reason);
  return true;
}

async function isClientAuthorized(tgClient) {
  if (!tgClient || !tgClient.connected) {
    return false;
  }

  try {
    return Boolean(await tgClient.isUserAuthorized());
  } catch {
    return false;
  }
}

/**
 * 获取或初始化 Client
 */
async function getOrInitClient(options = {}) {
  const {
    sessionStr,
    allowStoredSessionFallback = true,
    forceRecreate = false,
    tgConfig = null,
  } = options;

  if (client && client.connected) return client;

  if (forceRecreate && client) {
    await disposeClient("force-recreate");
  }

  const cfg = getConfig();
  const resolvedTgConfig = {
    ...(cfg.tg || {}),
    ...(tgConfig || {}),
  };

  const resolvedSession =
    typeof sessionStr === "string"
      ? sessionStr
      : allowStoredSessionFallback
        ? resolvedTgConfig.session || ""
        : "";

  if (!resolvedTgConfig.apiId || !resolvedTgConfig.apiHash) {
    throw new Error("TG 配置不完整，请先填写 apiId/apiHash");
  }

  const session = new StringSession(resolvedSession);

  client = new TelegramClient(
    session,
    Number(resolvedTgConfig.apiId),
    resolvedTgConfig.apiHash,
    {
      connectionRetries: 10,
      retryDelay: 3000,
      autoReconnect: true,
      useWSS: false,
      deviceModel: "KuruHaru_Uploader",
      receiveUpdates: false, // 禁用更新流，减少流量和超时报错
      baseLogger: createSilentGramJsLogger(),
    },
  );

  return client;
}

/**
 * 自动重连逻辑
 */
export async function tryAutoConnect() {
  try {
    if (isLogining) {
      return { connected: false, pendingLogin: true };
    }

    const cfg = getConfig();
    if (!cfg.tg.session || !cfg.tg.apiId) return { connected: false };

    const tgClient = await getOrInitClient({
      sessionStr: cfg.tg.session,
      allowStoredSessionFallback: true,
    });
    if (!tgClient.connected) {
      await tgClient.connect();
    }

    const isAuthorized = await tgClient.isUserAuthorized();
    currentState = isAuthorized ? "connected" : "auth_failed";
    return { connected: isAuthorized };
  } catch (error) {
    const duplicated = await handleAuthKeyDuplicated(error, "tryAutoConnect");
    if (duplicated) {
      currentState = "disconnected";
      return {
        connected: false,
        requiresRelogin: true,
        code: "AUTH_KEY_DUPLICATED",
      };
    }

    logger.error("AutoConnect 失败:", error);
    currentState = "auth_failed";
    return { connected: false };
  }
}

export function getConnectedTelegramClient() {
  if (!client || !client.connected) {
    return null;
  }

  return client;
}

export async function requireConnectedTelegramClient() {
  const currentClient = getConnectedTelegramClient();
  if (await isClientAuthorized(currentClient)) {
    return currentClient;
  }

  const autoConnectResult = await tryAutoConnect();
  const connectedClient = getConnectedTelegramClient();
  if (
    autoConnectResult.connected &&
    (await isClientAuthorized(connectedClient))
  ) {
    return connectedClient;
  }

  if (autoConnectResult.pendingLogin) {
    throw new Error("Telegram 正在登录中，请稍后重试");
  }

  if (autoConnectResult.requiresRelogin) {
    throw new Error("会话冲突已重置，请先重新登录 Telegram");
  }

  throw new Error("Telegram 未连接，请先登录");
}

/**
 * 单个文件串行处理核心
 */
async function processSerialUpload(file, channelId, index, total, event) {
  const fileName = path.basename(file.path);
  const filenameNoExt = path.parse(fileName).name;
  const checkCancel = () => {
    if (uploadCancelled) throw new Error("CANCELLED");
  };

  // 1. 发送索引标题
  checkCancel();
  const txtMsg = await client.sendMessage(channelId, {
    message: filenameNoExt,
  });

  // 2. 关键等待：给 Bot 反应时间，确保视觉连续 (3.5秒)
  await new Promise((r) => setTimeout(r, 3500));

  // 3. 上传文件
  let retryCount = 0;
  while (retryCount < 3) {
    checkCancel();
    try {
      await client.sendFile(channelId, {
        file: file.path,
        forceDocument: true,
        commentTo: txtMsg.id,
        progressCallback: (p) => {
          checkCancel();
          const pct = Math.round(p * 100);
          if (pct % 50 === 0) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `[${index + 1}/${total}] ${filenameNoExt}: ${pct}%`,
            });
          }
        },
      });
      return true;
    } catch (e) {
      if (e.message.includes("MSG_ID_INVALID")) {
        retryCount++;
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      throw e;
    }
  }
}

/**
 * IPC 注册中心 (在一个 setup 函数里搞定所有监听)
 */
export function setupTelegramIPC() {
  // --- 1. 状态与登录监听 ---
  ipcMain.handle("tg-check-login", async () => {
    const result = await tryAutoConnect();
    return result.connected;
  });

  ipcMain.handle("tg-get-status", () => ({
    state: currentState,
    connected: !!(client && client.connected),
  }));

  ipcMain.handle("tg-login", async (event, payload = {}) => {
    const cfg = getConfig();
    if (isLogining) return { success: false, error: "正在登录中" };

    const nextTgConfig = {
      ...(cfg.tg || {}),
      ...(payload || {}),
    };

    if (!nextTgConfig.apiId || !nextTgConfig.apiHash || !nextTgConfig.phone) {
      return {
        success: false,
        error: "请先填写 Telegram API ID / API Hash / 手机号",
      };
    }

    isLogining = true;
    try {
      await disposeClient("tg-login-start");
      client = await getOrInitClient({
        sessionStr: "",
        allowStoredSessionFallback: false,
        forceRecreate: true,
        tgConfig: nextTgConfig,
      });
      await client.connect();

      const createAuthCallback = (type) =>
        new Promise((resolve, reject) => {
          currentAuthReject = reject;
          const handleReply = (_, result) => {
            ipcMain.removeListener("tg-auth-reply", handleReply);
            if (result?.cancel) reject(new Error("USER_CANCEL"));
            else resolve(result.code);
          };
          ipcMain.once("tg-auth-reply", handleReply);
          event.sender.send("tg-auth-needed", { type, timeout: 180000 });
        });

      await client.start({
        phoneNumber: nextTgConfig.phone,
        phoneCode: () => createAuthCallback("Code"),
        password: () => createAuthCallback("Password"),
      });

      const sessionStr = client.session.save();
      await saveConfig({
        tg: { ...nextTgConfig, session: sessionStr },
        paths: cfg.paths,
      });
      currentState = "connected";
      return { success: true, session: sessionStr };
    } catch (error) {
      const duplicated = await handleAuthKeyDuplicated(error, "tg-login");
      if (duplicated) {
        currentState = "disconnected";
        return {
          success: false,
          code: "AUTH_KEY_DUPLICATED",
          requiresRelogin: true,
          error:
            "检测到 Telegram 会话冲突（AUTH_KEY_DUPLICATED），已自动清空本地 session。请重新登录。",
        };
      }

      await disposeClient("tg-login-failed");
      const errorMessage = getErrorMessage(error);
      currentState =
        errorMessage === "USER_CANCEL" ? "cancelled" : "auth_failed";
      return { success: false, error: errorMessage };
    } finally {
      isLogining = false;
      currentAuthReject = null;
    }
  });

  ipcMain.handle("tg-cancel-auth", () => {
    if (currentAuthReject) currentAuthReject(new Error("USER_CANCEL"));
    return { success: true };
  });

  // --- 2. 上传与控制监听 ---
  ipcMain.handle("tg-cancel-upload", () => {
    uploadCancelled = true;
    return { success: true };
  });

  ipcMain.on("tg-upload-files", async (event, { files, channelId }) => {
    const uploadFiles = Array.isArray(files) ? files : [];
    const totalFiles = uploadFiles.length;
    uploadCancelled = false;
    let successCount = 0;
    let failCount = 0;

    try {
      if (!client || !client.connected) {
        const autoConnectResult = await tryAutoConnect();
        if (!autoConnectResult.connected || !client || !client.connected) {
          throw new Error(
            autoConnectResult.requiresRelogin
              ? "会话冲突已重置，请先重新登录 Telegram"
              : "Telegram 未连接，请先登录",
          );
        }
      }
      event.sender.send("log-update", {
        type: "tg",
        msg: "🚀 开始串行上传模式...",
      });

      const peerId =
        typeof channelId === "string" && channelId.startsWith("-100")
          ? BigInt(channelId)
          : channelId;

      // 串行循环
      for (let i = 0; i < totalFiles; i++) {
        if (uploadCancelled) break;
        try {
          await processSerialUpload(
            uploadFiles[i],
            peerId,
            i,
            totalFiles,
            event,
          );
          successCount++;
          event.sender.send("log-update", {
            type: "tg",
            msg: `✅ 已完成 [${i + 1}/${totalFiles}]`,
          });
          await new Promise((r) => setTimeout(r, 1000)); // 呼吸间隔
        } catch (err) {
          if (err.message === "CANCELLED") throw err;
          failCount++;
          event.sender.send("log-update", {
            type: "tg",
            msg: `❌ 失败: ${path.basename(uploadFiles[i].path)} | ${err.message}`,
          });
        }
      }

      event.sender.send("log-update", {
        type: "tg",
        msg: uploadCancelled
          ? "🛑 任务已手动中断"
          : `🎉 全部完成 | 成功: ${successCount} | 失败: ${failCount}`,
      });
    } catch (globalErr) {
      const msg =
        globalErr.message === "CANCELLED"
          ? "🛑 已停止后续任务"
          : `🚨 严重异常: ${globalErr.message}`;
      event.sender.send("log-update", { type: "tg", msg });
    } finally {
      event.sender.send("tg-upload-finished", {
        success: !uploadCancelled && failCount === 0,
        cancelled: uploadCancelled,
        successCount,
        failCount,
        total: totalFiles,
      });
      uploadCancelled = false;
    }
  });
}
