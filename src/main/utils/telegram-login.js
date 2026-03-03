/**
 * Telegram 模块全量代码 - 串行稳定版
 * 功能：登录、自动连接、状态检查、串行上传（确保视觉连续性）
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
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

/**
 * 获取或初始化 Client
 */
async function getOrInitClient(sessionStr = "") {
    if (client && client.connected) return client;

    const cfg = getConfig();
    const session = new StringSession(sessionStr || cfg.tg.session || "");
    
    client = new TelegramClient(session, Number(cfg.tg.apiId), cfg.tg.apiHash, {
        connectionRetries: 10,
        retryDelay: 3000,
        autoReconnect: true,
        useWSS: false,
        deviceModel: "KuruHaru_Uploader",
        receiveUpdates: false, // 禁用更新流，减少流量和超时报错
    });

    return client;
}

/**
 * 自动重连逻辑
 */
export async function tryAutoConnect() {
    try {
        const cfg = getConfig();
        if (!cfg.tg.session || !cfg.tg.apiId) return { connected: false };

        const tgClient = await getOrInitClient(cfg.tg.session);
        if (!tgClient.connected) {
            await tgClient.connect();
        }
        
        const isAuthorized = await tgClient.isUserAuthorized();
        currentState = isAuthorized ? "connected" : "auth_failed";
        return { connected: isAuthorized };
    } catch (error) {
        logger.error("AutoConnect 失败:", error);
        currentState = "auth_failed";
        return { connected: false };
    }
}

/**
 * 单个文件串行处理核心
 */
async function processSerialUpload(file, channelId, index, total, event) {
    const fileName = path.basename(file.path);
    const filenameNoExt = path.parse(fileName).name;
    const checkCancel = () => { if (uploadCancelled) throw new Error("CANCELLED"); };

    // 1. 发送索引标题
    checkCancel();
    const txtMsg = await client.sendMessage(channelId, { message: filenameNoExt });

    // 2. 关键等待：给 Bot 反应时间，确保视觉连续 (3.5秒)
    await new Promise(r => setTimeout(r, 3500));

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
                        event.sender.send("log-update", { type: "tg", msg: `[${index + 1}/${total}] ${filenameNoExt}: ${pct}%` });
                    }
                }
            });
            return true;
        } catch (e) {
            if (e.message.includes("MSG_ID_INVALID")) {
                retryCount++;
                await new Promise(r => setTimeout(r, 4000));
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
        connected: !!(client && client.connected)
    }));

    ipcMain.handle("tg-login", async (event) => {
        const cfg = getConfig();
        if (isLogining) return { success: false, error: "正在登录中" };
        isLogining = true;
        try {
            if (client) await client.disconnect().catch(() => {});
            client = await getOrInitClient("");
            await client.connect();

            const createAuthCallback = (type) => new Promise((resolve, reject) => {
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
                phoneNumber: cfg.tg.phone,
                phoneCode: () => createAuthCallback("Code"),
                password: () => createAuthCallback("Password"),
            });

            const sessionStr = client.session.save();
            saveConfig({ tg: { ...cfg.tg, session: sessionStr }, paths: cfg.paths });
            currentState = "connected";
            return { success: true, session: sessionStr };
        } catch (error) {
            currentState = error.message === "USER_CANCEL" ? "cancelled" : "auth_failed";
            return { success: false, error: error.message };
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
        uploadCancelled = false;
        let successCount = 0;
        let failCount = 0;

        try {
            if (!client || !client.connected) await tryAutoConnect();
            event.sender.send("log-update", { type: "tg", msg: "🚀 开始串行上传模式..." });

            const peerId = (typeof channelId === "string" && channelId.startsWith("-100")) 
                           ? BigInt(channelId) : channelId;

            // 串行循环
            for (let i = 0; i < files.length; i++) {
                if (uploadCancelled) break;
                try {
                    await processSerialUpload(files[i], peerId, i, files.length, event);
                    successCount++;
                    event.sender.send("log-update", { type: "tg", msg: `✅ 已完成 [${i+1}/${files.length}]` });
                    await new Promise(r => setTimeout(r, 1000)); // 呼吸间隔
                } catch (err) {
                    if (err.message === "CANCELLED") throw err;
                    failCount++;
                    event.sender.send("log-update", { type: "tg", msg: `❌ 失败: ${path.basename(files[i].path)} | ${err.message}` });
                }
            }

            event.sender.send("log-update", { 
                type: "tg", 
                msg: uploadCancelled ? "🛑 任务已手动中断" : `🎉 全部完成 | 成功: ${successCount} | 失败: ${failCount}` 
            });

        } catch (globalErr) {
            const msg = globalErr.message === "CANCELLED" ? "🛑 已停止后续任务" : `🚨 严重异常: ${globalErr.message}`;
            event.sender.send("log-update", { type: "tg", msg });
        } finally {
            uploadCancelled = false;
        }
    });
}