/**
 * Telegram 登录工具
 * 提供标准化的 Telegram 登录流程和状态管理
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { ipcMain } from "electron";
import path from "path";
import { getConfig, saveConfig } from "../modules/config";
import { normalizeError } from "./errorHandler";

// 创建完整的logger对象，兼容Telegram库所需的所有方法
const logger = {
  // 基础日志方法
  debug: (...args) => console.debug("[telegram:debug]", ...args),
  info: (...args) => console.info("[telegram:info]", ...args),
  warn: (...args) => console.warn("[telegram:warn]", ...args),
  error: (...args) => console.error("[telegram:error]", ...args),

  // Telegram库可能需要的方法
  canSend: () => true,
  canReceive: () => true,
  connection: {
    debug: (...args) => console.debug("[telegram:connection:debug]", ...args),
    info: (...args) => console.info("[telegram:connection:info]", ...args),
    warn: (...args) => console.warn("[telegram:connection:warn]", ...args),
    error: (...args) => console.error("[telegram:connection:error]", ...args),
  },
};

/**
 * 登录状态枚举
 */
export const LOGIN_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  AUTHENTICATING: "authenticating",
  CONNECTED: "connected",
  AUTH_FAILED: "auth_failed",
  CANCELLED: "cancelled",
};

let client = null;
let currentState = LOGIN_STATE.DISCONNECTED;
// 用于防止重复触发登录
let isLogining = false;
// 保存当前的 reject 句柄用于手动取消
let currentAuthReject = null;

/**
 * 尝试自动重连
 * @returns {Promise<{connected: boolean, reason?: string}>}
 */
export async function tryAutoConnect() {
  try {
    const cfg = getConfig();
    // 检查 Session 字符串是否存在（注意：仅有 Session 字符串不代表有效，需验证）
    if (!cfg.tg.session || !cfg.tg.apiId || !cfg.tg.apiHash) {
      return { connected: false, reason: "missing_credentials" };
    }

    // 防止在正在手动登录时触发自动重连
    if (isLogining) {
      return { connected: false, reason: "login_in_progress" };
    }

    currentState = LOGIN_STATE.CONNECTING;
    notifyStatusChange();

    // 如果之前的 client 还在，先断开
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        /* ignore */
      }
    }

    client = new TelegramClient(
      new StringSession(cfg.tg.session),
      Number(cfg.tg.apiId),
      cfg.tg.apiHash,
      {
        connectionRetries: 2,
        useWSS: false,
        deviceModel: "KuruHaru",
        // 提供完整的baseLogger，兼容Telegram库所需的所有方法
        baseLogger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          log: () => {},
          canSend: () => true,
          canReceive: () => true,
        },
      },
    );

    // 连接 Socket
    await client.connect();

    // FIXME: 2. 关键修复 - connect() 成功只代表网络通了，不代表 Session 有效
    const isAuthorized = await client.isUserAuthorized();

    if (!isAuthorized) {
      logger.warn("Auto-connect: Session invalid or expired");
      // Session 失效，清理掉配置防止死循环，或者让用户重新登录
      currentState = LOGIN_STATE.AUTH_FAILED;
      notifyStatusChange();
      return { connected: false, reason: "session_invalid" };
    }

    currentState = LOGIN_STATE.CONNECTED;
    notifyStatusChange();
    logger.info("自动重连成功");

    return { connected: true };
  } catch (error) {
    const normalized = normalizeError(error);
    logger.error("Auto-connect failed:", normalized.error.message);

    currentState = LOGIN_STATE.AUTH_FAILED;
    notifyStatusChange();

    return {
      connected: false,
      reason: normalized.error.code,
      error: normalized,
    };
  }
}

/**
 * 发起登录流程
 * @param {Object} sender - IPC sender
 * @returns {Promise<{success: boolean, session?: string, error?: Object}>}
 */
