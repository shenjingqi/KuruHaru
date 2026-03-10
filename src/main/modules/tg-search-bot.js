/**
 * Telegram 搜索 Bot 模块（Bot API 版本）
 * 功能：
 * 1. 通过 Bot API 响应 /start /search /info /help
 * 2. 搜索优先级：历史索引 > 前置包内存索引（极速）> 频道检索（后台补充）
 * 3. 支持用户/群组白名单
 * 4. 支持 Polling（开发）与 Webhook（生产）模式
 */

import TelegramBot from "node-telegram-bot-api";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createSilentGramJsLogger } from "../utils/gramjs-logger";
import { ipcMain, app } from "electron";
import fs from "fs/promises";
import path from "path";
import { getConfig, getDataDir } from "./config";
import { normalizeError } from "../utils/errorHandler";
import { createLogSender } from "../utils/logger";
import {
  normalizeIdList,
  normalizeChannelId,
  parseSearchLimit,
  toSafeBoolean,
  ensureHistoryShape,
} from "./tg-search-bot-core/normalizers";
import { extractRJCode, extractRJCodes } from "./tg-search-bot-core/rj-parsers";
import {
  buildMessageLinksByChat,
  buildMessageLinksByEntity,
  isSameChannel,
} from "./tg-search-bot-core/link-builders";
import { evaluatePermission } from "./tg-search-bot-core/permissions";
import {
  maskField,
  buildRequestLogContext,
} from "./tg-search-bot-core/logging-context";
import {
  buildNotFoundMessage,
  buildPresetFoundMessage,
} from "./tg-search-bot-core/response-messages";
import {
  createEmptyPresetIndexStats,
  getHistoryEntryAlternateUrls,
  getHistoryEntryUrl,
} from "./tg-search-bot-core/history-utils";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity";
import { getTelegramMessageText } from "./tg-common-core/message-text";
import { normalizeMessageIdFromPayload } from "./tg-common-core/id-normalizers";
import {
  fetchWorkInfoByCode,
  formatWorkInfoMessage,
  getInfoCacheRuntimeConfig,
} from "./tg-info-cache";

const logger = createLogSender("tg-search-bot");

const SEARCH_COMMAND_REGEX = /^(?:@\w+\s+)?\/search(?:@\w+)?\s+(.+)/i;
const INFO_COMMAND_REGEX = /^(?:@\w+\s+)?\/info(?:@\w+)?\s+(.+)/i;
const START_COMMAND_REGEX = /^(?:@\w+\s+)?\/start(?:@\w+)?$/i;
const HELP_COMMAND_REGEX = /^(?:@\w+\s+)?\/help(?:@\w+)?$/i;

const BOT_COMMANDS = [
  { command: "start", description: "启动说明" },
  { command: "search", description: "搜索 RJ/VJ/BJ 资源链接" },
  { command: "info", description: "查询 RJ/VJ/BJ 详情" },
  { command: "help", description: "查看帮助" },
];

const BOT_COMMAND_SCOPES = [
  { name: "default", options: {} },
  {
    name: "all_private_chats",
    options: { scope: { type: "all_private_chats" } },
  },
  { name: "all_group_chats", options: { scope: { type: "all_group_chats" } } },
  {
    name: "all_chat_administrators",
    options: { scope: { type: "all_chat_administrators" } },
  },
];

let bot = null;
let botRunning = false;
let botStartTimestamp = 0;
let runningMode = "polling";

let telegramClient = null;
let telegramClientConnected = false;

let historyPath = "";
let historyCache = {
  updatedAt: new Date().toISOString(),
  history: {},
};

let startupSyncTask = null;
const PRESET_INDEX_CACHE_TTL_MS = 5000;
const INFO_REPLY_DEDUPE_TTL_MS = 60 * 1000;
const PLAIN_TEXT_MESSAGE_DEDUPE_TTL_MS = 15 * 1000;
const NUMBER_ONLY_WORK_CODE_REGEX = /^\d{6,8}$/;

let presetIndexCache = {
  initialized: false,
  cacheKey: "",
  checkedAt: 0,
  mtimeMs: 0,
  fileSize: 0,
  entries: {},
  stats: createEmptyPresetIndexStats(),
};
const recentInfoReplyKeys = new Map();
const recentPlainTextMessageKeys = new Map();

function buildIncomingMessageKey(msg) {
  return `${String(msg?.chat?.id || "")}:${String(msg?.message_id || "")}`;
}

function markAndCheckPlainTextMessageDedupe(msg) {
  const now = Date.now();
  for (const [key, timestamp] of recentPlainTextMessageKeys) {
    if (now - timestamp > PLAIN_TEXT_MESSAGE_DEDUPE_TTL_MS) {
      recentPlainTextMessageKeys.delete(key);
    }
  }

  const key = buildIncomingMessageKey(msg);
  if (!key || key === ":") {
    return false;
  }

  const previous = recentPlainTextMessageKeys.get(key);
  if (previous && now - previous <= PLAIN_TEXT_MESSAGE_DEDUPE_TTL_MS) {
    return true;
  }

  recentPlainTextMessageKeys.set(key, now);
  return false;
}

function buildInfoReplyDedupeKey(chatId, replyToMessageId, workCode) {
  return `${String(chatId)}:${String(replyToMessageId)}:${String(workCode || "").toUpperCase()}`;
}

function markAndCheckInfoReplyDedupe(chatId, replyToMessageId, workCode) {
  const now = Date.now();

  for (const [key, timestamp] of recentInfoReplyKeys) {
    if (now - timestamp > INFO_REPLY_DEDUPE_TTL_MS) {
      recentInfoReplyKeys.delete(key);
    }
  }

  const dedupeKey = buildInfoReplyDedupeKey(chatId, replyToMessageId, workCode);
  const previous = recentInfoReplyKeys.get(dedupeKey);
  if (previous && now - previous <= INFO_REPLY_DEDUPE_TTL_MS) {
    return true;
  }

  recentInfoReplyKeys.set(dedupeKey, now);
  return false;
}

function getBotRuntimeConfig(config = getConfig()) {
  const tgConfig = config?.tg || {};
  const legacyBotConfig = tgConfig.bot || {};

  const botToken = tgConfig.botToken || legacyBotConfig.token || "";
  const sourceChannelRaw =
    tgConfig.searchChannelId || tgConfig.channel || tgConfig.discussion || "";
  const sourceChannelCandidates = normalizeIdList(
    typeof sourceChannelRaw === "string" || Array.isArray(sourceChannelRaw)
      ? sourceChannelRaw
      : String(sourceChannelRaw || ""),
  );
  const sourceChannelId = sourceChannelCandidates[0] || "";

  const prePackagePath =
    tgConfig.prePackagePath ||
    path.join(
      config.paths?.tgDownloadDir ||
        path.join(app.getPath("downloads"), "Downloads"),
      "前置包.txt",
    );

  const prePackageLink = tgConfig.prePackageLink || "";

  const allowedUsers = normalizeIdList(
    tgConfig.botAllowedUsers || legacyBotConfig.allowedUsers,
  );
  const allowedChats = normalizeIdList(
    tgConfig.botAllowedChats || legacyBotConfig.allowedGroups,
  );

  const mode = (
    tgConfig.botMode ||
    legacyBotConfig.mode ||
    "polling"
  ).toLowerCase();
  const webhookUrl = tgConfig.botWebhookUrl || legacyBotConfig.webhookUrl || "";
  const webhookPort = Number(
    tgConfig.botWebhookPort || legacyBotConfig.webhookPort || 8443,
  );
  const searchLimit = parseSearchLimit(
    tgConfig.botSearchLimit ?? legacyBotConfig.searchLimit,
    3000,
  );
  const whitelistDebugLog = toSafeBoolean(tgConfig.botWhitelistDebugLog, false);
  const configuredHistoryPath =
    tgConfig.botHistoryPath ||
    legacyBotConfig.historyPath ||
    path.join(getDataDir(), "tg-bot-history.json");

  return {
    botToken,
    sourceChannelId: normalizeChannelId(sourceChannelId),
    prePackagePath,
    prePackageLink,
    allowedUsers,
    allowedChats,
    mode: mode === "webhook" ? "webhook" : "polling",
    webhookUrl,
    webhookPort: Number.isFinite(webhookPort) ? webhookPort : 8443,
    searchLimit,
    whitelistDebugLog,
    historyFilePath: configuredHistoryPath,
  };
}

