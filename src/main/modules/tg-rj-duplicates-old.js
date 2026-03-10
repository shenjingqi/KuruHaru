/**
 * RJ重复检测与清理模块
 * 功能：扫描Telegram频道内重复的RJ号以及对应的bot发出的RJ重复封面消息
 * 支持扫描参数配置、结果展示、重复删除等功能
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createSilentGramJsLogger } from "../utils/gramjs-logger";
import { ipcMain } from "electron";
import { getConfig } from "./config";

// 日志工具
import { createLogSender } from "../utils/logger";
const logger = createLogSender("tg-rj-duplicates");

// 全局状态
let telegramClient = null;
let isConnected = false;

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
    logger.debug("正在初始化 Telegram 客户端连接...");
    telegramClient = new TelegramClient(
      new StringSession(session),
      Number(apiId),
      apiHash,
      {
        connectionRetries: 2,
        useWSS: false,
        baseLogger: createSilentGramJsLogger(),
      },
    );
    telegramClient.setLogLevel("none");
    await telegramClient.connect();
    isConnected = true;
    logger.debug("Telegram 客户端已连接");
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
    throw new Error(
      `无法找到群组/频道 (ID: ${chatIdInput})。请确保机器人已加入该群组且配置正确。`,
    );
  }
}

/**
 * 从消息中提取 RJ 号
 */
function extractRJCode(str) {
  if (!str) return null;
  const match = str.match(/(RJ|VJ|BJ)\d{6,8}/i);
  return match ? match[0].toUpperCase() : null;
}

function extractRJCodeFromMessage(msg) {
  const text = msg.text || msg.caption || "";
  return extractRJCode(text);
}

/**
 * 获取消息类型
 */
function getMessageType(msg) {
  if (msg.document) {
    return "file";
  }

  if (
    msg.text &&
    (msg.text.includes("重复封面") ||
      msg.text.includes("RJ封面") ||
      msg.text.includes("封面技能"))
  ) {
    return "cover";
  }

  return "other";
}

// ==========================================
// 核心业务逻辑
// ==========================================

/**
 * 扫描频道中的重复 RJ 号
 */
async function scanRjDuplicates(options) {
  try {
    const config = await getConfig();
    const chatIdStr = config.tg.discussion || config.tg.channel;
    if (!chatIdStr) throw new Error("未配置讨论组或频道 ID");

    const telegramClient = await getConnectedClient();
    const entity = await resolveEntity(telegramClient, chatIdStr);

    logger.info(`开始扫描最近 ${options.limit} 条消息中的重复 RJ 号`);

    const messages = [];
    const iterator = telegramClient.iterMessages(entity, {
      limit: options.limit,
    });

    for await (const msg of iterator) {
      if (!msg) continue;
      messages.push(msg);
    }

    logger.info(`成功获取 ${messages.length} 条消息，开始分析重复 RJ 号...`);

    // 从消息中提取RJ号并分组
    const messagesWithRJ = messages
      .map((msg) => ({
        rjCode: extractRJCodeFromMessage(msg),
        messageId: msg.id,
        date: new Date(msg.date * 1000),
        type: getMessageType(msg),
      }))
      .filter((msg) => msg.rjCode);

    const rjGroups = {};
    messagesWithRJ.forEach((msg) => {
      if (!rjGroups[msg.rjCode]) {
        rjGroups[msg.rjCode] = [];
      }
      rjGroups[msg.rjCode].push(msg);
    });

    // 找到重复的RJ号组
    const duplicateGroups = Object.values(rjGroups).filter(
      (group) => group.length > 1,
    );

    logger.info(`找到 ${duplicateGroups.length} 个重复RJ号组`);

    // 确定保留和删除的消息
    const duplicates = [];
    let messagesToDelete = 0;

    duplicateGroups.forEach((group) => {
      // 按时间降序排序（最新的在前）
      const sortedGroup = group.sort((a, b) => b.date - a.date);

      // 第一条为保留，其余为删除
      sortedGroup.forEach((msg, index) => {
        duplicates.push({
          ...msg,
          status: index === 0 ? "keep" : "delete",
          date: msg.date.toISOString(),
        });

        if (index > 0) {
          messagesToDelete++;
        }
      });
    });

    logger.info(
      `扫描完成，共找到 ${duplicates.length} 条重复消息，其中 ${messagesToDelete} 条需要删除`,
    );

    return {
      success: true,
      duplicates,
      statistics: {
        totalScanned: messages.length,
        duplicateRJs: duplicateGroups.length,
        messagesToDelete,
        deletedCount: 0,
      },
    };
  } catch (error) {
    logger.error("扫描失败:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 删除指定的重复消息
 */
async function deleteDuplicateMessages(messageIds) {
  try {
    const config = await getConfig();
    const chatIdStr = config.tg.discussion || config.tg.channel;
    if (!chatIdStr) throw new Error("未配置讨论组或频道 ID");

    const telegramClient = await getConnectedClient();
    const entity = await resolveEntity(telegramClient, chatIdStr);

    logger.info(`开始删除 ${messageIds.length} 条重复消息`);

    let deletedCount = 0;
    const errors = [];

    for (const messageId of messageIds) {
      try {
        await telegramClient.deleteMessages(entity, [messageId]);
        deletedCount++;
        logger.info(`成功删除消息 ID: ${messageId}`);
      } catch (error) {
        logger.error(`删除消息 ID ${messageId} 失败:`, error.message);
        errors.push({
          messageId,
          error: error.message,
        });
      }
    }

    logger.info(
      `删除操作完成，成功删除 ${deletedCount} 条消息，失败 ${errors.length} 条`,
    );

    return {
      success: true,
      deletedCount,
      errors,
    };
  } catch (error) {
    logger.error("删除操作失败:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==========================================
// IPC 通信注册
// ==========================================

export function setupRjDuplicatesIPC() {
  logger.debug("[tg-rj-duplicates] initializing IPC handlers...");

  const handlers = ["tg-scan-rj-duplicates", "tg-delete-duplicate-messages"];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // 忽略错误
    }
  }

  // 扫描重复 RJ 号
  ipcMain.handle("tg-scan-rj-duplicates", async (event, options) => {
    logger.debug("IPC: tg-scan-rj-duplicates");
    return await scanRjDuplicates(options);
  });

  // 删除重复消息
  ipcMain.handle("tg-delete-duplicate-messages", async (event, messageIds) => {
    logger.debug(
      `IPC: tg-delete-duplicate-messages - 删除 ${messageIds.length} 条消息`,
    );
    return await deleteDuplicateMessages(messageIds);
  });

  logger.debug("[tg-rj-duplicates] IPC handlers registered");
}
