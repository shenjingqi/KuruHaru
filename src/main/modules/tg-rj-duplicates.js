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
import { createSilentGramJsLogger } from "../utils/gramjs-logger";
import { ipcMain } from "electron";
import { getConfig } from "./config";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity";
import { getTelegramMessageText } from "./tg-common-core/message-text";
import {
  normalizeChatIdFromPayload,
  normalizeMessageIdFromPayload,
  normalizeMessageIdList,
  normalizePositiveMessageId,
  normalizeFlexiblePeerId,
  normalizeSenderIdFromPayload,
  normalizeUsername,
} from "./tg-common-core/id-normalizers";

// 日志工具
import { createLogSender } from "../utils/logger";
const logger = createLogSender("tg-rj-duplicates");

// 全局状态
let telegramClient = null;
let isConnected = false;
let lastScanMessageMeta = new Map();

// DLsite Info Bot 标识
const DLSITE_INFO_BOT = {
  username: "dlsite_info_bot",
  userId: "5870228865", // 可通过配置 tg.dlsiteInfoBotUserId 覆盖
};

const DELETE_BATCH_SIZE = 100;

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
  const peerId = normalizePeerEntityInput(chatIdInput);

  try {
    return await telegramClient.getEntity(peerId);
  } catch {
    logger.warn(`本地缓存未找到 ID ${chatIdInput}，正在刷新对话列表...`);
  }

  try {
    await telegramClient.getDialogs({ limit: 100 });
    return await telegramClient.getEntity(peerId);
  } catch (e) {
    logger.error(`无法解析群组 ID: ${chatIdInput}，原因: ${e.message}`);
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
  const text = getTelegramMessageText(msg);
  return extractRJCode(text);
}

function getReplyToMessageId(msg) {
  return normalizePositiveMessageId(
    msg.replyToMsgId ?? msg.replyTo?.replyToMsgId,
  );
}

function getPeerType(rawPeer) {
  if (!rawPeer || typeof rawPeer !== "object") {
    return "unknown";
  }

  const className =
    typeof rawPeer.className === "string" ? rawPeer.className : "";

  if (className === "PeerUser" || "userId" in rawPeer) {
    return "user";
  }

  if (className === "PeerChannel" || "channelId" in rawPeer) {
    return "channel";
  }

  if (className === "PeerChat" || "chatId" in rawPeer) {
    return "chat";
  }

  return "unknown";
}

function ensureMessageIdField(message) {
  if (!message) {
    return null;
  }

  const messageId = normalizeMessageIdFromPayload(message);
  const senderId = normalizeSenderIdFromPayload(message);

  const senderInfo = message.senderInfo
    ? {
        ...message.senderInfo,
        senderId: normalizeFlexiblePeerId(
          message.senderInfo.senderId ?? senderId,
        ),
      }
    : undefined;

  return {
    ...message,
    messageId,
    id: messageId ?? message.id,
    senderId,
    senderInfo,
  };
}

function formatDeleteError(error) {
  const code =
    typeof error?.code === "number"
      ? error.code
      : typeof error?.errorCode === "number"
        ? error.errorCode
        : null;
  const message =
    error?.errorMessage ||
    error?.message ||
    (error ? String(error) : "Unknown");
  const name = error?.name || "Error";

  return {
    code,
    name,
    message,
    summary:
      code === null
        ? `${name}: ${message}`
        : `${name} (code=${code}): ${message}`,
  };
}

function getEntityTypeLabel(entity) {
  if (!entity || typeof entity !== "object") {
    return "unknown";
  }

  const className =
    typeof entity.className === "string" ? entity.className : "";
  if (className.includes("Channel")) {
    return "channel";
  }
  if (className.includes("Chat")) {
    return "chat";
  }
  if (className.includes("User")) {
    return "user";
  }

  return className || "unknown";
}

function getMirrorDeleteTarget(meta, fallbackMessageId, configuredChatId) {
  if (!meta || meta.senderType !== "channel") {
    return null;
  }

  const senderChannelId = normalizeFlexiblePeerId(meta.senderId);
  if (!senderChannelId || !senderChannelId.startsWith("-100")) {
    return null;
  }

  if (configuredChatId && senderChannelId === configuredChatId) {
    return null;
  }

  const mappedMessageId = normalizePositiveMessageId(
    meta.forwardChannelPostId ?? meta.replyToTopId,
  );
  if (mappedMessageId !== null) {
    return {
      chatId: senderChannelId,
      messageId: mappedMessageId,
      reason: "mapped-forward",
    };
  }

  if (meta.isPost) {
    return {
      chatId: senderChannelId,
      messageId: fallbackMessageId,
      reason: "post-fallback",
    };
  }

  if (meta.sourceChatId && meta.sourceChatId === senderChannelId) {
    return {
      chatId: senderChannelId,
      messageId: fallbackMessageId,
      reason: "same-chat",
    };
  }

  return null;
}