export async function startLogin(sender) {
  const cfg = getConfig();

  // 锁检查
  if (isLogining) {
    return { success: false, error: { message: "Login already in progress" } };
  }

  // 前端验证
  if (!cfg.tg.apiId || !cfg.tg.apiHash || !cfg.tg.phone) {
    return {
      success: false,
      error: { message: "Missing credentials" },
    };
  }

  isLogining = true;

  try {
    // 彻底断开旧连接
    if (client) {
      await client.disconnect();
      client = null;
    }

    currentState = LOGIN_STATE.AUTHENTICATING;
    notifyStatusChange();

    logger.info(`开始登录流程: Phone=${cfg.tg.phone}, API_ID=${cfg.tg.apiId}`);

    client = new TelegramClient(
      new StringSession(""), // 新登录必须用空 Session
      Number(cfg.tg.apiId),
      cfg.tg.apiHash,
      {
        connectionRetries: 5,
        useWSS: false,
        deviceModel: "KuruHaru",
        // 提供完整的baseLogger，兼容Telegram库所需的所有方法
        baseLogger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          log: () => {},
          canSend: () => true,
          canReceive: () => true,
        },
      },
    );

    /**
     * FIXME: 3. 重构验证回调生成器
     * 修复了 IPC 监听器无法移除导致的内存泄漏问题
     */
    const createAuthCallback = (type) => {
      return new Promise((resolve, reject) => {
        // 保存 reject 句柄供 cancelAuth 使用
        currentAuthReject = reject;

        // 设置超时 (3分钟)
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error("TIMEOUT"));
        }, 180000);

        // 定义监听处理函数
        const handleReply = (_, result) => {
          // 收到消息后立即清理监听器和定时器
          cleanup();

          logger.info(`收到验证回复 [${type}]:`, result);

          if (result?.cancel) {
            reject(new Error("USER_CANCEL"));
          } else if (result?.code) {
            resolve(result.code);
          } else {
            reject(new Error("INVALID_INPUT"));
          }
        };

        // 清理函数
        const cleanup = () => {
          clearTimeout(timeoutId);
          ipcMain.removeListener("tg-auth-reply", handleReply); // 移除监听
          currentAuthReject = null;
        };

        // 注册监听
        ipcMain.once("tg-auth-reply", handleReply);

        // 通知前端显示输入框
        sender.send("tg-auth-needed", {
          type,
          timeout: 180000,
        });
      });
    };

    // 执行 GramJS 的交互式登录
    await client.start({
      phoneNumber: cfg.tg.phone,
      phoneCode: () => createAuthCallback("Code"),
      password: (hint) => {
        logger.info(`需要两步验证密码 (Hint: ${hint})`);
        return createAuthCallback("Password");
      },
      onError: (err) => {
        // client.start 内部报错时触发，通常不需要 throw，
        // 除非是致命错误。GramJS 会自动重试部分错误。
        logger.error("GramJS Internal Error:", err);
      },
    });

    // 登录成功，保存 Session
    // 注意：必须包含现有 paths 配置，否则会覆盖用户设置的自定义路径
    const sessionStr = client.session.save();

    saveConfig({
      tg: {
        ...cfg.tg, // 保留原有配置
        session: sessionStr,
      },
      paths: cfg.paths, // 保留现有路径配置
    });

    currentState = LOGIN_STATE.CONNECTED;
    notifyStatusChange();
    logger.info("Telegram 登录成功并保存 Session");

    return { success: true, session: sessionStr };
  } catch (error) {
    // 错误处理
    const errorMsg = error?.message || "Unknown Error";

    // 如果是用户取消，不算系统错误
    if (errorMsg === "USER_CANCEL" || errorMsg.includes("CANCEL")) {
      logger.info("登录流程被用户取消");
      currentState = LOGIN_STATE.CANCELLED;
    } else {
      logger.error("登录流程发生异常:", error);
      currentState = LOGIN_STATE.AUTH_FAILED;
    }

    notifyStatusChange();

    // 登录失败，断开清理
    if (client) {
      await client.disconnect();
      // client = null // 可选：保留 client 实例以便重试，或者置空
    }

    return {
      success: false,
      error: { message: errorMsg, code: error?.code },
    };
  } finally {
    isLogining = false;
    currentAuthReject = null;
  }
}

