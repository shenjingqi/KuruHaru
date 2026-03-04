/**
 * Telegram 搜索 Bot 模块（Bot API 版本）
 * 功能：
 * 1. 通过 Bot API 响应 /start /search /help
 * 2. 搜索优先级：历史索引 > 前置包内存索引（极速）> 频道检索（后台补充）
 * 3. 支持用户/群组白名单
 * 4. 支持 Polling（开发）与 Webhook（生产）模式
 */

import TelegramBot from "node-telegram-bot-api";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { ipcMain, app } from "electron";
import fs from "fs/promises";
import path from "path";
import { getConfig, getDataDir } from "./config";
import { normalizeError } from "../utils/errorHandler";
import { createLogSender } from "../utils/logger";

const logger = createLogSender("tg-search-bot");

const SEARCH_COMMAND_REGEX = /^(?:@\w+\s+)?\/search(?:@\w+)?\s+(.+)/i;
const START_COMMAND_REGEX = /^(?:@\w+\s+)?\/start(?:@\w+)?$/i;
const HELP_COMMAND_REGEX = /^(?:@\w+\s+)?\/help(?:@\w+)?$/i;
const RJ_CODE_REGEX = /RJ\d{6,8}/gi;

const BOT_COMMANDS = [
  { command: "start", description: "启动说明" },
  { command: "search", description: "搜索 RJ 资源" },
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

function createEmptyPresetIndexStats() {
  return {
    presetScannedLines: 0,
    presetMatchedLines: 0,
    presetIndexedCodes: 0,
    presetSkippedNoUrl: 0,
  };
}

let presetIndexCache = {
  initialized: false,
  cacheKey: "",
  checkedAt: 0,
  mtimeMs: 0,
  fileSize: 0,
  entries: {},
  stats: createEmptyPresetIndexStats(),
};

function normalizeIdList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[\n,，\s]+/)
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeChannelId(rawValue) {
  if (!rawValue) return "";
  return String(rawValue).trim();
}

function normalizeNumericChannelId(rawValue) {
  const normalized = normalizeChannelId(rawValue);
  if (!/^-?\d+$/.test(normalized)) return normalized;

  if (normalized.startsWith("-100")) return normalized;
  if (normalized.startsWith("-")) return normalized;
  return `-100${normalized}`;
}

function parseSearchLimit(rawValue, fallbackValue = 3000) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return fallbackValue;
  }

  const normalized = String(rawValue)
    .trim()
    .toLowerCase()
    .replace(/[，,\s]+/g, "");

  if (!normalized) {
    return fallbackValue;
  }

  const suffixMatch = normalized.match(/^(\d+(?:\.\d+)?)(w|万|k)?$/i);

  let parsedLimit = Number.NaN;
  if (suffixMatch) {
    const baseValue = Number(suffixMatch[1]);
    if (Number.isFinite(baseValue) && baseValue > 0) {
      const suffix = suffixMatch[2];
      const multiplier =
        suffix === "w" || suffix === "万" ? 10000 : suffix === "k" ? 1000 : 1;
      parsedLimit = baseValue * multiplier;
    }
  } else {
    const directValue = Number(normalized);
    if (Number.isFinite(directValue) && directValue > 0) {
      parsedLimit = directValue;
    }
  }

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsedLimit);
}

function toSafeBoolean(rawValue, fallbackValue = false) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    return rawValue !== 0;
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return fallbackValue;
}

function extractRJCode(rawText) {
  if (!rawText) return null;
  const match = String(rawText)
    .toUpperCase()
    .match(/RJ\d{6,8}/i);
  return match ? match[0].toUpperCase() : null;
}

function extractRJCodes(rawText) {
  if (!rawText) return [];
  const matches = String(rawText).toUpperCase().match(RJ_CODE_REGEX) || [];
  return [...new Set(matches.map((code) => code.toUpperCase()))];
}

function buildMessageLinkByChat(chat, messageId) {
  if (!chat || !messageId) return null;

  if (chat.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }

  const chatId = String(chat.id || "");
  if (/^-100\d+$/.test(chatId)) {
    return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  }

  return null;
}