/**
 * 识别发送者身份
 */
function identifySender(msg, config) {
  const senderId = normalizeSenderIdFromPayload(msg);
  const senderEntity = msg.sender || msg.from || null;
  const senderUsername = normalizeUsername(senderEntity?.username);
  const peerType =
    getPeerType(msg.rawFromId ?? msg.fromId) !== "unknown"
      ? getPeerType(msg.rawFromId ?? msg.fromId)
      : getPeerType(msg.rawSenderId ?? msg.senderId);

  const displayName =
    senderEntity?.firstName ||
    senderEntity?.title ||
    senderEntity?.username ||
    (senderId ? `ID:${senderId}` : "Unknown");

  const configuredBotId = normalizeFlexiblePeerId(
    config?.tg?.dlsiteInfoBotUserId ?? DLSITE_INFO_BOT.userId,
  );
  const configuredBotUsername = normalizeUsername(
    config?.tg?.dlsiteInfoBotUsername || DLSITE_INFO_BOT.username,
  );

  const isBotEntity = Boolean(senderEntity?.isBot || senderEntity?.bot);
  const isUserEntity = Boolean(
    senderEntity?.isUser || senderEntity?.className === "User",
  );
  const isDlsiteBotById =
    configuredBotId !== null && senderId === configuredBotId;
  const isDlsiteBotByName =
    configuredBotUsername.length > 0 &&
    senderUsername === configuredBotUsername;

  if (isDlsiteBotById || isDlsiteBotByName) {
    return {
      type: "bot",
      botType: "dlsite-info",
      senderId,
      name: displayName,
      username: senderUsername,
    };
  }

  if (isBotEntity) {
    return {
      type: "bot",
      botType: "other",
      senderId,
      name: displayName,
      username: senderUsername,
    };
  }

  if (isUserEntity || peerType === "user") {
    return {
      type: "user",
      senderId,
      name: displayName,
      username: senderUsername,
    };
  }

  if (peerType === "channel" || peerType === "chat") {
    return {
      type: "channel",
      senderId,
      name: displayName,
      username: senderUsername,
    };
  }

  if (senderId && !isBotEntity) {
    return {
      type: "user",
      senderId,
      name: displayName,
      username: senderUsername,
    };
  }

  return {
    type: "unknown",
    senderId,
    name: displayName,
    username: senderUsername,
  };
}

function isLikelyReplyCandidate(candidate, userMessage) {
  if (!candidate || candidate.id === userMessage.id) {
    return false;
  }

  if (candidate.replyToMessageId !== userMessage.id) {
    return false;
  }

  if (
    candidate.senderInfo?.senderId &&
    userMessage.senderInfo?.senderId &&
    candidate.senderInfo.senderId === userMessage.senderInfo.senderId
  ) {
    return false;
  }

  if (candidate.senderInfo?.type === "channel") {
    return false;
  }

  if (candidate.senderInfo?.type === "user" && candidate.extractedRJ) {
    return false;
  }

  return true;
}

function isRjOriginMessage(message) {
  if (!message?.extractedRJ) {
    return false;
  }

  const senderType = message.senderInfo?.type;
  return senderType === "user" || senderType === "channel";
}

function detectResponderSenderIds(messages, config) {
  const senderCountMap = new Map();

  for (const message of messages) {
    const senderId = normalizeSenderIdFromPayload(message);
    if (!senderId) {
      continue;
    }

    if (message.replyToMessageId !== null && !message.extractedRJ) {
      senderCountMap.set(senderId, (senderCountMap.get(senderId) || 0) + 1);
    }
  }

  const configuredSenderId = normalizeFlexiblePeerId(
    config?.tg?.dlsiteInfoBotUserId,
  );
  const sortedByReplyCount = [...senderCountMap.entries()].sort(
    (left, right) => right[1] - left[1],
  );

  const responderSenderIds = new Set();
  if (configuredSenderId) {
    responderSenderIds.add(configuredSenderId);
  }

  if (sortedByReplyCount.length > 0) {
    responderSenderIds.add(sortedByReplyCount[0][0]);
  }

  for (const message of messages) {
    const senderId = normalizeSenderIdFromPayload(message);
    if (!senderId) {
      continue;
    }

    if (
      message?.senderInfo?.type === "bot" ||
      message?.senderInfo?.botType === "dlsite-info"
    ) {
      responderSenderIds.add(senderId);
    }
  }

  return {
    responderSenderIds,
    sortedByReplyCount,
    configuredSenderId,
  };
}