/**
 * 取消当前认证流程
 */
export function cancelAuth() {
  if (currentAuthReject) {
    currentAuthReject(new Error("USER_CANCEL"));
    currentAuthReject = null;
    logger.info("触发手动取消登录");
  }
}

/**
 * 发送状态变更通知
 * (你需要确保在主进程初始化时正确设置了窗口发送机制)
 */
function notifyStatusChange() {
  // 示例：通过广播或者特定的 WebContents 发送
  // import { BrowserWindow } from 'electron'
  // BrowserWindow.getAllWindows().forEach(win => {
  //    win.webContents.send('tg-status-changed', { state: currentState, connected: isConnected() })
  // })
}

/**
 * 检查是否已连接
 */
export function isConnected() {
  // 必须同时满足 Socket 连接 + 用户已认证 + 状态标记正确
  return client && client.connected && currentState === LOGIN_STATE.CONNECTED;
}

/**
 * 获取当前连接状态
 */
export function getConnectionState() {
  return currentState;
}

/**
 * 设置 IPC 处理器
 */
export function setupTelegramIPC() {
  ipcMain.handle("tg-check-login", async () => {
    const result = await tryAutoConnect();
    return result.connected;
  });

  ipcMain.handle("tg-login", async (event) => {
    try {
      const result = await startLogin(event.sender);
      return result;
    } catch (error) {
      console.error("startLogin 异常:", error);
      return { success: false, error: { message: String(error) } };
    }
  });

  ipcMain.handle("tg-cancel-auth", () => {
    cancelAuth();
    return { success: true };
  });

  ipcMain.handle("tg-get-status", () => {
    return {
      state: currentState,
      connected: isConnected(),
    };
  });

  /**
   * 上传文件到 Telegram
   * 流程：发送 RJ 号，然后发送到该消息的评论区
   */
  ipcMain.on("tg-upload-files", async (event, { files, channelId }) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000;
    const UPLOAD_DELAY = 4000;
    const STEP_TIMEOUT = 30000; // 30秒超时

    // 带超时的操作
    const withTimeout = (promise, ms) => {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), ms),
        ),
      ]);
    };

    // 连接检查
    const checkConnection = async () => {
      if (!client) return false;
      if (!client.connected || currentState !== LOGIN_STATE.CONNECTED) {
        try {
          await client.connect();
          const isAuth = await client.isUserAuthorized();
          if (!isAuth) return false;
          currentState = LOGIN_STATE.CONNECTED;
          return true;
        } catch {
          return false;
        }
      }
      return true;
    };

    if (!(await checkConnection())) {
      event.sender.send("log-update", { type: "tg", msg: "❌ 未连接" });
      return;
    }

    event.sender.send("log-update", {
      type: "tg",
      msg: `🚀 开始上传 ${files.length} 个文件`,
    });

    // 解析频道 ID (如果是 -100 开头，转为整数)
    let peerId = channelId;
    if (typeof channelId === "string" && channelId.startsWith("-100")) {
      peerId = parseInt(channelId);
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = path.basename(file.path);
      const filenameNoExt = path.parse(fileName).name;

      let txtMsg = null;

      // ========== 步骤 1: 发送文字消息 ==========
      let step1Success = false;
      let step1Attempts = 0;
      while (!step1Success && step1Attempts < MAX_RETRIES) {
        step1Attempts++;
        try {
          if (!(await checkConnection())) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⚠️ 连接断开，重试 (${step1Attempts}/${MAX_RETRIES})`,
            });
            await new Promise((r) => setTimeout(r, RETRY_DELAY));
            continue;
          }

          event.sender.send("log-update", {
            type: "tg",
            msg: `✉️ ${i + 1}/${files.length} 发送索引: ${filenameNoExt}`,
          });
          event.sender.send("log-update", {
            type: "tg",
            msg: `⏳ 步骤1/2: 发送中...`,
          });

          txtMsg = await withTimeout(
            client.sendMessage(peerId, { message: filenameNoExt }),
            STEP_TIMEOUT,
          );

          event.sender.send("log-update", { type: "tg", msg: `✅ 步骤1完成` });
          step1Success = true;
        } catch (e) {
          if (e.message === "TIMEOUT") {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⏰ 步骤1超时 (${step1Attempts}/${MAX_RETRIES})`,
            });
          } else if (e.seconds) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⏳ 流控 ${e.seconds}s...`,
            });
            await new Promise((r) => setTimeout(r, e.seconds * 1000));
          } else {
            event.sender.send("log-update", {
              type: "tg",
              msg: `❌ 步骤1失败: ${e.message} (${step1Attempts}/${MAX_RETRIES})`,
            });
          }

          if (step1Attempts < MAX_RETRIES) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `💤 ${RETRY_DELAY / 1000}s 后重试...`,
            });
            await new Promise((r) => setTimeout(r, RETRY_DELAY));
          }
        }
      }

      if (!step1Success) {
        event.sender.send("log-update", {
          type: "tg",
          msg: `❌ 放弃: ${filenameNoExt}`,
        });
        failCount++;
        continue;
      }

      // 等待 2 秒确保 Telegram 服务器创建讨论线程
      await new Promise((r) => setTimeout(r, 2000));

      // ========== 步骤 2: 上传文件 ==========
      let step2Success = false;
      let step2Attempts = 0;
      while (!step2Success && step2Attempts < MAX_RETRIES) {
        step2Attempts++;
        try {
          if (!(await checkConnection())) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⚠️ 连接断开，重试 (${step2Attempts}/${MAX_RETRIES})`,
            });
            await new Promise((r) => setTimeout(r, RETRY_DELAY));
            continue;
          }

          event.sender.send("log-update", {
            type: "tg",
            msg: `⬆️ 步骤2/2: 上传文件: ${fileName}`,
          });

          await withTimeout(
            client.sendFile(peerId, {
              file: file.path,
              forceDocument: true,
              commentTo: txtMsg.id,
              progressCallback: (progress) => {
                const pct = Math.round(progress * 100);
                if (pct % 20 === 0 || pct === 100) {
                  event.sender.send("log-update", {
                    type: "tg",
                    msg: `[${filenameNoExt}] ${pct}%`,
                  });
                }
              },
            }),
            STEP_TIMEOUT,
          );

          event.sender.send("log-update", {
            type: "tg",
            msg: `✅ 完成: ${filenameNoExt}`,
          });
          step2Success = true;
          successCount++;
        } catch (e) {
          if (e.message === "TIMEOUT") {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⏰ 步骤2超时 (${step2Attempts}/${MAX_RETRIES})`,
            });
          } else if (e.seconds) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `⏳ 流控 ${e.seconds}s...`,
            });
            await new Promise((r) => setTimeout(r, e.seconds * 1000));
          } else {
            event.sender.send("log-update", {
              type: "tg",
              msg: `❌ 步骤2失败: ${e.message} (${step2Attempts}/${MAX_RETRIES})`,
            });
          }

          if (step2Attempts < MAX_RETRIES) {
            event.sender.send("log-update", {
              type: "tg",
              msg: `💤 ${RETRY_DELAY / 1000}s 后重试...`,
            });
            await new Promise((r) => setTimeout(r, RETRY_DELAY));
          }
        }
      }

      if (!step2Success) {
        event.sender.send("log-update", {
          type: "tg",
          msg: `❌ 放弃: ${filenameNoExt}`,
        });
        failCount++;
        // 失败后等待一下再继续
        if (i < files.length - 1) {
          event.sender.send("log-update", {
            type: "tg",
            msg: `💤 等待 ${UPLOAD_DELAY / 1000}s...`,
          });
          await new Promise((r) => setTimeout(r, UPLOAD_DELAY));
        }
      }

      // 成功完成不需要等待
    }

    event.sender.send("log-update", {
      type: "tg",
      msg: `🎉 全部完成: 成功 ${successCount}，失败 ${failCount}`,
    });
  });
}
