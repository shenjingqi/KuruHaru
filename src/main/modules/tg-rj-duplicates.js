/**
 * RJ重复检测与清理模块 V2
 * 功能：扫描Telegram频道内重复的RJ号以及对应的DLsite Info Bot发出的RJ封面消息
 * 支持扫描参数配置、结果展示、重复删除等功能
 *
 * 业务逻辑：
 * 1. 用户发送包含RJ号的消息
 * 2. DLsite Info Bot自动回复RJ封面
 * 3. 识别这种配对关系
 * 4. 对于重复的RJ号，保留最新的一对，标记旧的对为删除
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { ipcMain } from "electron";
import { getConfig } from "./config";

// 日志工具
import { createLogSender } from "../utils/logger";
const logger = createLogSender("tg-rj-duplicates");

// 全局状态
let telegramClient = null;
let isConnected = false;

// DLsite Info Bot 标识
const DLSITE_INFO_BOT = {
  username: "DLsite_Info_Bot",
  userId: BigInt("5870228865"), // 这是示例ID，需要根据实际情况调整
};

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
 * 识别发送者身份
 */
function identifySender(msg) {
  // 获取发送者信息
  const sender = msg.senderId || msg.fromId;
  const senderInfo = msg.sender || msg.from;
  const senderName =
    senderInfo?.username ||
    senderInfo?.firstName ||
    senderInfo?.title ||
    "Unknown";

  // 检查是否是 DLsite Info Bot
  // 可以通过 userId 或 username 来识别
  const senderIdBigInt =
    typeof sender === "bigint" ? sender : BigInt(sender?.value || sender);

  if (
    senderIdBigInt === DLSITE_INFO_BOT.userId ||
    senderName === DLSITE_INFO_BOT.username
  ) {
    return {
      type: "bot",
      botType: "dlsite-info",
      senderId: sender,
      name: senderName,
    };
  }

  // 检查是否是普通用户
  if (senderInfo?.isUser || (!senderInfo?.isBot && !senderInfo?.bot)) {
    return { type: "user", senderId: sender, name: senderName };
  }

  // 其他Bot
  if (senderInfo?.isBot || senderInfo?.bot) {
    return {
      type: "bot",
      botType: "other",
      senderId: sender,
      name: senderName,
    };
  }

  return { type: "unknown", senderId: sender, name: senderName };
}

// ==========================================
// 核心业务逻辑
// ==========================================

/**
 * 关联用户消息和Bot回复
 */