function isResponderMessage(message, responderSenderIds) {
  if (!message) {
    return false;
  }

  const senderId = normalizeSenderIdFromPayload(message);
  if (senderId && responderSenderIds.has(senderId)) {
    return true;
  }

  return (
    message?.senderInfo?.type === "bot" ||
    message?.senderInfo?.botType === "dlsite-info"
  );
}

// ==========================================
// 核心业务逻辑
// ==========================================

/**
 * 关联用户消息和Bot回复
 */
function associateUserBotMessages(messages, config) {
  // 首先识别所有消息的发送者
  const identifiedMessages = messages.map((msg) => ({
    ...msg,
    senderInfo: identifySender(msg, config),
    extractedRJ: extractRJCodeFromMessage(msg),
  }));

  const senderTypeStats = identifiedMessages.reduce((stats, message) => {
    const type = message.senderInfo?.type || "unknown";
    stats[type] = (stats[type] || 0) + 1;
    return stats;
  }, {});

  const userWithRjCount = identifiedMessages.filter(
    (message) => message.senderInfo?.type === "user" && message.extractedRJ,
  ).length;
  const channelWithRjCount = identifiedMessages.filter(
    (message) => message.senderInfo?.type === "channel" && message.extractedRJ,
  ).length;
  const originWithRjCount = identifiedMessages.filter((message) =>
    isRjOriginMessage(message),
  ).length;

  const replyTaggedCount = identifiedMessages.filter(
    (message) => message.replyToMessageId !== null,
  ).length;

  const responderDetection = detectResponderSenderIds(
    identifiedMessages,
    config,
  );
  const responderSenderIds = responderDetection.responderSenderIds;
  const topResponderByReply = responderDetection.sortedByReplyCount[0] || null;

  logger.info(
    `[接口日志] 回应者识别: configured=${responderDetection.configuredSenderId || "none"}, inferredTop=${topResponderByReply ? `${topResponderByReply[0]}:${topResponderByReply[1]}` : "none"}, active=${[...responderSenderIds].join(",") || "none"}`,
  );

  logger.info(
    `[接口日志] 关联前统计: total=${identifiedMessages.length}, userWithRJ=${userWithRjCount}, channelWithRJ=${channelWithRjCount}, originWithRJ=${originWithRjCount}, bot=${senderTypeStats.bot || 0}, user=${senderTypeStats.user || 0}, channel=${senderTypeStats.channel || 0}, unknown=${senderTypeStats.unknown || 0}, replyTagged=${replyTaggedCount}`,
  );

  // 按时间排序
  const sortedMessages = identifiedMessages.sort((a, b) => a.date - b.date);

  const pairs = [];
  const usedBotMessages = new Set();
  const usedOriginMessages = new Set();

  // 第一轮：直接 reply_to 关联
  for (const msg of sortedMessages) {
    if (!isRjOriginMessage(msg)) continue;
    if (usedOriginMessages.has(msg.id)) continue;

    // 查找这个原始消息的 Bot 回复
    // 策略1: 查找 reply_to 指向此消息的消息
    const botReply = sortedMessages.find(
      (m) =>
        isResponderMessage(m, responderSenderIds) &&
        isLikelyReplyCandidate(m, msg) &&
        !usedBotMessages.has(m.id),
    );

    if (botReply) {
      pairs.push({
        userMessage: msg,
        botMessage: botReply,
        rjCode: msg.extractedRJ,
        associationMethod: "reply_to",
      });
      usedOriginMessages.add(msg.id);
      usedBotMessages.add(botReply.id);
    }
  }

  // 第二轮：时间邻近 + RJ号匹配关联
  for (const msg of sortedMessages) {
    if (!isRjOriginMessage(msg)) continue;
    if (usedOriginMessages.has(msg.id)) continue;

    // 查找在原始消息之后的 Bot 消息
    const msgIndex = sortedMessages.indexOf(msg);
    const timeWindow = 60000; // 60秒时间窗口

    for (let i = msgIndex + 1; i < sortedMessages.length; i++) {
      const candidate = sortedMessages[i];

      // 时间超出窗口，停止查找
      if (candidate.date - msg.date > timeWindow) break;

      // 遇到下一个原始RJ消息，停止查找
      if (isRjOriginMessage(candidate)) break;

      // 检查是否是未使用的Bot消息
      if (
        isResponderMessage(candidate, responderSenderIds) &&
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
          usedOriginMessages.add(msg.id);
          usedBotMessages.add(candidate.id);
          break;
        }
      }
    }
  }

  // 第三轮：处理没有 Bot 回复的原始消息
  for (const msg of sortedMessages) {
    if (!isRjOriginMessage(msg)) continue;
    if (usedOriginMessages.has(msg.id)) continue;

    pairs.push({
      userMessage: msg,
      botMessage: null,
      rjCode: msg.extractedRJ,
      associationMethod: "no_reply",
    });
    usedOriginMessages.add(msg.id);
  }

  const associationStats = pairs.reduce((stats, pair) => {
    const key = pair.associationMethod || "unknown";
    stats[key] = (stats[key] || 0) + 1;
    return stats;
  }, {});

  logger.info(
    `[接口日志] 关联结果统计: total=${pairs.length}, reply_to=${associationStats.reply_to || 0}, rj_match=${associationStats.rj_match || 0}, no_reply=${associationStats.no_reply || 0}`,
  );

  return pairs;
}