function buildMessageLinkByEntity(entity, fallbackChannelId, messageId) {
  if (entity?.username) {
    return `https://t.me/${entity.username}/${messageId}`;
  }

  if (entity?.id) {
    return `https://t.me/c/${String(entity.id).replace(/^-/, "")}/${messageId}`;
  }

  const normalized = normalizeChannelId(fallbackChannelId).replace(/^@/, "");
  if (/^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(normalized)) {
    return `https://t.me/${normalized}/${messageId}`;
  }

  const numericId = normalizeNumericChannelId(normalized);
  if (/^-100\d+$/.test(numericId)) {
    return `https://t.me/c/${numericId.slice(4)}/${messageId}`;
  }

  return null;
}

function isSameChannel(chat, configuredChannelId) {
  if (!chat) return false;

  const normalizedChannelId = normalizeChannelId(configuredChannelId);
  if (!normalizedChannelId) return true;

  const chatId = normalizeNumericChannelId(chat.id);
  const targetNumericId = normalizeNumericChannelId(normalizedChannelId);

  if (/^-100\d+$/.test(targetNumericId) && chatId === targetNumericId) {
    return true;
  }

  const channelUsername = normalizedChannelId.replace(/^@/, "").toLowerCase();
  if (chat.username && chat.username.toLowerCase() === channelUsername) {
    return true;
  }

  return false;
}

function ensureHistoryShape(parsedData) {
  if (!parsedData || typeof parsedData !== "object") {
    return {
      updatedAt: new Date().toISOString(),
      history: {},
    };
  }

  if (!parsedData.history || typeof parsedData.history !== "object") {
    return {
      updatedAt: new Date().toISOString(),
      history: {},
    };
  }

  return {
    updatedAt: parsedData.updatedAt || new Date().toISOString(),
    history: parsedData.history,
  };
}

function getBotRuntimeConfig(config = getConfig()) {
  const tgConfig = config?.tg || {};
  const legacyBotConfig = tgConfig.bot || {};

  const botToken = tgConfig.botToken || legacyBotConfig.token || "";
  const sourceChannelId =
    tgConfig.searchChannelId || tgConfig.channel || tgConfig.discussion || "";

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
      source: "history",
      updatedAt: "",
    };
  }

  return {
    url: hit.url,
    source: hit.source || "history",
    updatedAt: hit.updatedAt || "",
  };
}

function getHistoryEntryUrl(historyEntry) {
  if (!historyEntry) return "";
  if (typeof historyEntry === "string") return historyEntry;
  if (typeof historyEntry.url === "string") return historyEntry.url;
  return "";
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
      },
    );

    telegramClient.setLogLevel("none");
    await telegramClient.connect();
    telegramClientConnected = true;
    logger.info("[tg-search-bot] Telegram User API 客户端已连接");
  }

  return telegramClient;
}