function associateUserBotMessages(messages) {
  // 首先识别所有消息的发送者
  const identifiedMessages = messages.map((msg) => ({
    ...msg,
    senderInfo: identifySender(msg),
    extractedRJ: extractRJCodeFromMessage(msg),
  }));

  // 按时间排序
  const sortedMessages = identifiedMessages.sort((a, b) => a.date - b.date);

  const pairs = [];
  const usedBotMessages = new Set();
  const usedUserMessages = new Set();

  // 第一轮：直接 reply_to 关联
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== "user") continue;
    if (usedUserMessages.has(msg.id)) continue;

    // 查找这个用户消息的 Bot 回复
    // 策略1: 查找 reply_to 指向此消息的消息
    const botReply = sortedMessages.find(
      (m) =>
        m.senderInfo.type === "bot" &&
        m.senderInfo.botType === "dlsite-info" &&
        m.replyTo?.replyToMsgId === msg.id &&
        !usedBotMessages.has(m.id),
    );

    if (botReply) {
      pairs.push({
        userMessage: msg,
        botMessage: botReply,
        rjCode: msg.extractedRJ,
        associationMethod: "reply_to",
      });
      usedUserMessages.add(msg.id);
      usedBotMessages.add(botReply.id);
    }
  }

  // 第二轮：时间邻近 + RJ号匹配关联
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== "user") continue;
    if (usedUserMessages.has(msg.id)) continue;
    if (!msg.extractedRJ) continue;

    // 查找在用户消息之后的 Bot 消息
    const msgIndex = sortedMessages.indexOf(msg);
    const timeWindow = 60000; // 60秒时间窗口

    for (let i = msgIndex + 1; i < sortedMessages.length; i++) {
      const candidate = sortedMessages[i];

      // 时间超出窗口，停止查找
      if (candidate.date - msg.date > timeWindow) break;

      // 遇到另一个用户消息，停止查找
      if (candidate.senderInfo.type === "user") break;

      // 检查是否是未使用的Bot消息
      if (
        candidate.senderInfo.type === "bot" &&
        candidate.senderInfo.botType === "dlsite-info" &&
        !usedBotMessages.has(candidate.id)
      ) {
        // 检查RJ号是否匹配
        if (candidate.extractedRJ === msg.extractedRJ) {
          pairs.push({
            userMessage: msg,
            botMessage: candidate,
            rjCode: msg.extractedRJ,
            associationMethod: "rj_match",
          });
          usedUserMessages.add(msg.id);
          usedBotMessages.add(candidate.id);
          break;
        }
      }
    }
  }

  // 第三轮：处理没有 Bot 回复的用户消息
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== "user") continue;
    if (usedUserMessages.has(msg.id)) continue;

    pairs.push({
      userMessage: msg,
      botMessage: null,
      rjCode: msg.extractedRJ,
      associationMethod: "no_reply",
    });
    usedUserMessages.add(msg.id);
  }

  return pairs;
}

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

    // 获取所有消息
    const messages = [];
    const iterator = telegramClient.iterMessages(entity, {
      limit: options.limit,
    });

    for await (const msg of iterator) {
      if (!msg) continue;

      // 只处理包含RJ号的消息
      const rjCode = extractRJCodeFromMessage(msg);
      if (!rjCode) continue;

      messages.push({
        id: msg.id,
        text: msg.text || msg.caption || "",
        date: new Date(msg.date * 1000),
        senderId: msg.senderId,
        fromId: msg.fromId,
        sender: msg.sender,
        from: msg.from,
        replyTo: msg.replyTo,
        extractedRJ: rjCode,
      });
    }

    logger.info(`成功获取 ${messages.length} 条包含RJ号的消息`);

    // 关联用户消息和Bot回复
    const pairs = associateUserBotMessages(messages);

    logger.info(`成功关联 ${pairs.length} 个用户-Bot配对`);

    // 按 RJ 号分组
    const rjGroups = {};

    for (const pair of pairs) {
      const rjCode = pair.rjCode;
      if (!rjCode) continue;

      if (!rjGroups[rjCode]) {
        rjGroups[rjCode] = [];
      }
      rjGroups[rjCode].push(pair);
    }

    // 分析每个 RJ 号组，识别重复
    const results = [];
    let duplicateGroups = 0;

    for (const [rjCode, group] of Object.entries(rjGroups)) {
      if (group.length === 1) {
        // 不重复，标记为保留
        results.push({
          ...group[0],
          isDuplicate: false,
          keepStatus: "keep",
        });
      } else {
        // 有重复
        duplicateGroups++;

        // 按时间排序（最新的在前）
        const sortedGroup = group.sort(
          (a, b) => b.userMessage.date - a.userMessage.date,
        );

        // 最新的保留，其他的标记为删除
        sortedGroup.forEach((pair, index) => {
          results.push({
            ...pair,
            isDuplicate: true,
            keepStatus: index === 0 ? "keep" : "delete",
            duplicateGroup: rjCode,
          });
        });
      }
    }

    logger.info(`扫描完成，找到 ${duplicateGroups} 个重复RJ号组`);

    return {
      success: true,
      duplicates: results,
      statistics: {
        totalScanned: messages.length,
        duplicateRJs: duplicateGroups,
        messagesToDelete: results.filter((r) => r.keepStatus === "delete")
          .length,
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

    logger.info(`开始删除 ${messageIds.length} 条消息`);

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
  console.log("[tg-rj-duplicates] 正在初始化 IPC 处理器...");

  const handlers = ["tg-scan-rj-duplicates", "tg-delete-duplicate-messages"];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略错误
    }
  }

  // 扫描重复 RJ 号
  ipcMain.handle("tg-scan-rj-duplicates", async (event, options) => {
    logger.info("IPC: tg-scan-rj-duplicates");
    return await scanRjDuplicates(options);
  });

  // 删除重复消息
  ipcMain.handle("tg-delete-duplicate-messages", async (event, messageIds) => {
    logger.info(
      `IPC: tg-delete-duplicate-messages - 删除 ${messageIds.length} 条消息`,
    );
    return await deleteDuplicateMessages(messageIds);
  });

  console.log("[tg-rj-duplicates] 所有 IPC 处理器注册完成!");
}