/**
 * 扫描频道中的重复 RJ 号
 */
async function scanRjDuplicates(options) {
  try {
    const config = await getConfig();
    const channelIdStr = config.tg.channel;
    if (!channelIdStr) throw new Error("未配置频道 ID");

    const discussionIdStr =
      typeof config.tg.discussion === "string"
        ? config.tg.discussion.trim()
        : String(config.tg.discussion || "").trim();
    if (discussionIdStr && discussionIdStr !== String(channelIdStr).trim()) {
      logger.info(
        `[接口日志] 仅频道模式已启用，扫描时忽略讨论组 ID=${discussionIdStr}`,
      );
    }

    const limit = Number(options?.limit);
    const scanLimit = Number.isInteger(limit) && limit > 0 ? limit : 1000;

    const telegramClient = await getConnectedClient();
    const entity = await resolveEntity(telegramClient, channelIdStr);

    logger.info(`开始扫描最近 ${scanLimit} 条消息中的重复 RJ 号`);

    // 获取所有消息
    const messages = [];
    const iterator = telegramClient.iterMessages(entity, {
      limit: scanLimit,
    });

    for await (const msg of iterator) {
      if (!msg) continue;

      const messageId = normalizeMessageIdFromPayload(msg);
      if (messageId === null) {
        logger.warn(`[接口日志] 跳过无效消息ID: ${String(msg.id)}`);
        continue;
      }

      const rjCode = extractRJCodeFromMessage(msg);
      const replyToMessageId = getReplyToMessageId(msg);
      const peerId = normalizeChatIdFromPayload(msg);
      const forwardFromPeerId = normalizeFlexiblePeerId(
        msg.fwdFrom?.fromId ?? msg.fwdFrom?.savedFromPeer,
      );
      const forwardChannelPostId = normalizePositiveMessageId(
        msg.fwdFrom?.channelPost ?? msg.fwdFrom?.savedFromMsgId,
      );
      const replyToTopId = normalizePositiveMessageId(
        msg.replyTo?.replyToTopId,
      );
      const isPost = Boolean(msg.post);
      let sender = msg.sender || msg.from || null;

      if (!sender && (rjCode || replyToMessageId)) {
        try {
          if (typeof msg.getSender === "function") {
            sender = await msg.getSender();
          }
        } catch (error) {
          logger.warn(
            `[接口日志] 解析发送者失败 messageId=${messageId}: ${error.message}`,
          );
        }
      }

      messages.push({
        id: messageId,
        messageId,
        text: getTelegramMessageText(msg),
        date: new Date(msg.date * 1000),
        senderId: normalizeSenderIdFromPayload(msg),
        fromId: normalizeFlexiblePeerId(msg.fromId),
        rawSenderId: msg.senderId,
        rawFromId: msg.fromId,
        peerId,
        sender,
        from: msg.from,
        replyTo: msg.replyTo,
        replyToMessageId,
        replyToTopId,
        isPost,
        forwardFromPeerId,
        forwardChannelPostId,
        extractedRJ: rjCode,
      });
    }

    const rjMessageCount = messages.filter((message) =>
      Boolean(message.extractedRJ),
    ).length;

    const replyNoRjSenderCounter = messages
      .filter(
        (message) =>
          message.replyToMessageId !== null &&
          !message.extractedRJ &&
          message.senderId !== null,
      )
      .reduce((counter, message) => {
        const senderId = message.senderId;
        counter.set(senderId, (counter.get(senderId) || 0) + 1);
        return counter;
      }, new Map());

    const topReplyNoRjSenders = [...replyNoRjSenderCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([senderId, count]) => `${senderId}:${count}`)
      .join(",");

    logger.info(
      `成功获取 ${messages.length} 条消息，其中 ${rjMessageCount} 条包含RJ号`,
    );
    logger.info(
      `[接口日志] reply无RJ消息发送者Top5=${topReplyNoRjSenders || "none"}`,
    );

    // 关联用户消息和Bot回复
    const pairs = associateUserBotMessages(messages, config);

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

    const normalizedResults = results.map((pair) => ({
      ...pair,
      userMessage: ensureMessageIdField(pair.userMessage),
      botMessage: ensureMessageIdField(pair.botMessage),
    }));

    const scanMessageMeta = new Map();
    for (const row of normalizedResults) {
      const rowMessages = [row.userMessage, row.botMessage].filter(Boolean);
      for (const rowMessage of rowMessages) {
        const messageId = normalizeMessageIdFromPayload(rowMessage);
        if (messageId === null) {
          continue;
        }

        const senderId = normalizeSenderIdFromPayload(rowMessage);
        const senderType = rowMessage?.senderInfo?.type || "unknown";
        const sourceChatId = normalizeChatIdFromPayload(rowMessage);
        const forwardFromPeerId = normalizeFlexiblePeerId(
          rowMessage?.forwardFromPeerId,
        );
        const forwardChannelPostId = normalizePositiveMessageId(
          rowMessage?.forwardChannelPostId,
        );
        const replyToTopId = normalizePositiveMessageId(
          rowMessage?.replyToTopId,
        );
        const isPost = Boolean(rowMessage?.isPost);

        scanMessageMeta.set(messageId, {
          senderId,
          senderType,
          sourceChatId,
          forwardFromPeerId,
          forwardChannelPostId,
          replyToTopId,
          isPost,
          rjCode: row.rjCode,
          associationMethod: row.associationMethod,
        });
      }
    }
    lastScanMessageMeta = scanMessageMeta;

    const messagesToDelete = normalizedResults.filter(
      (row) => row.keepStatus === "delete",
    ).length;

    const sampleRows = normalizedResults.slice(0, 5);
    const sampleUserMessageIds =
      sampleRows
        .map((row) => row.userMessage?.messageId)
        .filter((id) => id !== null)
        .join(",") || "none";
    const sampleUserSenderIds =
      sampleRows
        .map(
          (row) =>
            row.userMessage?.senderInfo?.senderId ?? row.userMessage?.senderId,
        )
        .filter((id) => id !== null)
        .join(",") || "none";
    const sampleUserSenderNames =
      sampleRows
        .map((row) => row.userMessage?.senderInfo?.name)
        .filter((name) => typeof name === "string" && name.trim().length > 0)
        .join(",") || "none";
    const sampleBotSenderIds =
      sampleRows
        .map(
          (row) =>
            row.botMessage?.senderInfo?.senderId ?? row.botMessage?.senderId,
        )
        .filter((id) => id !== null)
        .join(",") || "none";
    const sampleBotSenderNames =
      sampleRows
        .map((row) => row.botMessage?.senderInfo?.name)
        .filter((name) => typeof name === "string" && name.trim().length > 0)
        .join(",") || "none";

    logger.info(
      `[接口日志] tg-scan-rj-duplicates 返回: success=true, rows=${normalizedResults.length}, toDelete=${messagesToDelete}, sampleUserMessageIds=${sampleUserMessageIds}, sampleUserSenderIds=${sampleUserSenderIds}, sampleUserSenderNames=${sampleUserSenderNames}, sampleBotSenderIds=${sampleBotSenderIds}, sampleBotSenderNames=${sampleBotSenderNames}`,
    );

    return {
      success: true,
      duplicates: normalizedResults,
      statistics: {
        totalScanned: messages.length,
        duplicateRJs: duplicateGroups,
        messagesToDelete,
        deletedCount: 0,
      },
    };
  } catch (error) {
    logger.error(`扫描失败: ${error.message}`);
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
    const channelIdStr = config.tg.channel;
    if (!channelIdStr) throw new Error("未配置频道 ID");

    const discussionIdStr =
      typeof config.tg.discussion === "string"
        ? config.tg.discussion.trim()
        : String(config.tg.discussion || "").trim();
    if (discussionIdStr && discussionIdStr !== String(channelIdStr).trim()) {
      logger.info(
        `[接口日志] 仅频道模式已启用，删除时忽略讨论组 ID=${discussionIdStr}`,
      );
    }

    const normalizedMessageIds = normalizeMessageIdList(messageIds);

    logger.info(
      `[接口日志] tg-delete-duplicate-messages 请求: rawCount=${Array.isArray(messageIds) ? messageIds.length : 0}, normalizedCount=${normalizedMessageIds.length}, sample=${normalizedMessageIds.slice(0, 10).join(",") || "none"}`,
    );

    if (normalizedMessageIds.length === 0) {
      logger.warn("[接口日志] 删除请求没有有效的消息ID，直接返回");
      return {
        success: false,
        error: "没有有效的消息ID可删除",
        deletedCount: 0,
        errors: [],
      };
    }

    const telegramClient = await getConnectedClient();
    const entity = await resolveEntity(telegramClient, channelIdStr);
    const entityType = getEntityTypeLabel(entity);
    const configuredChatId = normalizeFlexiblePeerId(channelIdStr);

    logger.info(
      `[接口日志] 开始删除 ${normalizedMessageIds.length} 条消息，目标实体=${entityType}, channelId=${channelIdStr}`,
    );

    let deletedCount = 0;
    const deletedMessageIds = [];
    const errors = [];
    const entityCache = new Map();
    const messageStates = normalizedMessageIds.map((messageId) => {
      const meta = lastScanMessageMeta.get(messageId) || null;

      return {
        messageId,
        meta,
        mirrorTarget: getMirrorDeleteTarget(meta, messageId, configuredChatId),
        primaryAttempt: null,
        mirrorFailure: null,
        fallbackAttempt: null,
      };
    });

    const getEntityByChatId = async (chatId) => {
      if (!chatId) {
        return null;
      }

      let cached = entityCache.get(chatId);
      if (!cached) {
        cached = await resolveEntity(telegramClient, chatId);
        entityCache.set(chatId, cached);
      }
      return cached;
    };

    const createSuccessAttempt = (targetLabel, deleteId) => ({
      success: true,
      targetLabel,
      deleteId,
    });

    const createFailureAttempt = (targetLabel, deleteId, errorOrDetail) => {
      const detail =
        errorOrDetail && typeof errorOrDetail.summary === "string"
          ? errorOrDetail
          : formatDeleteError(errorOrDetail);

      return {
        success: false,
        targetLabel,
        deleteId,
        detail,
      };
    };

    const createFailedAttemptLog = (attempt, fallbackDeleteId) => ({
      target: attempt.targetLabel,
      deleteId: attempt.deleteId ?? fallbackDeleteId,
      code: attempt.detail?.code ?? null,
      error: attempt.detail?.message || "Unknown",
    });

    const chunkDeleteIds = (deleteIds) => {
      const chunks = [];

      for (
        let index = 0;
        index < deleteIds.length;
        index += DELETE_BATCH_SIZE
      ) {
        chunks.push(deleteIds.slice(index, index + DELETE_BATCH_SIZE));
      }

      return chunks;
    };

    const groupStatesByChatId = (states, getChatId) => {
      const grouped = new Map();

      for (const state of states) {
        const chatId = getChatId(state);
        if (!chatId) {
          continue;
        }

        let bucket = grouped.get(chatId);
        if (!bucket) {
          bucket = [];
          grouped.set(chatId, bucket);
        }
        bucket.push(state);
      }

      return grouped;
    };

    const tryDeleteBatch = async (targetEntity, targetLabel, deleteIds) => {
      try {
        await telegramClient.deleteMessages(targetEntity, deleteIds, {
          revoke: true,
        });
        return {
          success: true,
          targetLabel,
          deleteIds: [...deleteIds],
        };
      } catch (error) {
        return createFailureAttempt(targetLabel, deleteIds[0] ?? null, error);
      }
    };

    const tryDeleteOnce = async (targetEntity, targetLabel, messageId) => {
      try {
        await telegramClient.deleteMessages(targetEntity, [messageId], {
          revoke: true,
        });
        return createSuccessAttempt(targetLabel, messageId);
      } catch (error) {
        return createFailureAttempt(targetLabel, messageId, error);
      }
    };

    const deleteStatesByTarget = async ({
      states,
      targetEntity,
      targetLabel,
      operationLabel,
      getDeleteId,
      onSuccess,
      onFailure,
    }) => {
      const statesByDeleteId = new Map();

      for (const state of states) {
        const deleteId = normalizePositiveMessageId(getDeleteId(state));
        if (deleteId === null) {
          onFailure(
            state,
            createFailureAttempt(
              targetLabel,
              null,
              new Error("无效的删除消息 ID"),
            ),
          );
          continue;
        }

        let bucket = statesByDeleteId.get(deleteId);
        if (!bucket) {
          bucket = [];
          statesByDeleteId.set(deleteId, bucket);
        }
        bucket.push(state);
      }

      for (const deleteIdChunk of chunkDeleteIds([
        ...statesByDeleteId.keys(),
      ])) {
        const batchAttempt = await tryDeleteBatch(
          targetEntity,
          targetLabel,
          deleteIdChunk,
        );

        if (batchAttempt.success) {
          for (const deleteId of deleteIdChunk) {
            for (const state of statesByDeleteId.get(deleteId) || []) {
              onSuccess(state, deleteId);
            }
          }
          continue;
        }

        logger.warn(
          `[接口日志] ${operationLabel} 批量删除失败，降级为单条重试; target=${targetLabel}, size=${deleteIdChunk.length}, detail=${batchAttempt.detail.summary}`,
        );

        for (const deleteId of deleteIdChunk) {
          const singleAttempt = await tryDeleteOnce(
            targetEntity,
            targetLabel,
            deleteId,
          );

          for (const state of statesByDeleteId.get(deleteId) || []) {
            if (singleAttempt.success) {
              onSuccess(state, deleteId);
            } else {
              onFailure(state, singleAttempt);
            }
          }
        }
      }
    };

    await deleteStatesByTarget({
      states: messageStates,
      targetEntity: entity,
      targetLabel: "configured-entity",
      operationLabel: "配置实体",
      getDeleteId: (state) => state.messageId,
      onSuccess: (state, deleteId) => {
        state.primaryAttempt = createSuccessAttempt(
          "configured-entity",
          deleteId,
        );
      },
      onFailure: (state, attempt) => {
        state.primaryAttempt = attempt;
      },
    });

    const mirrorStateGroups = groupStatesByChatId(
      messageStates.filter(
        (state) => state.primaryAttempt?.success && state.mirrorTarget,
      ),
      (state) => state.mirrorTarget?.chatId,
    );

    for (const [chatId, states] of mirrorStateGroups.entries()) {
      const targetLabel = `mirror-channel:${chatId}`;

      try {
        const mirrorEntity = await getEntityByChatId(chatId);

        await deleteStatesByTarget({
          states,
          targetEntity: mirrorEntity,
          targetLabel,
          operationLabel: `频道镜像 chatId=${chatId}`,
          getDeleteId: (state) => state.mirrorTarget?.messageId,
          onSuccess: (state, deleteId) => {
            logger.info(
              `[接口日志] 消息 ID ${state.messageId} 已同步删除频道消息 chatId=${chatId}, messageId=${deleteId}, reason=${state.mirrorTarget.reason}`,
            );
          },
          onFailure: (state, attempt) => {
            state.mirrorFailure = {
              detail: attempt.detail,
              attempts: [
                {
                  target: state.primaryAttempt.targetLabel,
                  deleteId: state.primaryAttempt.deleteId ?? state.messageId,
                  code: null,
                  error: "configured-entity deleted",
                },
                createFailedAttemptLog(
                  attempt,
                  state.mirrorTarget?.messageId ?? state.messageId,
                ),
              ],
              note: `配置实体删除成功，但频道镜像删除失败(chatId=${chatId}, messageId=${state.mirrorTarget.messageId}, reason=${state.mirrorTarget.reason})`,
            };
          },
        });
      } catch (error) {
        const detail = formatDeleteError(error);

        for (const state of states) {
          state.mirrorFailure = {
            detail,
            attempts: [
              {
                target: state.primaryAttempt.targetLabel,
                deleteId: state.primaryAttempt.deleteId ?? state.messageId,
                code: null,
                error: "configured-entity deleted",
              },
              {
                target: targetLabel,
                deleteId: state.mirrorTarget.messageId,
                code: detail.code,
                error: detail.message,
              },
            ],
            note: `配置实体删除成功，但频道实体解析失败(chatId=${chatId})`,
          };
        }
      }
    }

    const fallbackStateGroups = groupStatesByChatId(
      messageStates.filter(
        (state) => !state.primaryAttempt?.success && state.mirrorTarget,
      ),
      (state) => state.mirrorTarget?.chatId,
    );

    for (const [chatId, states] of fallbackStateGroups.entries()) {
      const targetLabel = `sender-channel:${chatId}`;

      try {
        const fallbackEntity = await getEntityByChatId(chatId);

        await deleteStatesByTarget({
          states,
          targetEntity: fallbackEntity,
          targetLabel,
          operationLabel: `频道回退 chatId=${chatId}`,
          getDeleteId: (state) => state.mirrorTarget?.messageId,
          onSuccess: (state, deleteId) => {
            state.fallbackAttempt = createSuccessAttempt(targetLabel, deleteId);
            logger.info(
              `[接口日志] 消息 ID ${state.messageId} 在配置实体删除失败后，已通过频道回退删除成功(chatId=${chatId}, messageId=${deleteId}, reason=${state.mirrorTarget.reason})`,
            );
          },
          onFailure: (state, attempt) => {
            state.fallbackAttempt = attempt;
          },
        });
      } catch (error) {
        for (const state of states) {
          state.fallbackAttempt = createFailureAttempt(
            targetLabel,
            state.mirrorTarget?.messageId ?? null,
            error,
          );
        }
      }
    }

    for (const state of messageStates) {
      const { messageId, meta, mirrorTarget, primaryAttempt, mirrorFailure } =
        state;

      if (primaryAttempt?.success) {
        if (mirrorFailure) {
          logger.error(
            `[接口日志] 删除消息 ID ${messageId} 失败: ${mirrorFailure.detail.summary}; ${mirrorFailure.note}`,
          );

          errors.push({
            messageId,
            code: mirrorFailure.detail.code,
            error: mirrorFailure.detail.message,
            attempts: mirrorFailure.attempts,
            meta,
          });
          continue;
        }

        deletedCount++;
        deletedMessageIds.push(messageId);
        logger.info(`成功删除消息 ID: ${messageId}`);
        continue;
      }

      if (state.fallbackAttempt?.success) {
        deletedCount++;
        deletedMessageIds.push(messageId);
        continue;
      }

      if (!mirrorTarget && meta?.senderType === "channel") {
        logger.warn(
          `[接口日志] 消息 ID ${messageId} 删除失败且无频道映射，无法执行频道回退删除; senderId=${meta.senderId || "unknown"}, sourceChatId=${meta.sourceChatId || "unknown"}`,
        );
      }

      const failedAttempts = [primaryAttempt, state.fallbackAttempt]
        .filter(Boolean)
        .map((attempt) =>
          createFailedAttemptLog(attempt, mirrorTarget?.messageId ?? messageId),
        );

      const bestDetail =
        state.fallbackAttempt?.detail ||
        primaryAttempt?.detail ||
        formatDeleteError(new Error("Unknown"));

      logger.error(
        `[接口日志] 删除消息 ID ${messageId} 失败: ${bestDetail.summary}${
          meta
            ? `; senderType=${meta.senderType}, senderId=${meta.senderId || "unknown"}, sourceChatId=${meta.sourceChatId || "unknown"}, forwardChannelPostId=${meta.forwardChannelPostId || "none"}, replyToTopId=${meta.replyToTopId || "none"}, rjCode=${meta.rjCode || "unknown"}`
            : ""
        }`,
      );

      errors.push({
        messageId,
        code: bestDetail.code,
        error: bestDetail.message,
        attempts: failedAttempts,
        meta,
      });
    }

    logger.info(
      `删除操作完成，成功删除 ${deletedCount} 条消息，失败 ${errors.length} 条`,
    );

    const partial = deletedCount > 0 && errors.length > 0;
    const success = errors.length === 0;
    const failureReason = success
      ? undefined
      : partial
        ? "部分消息删除失败"
        : "所有消息删除失败";

    return {
      success,
      partial,
      deletedCount,
      deletedMessageIds,
      errors,
      requestedCount: normalizedMessageIds.length,
      error: failureReason,
    };
  } catch (error) {
    logger.error(`删除操作失败: ${error.message}`);
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
  ipcMain.handle("tg-scan-rj-duplicates", async (_event, options) => {
    logger.debug(
      `IPC: tg-scan-rj-duplicates 请求 limit=${Number.isInteger(Number(options?.limit)) ? Number(options?.limit) : "default"}`,
    );

    const result = await scanRjDuplicates(options);

    logger.debug(
      `IPC: tg-scan-rj-duplicates 响应 success=${result.success} duplicates=${Array.isArray(result.duplicates) ? result.duplicates.length : 0}`,
    );
    return result;
  });

  // 删除重复消息
  ipcMain.handle("tg-delete-duplicate-messages", async (_event, messageIds) => {
    logger.debug(
      `IPC: tg-delete-duplicate-messages 请求数量=${Array.isArray(messageIds) ? messageIds.length : 0}`,
    );

    const result = await deleteDuplicateMessages(messageIds);

    logger.debug(
      `IPC: tg-delete-duplicate-messages 响应 success=${result.success} deleted=${result.deletedCount || 0} errors=${Array.isArray(result.errors) ? result.errors.length : 0}`,
    );
    return result;
  });

  logger.debug("[tg-rj-duplicates] IPC handlers registered");
}