async function ensureHistoryLoaded(runtimeConfig) {
  const nextHistoryPath = runtimeConfig.historyFilePath;

  if (historyPath === nextHistoryPath && historyCache?.history) {
    return;
  }

  historyPath = nextHistoryPath;

  try {
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    const content = await fs.readFile(historyPath, "utf-8");
    historyCache = ensureHistoryShape(JSON.parse(content));
  } catch (error) {
    const normalizedError = normalizeError(error);

    if (normalizedError.code !== "ENOENT") {
      logger.warn(
        "[tg-search-bot] 历史缓存读取失败，已使用空缓存",
        normalizedError.message,
      );
    }

    historyCache = {
      updatedAt: new Date().toISOString(),
      history: {},
    };
  }
}

async function persistHistory() {
  if (!historyPath) return;

  try {
    historyCache.updatedAt = new Date().toISOString();
    await fs.writeFile(
      historyPath,
      JSON.stringify(historyCache, null, 2),
      "utf-8",
    );
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] 历史缓存写入失败", normalizedError.message);
  }
}

function upsertHistory(rjCode, payload) {
  historyCache.history[rjCode] = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };
}

function getHistoryHit(rjCode) {
  const hit = historyCache.history?.[rjCode];
  if (!hit) return null;

  if (typeof hit === "string") {
    return {
      url: hit,
      alternateUrls: [],
      source: "history",
      updatedAt: "",
    };
  }

  return {
    url: hit.url,
    alternateUrls: getHistoryEntryAlternateUrls(hit),
    source: hit.source || "history",
    updatedAt: hit.updatedAt || "",
  };
}

function hasUserApiCredentials(config = getConfig()) {
  const tgConfig = config?.tg || {};
  return Boolean(tgConfig.apiId && tgConfig.apiHash && tgConfig.session);
}

async function getConnectedClient() {
  const config = getConfig();
  const tgConfig = config.tg || {};
  const { apiId, apiHash, session } = tgConfig;

  if (!apiId || !apiHash || !session) {
    throw new Error(
      "频道实时检索需要配置 apiId/apiHash/session（用于读取频道历史）。",
    );
  }

  if (!telegramClient || !telegramClientConnected) {
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
    telegramClientConnected = true;
    logger.debug("[tg-search-bot] Telegram User API 客户端已连接");
  }

  return telegramClient;
}

async function resolveEntity(client, channelIdInput) {
  const trimmed = normalizeChannelId(channelIdInput);
  const peerId = normalizePeerEntityInput(trimmed, {
    onBigIntError: (error) => {
      const normalizedError = normalizeError(error);
      logger.warn(
        "[tg-search-bot] channelId 转换 BigInt 失败，回退字符串",
        normalizedError.message,
      );
    },
  });

  try {
    return await client.getEntity(peerId);
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.warn(
      "[tg-search-bot] 本地缓存未命中频道，正在刷新对话",
      normalizedError.message,
    );
  }

  await client.getDialogs({ limit: 100 });
  return await client.getEntity(peerId);
}

async function searchRJInTelegramChannel(rjCode, runtimeConfig) {
  if (!runtimeConfig.sourceChannelId) {
    logger.warn("[tg-search-bot] 未配置频道 ID，跳过频道检索");
    return null;
  }

  try {
    const client = await getConnectedClient();
    const entity = await resolveEntity(client, runtimeConfig.sourceChannelId);

    // 优先使用 Telegram 服务端 search，避免在客户端全量遍历频道历史
    const searchLimit = Math.max(
      1,
      Math.min(runtimeConfig.searchLimit || 50, 50),
    );

    try {
      const iterator = client.iterMessages(entity, {
        search: rjCode,
        limit: searchLimit,
      });

      for await (const msg of iterator) {
        if (!msg) continue;
        const messageId = normalizeMessageIdFromPayload(msg);
        if (messageId === null) continue;

        const text = getTelegramMessageText(msg);
        const rjCodes = extractRJCodes(text);
        if (!rjCodes.includes(rjCode)) continue;

        const linkSet = buildMessageLinksByEntity(
          entity,
          runtimeConfig.sourceChannelId,
          messageId,
        );
        if (!linkSet.primaryUrl) {
          logger.warn(
            "[tg-search-bot] 匹配到 RJ 号，但无法构建消息链接",
            rjCode,
          );
          return null;
        }

        return {
          url: linkSet.primaryUrl,
          alternateUrls: linkSet.alternateUrls,
          source: "channel",
          messageId,
        };
      }

      return null;
    } catch (searchError) {
      const normalizedSearchError = normalizeError(searchError);
      logger.warn(
        "[tg-search-bot] 服务端 search 检索失败，回退频道遍历",
        normalizedSearchError.message,
      );
    }

    const fallbackIterator = client.iterMessages(entity, {
      limit: runtimeConfig.searchLimit,
    });

    for await (const msg of fallbackIterator) {
      if (!msg) continue;
      const messageId = normalizeMessageIdFromPayload(msg);
      if (messageId === null) continue;

      const text = getTelegramMessageText(msg);
      const rjCodes = extractRJCodes(text);
      if (!rjCodes.includes(rjCode)) continue;

      const linkSet = buildMessageLinksByEntity(
        entity,
        runtimeConfig.sourceChannelId,
        messageId,
      );
      if (!linkSet.primaryUrl) {
        logger.warn("[tg-search-bot] 匹配到 RJ 号，但无法构建消息链接", rjCode);
        return null;
      }

      return {
        url: linkSet.primaryUrl,
        alternateUrls: linkSet.alternateUrls,
        source: "channel",
        messageId,
      };
    }

    return null;
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.warn(
      "[tg-search-bot] 频道检索失败，继续前置包检索",
      normalizedError.message,
    );
    return null;
  }
}

async function searchRJInPresetFile(rjCode, runtimeConfig) {
  const presetIndex = await buildPresetIndexEntries(runtimeConfig);
  const targetCode = String(rjCode || "").toUpperCase();
  const hit = presetIndex.entries[targetCode];

  if (!hit) {
    return null;
  }

  return {
    source: "preset_cache",
    url: hit.url,
    matchedLine: hit.matchedLine || "",
    filePath: runtimeConfig.prePackagePath,
  };
}