async function resolveEntity(client, channelIdInput) {
  let peerId = channelIdInput;
  const trimmed = normalizeChannelId(channelIdInput);

  if (/^-?\d+$/.test(trimmed)) {
    try {
      peerId = BigInt(trimmed);
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        "[tg-search-bot] channelId 转换 BigInt 失败，回退字符串",
        normalizedError.message,
      );
      peerId = trimmed;
    }
  }

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

        const text = msg.text || msg.caption || "";
        const rjCodes = extractRJCodes(text);
        if (!rjCodes.includes(rjCode)) continue;

        const url = buildMessageLinkByEntity(
          entity,
          runtimeConfig.sourceChannelId,
          msg.id,
        );
        if (!url) {
          logger.warn(
            "[tg-search-bot] 匹配到 RJ 号，但无法构建消息链接",
            rjCode,
          );
          return null;
        }

        return {
          url,
          source: "channel",
          messageId: msg.id,
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

      const text = msg.text || msg.caption || "";
      const rjCodes = extractRJCodes(text);
      if (!rjCodes.includes(rjCode)) continue;

      const url = buildMessageLinkByEntity(
        entity,
        runtimeConfig.sourceChannelId,
        msg.id,
      );
      if (!url) {
        logger.warn("[tg-search-bot] 匹配到 RJ 号，但无法构建消息链接", rjCode);
        return null;
      }

      return {
        url,
        source: "channel",
        messageId: msg.id,
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

      scannedMessages += 1;

      const text = msg.text || msg.caption || "";
      const rjCodes = extractRJCodes(text);
      if (!rjCodes.length) continue;

      const url = buildMessageLinkByEntity(
        entity,
        runtimeConfig.sourceChannelId,
        msg.id,
      );

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
          source: "channel_sync",
          messageId: msg.id,
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

function evaluatePermission(msg, runtimeConfig) {
  const userId = String(msg?.from?.id || "");
  const chatId = String(msg?.chat?.id || "");
  const { allowedUsers, allowedChats } = runtimeConfig;

  const matchedUser = allowedUsers.includes(userId);
  const matchedChat = allowedChats.includes(chatId);
  const hasWhitelist = allowedUsers.length > 0 || allowedChats.length > 0;

  return {
    allowed: !hasWhitelist || matchedUser || matchedChat,
    userId,
    chatId,
    matchedUser,
    matchedChat,
    hasWhitelist,
  };
}

function maskField(rawValue) {
  const text = String(rawValue || "");
  if (!text) return "-";
  if (text.length <= 4) return `${text[0]}***`;
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function normalizeRequestContent(rawValue, debugEnabled) {
  const normalized = String(rawValue || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  if (debugEnabled) {
    return normalized.length > 280
      ? `${normalized.slice(0, 280)}...`
      : normalized;
  }

  return `[redacted length=${normalized.length}]`;
}

function buildRequestLogContext(msg, commandName, options = {}) {
  const debugEnabled = options.debugEnabled === true;
  const from = msg?.from || {};
  const chat = msg?.chat || {};
  const senderId = String(from.id || "");
  const senderUsername = from.username || "";
  const senderName = [from.first_name, from.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const chatId = String(chat.id || "");
  const chatType = String(chat.type || "unknown");
  const chatTitle = chat.title || chat.username || "";
  const content = normalizeRequestContent(
    msg?.text || msg?.caption || "",
    debugEnabled,
  );

  return {
    commandName,
    senderId: debugEnabled ? senderId : maskField(senderId),
    senderUsername: debugEnabled
      ? senderUsername || "-"
      : maskField(senderUsername),
    senderName: debugEnabled ? senderName || "-" : maskField(senderName),
    chatId: debugEnabled ? chatId : maskField(chatId),
    chatType,
    chatTitle: debugEnabled ? chatTitle || "-" : maskField(chatTitle),
    content,
  };
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

function buildNotFoundMessage(rjCode) {
  return `暂未找到 ${rjCode}\n请在 one 站查看是否拥有，或在频道提出。`;
}

function buildPresetFoundMessage(rjCode, presetResult) {
  if (presetResult.url) {
    return `找到 ${rjCode}（前置包缓存）\n${presetResult.url}`;
  }

  return `找到 ${rjCode}（前置包缓存）\n文件：${presetResult.filePath}`;
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
  const rjCode = extractRJCode(rawInput);
  if (!rjCode) {
    return {
      success: false,
      message: "无效的 RJ 号格式，请使用如 RJ123456",
    };
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  await ensureHistoryLoaded(runtimeConfig);

  const historyHit = getHistoryHit(rjCode);
  if (historyHit?.url) {
    return {
      success: true,
      url: historyHit.url,
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
      message: buildPresetFoundMessage(rjCode, presetResult),
      source: presetResult.source,
    };
  }

  const channelResult = await searchRJInTelegramChannel(rjCode, runtimeConfig);
  if (channelResult?.url) {
    upsertHistory(rjCode, {
      url: channelResult.url,
      source: channelResult.source,
      messageId: channelResult.messageId,
    });
    await persistHistory();

    return {
      success: true,
      url: channelResult.url,
      message: `找到 ${rjCode}（频道）`,
      source: channelResult.source,
    };
  }

  return {
    success: false,
    message: buildNotFoundMessage(rjCode),
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
      `/search <RJ号> - 搜索资源（例如 /search RJ123456）\n` +
      `群聊也支持：/search@BotName RJ123456 或 @BotName /search RJ123456\n` +
      `/help - 查看帮助\n\n` +
      `搜索优先级：历史索引 -> 前置包缓存 -> 频道补充`,
  );
}

async function handleSearchCommand(msg, match) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/search");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  const requestedValue = (match?.[1] || "").trim();
  const rjCode = extractRJCode(requestedValue);

  if (!rjCode) {
    await bot.sendMessage(
      msg.chat.id,
      "❌ 无效的 RJ 号格式，请使用如 /search RJ123456",
    );
    return;
  }

  const searchingMessage = await bot.sendMessage(
    msg.chat.id,
    `🔍 正在搜索 ${rjCode}...`,
  );

  try {
    const result = await handleSearchRequest(rjCode);

    const responseText = result.success
      ? `✅ ${result.message}${result.url ? `\n${result.url}` : ""}`
      : `❌ ${result.message}`;

    await bot.editMessageText(responseText, {
      chat_id: msg.chat.id,
      message_id: searchingMessage.message_id,
    });
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] /search 处理失败", normalizedError.message);

    await bot.editMessageText(`❌ 搜索失败：${normalizedError.message}`, {
      chat_id: msg.chat.id,
      message_id: searchingMessage.message_id,
    });
  }
}

async function handleChannelPost(msg) {
  if (!msg) return;
  if (msg.date < botStartTimestamp) return;

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  if (!isSameChannel(msg.chat, runtimeConfig.sourceChannelId)) {
    return;
  }

  const text = msg.text || msg.caption || "";
  const rjCodes = extractRJCodes(text);
  if (!rjCodes.length) return;

  await ensureHistoryLoaded(runtimeConfig);

  const url = buildMessageLinkByChat(msg.chat, msg.message_id);
  if (!url) {
    logger.warn("[tg-search-bot] channel_post 包含 RJ 号，但无法构建链接");
    return;
  }

  for (const code of rjCodes) {
    upsertHistory(code, {
      url,
      source: "channel_post",
      messageId: msg.message_id,
    });
  }

  await persistHistory();
  logger.info(
    `[tg-search-bot] 已通过 channel_post 更新 ${rjCodes.length} 条 RJ 索引`,
  );
}

function setupBotHandlers() {
  if (!bot) return;

  bot.onText(START_COMMAND_REGEX, handleStartCommand);
  bot.onText(HELP_COMMAND_REGEX, handleHelpCommand);
  bot.onText(SEARCH_COMMAND_REGEX, handleSearchCommand);
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
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] polling_error", normalizedError.message);
  });

  bot.on("webhook_error", (error) => {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] webhook_error", normalizedError.message);
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

      await bot.setWebHook(runtimeConfig.webhookUrl);
      runningMode = "webhook";
    } else {
      bot = new TelegramBot(runtimeConfig.botToken, {
        polling: {
          interval: 300,
          autoStart: true,
          params: {
            timeout: 10,
          },
        },
      });

      runningMode = "polling";
    }

    setupBotHandlers();
    botStartTimestamp = Math.floor(Date.now() / 1000);

    const botInfo = await bot.getMe();
    await syncBotCommandMenu();
    botRunning = true;

    logger.info(
      `[tg-search-bot] Bot 启动成功: @${botInfo.username}, mode=${runningMode}, channel=${runtimeConfig.sourceChannelId || "未配置"}`,
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
  logger.info("[tg-search-bot] 正在初始化 IPC 处理器...");

  const handlers = [
    "tg-bot-search",
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
    logger.info(`[tg-search-bot] IPC 搜索请求: ${rjCode}`);
    return await handleSearchRequest(rjCode);
  });

  ipcMain.handle("tg-bot-start", async () => {
    logger.info("[tg-search-bot] IPC 启动 Bot 请求");
    return await startBot();
  });

  ipcMain.handle("tg-bot-stop", async () => {
    logger.info("[tg-search-bot] IPC 停止 Bot 请求");
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
    logger.info(`[tg-search-bot] IPC 索引同步请求 limit=${effectiveLimit}`);
    return await syncChannelHistoryToIndex(options);
  });

  logger.info("[tg-search-bot] 所有 IPC 处理器注册完成");
}
