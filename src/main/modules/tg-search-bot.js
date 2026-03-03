/**
 * Telegram 搜索 Bot 模块
 * 功能：
 * 1. 响应 /search 指令，在频道内搜索 RJ 号对应的消息地址
 * 2. 若未找到，尝试从 Downloads/前置包.txt 查找
 * 3. 若都未找到，返回提示信息
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { ipcMain, app } from "electron";
import fs from "fs/promises";
import path from "path";
import { getConfig } from "./config";
import { normalizeError } from "../utils/errorHandler";
import { createLogSender } from "../utils/logger";

const logger = createLogSender("tg-search-bot");

// 全局状态
let telegramClient = null;
let isConnected = false;
let botRunning = false;

// 前置包消息地址
const PRESET_PACKAGE_URL = "https://t.me/kuruHaruga/17809";

// ==========================================
// 核心工具函数
// ==========================================

/**
 * 获取连接的客户端 (单例模式)
 */
async function getConnectedClient() {
  const config = await getConfig();
  const { apiId, apiHash, session } = config.tg;

  if (!apiId || !apiHash || !session) {
    throw new Error("TG 配置不完整，请在设置中检查。");
  }

  if (!isConnected || !telegramClient) {
    logger.info("正在初始化 Telegram 客户端连接...");
    telegramClient = new TelegramClient(
      new StringSession(session),
      Number(apiId),
      apiHash,
      {
        connectionRetries: 2,
        useWSS: false,
      },
    );
    telegramClient.setLogLevel("none");
    await telegramClient.connect();
    isConnected = true;
    logger.info("Telegram 客户端已连接");
  }
  return telegramClient;
}

/**
 * 解析 Entity (群组/频道对象)
 */
async function resolveEntity(_client, chatIdInput) {
  let peerId = chatIdInput;

  if (typeof chatIdInput === "string" || typeof chatIdInput === "number") {
    const cleanId = String(chatIdInput).trim();
    try {
      if (/^-?\d+$/.test(cleanId)) {
        peerId = BigInt(cleanId);
      }
    } catch {
      peerId = cleanId;
    }
  }

  try {
    return await telegramClient.getEntity(peerId);
  } catch {
    logger.warn(`本地缓存未找到 ID ${chatIdInput}，正在刷新对话列表...`);
  }

  try {
    await telegramClient.getDialogs({ limit: 100 });
    return await telegramClient.getEntity(peerId);
  } catch (e) {
    logger.error(`无法解析群组 ID: ${chatIdInput}`, e.message);
    throw new Error(`无法找到群组/频道 (ID: ${chatIdInput})。请确保配置正确。`);
  }
}

/**
 * 从字符串中提取 RJ 号
 */