async function buildPresetIndexEntries(runtimeConfig, options = {}) {
  const presetFilePath = runtimeConfig.prePackagePath;
  const cacheKey = `${presetFilePath || ""}::${runtimeConfig.prePackageLink || ""}`;
  const emptyResult = {
    entries: {},
    stats: createEmptyPresetIndexStats(),
    fromCache: false,
  };

  if (!presetFilePath) {
    return emptyResult;
  }

  const forceReload = options.forceReload === true;
  const now = Date.now();

  if (
    !forceReload &&
    presetIndexCache.initialized &&
    presetIndexCache.cacheKey === cacheKey &&
    now - presetIndexCache.checkedAt < PRESET_INDEX_CACHE_TTL_MS
  ) {
    return {
      entries: presetIndexCache.entries,
      stats: presetIndexCache.stats,
      fromCache: true,
    };
  }

  let fileStats = null;

  try {
    fileStats = await fs.stat(presetFilePath);
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.info("[tg-search-bot] 前置包文件不可访问", normalizedError.message);

    presetIndexCache = {
      initialized: true,
      cacheKey,
      checkedAt: now,
      mtimeMs: 0,
      fileSize: 0,
      entries: {},
      stats: createEmptyPresetIndexStats(),
    };

    return emptyResult;
  }

  if (
    !forceReload &&
    presetIndexCache.initialized &&
    presetIndexCache.cacheKey === cacheKey &&
    presetIndexCache.mtimeMs === fileStats.mtimeMs &&
    presetIndexCache.fileSize === fileStats.size
  ) {
    presetIndexCache.checkedAt = now;
    return {
      entries: presetIndexCache.entries,
      stats: presetIndexCache.stats,
      fromCache: true,
    };
  }

  try {
    const content = await fs.readFile(presetFilePath, "utf-8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const entries = {};
    const stats = createEmptyPresetIndexStats();

    for (const line of lines) {
      stats.presetScannedLines += 1;

      const rjCodes = extractRJCodes(line);
      if (!rjCodes.length) continue;

      stats.presetMatchedLines += 1;

      const matchedUrl =
        line.match(/https?:\/\/\S+/i)?.[0] ||
        runtimeConfig.prePackageLink ||
        "";

      if (!matchedUrl) {
        stats.presetSkippedNoUrl += rjCodes.length;
        continue;
      }

      for (const code of rjCodes) {
        if (entries[code]) continue;

        entries[code] = {
          url: matchedUrl,
          source: "preset_sync",
          filePath: presetFilePath,
          matchedLine: line,
        };
        stats.presetIndexedCodes += 1;
      }
    }

    presetIndexCache = {
      initialized: true,
      cacheKey,
      checkedAt: now,
      mtimeMs: fileStats.mtimeMs,
      fileSize: fileStats.size,
      entries,
      stats,
    };

    return {
      entries,
      stats,
      fromCache: false,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.warn("[tg-search-bot] 构建前置包索引失败", normalizedError.message);

    presetIndexCache = {
      initialized: true,
      cacheKey,
      checkedAt: now,
      mtimeMs: fileStats?.mtimeMs || 0,
      fileSize: fileStats?.size || 0,
      entries: {},
      stats: createEmptyPresetIndexStats(),
    };

    return emptyResult;
  }
}

export async function syncChannelHistoryToIndex(options = {}) {
  const runtimeConfig = getBotRuntimeConfig(getConfig());

  if (!runtimeConfig.sourceChannelId) {
    return {
      success: false,
      error: "未配置搜索频道 ID，请先在设置中填写 tg.searchChannelId",
    };
  }

  const requestedLimit = parseSearchLimit(options?.limit, 0);
  const fallbackLimit = parseSearchLimit(runtimeConfig.searchLimit, 3000);
  const scanLimit = requestedLimit > 0 ? requestedLimit : fallbackLimit;

  await ensureHistoryLoaded(runtimeConfig);

  try {
    const client = await getConnectedClient();
    const entity = await resolveEntity(client, runtimeConfig.sourceChannelId);

    const iterator = client.iterMessages(entity, {
      limit: scanLimit,
    });

    let scannedMessages = 0;
    let matchedMessages = 0;
    let newCount = 0;
    let updatedCount = 0;
    let skippedNoLink = 0;
    let presetAdded = 0;
    let presetUpdated = 0;
    let presetSkippedExisting = 0;

    for await (const msg of iterator) {
      if (!msg) continue;
      const messageId = normalizeMessageIdFromPayload(msg);
      if (messageId === null) continue;

      scannedMessages += 1;

      const text = getTelegramMessageText(msg);
      const rjCodes = extractRJCodes(text);
      if (!rjCodes.length) continue;

      const linkSet = buildMessageLinksByEntity(
        entity,
        runtimeConfig.sourceChannelId,
        messageId,
      );
      const url = linkSet.primaryUrl;

      if (!url) {
        skippedNoLink += 1;
        continue;
      }

      matchedMessages += 1;

      for (const code of rjCodes) {
        const existingUrl = getHistoryEntryUrl(historyCache.history?.[code]);

        if (!existingUrl) {
          newCount += 1;
        } else if (existingUrl !== url) {
          updatedCount += 1;
        }

        upsertHistory(code, {
          url,
          alternateUrls: linkSet.alternateUrls,
          source: "channel_sync",
          messageId,
        });
      }
    }

    const presetIndex = await buildPresetIndexEntries(runtimeConfig, {
      forceReload: true,
    });

    for (const [code, presetPayload] of Object.entries(presetIndex.entries)) {
      const existingEntry = historyCache.history?.[code];
      const existingUrl = getHistoryEntryUrl(existingEntry);
      const existingSource =
        typeof existingEntry === "string"
          ? "legacy"
          : String(existingEntry?.source || "");

      const fromChannelSource =
        existingSource === "channel" || existingSource.startsWith("channel_");
      const fromPresetSource =
        existingSource === "preset" || existingSource.startsWith("preset");

      if (!existingUrl) {
        newCount += 1;
        presetAdded += 1;
        upsertHistory(code, presetPayload);
        continue;
      }

      if (fromChannelSource) {
        presetSkippedExisting += 1;
        continue;
      }

      if (fromPresetSource && existingUrl !== presetPayload.url) {
        updatedCount += 1;
        presetUpdated += 1;
        upsertHistory(code, presetPayload);
        continue;
      }

      if (existingUrl !== presetPayload.url) {
        presetSkippedExisting += 1;
      }
    }

    await persistHistory();

    const totalIndexed = Object.keys(historyCache.history || {}).length;

    logger.info(
      `[tg-search-bot] 索引同步完成 scanned=${scannedMessages} matched=${matchedMessages} new=${newCount} updated=${updatedCount} presetScanned=${presetIndex.stats.presetScannedLines} presetMatched=${presetIndex.stats.presetMatchedLines} presetAdded=${presetAdded} presetUpdated=${presetUpdated} total=${totalIndexed}`,
    );

    return {
      success: true,
      message: `索引同步完成：新增 ${newCount}，更新 ${updatedCount}，总计 ${totalIndexed}`,
      stats: {
        scannedMessages,
        matchedMessages,
        newCount,
        updatedCount,
        skippedNoLink,
        presetAdded,
        presetUpdated,
        presetSkippedExisting,
        presetScannedLines: presetIndex.stats.presetScannedLines,
        presetMatchedLines: presetIndex.stats.presetMatchedLines,
        presetIndexedCodes: presetIndex.stats.presetIndexedCodes,
        presetSkippedNoUrl: presetIndex.stats.presetSkippedNoUrl,
        totalIndexed,
        scanLimit,
      },
      historyFilePath: runtimeConfig.historyFilePath,
      sourceChannelId: runtimeConfig.sourceChannelId,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] 索引同步失败", normalizedError.message);

    return {
      success: false,
      error: normalizedError.message,
      historyFilePath: runtimeConfig.historyFilePath,
      sourceChannelId: runtimeConfig.sourceChannelId,
    };
  }
}

export function triggerStartupHistorySync(options = {}) {
  if (startupSyncTask) {
    return startupSyncTask;
  }

  startupSyncTask = (async () => {
    const config = getConfig();
    const runtimeConfig = getBotRuntimeConfig(config);

    if (config?.tg?.botAutoSyncOnStartup === false) {
      logger.info("[tg-search-bot] 启动自动同步已关闭，跳过执行");
      return {
        success: true,
        skipped: true,
        reason: "auto_sync_disabled",
      };
    }

    // 启动时预热前置包索引，后续 /search 前置包兜底可 O(1) 命中
    const presetIndex = await buildPresetIndexEntries(runtimeConfig);
    logger.info(
      `[tg-search-bot] 启动预热前置包索引 indexed=${presetIndex.stats.presetIndexedCodes} cache=${presetIndex.fromCache}`,
    );

    if (!runtimeConfig.sourceChannelId) {
      logger.info(
        "[tg-search-bot] 启动自动同步跳过：未配置 tg.searchChannelId",
      );
      return {
        success: true,
        skipped: true,
        reason: "missing_search_channel",
      };
    }

    if (!hasUserApiCredentials(config)) {
      logger.info(
        "[tg-search-bot] 启动自动同步跳过：未配置 apiId/apiHash/session",
      );
      return {
        success: true,
        skipped: true,
        reason: "missing_user_api_credentials",
      };
    }

    logger.info(
      `[tg-search-bot] 启动自动同步开始 channel=${runtimeConfig.sourceChannelId} limit=${runtimeConfig.searchLimit}`,
    );

    const result = await syncChannelHistoryToIndex(options);

    if (result.success) {
      logger.info(
        `[tg-search-bot] 启动自动同步完成 total=${result?.stats?.totalIndexed ?? "unknown"}`,
      );
    } else {
      logger.warn(
        `[tg-search-bot] 启动自动同步失败: ${result.error || result.message || "unknown"}`,
      );
    }

    return result;
  })()
    .catch((error) => {
      const normalizedError = normalizeError(error);
      logger.error("[tg-search-bot] 启动自动同步异常", normalizedError.message);
      return {
        success: false,
        error: normalizedError.message,
      };
    })
    .finally(() => {
      startupSyncTask = null;
    });

  return startupSyncTask;
}

function logIncomingRequest(msg, runtimeConfig, commandName) {
  const debugEnabled = runtimeConfig.whitelistDebugLog === true;
  const requestContext = buildRequestLogContext(msg, commandName, {
    debugEnabled,
  });
  const permission = evaluatePermission(msg, runtimeConfig);

  logger.info(
    `[tg-search-bot] 请求 cmd=${requestContext.commandName} sender=${requestContext.senderId}(@${requestContext.senderUsername || "-"}) senderName=${requestContext.senderName || "-"} chat=${requestContext.chatId}(${requestContext.chatType}:${requestContext.chatTitle || "-"}) content="${requestContext.content || ""}" allowed=${permission.allowed} matchedUser=${permission.matchedUser} matchedChat=${permission.matchedChat}`,
  );

  if (!permission.allowed) {
    const allowedUsersText = debugEnabled
      ? `[${runtimeConfig.allowedUsers.join(",")}]`
      : `[count=${runtimeConfig.allowedUsers.length}]`;
    const allowedChatsText = debugEnabled
      ? `[${runtimeConfig.allowedChats.join(",")}]`
      : `[count=${runtimeConfig.allowedChats.length}]`;

    logger.warn(
      `[tg-search-bot] 白名单拒绝 cmd=${requestContext.commandName} sender=${debugEnabled ? permission.userId : maskField(permission.userId)} chat=${debugEnabled ? permission.chatId : maskField(permission.chatId)} allowedUsers=${allowedUsersText} allowedChats=${allowedChatsText}`,
    );
  }

  return permission;
}

function refreshChannelHitInBackground(rjCode, runtimeConfig) {
  if (!runtimeConfig.sourceChannelId) {
    return;
  }

  if (!hasUserApiCredentials(getConfig())) {
    return;
  }

  searchRJInTelegramChannel(rjCode, runtimeConfig)
    .then(async (channelResult) => {
      if (!channelResult?.url) {
        return;
      }

      upsertHistory(rjCode, {
        url: channelResult.url,
        alternateUrls: channelResult.alternateUrls || [],
        source: channelResult.source,
        messageId: channelResult.messageId,
      });
      await persistHistory();

      logger.info(`[tg-search-bot] 后台频道补充命中 ${rjCode}`);
    })
    .catch((error) => {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] 后台频道补充失败 ${rjCode}`,
        normalizedError.message,
      );
    });
}

export async function handleSearchRequest(rawInput) {
  const rjCode = normalizeWorkCodeInput(rawInput);
  if (!rjCode) {
    return {
      success: false,
      message: "无效的编号格式，请使用 RJ/VJ/BJ + 数字（如 RJ123456）",
    };
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  await ensureHistoryLoaded(runtimeConfig);

  const historyHit = getHistoryHit(rjCode);
  if (historyHit?.url) {
    return {
      success: true,
      url: historyHit.url,
      alternateUrls: [],
      message: `找到 ${rjCode}（历史索引）`,
      source: historyHit.source,
    };
  }

  const presetResult = await searchRJInPresetFile(rjCode, runtimeConfig);
  if (presetResult) {
    refreshChannelHitInBackground(rjCode, runtimeConfig);

    return {
      success: true,
      url: presetResult.url,
      alternateUrls: [],
      message: buildPresetFoundMessage(rjCode, presetResult),
      source: presetResult.source,
    };
  }

  const channelResult = await searchRJInTelegramChannel(rjCode, runtimeConfig);
  if (channelResult?.url) {
    upsertHistory(rjCode, {
      url: channelResult.url,
      alternateUrls: channelResult.alternateUrls || [],
      source: channelResult.source,
      messageId: channelResult.messageId,
    });
    await persistHistory();

    return {
      success: true,
      url: channelResult.url,
      alternateUrls: [],
      message: `找到 ${rjCode}（频道）`,
      source: channelResult.source,
    };
  }

  return {
    success: false,
    message: buildNotFoundMessage(rjCode),
  };
}

export async function handleInfoRequest(rawInput) {
  const workCode = normalizeWorkCodeInput(rawInput);
  if (!workCode) {
    return {
      success: false,
      message: "无效的编号格式，请使用 RJ/VJ/BJ + 数字（如 RJ123456）",
    };
  }

  const infoRuntimeConfig = getInfoCacheRuntimeConfig(getConfig());
  const result = await fetchWorkInfoByCode(workCode, {
    runtimeConfig: infoRuntimeConfig,
    preferCache: true,
    persistResult: true,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      message: result.error || `暂未找到 ${workCode} 的作品信息`,
    };
  }

  return {
    success: true,
    workCode,
    source: result.source || "unknown",
    data: result.data,
    message: `找到 ${workCode}（${result.source === "cache" ? "缓存" : "实时抓取"}）`,
  };
}

async function handleStartCommand(msg) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/start");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  const username = msg.from?.username || msg.from?.first_name || "用户";
  await bot.sendMessage(
    msg.chat.id,
    `👋 你好，${username}！\n\n` +
      `我是 KuruHaru 搜索 Bot。\n` +
      `你可以使用以下命令：\n` +
      `/search <RJ号> - 搜索资源\n` +
      `/info <编号> - 查询作品信息（RJ/VJ/BJ）\n` +
      `/help - 查看帮助`,
  );
}

async function handleHelpCommand(msg) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/help");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  await bot.sendMessage(
    msg.chat.id,
    `📖 帮助信息\n\n` +
      `/start - 启动说明\n` +
      `/search <编号> - 搜索资源（例如 /search RJ123456）\n` +
      `/info <编号> - 查询作品信息（例如 /info VJ123456）\n` +
      `群聊也支持：/search@BotName RJ123456 或 @BotName /search RJ123456\n` +
      `/help - 查看帮助\n\n` +
      `搜索优先级：历史索引 -> 前置包缓存 -> 频道补充\n` +
      `信息查询优先级：本地缓存 JSON -> 实时抓取并回填缓存`,
  );
}

function escapeRegExp(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickReplyQuote(rawText, preferredCode) {
  const text = String(rawText || "");
  if (!text) return "";

  const code = String(preferredCode || "").trim();
  if (code) {
    const matcher = new RegExp(escapeRegExp(code), "i");
    const match = text.match(matcher);
    if (match?.[0]) {
      return match[0];
    }
  }

  const firstLine = text.split(/\r?\n/)[0] || "";
  return firstLine.trim().slice(0, 120);
}

function buildReplyOptions(replyToMessageId, messageThreadId, replyQuote = "") {
  const options = {};

  const normalizedReplyTo = Number(replyToMessageId);
  if (Number.isFinite(normalizedReplyTo) && normalizedReplyTo > 0) {
    options.reply_parameters = {
      message_id: normalizedReplyTo,
      allow_sending_without_reply: false,
    };

    const quoteText = String(replyQuote || "").trim();
    if (quoteText) {
      options.reply_parameters.quote = quoteText;
    }
  }

  const normalizedThreadId = Number(messageThreadId);
  if (Number.isFinite(normalizedThreadId) && normalizedThreadId > 0) {
    options.message_thread_id = normalizedThreadId;
  }

  return options;
}

function isNotEnoughRightsToSendMessageError(error) {
  const normalizedError = normalizeError(error);
  const message = String(
    normalizedError?.error?.message ||
      normalizedError?.message ||
      error?.message ||
      "",
  ).toLowerCase();
  if (!message) return false;
  return message.includes(
    "not enough rights to send text messages to the chat",
  );
}

function getNormalizedErrorMessage(error, fallback = "unknown error") {
  const normalizedError = normalizeError(error);
  return (
    normalizedError?.error?.message ||
    normalizedError?.message ||
    error?.message ||
    fallback
  );
}

async function sendInfoReplyMessage({
  chatId,
  replyToMessageId,
  messageThreadId,
  replyQuote,
  workCode,
  data,
}) {
  if (!bot) return;

  const payload = formatWorkInfoMessage(data, workCode);
  const replyOptions = buildReplyOptions(
    replyToMessageId,
    messageThreadId,
    replyQuote,
  );

  const fallbackText = payload?.caption
    ? `${payload.caption}\n\n⚠️ 封面加载失败`
    : `✅ 找到 ${workCode}`;

  const replyMarkup = payload?.replyMarkup || null;

  if (!payload?.imageUrl) {
    await bot.sendMessage(chatId, fallbackText, {
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
      ...replyOptions,
    });
    return;
  }

  try {
    const sentMessage = await bot.sendPhoto(chatId, payload.imageUrl, {
      caption: payload.caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      ...replyOptions,
    });
    logger.info(
      `[tg-search-bot] 信息回复已发送 ${workCode} replyTo=${sentMessage?.reply_to_message?.message_id || 0}`,
    );
    return;
  } catch (primaryError) {
    const normalizedPrimaryError = normalizeError(primaryError);
    logger.warn(
      `[tg-search-bot] /info 主封面发送失败 ${workCode}`,
      normalizedPrimaryError.message,
    );
  }

  if (payload.fallbackImageUrl) {
    try {
      await bot.sendPhoto(chatId, payload.fallbackImageUrl, {
        caption: payload.caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        ...replyOptions,
      });
      return;
    } catch (fallbackError) {
      const normalizedFallbackError = normalizeError(fallbackError);
      logger.warn(
        `[tg-search-bot] /info 备用封面发送失败 ${workCode}`,
        normalizedFallbackError.message,
      );
    }
  }

  await bot.sendMessage(chatId, fallbackText, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
    ...replyOptions,
  });
}

function isCommandLikeMessage(text) {
  return /^\s*\/\w+/i.test(String(text || ""));
}

function normalizeWorkCodeInput(rawText) {
  const input = String(rawText || "").trim();
  if (!input) {
    return null;
  }

  const prefixedCode = extractRJCode(input);
  if (prefixedCode) {
    return prefixedCode;
  }

  if (NUMBER_ONLY_WORK_CODE_REGEX.test(input)) {
    return `RJ${input}`;
  }

  return null;
}

function extractPlainTextWorkCodes(rawText, maxCount = 3) {
  const text = String(rawText || "").trim();
  if (!text) {
    return [];
  }

  const prefixedCodes = extractRJCodes(text).slice(0, maxCount);
  if (prefixedCodes.length > 0) {
    return prefixedCodes;
  }

  const normalizedSingle = normalizeWorkCodeInput(text);
  if (!normalizedSingle) {
    return [];
  }

  return [normalizedSingle];
}

function isSingleWorkCodeText(text) {
  return Boolean(normalizeWorkCodeInput(text));
}

function extractCodesFromPlainTextContext(msg, maxCount = 3) {
  const text = String(msg?.text || msg?.caption || "").trim();
  const fromCurrent = extractPlainTextWorkCodes(text, maxCount);
  if (fromCurrent.length > 0) {
    return fromCurrent;
  }

  const repliedText = getTelegramMessageText(msg?.reply_to_message);
  if (!repliedText) {
    return [];
  }

  return extractPlainTextWorkCodes(repliedText, maxCount);
}

function resolveAutomaticForwardOrigin(msg) {
  if (!msg || msg.is_automatic_forward !== true) {
    return null;
  }

  const forwardOriginChat = msg.forward_origin?.chat || null;
  const forwardFromChat = msg.forward_from_chat || null;
  const senderChat =
    msg.sender_chat?.type === "channel" ? msg.sender_chat : null;

  const originChat = forwardFromChat || forwardOriginChat || senderChat;
  const externalOrigin = msg.external_reply?.origin;
  const externalOriginChat = externalOrigin?.chat || null;
  const externalOriginMessageId = Number(externalOrigin?.message_id || 0);
  const originMessageId = Number(
    msg.forward_from_message_id ||
      msg.forward_origin?.message_id ||
      externalOriginMessageId ||
      0,
  );

  if (
    !(originChat?.id || externalOriginChat?.id) ||
    !Number.isFinite(originMessageId) ||
    originMessageId <= 0
  ) {
    return null;
  }

  const resolvedChat = originChat || externalOriginChat;

  return {
    channelId: String(resolvedChat.id),
    channelUsername: String(resolvedChat.username || ""),
    messageId: originMessageId,
  };
}

function resolveChannelReplyOrigin(msg) {
  const directOrigin = resolveAutomaticForwardOrigin(msg);
  if (directOrigin) {
    return {
      origin: directOrigin,
      source: "message",
    };
  }

  const repliedOrigin = resolveAutomaticForwardOrigin(msg?.reply_to_message);
  if (repliedOrigin) {
    return {
      origin: repliedOrigin,
      source: "reply_to_message",
    };
  }

  return null;
}

function isAnonymousAdminMessage(msg) {
  if (!msg?.sender_chat?.id || !msg?.chat?.id) {
    return false;
  }

  return String(msg.sender_chat.id) === String(msg.chat.id);
}

async function runInfoLookupReplyFlow({
  chatId,
  replyToMessageId,
  messageThreadId,
  replyQuote,
  workCode,
  showSearchingMessage = true,
}) {
  if (!bot) return;

  let searchingMessage = null;

  if (showSearchingMessage) {
    try {
      searchingMessage = await bot.sendMessage(
        chatId,
        "🔍 正在查询...",
        buildReplyOptions(replyToMessageId, messageThreadId, replyQuote),
      );
    } catch (sendSearchingError) {
      const normalizedError = normalizeError(sendSearchingError);
      logger.warn(
        `[tg-search-bot] 发送查询占位消息失败 ${workCode}`,
        normalizedError.message,
      );
    }
  }

  try {
    const result = await handleInfoRequest(workCode);

    if (!result.success || !result.data) {
      if (searchingMessage?.message_id) {
        await bot.editMessageText(`❌ ${result.message}`, {
          chat_id: chatId,
          message_id: searchingMessage.message_id,
        });
        return;
      }

      await bot.sendMessage(chatId, `❌ ${result.message}`, {
        ...buildReplyOptions(replyToMessageId, messageThreadId, replyQuote),
      });
      return;
    }

    await sendInfoReplyMessage({
      chatId,
      replyToMessageId,
      messageThreadId,
      replyQuote,
      workCode: result.workCode || workCode,
      data: result.data,
    });

    if (searchingMessage?.message_id) {
      try {
        await bot.deleteMessage(chatId, searchingMessage.message_id);
      } catch (deleteError) {
        const normalizedDeleteError = normalizeError(deleteError);
        logger.debug(
          "[tg-search-bot] 删除查询占位消息失败（可忽略）",
          normalizedDeleteError.message,
        );
      }
    }
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error(
      `[tg-search-bot] 信息查询处理失败 ${workCode}`,
      normalizedError.message,
    );

    if (searchingMessage?.message_id) {
      await bot.editMessageText(`❌ 查询失败：${normalizedError.message}`, {
        chat_id: chatId,
        message_id: searchingMessage.message_id,
      });
      return;
    }

    await bot.sendMessage(chatId, `❌ 查询失败：${normalizedError.message}`, {
      ...buildReplyOptions(replyToMessageId, messageThreadId, replyQuote),
    });
  }
}

async function handleInfoCommand(msg, match) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/info");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  const requestedValue = (match?.[1] || "").trim();
  const workCode = normalizeWorkCodeInput(requestedValue);

  if (!workCode) {
    await bot.sendMessage(
      msg.chat.id,
      "❌ 无效的编号格式，请使用如 /info RJ123456（支持 RJ/VJ/BJ）",
    );
    return;
  }

  await runInfoLookupReplyFlow({
    chatId: msg.chat.id,
    replyToMessageId: msg.message_id,
    messageThreadId: msg.message_thread_id,
    replyQuote: pickReplyQuote(msg.text, workCode),
    workCode,
  });
}

async function handlePlainTextInfoMessage(msg) {
  if (!bot || !msg) return;

  if (markAndCheckPlainTextMessageDedupe(msg)) {
    return;
  }

  if (msg.date < botStartTimestamp) {
    return;
  }

  const anonymousAdminMessage = isAnonymousAdminMessage(msg);
  const allowBotLikeMessage =
    msg.is_automatic_forward === true || anonymousAdminMessage;
  if (msg.from?.is_bot && !allowBotLikeMessage) {
    logger.debug(
      `[tg-search-bot] 跳过机器人消息 message=${msg.message_id} chat=${msg.chat?.id}`,
    );
    return;
  }

  const text = String(msg.text || "").trim();
  logger.debug(
    `[tg-search-bot] 纯文本入口 message=${msg.message_id} chat=${msg.chat?.id} type=${msg.chat?.type} autoForward=${msg.is_automatic_forward === true} hasReply=${Boolean(msg.reply_to_message)} textLen=${text.length}`,
  );
  if (!text || isCommandLikeMessage(text)) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const codes = extractCodesFromPlainTextContext(msg, 3);
  if (!codes.length) {
    logger.debug(
      `[tg-search-bot] 纯文本消息未匹配到 RJ/VJ/BJ，message=${msg.message_id}`,
    );
    return;
  }

  const permission = logIncomingRequest(msg, runtimeConfig, "plain_text");
  if (!permission.allowed) {
    logger.debug(
      `[tg-search-bot] 纯文本消息权限未通过，chat=${permission.chatId} user=${permission.userId}`,
    );
    return;
  }

  // 某些部署环境收不到 channel_post 更新；另外群里回复自动转发贴时，也需要能反查原频道贴并回到频道。
  const channelReplyContext = resolveChannelReplyOrigin(msg);
  if (channelReplyContext?.origin) {
    const origin = channelReplyContext.origin;
    if (!origin) {
      logger.warn(
        `[tg-search-bot] 自动转发消息无法解析原频道/原贴 ID，message=${msg.message_id}`,
      );
      return;
    }

    const sourceChannelMatched = isSameChannel(
      { id: origin.channelId, username: origin.channelUsername },
      runtimeConfig.sourceChannelId,
    );
    if (!sourceChannelMatched) {
      logger.warn(
        `[tg-search-bot] 自动转发来源频道不匹配，仍按来源频道回帖 detected=${origin.channelId} configured=${runtimeConfig.sourceChannelId || "-"}`,
      );
    }

    logger.info(
      `[tg-search-bot] 自动转发回帖兜底触发 source=${channelReplyContext.source} channel=${origin.channelId} post=${origin.messageId}`,
    );

    for (const code of codes) {
      logger.debug(
        `[tg-search-bot] 自动转发兜底准备回帖 code=${code} channel=${origin.channelId} post=${origin.messageId}`,
      );
      const duplicated = markAndCheckInfoReplyDedupe(
        origin.channelId,
        origin.messageId,
        code,
      );
      if (duplicated) {
        continue;
      }

      await runInfoLookupReplyFlow({
        chatId: origin.channelId,
        replyToMessageId: origin.messageId,
        messageThreadId: undefined,
        replyQuote: pickReplyQuote(text, code),
        workCode: code,
        showSearchingMessage: false,
      });
    }
    return;
  }

  for (const code of codes) {
    logger.debug(
      `[tg-search-bot] 普通群消息准备回复 code=${code} chat=${msg.chat.id} message=${msg.message_id}`,
    );
    await runInfoLookupReplyFlow({
      chatId: msg.chat.id,
      replyToMessageId: msg.message_id,
      messageThreadId: msg.message_thread_id,
      replyQuote: pickReplyQuote(text, code),
      workCode: code,
    });
  }
}

async function handleSearchCommand(msg, match) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/search");
  if (!permission.allowed) {
    try {
      await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    } catch (error) {
      const errorMessage = getNormalizedErrorMessage(error);
      logger.warn(
        `[tg-search-bot] /search denied reply send failed chat=${msg.chat.id}`,
        errorMessage,
      );
    }
    return;
  }

  const requestedValue = (match?.[1] || "").trim();
  const rjCode = normalizeWorkCodeInput(requestedValue);

  if (!rjCode) {
    try {
      await bot.sendMessage(
        msg.chat.id,
        "❌ 无效的编号格式，请使用如 /search RJ123456（支持 RJ/VJ/BJ）",
      );
    } catch (error) {
      const errorMessage = getNormalizedErrorMessage(error);
      logger.warn(
        `[tg-search-bot] /search invalid-argument reply send failed chat=${msg.chat.id}`,
        errorMessage,
      );
    }
    return;
  }

  let searchingMessage = null;
  try {
    searchingMessage = await bot.sendMessage(
      msg.chat.id,
      `Searching ${rjCode}...`,
    );
  } catch (error) {
    const errorMessage = getNormalizedErrorMessage(error);
    if (isNotEnoughRightsToSendMessageError(error)) {
      logger.warn(
        `[tg-search-bot] /search cannot send message: insufficient chat rights chat=${msg.chat.id} code=${rjCode}`,
      );
      return;
    }

    logger.warn(
      `[tg-search-bot] /search failed to send placeholder message chat=${msg.chat.id} code=${rjCode}`,
      errorMessage,
    );
    return;
  }

  try {
    const result = await handleSearchRequest(rjCode);

    const responseText = result.success
      ? `\u2705 ${result.message}${result.url ? `\n${result.url}` : ""}`
      : `\u274c ${result.message}`;

    await bot.editMessageText(responseText, {
      chat_id: msg.chat.id,
      message_id: searchingMessage.message_id,
    });
  } catch (error) {
    const errorMessage = getNormalizedErrorMessage(error);
    logger.error("[tg-search-bot] /search 处理失败", errorMessage);

    try {
      await bot.editMessageText(`❌ 搜索失败：${errorMessage}`, {
        chat_id: msg.chat.id,
        message_id: searchingMessage.message_id,
      });
    } catch (editError) {
      const editErrorMessage = getNormalizedErrorMessage(editError);
      logger.warn(
        `[tg-search-bot] /search failed to edit result message chat=${msg.chat.id} code=${rjCode}`,
        editErrorMessage,
      );
      try {
        await bot.sendMessage(msg.chat.id, `❌ 搜索失败：${errorMessage}`);
      } catch (sendError) {
        logger.warn(
          `[tg-search-bot] /search failed to send fallback error message chat=${msg.chat.id} code=${rjCode}`,
          getNormalizedErrorMessage(sendError),
        );
      }
    }
  }
}

async function handleChannelPost(msg) {
  if (!msg) return;
  if (msg.date < botStartTimestamp) return;

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const sourceChannelMatched = isSameChannel(
    msg.chat,
    runtimeConfig.sourceChannelId,
  );

  const text = getTelegramMessageText(msg);
  const messageId = normalizeMessageIdFromPayload(msg);
  if (messageId === null) return;

  const rjCodes = extractRJCodes(text);
  if (!rjCodes.length && !isSingleWorkCodeText(text)) {
    return;
  }

  if (sourceChannelMatched && rjCodes.length) {
    await ensureHistoryLoaded(runtimeConfig);

    const linkSet = buildMessageLinksByChat(msg.chat, messageId);
    if (!linkSet.primaryUrl) {
      logger.warn("[tg-search-bot] channel_post 包含 RJ 号，但无法构建链接");
      return;
    }

    for (const code of rjCodes) {
      upsertHistory(code, {
        url: linkSet.primaryUrl,
        alternateUrls: linkSet.alternateUrls,
        source: "channel_post",
        messageId,
      });
    }

    await persistHistory();
    logger.info(
      `[tg-search-bot] 已通过 channel_post 更新 ${rjCodes.length} 条 RJ 索引`,
    );
  } else if (!sourceChannelMatched && rjCodes.length) {
    logger.debug(
      `[tg-search-bot] channel_post 来源非配置搜索频道，跳过索引同步 channel=${msg.chat?.id}`,
    );
  }

  // 频道纯文本模式：仅当贴文内容是单个 RJ/VJ/BJ 编号时，直接在频道内回复详情。
  const hasMedia = Boolean(
    msg.photo ||
    msg.document ||
    msg.video ||
    msg.audio ||
    msg.voice ||
    msg.animation ||
    msg.sticker,
  );
  if (hasMedia || !isSingleWorkCodeText(text) || isCommandLikeMessage(text)) {
    return;
  }

  const workCode = normalizeWorkCodeInput(text);
  if (!workCode) {
    return;
  }

  const duplicated = markAndCheckInfoReplyDedupe(
    msg.chat.id,
    messageId,
    workCode,
  );
  if (duplicated) {
    return;
  }

  logger.info(
    `[tg-search-bot] channel_post 纯文本信息查询触发 ${workCode} messageId=${messageId}`,
  );

  await runInfoLookupReplyFlow({
    chatId: msg.chat.id,
    replyToMessageId: messageId,
    messageThreadId: msg.message_thread_id,
    replyQuote: pickReplyQuote(text, workCode),
    workCode,
    showSearchingMessage: false,
  });
}

function setupBotHandlers() {
  if (!bot) return;

  const registerSafeOnText = (regex, handler, handlerName) => {
    bot.onText(regex, (msg, match) => {
      Promise.resolve(handler(msg, match)).catch((error) => {
        const normalizedError = normalizeError(error);
        logger.error(
          `[tg-search-bot] ${handlerName} handler failed`,
          normalizedError.message,
        );
      });
    });
  };

  registerSafeOnText(START_COMMAND_REGEX, handleStartCommand, "/start");
  registerSafeOnText(HELP_COMMAND_REGEX, handleHelpCommand, "/help");
  registerSafeOnText(SEARCH_COMMAND_REGEX, handleSearchCommand, "/search");
  registerSafeOnText(INFO_COMMAND_REGEX, handleInfoCommand, "/info");
  bot.on("message", (msg) => {
    handlePlainTextInfoMessage(msg).catch((error) => {
      const normalizedError = normalizeError(error);
      logger.error(
        "[tg-search-bot] 纯文本信息查询处理失败",
        normalizedError.message,
      );
    });
  });
  registerSafeOnText(
    /(?:RJ|VJ|BJ)\d{6,8}/i,
    (msg) => {
      return handlePlainTextInfoMessage(msg).catch((error) => {
        const normalizedError = normalizeError(error);
        logger.error(
          "[tg-search-bot] 纯文本信息查询(text 兜底)处理失败",
          normalizedError.message,
        );
      });
    },
    "plain_text_regex_fallback",
  );
  bot.on("channel_post", (msg) => {
    handleChannelPost(msg).catch((error) => {
      const normalizedError = normalizeError(error);
      logger.error(
        "[tg-search-bot] channel_post 处理失败",
        normalizedError.message,
      );
    });
  });

  bot.on("polling_error", (error) => {
    const errorMessage = getNormalizedErrorMessage(error);
    const rawMessage = String(error?.message || "");
    const errorCode = String(error?.code || "").trim();
    const details = [
      errorCode ? `code=${errorCode}` : "",
      errorMessage ? `message=${errorMessage}` : "",
      rawMessage && rawMessage !== errorMessage ? `raw=${rawMessage}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    logger.error(`[tg-search-bot] polling_error ${details}`.trim());

    const lowered = `${errorMessage} ${rawMessage}`.toLowerCase();
    if (lowered.includes("terminated by other getupdates request")) {
      logger.warn(
        "[tg-search-bot] detected polling conflict: close other bot instances using the same token",
      );
    } else if (
      lowered.includes("can't use getupdates method while webhook is active")
    ) {
      logger.warn(
        "[tg-search-bot] detected webhook conflict: disable webhook or switch to webhook mode",
      );
    }
  });

  bot.on("webhook_error", (error) => {
    const errorMessage = getNormalizedErrorMessage(error);
    const rawMessage = String(error?.message || "");
    const errorCode = String(error?.code || "").trim();
    const details = [
      errorCode ? `code=${errorCode}` : "",
      errorMessage ? `message=${errorMessage}` : "",
      rawMessage && rawMessage !== errorMessage ? `raw=${rawMessage}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    logger.error(`[tg-search-bot] webhook_error ${details}`.trim());
  });
}

async function syncBotCommandMenu() {
  if (!bot) return;

  for (const scopeItem of BOT_COMMAND_SCOPES) {
    const options = scopeItem.options;

    try {
      await bot.deleteMyCommands(options);
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] 清理命令菜单失败 scope=${scopeItem.name}`,
        normalizedError.message,
      );
    }

    try {
      await bot.setMyCommands(BOT_COMMANDS, options);
      logger.info(`[tg-search-bot] 已更新命令菜单 scope=${scopeItem.name}`);
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] 更新命令菜单失败 scope=${scopeItem.name}`,
        normalizedError.message,
      );
    }
  }
}

export async function startBot() {
  if (botRunning && bot) {
    await syncBotCommandMenu();
    return { success: true, message: "Bot 已在运行中（命令菜单已刷新）" };
  }

  const config = getConfig();
  const runtimeConfig = getBotRuntimeConfig(config);

  if (!runtimeConfig.botToken) {
    return {
      success: false,
      error: "未配置 Bot Token，请在设置中填写 tg.botToken",
    };
  }

  try {
    await ensureHistoryLoaded(runtimeConfig);

    if (runtimeConfig.mode === "webhook") {
      if (!runtimeConfig.webhookUrl) {
        return {
          success: false,
          error: "Webhook 模式需要配置 tg.botWebhookUrl",
        };
      }

      bot = new TelegramBot(runtimeConfig.botToken, {
        polling: false,
        webHook: {
          autoOpen: true,
          port: runtimeConfig.webhookPort,
          host: "0.0.0.0",
        },
      });

      await bot.setWebHook(runtimeConfig.webhookUrl, {
        allowed_updates: ["message", "channel_post", "edited_channel_post"],
      });
      runningMode = "webhook";
    } else {
      bot = new TelegramBot(runtimeConfig.botToken, {
        polling: {
          interval: 300,
          autoStart: false,
          params: {
            timeout: 10,
            allowed_updates: ["message", "channel_post", "edited_channel_post"],
          },
        },
      });

      try {
        await bot.deleteWebHook();
        logger.info("[tg-search-bot] polling startup cleared webhook state");
      } catch (error) {
        logger.warn(
          `[tg-search-bot] polling startup failed to clear webhook state ${getNormalizedErrorMessage(error)}`,
        );
      }

      runningMode = "polling";
    }

    setupBotHandlers();
    if (runningMode === "polling") {
      await bot.startPolling();
    }
    botStartTimestamp = Math.floor(Date.now() / 1000);

    const botInfo = await bot.getMe();
    await syncBotCommandMenu();
    botRunning = true;
    const hasWhitelist =
      runtimeConfig.allowedUsers.length > 0 ||
      runtimeConfig.allowedChats.length > 0;

    logger.info(
      `[tg-search-bot] Bot 启动成功: @${botInfo.username}, mode=${runningMode}, channel=${runtimeConfig.sourceChannelId || "未配置"}, whitelist=${hasWhitelist}, allowedUsers=${runtimeConfig.allowedUsers.length}, allowedChats=${runtimeConfig.allowedChats.length}, whitelistDebugLog=${runtimeConfig.whitelistDebugLog === true}`,
    );

    return {
      success: true,
      message: "Bot 启动成功",
      mode: runningMode,
      botInfo: {
        id: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name,
      },
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] Bot 启动失败", normalizedError.message);

    if (bot) {
      try {
        await bot.stopPolling();
      } catch (stopError) {
        const normalizedStopError = normalizeError(stopError);
        logger.warn(
          "[tg-search-bot] stopPolling 清理失败",
          normalizedStopError.message,
        );
      }

      bot.removeAllListeners();
    }

    bot = null;
    botRunning = false;

    return {
      success: false,
      error: normalizedError.message,
    };
  }
}

export async function stopBot() {
  if (!botRunning || !bot) {
    return { success: true, message: "Bot 已经停止" };
  }

  try {
    const settled = await Promise.allSettled([
      bot.stopPolling(),
      bot.deleteWebHook(),
      bot.closeWebHook(),
    ]);

    for (const item of settled) {
      if (item.status === "rejected") {
        const normalizedError = normalizeError(item.reason);
        logger.warn(
          "[tg-search-bot] 停止流程出现可忽略错误",
          normalizedError.message,
        );
      }
    }

    bot.removeAllListeners();
    bot = null;
    botRunning = false;

    if (telegramClient && telegramClientConnected) {
      await telegramClient.disconnect();
      telegramClientConnected = false;
      telegramClient = null;
    }

    logger.info("[tg-search-bot] Bot 停止成功");
    return { success: true, message: "Bot 停止成功" };
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] Bot 停止失败", normalizedError.message);
    return { success: false, error: normalizedError.message };
  }
}

export function getBotStatus() {
  const runtimeConfig = getBotRuntimeConfig(getConfig());

  return {
    running: botRunning,
    connected: botRunning && !!bot,
    mode: runningMode,
    indexedCount: Object.keys(historyCache.history || {}).length,
    historyFilePath: runtimeConfig.historyFilePath,
    sourceChannelId: runtimeConfig.sourceChannelId,
  };
}

export function setupTgSearchBotIPC() {
  logger.debug("[tg-search-bot] 正在初始化 IPC 处理器...");

  const handlers = [
    "tg-bot-search",
    "tg-bot-info",
    "tg-bot-start",
    "tg-bot-stop",
    "tg-bot-status",
    "tg-bot-sync-history",
  ];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] removeHandler(${handler}) 失败`,
        normalizedError.message,
      );
    }
  }

  ipcMain.handle("tg-bot-search", async (_event, rjCode) => {
    logger.debug(`[tg-search-bot] IPC 搜索请求: ${rjCode}`);
    return await handleSearchRequest(rjCode);
  });

  ipcMain.handle("tg-bot-info", async (_event, code) => {
    logger.debug(`[tg-search-bot] IPC 信息查询请求: ${code}`);
    return await handleInfoRequest(code);
  });

  ipcMain.handle("tg-bot-start", async () => {
    logger.debug("[tg-search-bot] IPC 启动 Bot 请求");
    return await startBot();
  });

  ipcMain.handle("tg-bot-stop", async () => {
    logger.debug("[tg-search-bot] IPC 停止 Bot 请求");
    return await stopBot();
  });

  ipcMain.handle("tg-bot-status", () => {
    return getBotStatus();
  });

  ipcMain.handle("tg-bot-sync-history", async (_event, options = {}) => {
    const requestedLimit = parseSearchLimit(options?.limit, 0);
    const runtimeConfig = getBotRuntimeConfig(getConfig());
    const effectiveLimit =
      requestedLimit > 0
        ? requestedLimit
        : parseSearchLimit(runtimeConfig.searchLimit, 3000);
    logger.debug(`[tg-search-bot] IPC 索引同步请求 limit=${effectiveLimit}`);
    return await syncChannelHistoryToIndex(options);
  });

  logger.debug("[tg-search-bot] 所有 IPC 处理器注册完成");
}