function extractRJCode(str) {
  if (!str) return null;
  const match = str.match(/(RJ|VJ|BJ)\d{6,8}/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * 从消息中提取 RJ 号
 */
function extractRJCodeFromMessage(msg) {
  const text = msg.text || msg.caption || "";
  return extractRJCode(text);
}

// ==========================================
// 搜索功能实现
// ==========================================

/**
 * 在 Telegram 频道中搜索 RJ 号
 */
async function searchRJInTelegram(rjCode) {
  try {
    const config = await getConfig();
    const chatIdStr = config.tg.discussion || config.tg.channel;
    if (!chatIdStr) throw new Error("未配置讨论组或频道 ID");

    const client = await getConnectedClient();
    const entity = await resolveEntity(client, chatIdStr);

    logger.info(`正在频道中搜索 RJ 号: ${rjCode}`);

    // 搜索消息
    const messages = [];
    const iterator = client.iterMessages(entity, {
      limit: 2000, // 限制搜索范围，避免性能问题
    });

    for await (const msg of iterator) {
      if (!msg) continue;

      // 检查消息中是否包含目标 RJ 号
      const foundRJ = extractRJCodeFromMessage(msg);
      if (foundRJ && foundRJ.toUpperCase() === rjCode.toUpperCase()) {
        logger.info(`找到匹配的消息 ID: ${msg.id}`);
        return `https://t.me/kuruHaruga/${msg.id}`;
      }
    }

    logger.info(`在频道中未找到 RJ 号: ${rjCode}`);
    return null;
  } catch (error) {
    logger.error("在频道中搜索失败:", error.message);
    return null;
  }
}

/**
 * 从 Downloads/前置包.txt 中查找
 */
async function searchRJInPresetFile(rjCode) {
  try {
    const config = await getConfig();
    const presetFilePath = path.join(
      config.paths?.downloadsDir ||
        path.join(app.getPath("downloads"), "Downloads"),
      "前置包.txt",
    );

    logger.info(`正在前置包文件中搜索: ${presetFilePath}`);

    // 检查文件是否存在
    try {
      await fs.access(presetFilePath);
    } catch {
      logger.warn("前置包文件不存在");
      return null;
    }

    const content = await fs.readFile(presetFilePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    // 检查是否包含目标 RJ 号
    const normalizedRjCode = rjCode.toUpperCase();
    const found = lines.some((line) =>
      line.toUpperCase().includes(normalizedRjCode),
    );

    if (found) {
      logger.info(`在前置包中找到 RJ 号: ${rjCode}`);
      return PRESET_PACKAGE_URL;
    }

    logger.info(`在前置包中未找到 RJ 号: ${rjCode}`);
    return null;
  } catch (error) {
    logger.error("读取前置包文件失败:", error.message);
    return null;
  }
}

/**
 * 处理搜索请求
 */
export async function handleSearchRequest(rjCode) {
  logger.info(`收到搜索请求: ${rjCode}`);

  // 规范化 RJ 号格式
  const normalizedRj = rjCode.toUpperCase().replace(/[^RJ0-9]/g, "");

  // 1. 首先在 Telegram 频道中搜索
  const telegramResult = await searchRJInTelegram(normalizedRj);
  if (telegramResult) {
    return {
      success: true,
      url: telegramResult,
      message: `找到 RJ 号: ${normalizedRj}`,
    };
  }

  // 2. 然后在前置包文件中查找
  const presetResult = await searchRJInPresetFile(normalizedRj);
  if (presetResult) {
    return {
      success: true,
      url: presetResult,
      message: `找到 RJ 号: ${normalizedRj}\n请下载前置包`,
    };
  }

  // 3. 都未找到
  return {
    success: false,
    message: `暂未找到 RJ 号: ${normalizedRj}\n请尝试查看 one 站是否拥有或者在评论区留言`,
  };
}

// ==========================================
// Bot 启动和管理
// ==========================================

/**
 * 启动 Bot
 */
export async function startBot() {
  if (botRunning) {
    logger.info("Bot 已经在运行中");
    return { success: true, message: "Bot 已经在运行中" };
  }

  try {
    // 确保客户端连接
    await getConnectedClient();
    botRunning = true;
    logger.info("Bot 启动成功");
    return { success: true, message: "Bot 启动成功" };
  } catch (error) {
    logger.error("Bot 启动失败:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 停止 Bot
 */
export async function stopBot() {
  if (!botRunning) {
    logger.info("Bot 已经停止");
    return { success: true, message: "Bot 已经停止" };
  }

  try {
    // 这里可以添加停止 Bot 的逻辑
    botRunning = false;
    logger.info("Bot 停止成功");
    return { success: true, message: "Bot 停止成功" };
  } catch (error) {
    logger.error("Bot 停止失败:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 检查 Bot 运行状态
 */
export function getBotStatus() {
  return {
    running: botRunning,
    connected: isConnected,
  };
}

// ==========================================
// IPC 通信注册
// ==========================================

export function setupTgSearchBotIPC() {
  logger.info("[tg-search-bot] 正在初始化 IPC 处理器...");

  const handlers = [
    "tg-bot-search",
    "tg-bot-start",
    "tg-bot-stop",
    "tg-bot-status",
  ];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略错误
    }
  }

  // 处理搜索请求
  ipcMain.handle("tg-bot-search", async (event, rjCode) => {
    logger.info(`IPC: 收到搜索请求 - ${rjCode}`);
    return await handleSearchRequest(rjCode);
  });

  // 启动 Bot
  ipcMain.handle("tg-bot-start", async () => {
    logger.info("IPC: 启动 Bot 请求");
    return await startBot();
  });

  // 停止 Bot
  ipcMain.handle("tg-bot-stop", async () => {
    logger.info("IPC: 停止 Bot 请求");
    return await stopBot();
  });

  // 获取 Bot 状态
  ipcMain.handle("tg-bot-status", async () => {
    logger.info("IPC: 获取 Bot 状态请求");
    return getBotStatus();
  });

  logger.info("[tg-search-bot] 所有 IPC 处理器注册完成!");
}
