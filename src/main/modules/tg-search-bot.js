/**
 * Telegram 搜索 Bot 模块（Bot API 版本）
 * 功能：
 * 1. 通过 Bot API 响应 /start /search /info /help
 * 2. 搜索优先级：历史上传索引 > 前置包内存索引 > One 入队
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
import { enqueueRunningTranslationWork } from "./translation-automation.js";
import { normalizeError } from "../utils/errorHandler";
import { createLogSender } from "../utils/logger";
import { getAsmrClient } from "./httpClient";
import {
  normalizeIdList,
  normalizeChannelId,
  parseSearchLimit,
  toSafeBoolean,
  ensureHistoryShape,
} from "./tg-search-bot-core/normalizers";
import {
  extractMentionSearchWorkCodeToken,
  extractRJCode,
  extractRJCodes,
} from "./tg-search-bot-core/rj-parsers";
import {
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
  extractWorksArrayBasic,
  getAsmrSearchBrowserHeaders,
} from "./asmr-core/search-utils";
import {
  fetchWorkInfoByCode,
  formatWorkInfoMessage,
  getInfoCacheRuntimeConfig,
} from "./tg-info-cache";
import { getTranslationAutomationStatus } from "./translation-automation";
import {
  generateDailyZip,
  getLatestDailyZip,
  prefetchDailyZipSources,
} from "./tg-daily-zip";

const logger = createLogSender("tg-search-bot");

const SEARCH_COMMAND_REGEX = /^(?:@\w+\s+)?\/search(?:@\w+)?\s+(.+)/i;
const INFO_COMMAND_REGEX = /^(?:@\w+\s+)?\/info(?:@\w+)?\s+(.+)/i;
const START_COMMAND_REGEX = /^(?:@\w+\s+)?\/start(?:@\w+)?$/i;
const HELP_COMMAND_REGEX = /^(?:@\w+\s+)?\/help(?:@\w+)?$/i;
const STATUS_COMMAND_REGEX = /^(?:@\w+\s+)?\/status(?:@\w+)?$/i;
const ZIP_COMMAND_REGEX = /^(?:@\w+\s+)?\/zip(?:@\w+)?$/i;

const BOT_COMMANDS = [
  { command: "start", description: "启动说明" },
  { command: "search", description: "搜索 RJ/VJ/BJ 资源链接" },
  { command: "info", description: "查询 RJ/VJ/BJ 详情" },
  { command: "status", description: "查看自动翻译队列状态" },
  { command: "zip", description: "获取最近上传资源整合包链接" },
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
let currentBotUsername = "";

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
const ONE_SEARCH_PAGE_SIZE = 10;
const ONE_SEARCH_API_PREFIX = "https://api.asmr-200.com/api/search/";
const ONE_QUEUE_ADD_WORKS_API =
  "https://api.asmr-200.com/api/playlist/add-works-to-playlist";
const QUEUE_CHECK_MAX_PAGES = 200;
const SEARCH_COMMAND_TIMEOUT_MS = 45000;
const DEFAULT_TRANSLATION_QUEUE_CACHE_REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_SEARCH_RETRY_DELAY_MS = 60 * 1000;
const SEARCH_PIPELINE_STAGE = {
  history: "历史索引",
  preset: "前置包",
  channel: "频道",
  one: "One",
  queue: "入队",
};
const ONE_QUEUE_BLOCKED_TAGS = [
  "BL/男同性恋",
  "男性胸部",
  "扶她",
  "男子怀孕/出产",
  "男無",
  "人妖/双性人",
  "GAY/男同",
  "女性向",
  "大男子主义",
  "蕾丝/女同",
  "性转换(TS)",
  "男同性恋",
  "百合",
  "伪娘",
  "同性爱者",
];
const ONE_QUEUE_BLOCKED_TAG_LOOKUP = new Set(
  ONE_QUEUE_BLOCKED_TAGS.map((tag) => normalizeQueueBlockedTag(tag)),
);

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
let translationQueueCachePath = "";
let translationQueueCache = {
  updatedAt: "",
  playlistId: "",
  works: [],
};
let translationQueueRefreshTimer = null;
let searchRetryQueuePath = "";
let searchRetryQueue = {
  updatedAt: "",
  tasks: [],
};
let searchRetryTimer = null;
let searchRetryProcessing = false;
let dailyZipInitialTimer = null;
let dailyZipIntervalTimer = null;
let dailyZipPrefetchInitialTimer = null;
let dailyZipPrefetchIntervalTimer = null;

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
  const syncSearchCacheOnUpload = toSafeBoolean(
    tgConfig.botSyncSearchCacheOnUpload,
    true,
  );
  const whitelistDebugLog = toSafeBoolean(tgConfig.botWhitelistDebugLog, false);
  const configuredHistoryPath =
    tgConfig.botHistoryPath ||
    legacyBotConfig.historyPath ||
    path.join(getDataDir(), "tg-bot-history.json");
  const translationQueueCacheRefreshMs = Number(
    tgConfig.translationQueueCacheRefreshMs,
  );
  const searchRetryDelayMs = Number(tgConfig.searchRetryDelayMs);
  const searchRetryMaxAttempts = Number(tgConfig.searchRetryMaxAttempts);

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
    syncSearchCacheOnUpload,
    whitelistDebugLog,
    historyFilePath: configuredHistoryPath,
    translationQueueCachePath:
      tgConfig.translationQueueCachePath ||
      path.join(getDataDir(), "tg-translation-queue-cache.json"),
    translationQueueCacheRefreshMs:
      Number.isFinite(translationQueueCacheRefreshMs) &&
      translationQueueCacheRefreshMs > 0
        ? translationQueueCacheRefreshMs
        : DEFAULT_TRANSLATION_QUEUE_CACHE_REFRESH_MS,
    searchRetryQueuePath:
      tgConfig.searchRetryQueuePath ||
      path.join(getDataDir(), "tg-search-retry-queue.json"),
    searchRetryDelayMs:
      Number.isFinite(searchRetryDelayMs) && searchRetryDelayMs > 0
        ? searchRetryDelayMs
        : DEFAULT_SEARCH_RETRY_DELAY_MS,
    searchRetryMaxAttempts:
      Number.isFinite(searchRetryMaxAttempts) && searchRetryMaxAttempts >= 0
        ? Math.floor(searchRetryMaxAttempts)
        : 0,
  };
}

function getTranslationQueueRuntimeConfig(config = getConfig()) {
  const asmrConfig = config?.asmr || {};

  const token = String(asmrConfig.token || "").trim();
  const configuredPlaylistId = String(
    asmrConfig.translationQueuePlaylistId ||
      asmrConfig.pendingTranslationQueuePlaylistId ||
      asmrConfig.pendingTranslationPlaylistId ||
      asmrConfig.playlistId ||
      "",
  ).trim();

  return {
    token,
    playlistId: configuredPlaylistId,
  };
}

function normalizeTranslationQueueCache(rawCache, playlistId = "") {
  const works = Array.isArray(rawCache?.works)
    ? rawCache.works.filter((work) => work && typeof work === "object")
    : [];

  return {
    updatedAt: String(rawCache?.updatedAt || ""),
    playlistId: String(rawCache?.playlistId || playlistId || "").trim(),
    works,
  };
}

async function ensureTranslationQueueCacheLoaded(runtimeConfig) {
  const nextPath = String(
    runtimeConfig?.translationQueueCachePath || "",
  ).trim();
  const playlistId = String(
    getTranslationQueueRuntimeConfig(getConfig()).playlistId || "",
  ).trim();

  if (
    translationQueueCachePath === nextPath &&
    translationQueueCache.playlistId === playlistId
  ) {
    return;
  }

  translationQueueCachePath = nextPath;
  translationQueueCache = normalizeTranslationQueueCache({}, playlistId);

  if (!translationQueueCachePath) {
    return;
  }

  try {
    await fs.mkdir(path.dirname(translationQueueCachePath), {
      recursive: true,
    });
    const content = await fs.readFile(translationQueueCachePath, "utf-8");
    const loadedCache = normalizeTranslationQueueCache(JSON.parse(content));
    translationQueueCache =
      loadedCache.playlistId === playlistId
        ? loadedCache
        : normalizeTranslationQueueCache({}, playlistId);
  } catch (error) {
    const normalizedError = normalizeError(error);
    if (normalizedError.code !== "ENOENT") {
      logger.warn(
        "[tg-search-bot] 待翻译队列本地缓存读取失败，已使用空缓存",
        normalizedError.message,
      );
    }
  }
}

async function getTranslationQueueCachedCount(runtimeConfig) {
  await ensureTranslationQueueCacheLoaded(runtimeConfig);
  return translationQueueCache.works.length;
}

async function persistTranslationQueueCache() {
  if (!translationQueueCachePath) {
    return;
  }

  try {
    translationQueueCache.updatedAt = new Date().toISOString();
    await fs.writeFile(
      translationQueueCachePath,
      JSON.stringify(translationQueueCache, null, 2),
      "utf-8",
    );
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error(
      "[tg-search-bot] 待翻译队列本地缓存写入失败",
      normalizedError.message,
    );
  }
}

function findTranslationQueueCacheHit(workCode, workId = "") {
  return translationQueueCache.works.find((work) =>
    isSameOneWork(work, workCode, workId),
  );
}

async function addWorkToTranslationQueueCache(work) {
  if (!work || typeof work !== "object") {
    return;
  }

  const workId = String(work.id || "").trim();
  const sourceId = String(work.source_id || "")
    .trim()
    .toUpperCase();
  if (!workId && !sourceId) {
    return;
  }

  if (findTranslationQueueCacheHit(sourceId, workId)) {
    return;
  }

  translationQueueCache.works.push({
    id: workId,
    source_id: sourceId,
  });
  await persistTranslationQueueCache();
}

async function refreshTranslationQueueCache() {
  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const queueRuntimeConfig = getTranslationQueueRuntimeConfig(getConfig());
  const playlistId = String(queueRuntimeConfig.playlistId || "").trim();

  await ensureTranslationQueueCacheLoaded(runtimeConfig);
  if (!playlistId) {
    return { success: false, error: "未配置待翻译队列 playlistId" };
  }

  const headers = {};
  if (queueRuntimeConfig.token) {
    headers.Authorization = `Bearer ${queueRuntimeConfig.token}`;
  }

  const asmrClient = getAsmrClient();
  const works = [];
  const pageSize = 100;

  for (let page = 1; page <= QUEUE_CHECK_MAX_PAGES; page += 1) {
    const url =
      "https://api.asmr.one/api/playlist/get-playlist-works" +
      `?id=${encodeURIComponent(playlistId)}&page=${page}&pageSize=${pageSize}`;
    const response = await asmrClient.get(url, {
      headers,
      timeout: 30000,
    });
    const pageWorks = extractWorksArrayBasic(response?.data).filter(
      (work) => work && typeof work === "object",
    );
    works.push(...pageWorks);

    const totalCount = Number(response?.data?.pagination?.totalCount || 0);
    if (
      pageWorks.length < pageSize ||
      (totalCount > 0 && page * pageSize >= totalCount)
    ) {
      break;
    }
  }

  translationQueueCache = normalizeTranslationQueueCache(
    {
      updatedAt: new Date().toISOString(),
      playlistId,
      works,
    },
    playlistId,
  );
  await persistTranslationQueueCache();
  logger.info(
    `[tg-search-bot] 待翻译队列本地缓存已刷新 playlist=${playlistId} works=${works.length}`,
  );
  return { success: true, count: works.length };
}

function stopTranslationQueueCacheScheduler() {
  if (translationQueueRefreshTimer) {
    clearInterval(translationQueueRefreshTimer);
    translationQueueRefreshTimer = null;
  }
}

function startTranslationQueueCacheScheduler() {
  stopTranslationQueueCacheScheduler();
  const runtimeConfig = getBotRuntimeConfig(getConfig());

  refreshTranslationQueueCache().catch((error) => {
    logger.warn(
      "[tg-search-bot] 待翻译队列定时刷新首次执行失败",
      getNormalizedErrorMessage(error),
    );
  });

  translationQueueRefreshTimer = setInterval(() => {
    refreshTranslationQueueCache().catch((error) => {
      logger.warn(
        "[tg-search-bot] 待翻译队列定时刷新失败",
        getNormalizedErrorMessage(error),
      );
    });
  }, runtimeConfig.translationQueueCacheRefreshMs);
  translationQueueRefreshTimer.unref?.();
}

function normalizeSearchRetryQueue(rawQueue) {
  return {
    updatedAt: String(rawQueue?.updatedAt || ""),
    tasks: Array.isArray(rawQueue?.tasks)
      ? rawQueue.tasks.filter(
          (task) =>
            task &&
            typeof task === "object" &&
            String(task.workCode || "").trim() &&
            String(task.chatId || "").trim(),
        )
      : [],
  };
}

async function ensureSearchRetryQueueLoaded(runtimeConfig) {
  const nextPath = String(runtimeConfig?.searchRetryQueuePath || "").trim();
  if (searchRetryQueuePath === nextPath) {
    return;
  }

  searchRetryQueuePath = nextPath;
  searchRetryQueue = normalizeSearchRetryQueue({});
  if (!searchRetryQueuePath) {
    return;
  }

  try {
    await fs.mkdir(path.dirname(searchRetryQueuePath), { recursive: true });
    const content = await fs.readFile(searchRetryQueuePath, "utf-8");
    searchRetryQueue = normalizeSearchRetryQueue(JSON.parse(content));
  } catch (error) {
    const normalizedError = normalizeError(error);
    if (normalizedError.code !== "ENOENT") {
      logger.warn(
        "[tg-search-bot] 搜索重试队列读取失败，已使用空队列",
        normalizedError.message,
      );
    }
  }
}

async function persistSearchRetryQueue() {
  if (!searchRetryQueuePath) {
    return;
  }

  try {
    searchRetryQueue.updatedAt = new Date().toISOString();
    await fs.writeFile(
      searchRetryQueuePath,
      JSON.stringify(searchRetryQueue, null, 2),
      "utf-8",
    );
  } catch (error) {
    logger.error(
      "[tg-search-bot] 搜索重试队列写入失败",
      getNormalizedErrorMessage(error),
    );
  }
}

function buildSearchRetryTaskKey({ chatId, messageThreadId, workCode }) {
  return `${String(chatId)}:${String(messageThreadId || "")}:${String(workCode).toUpperCase()}`;
}

async function enqueueSearchRetry({ msg, workCode, commandName }) {
  const runtimeConfig = getBotRuntimeConfig(getConfig());
  await ensureSearchRetryQueueLoaded(runtimeConfig);

  const taskKey = buildSearchRetryTaskKey({
    chatId: msg.chat.id,
    messageThreadId: msg.message_thread_id,
    workCode,
  });
  const existingTask = searchRetryQueue.tasks.find(
    (task) => task.taskKey === taskKey,
  );
  if (existingTask) {
    return { queued: false, retryAt: existingTask.retryAt };
  }

  const retryAt = Date.now() + runtimeConfig.searchRetryDelayMs;
  searchRetryQueue.tasks.push({
    taskKey,
    chatId: msg.chat.id,
    messageThreadId: msg.message_thread_id || null,
    replyToMessageId: msg.message_id || null,
    workCode,
    commandName,
    retryAt,
    attempt: 0,
    createdAt: new Date().toISOString(),
  });
  await persistSearchRetryQueue();
  scheduleSearchRetryProcessing();
  return { queued: true, retryAt };
}

function stopSearchRetryScheduler() {
  if (searchRetryTimer) {
    clearTimeout(searchRetryTimer);
    searchRetryTimer = null;
  }
}

function scheduleSearchRetryProcessing() {
  stopSearchRetryScheduler();
  if (!searchRetryQueue.tasks.length) {
    return;
  }

  const nextRetryAt = Math.min(
    ...searchRetryQueue.tasks.map((task) => Number(task.retryAt) || Date.now()),
  );
  const delay = Math.max(0, nextRetryAt - Date.now());
  searchRetryTimer = setTimeout(() => {
    processPendingSearchRetries().catch((error) => {
      logger.error(
        "[tg-search-bot] 搜索重试队列处理失败",
        getNormalizedErrorMessage(error),
      );
    });
  }, delay);
  searchRetryTimer.unref?.();
}

function buildRetryMessageOptions(task) {
  const options = {};
  if (task.replyToMessageId) {
    options.reply_to_message_id = task.replyToMessageId;
  }
  if (task.messageThreadId) {
    options.message_thread_id = task.messageThreadId;
  }
  return options;
}

async function processPendingSearchRetries() {
  if (searchRetryProcessing || !botRunning || !bot) {
    return;
  }

  searchRetryProcessing = true;
  try {
    const runtimeConfig = getBotRuntimeConfig(getConfig());
    await ensureSearchRetryQueueLoaded(runtimeConfig);
    const now = Date.now();
    const pendingTasks = [];

    for (const task of searchRetryQueue.tasks) {
      if (Number(task.retryAt) > now) {
        pendingTasks.push(task);
        continue;
      }

      const nextAttempt = Number(task.attempt || 0) + 1;
      try {
        const result = await withOperationTimeout(
          handleSearchRequest(task.workCode, { enableOneQueue: true }),
          SEARCH_COMMAND_TIMEOUT_MS,
          `搜索 ${task.workCode}`,
        );

        if (!result.success && result.retryable !== true) {
          const responseText = `❌ ${task.workCode} 自动重试结果：${
            result.message || "未找到可用结果"
          }`;
          let notificationSent = false;
          try {
            await bot.sendMessage(
              task.chatId,
              responseText,
              buildRetryMessageOptions(task),
            );
            notificationSent = true;
          } catch (error) {
            logger.warn(
              `[tg-search-bot] 搜索重试得到业务结果，但通知发送失败，仍移出错误池 code=${task.workCode} chat=${task.chatId}`,
              getNormalizedErrorMessage(error),
            );
          }
          logger.info(
            `[tg-search-bot] 搜索重试得到业务结果，移出错误池 code=${task.workCode} chat=${task.chatId} notification=${notificationSent ? "sent" : "failed"} message=${result.message || "-"}`,
          );
          continue;
        }

        if (!result.success) {
          throw new Error(result.message || "搜索未成功");
        }

        const responseText = `✅ ${task.workCode} 自动重试成功：${result.message}${
          shouldAppendResultUrl(result) ? `\n${result.url}` : ""
        }`;
        let notificationSent = false;
        try {
          await bot.sendMessage(
            task.chatId,
            responseText,
            buildRetryMessageOptions(task),
          );
          notificationSent = true;
        } catch (error) {
          logger.warn(
            `[tg-search-bot] 搜索重试成功，但通知发送失败，仍移出错误池 code=${task.workCode} chat=${task.chatId}`,
            getNormalizedErrorMessage(error),
          );
        }
        logger.info(
          `[tg-search-bot] 搜索重试成功，移出错误池 code=${task.workCode} chat=${task.chatId} attempt=${nextAttempt} notification=${notificationSent ? "sent" : "failed"}`,
        );
      } catch (error) {
        const hasAttemptLimit = runtimeConfig.searchRetryMaxAttempts > 0;
        if (
          !hasAttemptLimit ||
          nextAttempt < runtimeConfig.searchRetryMaxAttempts
        ) {
          pendingTasks.push({
            ...task,
            attempt: nextAttempt,
            retryAt: Date.now() + runtimeConfig.searchRetryDelayMs,
            lastError: getNormalizedErrorMessage(error),
          });
          logger.warn(
            `[tg-search-bot] 搜索重试失败，继续保留错误池 code=${task.workCode} chat=${task.chatId} attempt=${nextAttempt}${
              hasAttemptLimit
                ? `/${runtimeConfig.searchRetryMaxAttempts}`
                : "/unlimited"
            }`,
            getNormalizedErrorMessage(error),
          );
          continue;
        }

        logger.error(
          `[tg-search-bot] 搜索重试已耗尽 code=${task.workCode} chat=${task.chatId} attempts=${nextAttempt}`,
          getNormalizedErrorMessage(error),
        );
      }
    }

    searchRetryQueue.tasks = pendingTasks;
    await persistSearchRetryQueue();
  } finally {
    searchRetryProcessing = false;
    scheduleSearchRetryProcessing();
  }
}

function startSearchRetryScheduler() {
  const runtimeConfig = getBotRuntimeConfig(getConfig());
  ensureSearchRetryQueueLoaded(runtimeConfig)
    .then(() => processPendingSearchRetries())
    .catch((error) => {
      logger.warn(
        "[tg-search-bot] 搜索重试队列初始化失败",
        getNormalizedErrorMessage(error),
      );
    });
}

function buildOneSearchUrl(workCode) {
  return `${ONE_SEARCH_API_PREFIX}${encodeURIComponent(workCode)}?order=create_date&sort=desc&pageSize=${ONE_SEARCH_PAGE_SIZE}&page=1`;
}

function resolveOneSearchMatchedWork(rawPayload, workCode) {
  const works = extractWorksArrayBasic(rawPayload).filter(
    (item) => item && typeof item === "object",
  );
  if (!works.length) {
    return null;
  }

  const normalizedCode = String(workCode || "")
    .trim()
    .toUpperCase();
  const matchedBySourceId = works.find(
    (item) =>
      String(item?.source_id || "")
        .trim()
        .toUpperCase() === normalizedCode,
  );
  if (matchedBySourceId) {
    return matchedBySourceId;
  }

  const targetNumeric = normalizedCode
    .replace(/^[A-Z]{2}/, "")
    .replace(/^0+/, "");
  if (targetNumeric) {
    const matchedByNumeric = works.find((item) => {
      const sourceNumeric = String(item?.source_id || "")
        .trim()
        .toUpperCase()
        .replace(/^[A-Z]{2}/, "")
        .replace(/^0+/, "");
      const idNumeric = String(item?.id || "").replace(/^0+/, "");
      return sourceNumeric === targetNumeric || idNumeric === targetNumeric;
    });

    if (matchedByNumeric) {
      return matchedByNumeric;
    }
  }

  return works[0] || null;
}

function extractOnePrimaryTagName(tag) {
  const value =
    tag?.name ||
    tag?.i18n?.["zh-cn"]?.name ||
    tag?.i18n?.["ja-jp"]?.name ||
    tag?.i18n?.["en-us"]?.name ||
    "";

  return String(value).trim();
}

function extractOneTagCandidateNames(tag) {
  const names = [
    tag?.name,
    tag?.i18n?.["zh-cn"]?.name,
    tag?.i18n?.["ja-jp"]?.name,
    tag?.i18n?.["en-us"]?.name,
  ];

  ["zh-cn", "ja-jp", "en-us"].forEach((localeKey) => {
    const histories = Array.isArray(tag?.i18n?.[localeKey]?.history)
      ? tag.i18n[localeKey].history
      : [];
    histories.forEach((history) => {
      names.push(history?.name);
    });
  });

  return [
    ...new Set(
      names.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

function extractOneTagNames(work, options = {}) {
  const includeLowWishTags = options.includeLowWishTags === true;
  const includeAliases = options.includeAliases === true;
  const tags = Array.isArray(work?.tags) ? work.tags : [];
  const tagNames = tags
    .filter((tag) => tag && typeof tag === "object")
    .filter(
      (tag) =>
        includeLowWishTags ||
        tag.voteStatus === undefined ||
        Number(tag.voteStatus) === 1,
    )
    .flatMap((tag) =>
      includeAliases
        ? extractOneTagCandidateNames(tag)
        : [extractOnePrimaryTagName(tag)],
    )
    .filter(Boolean);

  return [...new Set(tagNames)];
}

function normalizeQueueBlockedTag(tag) {
  return String(tag || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getBlockedQueueTags(tags) {
  const tagList = Array.isArray(tags) ? tags : [];

  return [...new Set(tagList)]
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag) =>
      ONE_QUEUE_BLOCKED_TAG_LOOKUP.has(normalizeQueueBlockedTag(tag)),
    );
}

function buildOneWorkUrl(work, fallbackCode = "") {
  const sourceId = String(work?.source_id || fallbackCode || "")
    .trim()
    .toUpperCase();
  if (!sourceId) {
    return "";
  }

  return `https://www.asmr.one/work/${sourceId}`;
}

function hasOneSubtitleFlag(work) {
  const value = work?.has_subtitle;

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function buildOneEditionLookupCode(edition = {}) {
  const sourceId = String(edition?.source_id || "")
    .trim()
    .toUpperCase();
  if (sourceId) {
    return sourceId;
  }

  const editionId = String(edition?.id || "").trim();
  if (!editionId) {
    return "";
  }

  return `RJ${editionId.padStart(8, "0")}`;
}

async function fetchOneMatchedWorkByCode(workCode) {
  const asmrClient = getAsmrClient();
  const searchUrl = buildOneSearchUrl(workCode);
  const headers = getAsmrSearchBrowserHeaders({
    includeCompression: true,
  });

  try {
    const response = await asmrClient.get(searchUrl, {
      timeout: 30000,
      headers,
    });

    const matchedWork = resolveOneSearchMatchedWork(response?.data, workCode);
    if (!matchedWork) {
      return {
        success: false,
        error: `One站未找到 ${workCode}`,
      };
    }

    return {
      success: true,
      work: matchedWork,
      workUrl: buildOneWorkUrl(matchedWork, workCode),
      tags: extractOneTagNames(matchedWork),
      blockedTagCandidates: extractOneTagNames(matchedWork, {
        includeLowWishTags: true,
        includeAliases: true,
      }),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    return {
      success: false,
      error:
        normalizedError.error?.message ||
        normalizedError.message ||
        "One站检索失败",
      retryable: true,
    };
  }
}

async function searchWorkInOneByCode(workCode) {
  return await fetchOneMatchedWorkByCode(workCode);
}

function normalizeOneEditionLanguage(rawValue) {
  return String(rawValue || "").trim();
}

function isChineseOneEditionLanguage(rawValue) {
  const normalized = normalizeOneEditionLanguage(rawValue).toLowerCase();

  return (
    normalized.includes("中文") ||
    normalized.includes("汉化") ||
    normalized.includes("漢化") ||
    normalized.includes("chinese") ||
    normalized === "zh" ||
    normalized.startsWith("zh-")
  );
}

function isJapaneseOneEditionLanguage(rawValue) {
  const normalized = normalizeOneEditionLanguage(rawValue).toLowerCase();

  return (
    normalized.includes("日本語") ||
    normalized.includes("日文") ||
    normalized.includes("japanese") ||
    normalized === "ja" ||
    normalized.startsWith("ja-")
  );
}

function pickPreferredOneSubtitleCandidate(candidates = []) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const scoredCandidates = candidates.map((candidate, index) => {
    const lang = normalizeOneEditionLanguage(candidate?.lang);
    let score = 0;

    if (isChineseOneEditionLanguage(lang)) {
      score += 100;
    } else if (lang && !isJapaneseOneEditionLanguage(lang)) {
      score += 10;
    } else if (!lang) {
      score += 1;
    }

    return {
      candidate,
      score,
      index,
    };
  });

  scoredCandidates.sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );

  return scoredCandidates[0]?.candidate || null;
}

function buildOneSubtitleHitMessage(requestedCode, subtitleTarget) {
  const targetCode = String(subtitleTarget?.sourceId || requestedCode || "")
    .trim()
    .toUpperCase();
  const lang = normalizeOneEditionLanguage(subtitleTarget?.lang);

  if (lang && targetCode) {
    return `本地未找到 ${requestedCode}，但 One 站已存在 ${lang} 字幕版本 ${targetCode}`;
  }

  if (targetCode) {
    return `本地未找到 ${requestedCode}，但 One 站已存在对应汉化版本 ${targetCode}`;
  }

  return `本地未找到 ${requestedCode}，但 One 站已存在对应汉化版本`;
}

async function resolveOneSubtitleTarget(work, workCode) {
  if (!work || typeof work !== "object") {
    return null;
  }

  const currentSourceId = String(work?.source_id || "")
    .trim()
    .toUpperCase();
  const currentWorkUrl = buildOneWorkUrl(work, workCode);
  const editionCodes = [
    ...new Set(
      (Array.isArray(work?.other_language_editions_in_db)
        ? work.other_language_editions_in_db
        : []
      )
        .map((edition) => buildOneEditionLookupCode(edition))
        .filter(Boolean)
        .filter((editionCode) => editionCode !== currentSourceId),
    ),
  ];

  if (editionCodes.length) {
    const editionEntries = (
      Array.isArray(work?.other_language_editions_in_db)
        ? work.other_language_editions_in_db
        : []
    ).filter((edition) => {
      const editionCode = buildOneEditionLookupCode(edition);
      return editionCode && editionCode !== currentSourceId;
    });

    const results = await Promise.allSettled(
      editionEntries.map((edition) =>
        fetchOneMatchedWorkByCode(buildOneEditionLookupCode(edition)),
      ),
    );

    const subtitleCandidates = results
      .map((result, index) => {
        if (result.status !== "fulfilled" || !result.value?.success) {
          return null;
        }

        if (!hasOneSubtitleFlag(result.value.work)) {
          return null;
        }

        const edition = editionEntries[index] || {};
        const sourceId = String(
          result.value.work?.source_id || buildOneEditionLookupCode(edition),
        )
          .trim()
          .toUpperCase();

        return {
          sourceId,
          lang: normalizeOneEditionLanguage(edition?.lang),
          workUrl:
            result.value.workUrl ||
            buildOneWorkUrl(result.value.work, sourceId),
          work: result.value.work,
        };
      })
      .filter(Boolean);

    const preferredEdition =
      pickPreferredOneSubtitleCandidate(subtitleCandidates);
    if (preferredEdition) {
      return preferredEdition;
    }
  }

  if (hasOneSubtitleFlag(work)) {
    return {
      sourceId:
        currentSourceId ||
        String(workCode || "")
          .trim()
          .toUpperCase(),
      lang: "",
      workUrl: currentWorkUrl,
      work,
    };
  }

  return null;
}

function isAlreadyInTranslationQueueError(error) {
  const normalizedError = normalizeError(error);
  const message = String(
    normalizedError.error?.message || normalizedError.message || "",
  ).toLowerCase();

  return (
    message.includes("already") ||
    message.includes("exists") ||
    message.includes("已存在") ||
    message.includes("重复")
  );
}

function extractOneApiErrorMessage(rawData) {
  if (!rawData) {
    return "";
  }

  if (typeof rawData === "string") {
    const text = rawData.trim();
    if (!text) {
      return "";
    }

    const lowered = text.toLowerCase();
    if (lowered === "ok" || lowered === "success") {
      return "";
    }

    return text;
  }

  if (typeof rawData !== "object") {
    return "";
  }

  const candidates = [
    rawData.message,
    rawData.msg,
    rawData.error,
    rawData.errmsg,
    rawData.detail,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) {
      return text;
    }
  }

  if (rawData.success === false) {
    return "接口返回 success=false";
  }

  const numericCode = Number(rawData.code);
  if (
    Number.isFinite(numericCode) &&
    numericCode !== 0 &&
    numericCode !== 200
  ) {
    return `接口返回 code=${numericCode}`;
  }

  return "";
}

function normalizeWorkNumericPart(rawValue) {
  return String(rawValue || "")
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]{2}/, "")
    .replace(/^0+/, "");
}

function isSameOneWork(work, workCode, workId) {
  if (!work || typeof work !== "object") {
    return false;
  }

  const normalizedCode = String(workCode || "")
    .trim()
    .toUpperCase();
  const expectedNumeric = normalizeWorkNumericPart(normalizedCode);
  const expectedId = String(workId || "").trim();

  const sourceId = String(work?.source_id || "")
    .trim()
    .toUpperCase();
  const sourceNumeric = normalizeWorkNumericPart(sourceId);
  const itemId = String(work?.id || "").trim();
  const itemIdNumeric = String(itemId).replace(/^0+/, "");

  if (normalizedCode && sourceId === normalizedCode) {
    return true;
  }

  if (
    expectedNumeric &&
    (sourceNumeric === expectedNumeric || itemIdNumeric === expectedNumeric)
  ) {
    return true;
  }

  return Boolean(expectedId && itemId === expectedId);
}

async function isWorkInPlaylist(queueRuntimeConfig, workCode, workId) {
  const playlistId = String(queueRuntimeConfig?.playlistId || "").trim();
  if (!playlistId) {
    return false;
  }

  const headers = {};
  if (queueRuntimeConfig?.token) {
    headers.Authorization = `Bearer ${queueRuntimeConfig.token}`;
  }

  const asmrClient = getAsmrClient();
  const pageSize = 100;

  for (let page = 1; page <= QUEUE_CHECK_MAX_PAGES; page += 1) {
    const url =
      "https://api.asmr.one/api/playlist/get-playlist-works" +
      `?id=${encodeURIComponent(playlistId)}&page=${page}&pageSize=${pageSize}`;

    try {
      const response = await asmrClient.get(url, {
        headers,
        timeout: 30000,
      });

      const works = extractWorksArrayBasic(response?.data).filter(
        (item) => item && typeof item === "object",
      );
      if (!works.length) {
        return false;
      }

      if (works.some((work) => isSameOneWork(work, workCode, workId))) {
        return true;
      }

      const totalCount = Number(response?.data?.pagination?.totalCount || 0);
      if (works.length < pageSize) {
        return false;
      }

      if (totalCount > 0 && page * pageSize >= totalCount) {
        return false;
      }
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] 查询待翻译队列失败 playlist=${playlistId} page=${page}`,
        normalizedError.message,
      );
      return false;
    }
  }

  return false;
}

function buildQueuePlaylistUrl(queueRuntimeConfig) {
  const playlistId = String(queueRuntimeConfig?.playlistId || "").trim();
  if (!playlistId) {
    return "";
  }

  return `https://asmr.one/playlist?id=${playlistId}`;
}

function buildMaskedQueueSuccessResult(queueRuntimeConfig) {
  return {
    success: true,
    alreadyQueued: false,
    playlistId: String(queueRuntimeConfig?.playlistId || "").trim(),
    queueUrl: buildQueuePlaylistUrl(queueRuntimeConfig),
    submittedIdentifier: "",
    maskedByTag: true,
  };
}

async function addWorkToTranslationQueue(
  workCode,
  queueRuntimeConfig,
  matchedWork = null,
) {
  if (!queueRuntimeConfig?.token) {
    return {
      success: false,
      error: "未配置 asmr.token，无法加入待翻译队列",
    };
  }

  if (!queueRuntimeConfig?.playlistId) {
    return {
      success: false,
      error: "未配置待翻译队列 playlistId",
    };
  }

  const headers = {
    Authorization: `Bearer ${queueRuntimeConfig.token}`,
    "Content-Type": "application/json",
  };
  const asmrClient = getAsmrClient();
  const matchedWorkId = String(matchedWork?.id || "").trim();
  const candidateWorks = [
    matchedWorkId,
    String(matchedWork?.source_id || "")
      .trim()
      .toUpperCase(),
    String(workCode || "")
      .trim()
      .toUpperCase(),
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidateWorks)];

  const attemptMessages = [];

  for (const candidate of uniqueCandidates) {
    try {
      const response = await asmrClient.post(
        ONE_QUEUE_ADD_WORKS_API,
        {
          id: queueRuntimeConfig.playlistId,
          works: [candidate],
        },
        {
          headers,
          timeout: 30000,
        },
      );

      if (!(response?.status >= 200 && response?.status < 300)) {
        attemptMessages.push(
          `${candidate}: HTTP ${response?.status || "unknown"}`,
        );
        continue;
      }

      const apiErrorMessage = extractOneApiErrorMessage(response?.data);
      if (apiErrorMessage) {
        if (isAlreadyInTranslationQueueError({ message: apiErrorMessage })) {
          return {
            success: true,
            alreadyQueued: true,
            playlistId: queueRuntimeConfig.playlistId,
            queueUrl: buildQueuePlaylistUrl(queueRuntimeConfig),
            submittedIdentifier: candidate,
          };
        }

        attemptMessages.push(`${candidate}: ${apiErrorMessage}`);
        continue;
      }

      confirmQueuedWorkInBackground(
        queueRuntimeConfig,
        workCode,
        matchedWorkId || null,
        candidate,
      );

      return {
        success: true,
        alreadyQueued: false,
        playlistId: queueRuntimeConfig.playlistId,
        queueUrl: buildQueuePlaylistUrl(queueRuntimeConfig),
        submittedIdentifier: candidate,
      };
    } catch (error) {
      if (isAlreadyInTranslationQueueError(error)) {
        return {
          success: true,
          alreadyQueued: true,
          playlistId: queueRuntimeConfig.playlistId,
          queueUrl: buildQueuePlaylistUrl(queueRuntimeConfig),
          submittedIdentifier: candidate,
        };
      }

      const normalizedError = normalizeError(error);
      attemptMessages.push(
        `${candidate}: ${normalizedError.error?.message || normalizedError.message || "unknown error"}`,
      );
    }
  }

  return {
    success: false,
    retryable: true,
    error:
      attemptMessages.length > 0
        ? attemptMessages.join(" | ")
        : "加入待翻译队列失败",
  };
}

export function enqueueWorkToTranslationQueue(workCode, matchedWork = null) {
  const queueRuntimeConfig = getTranslationQueueRuntimeConfig(getConfig());
  return addWorkToTranslationQueue(workCode, queueRuntimeConfig, matchedWork);
}

function confirmQueuedWorkInBackground(
  queueRuntimeConfig,
  workCode,
  workId,
  submittedIdentifier,
) {
  Promise.resolve()
    .then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return await isWorkInPlaylist(queueRuntimeConfig, workCode, workId);
    })
    .then((confirmed) => {
      if (confirmed) {
        logger.info(
          `[tg-search-bot] 待翻译队列后台确认成功 code=${workCode} submitted=${submittedIdentifier || "-"}`,
        );
        return;
      }

      logger.info(
        `[tg-search-bot] 待翻译队列后台确认暂未命中 code=${workCode} submitted=${submittedIdentifier || "-"}`,
      );
    })
    .catch((error) => {
      const normalizedError = normalizeError(error);
      logger.info(
        `[tg-search-bot] 待翻译队列后台确认失败 code=${workCode} submitted=${submittedIdentifier || "-"}`,
        normalizedError.message,
      );
    });
}

function buildQueueMessageSuffix(queueContext) {
  if (!queueContext) {
    return "";
  }

  const queueText = queueContext.alreadyQueued
    ? "，已在待翻译队列"
    : "，已加入待翻译队列";
  const tags = Array.isArray(queueContext.tags) ? queueContext.tags : [];
  const subtitleLabel = String(queueContext.subtitleLabel || "").trim();
  const queueUrl = String(queueContext.queueUrl || "").trim();

  const metaParts = [];
  if (tags.length) {
    const tagSnippet = tags.slice(0, 6).join("/");
    const suffix = tags.length > 6 ? "..." : "";
    metaParts.push(`Tag: ${tagSnippet}${suffix}`);
  }

  if (subtitleLabel) {
    metaParts.push(subtitleLabel);
  }

  const metaText = metaParts.length ? `（${metaParts.join("；")}）` : "";

  let queueLinkText = "";
  if (queueUrl) {
    queueLinkText = `，队列: ${queueUrl}`;
  }

  return `${queueText}${metaText}${queueLinkText}`;
}

function shouldAppendResultUrl(result) {
  const url = String(result?.url || "").trim();
  if (!url) {
    return false;
  }

  const message = String(result?.message || "");
  return !message.includes(url);
}

function logSearchPipelineStage(workCode, stage, status, detail = "") {
  const suffix = String(detail || "").trim();
  logger.info(
    `[tg-search-bot] /search pipeline code=${workCode} stage=${stage} status=${status}${suffix ? ` ${suffix}` : ""}`,
  );
}

function logSearchPipelineSkipStages(workCode, stages = [], reason = "") {
  for (const stage of stages) {
    logSearchPipelineStage(workCode, stage, "skip", reason);
  }
}

function extractChannelUsernameFromTgLink(rawUrl) {
  const normalizedUrl = String(rawUrl || "").trim();
  const matched = normalizedUrl.match(
    /^https?:\/\/t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,})(?:\/\d+)?(?:[/?#].*)?$/i,
  );
  return matched ? matched[1] : "";
}

function getPreferredLinkChannelId(runtimeConfig = {}) {
  const sourceChannelId = normalizeChannelId(runtimeConfig.sourceChannelId);
  const sourceChannelUsername = sourceChannelId.replace(/^@/, "");

  if (/^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(sourceChannelUsername)) {
    return `@${sourceChannelUsername}`;
  }

  const fallbackUsername = extractChannelUsernameFromTgLink(
    runtimeConfig.prePackageLink,
  );
  if (fallbackUsername) {
    return `@${fallbackUsername}`;
  }

  return sourceChannelId;
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

function collectWorkCodesFromUploadRecord(record) {
  const codeSet = new Set();
  const candidates = [
    record?.code,
    record?.rjCode,
    record?.sourceId,
    record?.source_id,
    record?.title,
    record?.name,
    record?.fileName,
    record?.path,
  ];

  for (const candidate of candidates) {
    extractRJCodes(candidate).forEach((code) => codeSet.add(code));

    const normalizedCode = normalizeWorkCodeInput(candidate);
    if (normalizedCode) {
      codeSet.add(normalizedCode);
    }
  }

  return [...codeSet];
}

function extractUploadRecordMessageId(record) {
  const candidates = [
    record?.titleMessageId,
    record?.messageId,
    record?.msgId,
    record?.fileMessageId,
  ];

  for (const candidate of candidates) {
    const normalizedId = normalizeMessageIdFromPayload(candidate);
    if (normalizedId !== null) {
      return normalizedId;
    }
  }

  return null;
}

function resolveUploadHistoryChannelId(runtimeConfig, rawChannelId) {
  const uploadChannelId = normalizeChannelId(rawChannelId);
  if (!uploadChannelId) {
    return getPreferredLinkChannelId(runtimeConfig);
  }

  const sourceChannelId = normalizeChannelId(runtimeConfig?.sourceChannelId);
  if (
    sourceChannelId &&
    isSameChannel({ id: uploadChannelId }, runtimeConfig.sourceChannelId)
  ) {
    return getPreferredLinkChannelId(runtimeConfig);
  }

  return uploadChannelId;
}

export async function syncSearchHistoryFromUploadRecords(payload = {}) {
  const runtimeConfig = getBotRuntimeConfig(getConfig());
  if (!runtimeConfig.syncSearchCacheOnUpload) {
    return {
      success: true,
      skipped: true,
      reason: "botSyncSearchCacheOnUpload=false",
      scannedRecords: 0,
      matchedCodes: 0,
      updatedCount: 0,
      skippedNoCode: 0,
      skippedNoMessageId: 0,
      skippedNoLink: 0,
      historyFilePath: runtimeConfig.historyFilePath,
    };
  }

  const records = Array.isArray(payload?.uploadedFiles)
    ? payload.uploadedFiles
    : Array.isArray(payload?.records)
      ? payload.records
      : [];

  if (!records.length) {
    return {
      success: true,
      scannedRecords: 0,
      matchedCodes: 0,
      updatedCount: 0,
      skippedNoCode: 0,
      skippedNoMessageId: 0,
      skippedNoLink: 0,
      historyFilePath: runtimeConfig.historyFilePath,
    };
  }

  await ensureHistoryLoaded(runtimeConfig);
  const linkChannelId = resolveUploadHistoryChannelId(
    runtimeConfig,
    payload?.channelId || payload?.chatId || "",
  );

  let scannedRecords = 0;
  let matchedCodes = 0;
  let updatedCount = 0;
  let skippedNoCode = 0;
  let skippedNoMessageId = 0;
  let skippedNoLink = 0;

  for (const record of records) {
    scannedRecords += 1;
    const messageId = extractUploadRecordMessageId(record);
    if (messageId === null) {
      skippedNoMessageId += 1;
      continue;
    }

    const codes = collectWorkCodesFromUploadRecord(record);
    if (!codes.length) {
      skippedNoCode += 1;
      continue;
    }

    const linkSet = buildMessageLinksByEntity(null, linkChannelId, messageId);
    if (!linkSet.primaryUrl) {
      skippedNoLink += 1;
      continue;
    }

    for (const code of codes) {
      upsertHistory(code, {
        url: linkSet.primaryUrl,
        alternateUrls: linkSet.alternateUrls,
        source: "upload_event",
        messageId,
      });
      matchedCodes += 1;
      updatedCount += 1;
    }
  }

  if (updatedCount > 0) {
    await persistHistory();
  }

  logger.info(
    `[tg-search-bot] 上传记录同步索引 scanned=${scannedRecords} matched=${matchedCodes} updated=${updatedCount} skippedNoCode=${skippedNoCode} skippedNoMessageId=${skippedNoMessageId} skippedNoLink=${skippedNoLink} channel=${linkChannelId || "-"}`,
  );

  return {
    success: true,
    scannedRecords,
    matchedCodes,
    updatedCount,
    skippedNoCode,
    skippedNoMessageId,
    skippedNoLink,
    channelId: linkChannelId,
    historyFilePath: runtimeConfig.historyFilePath,
  };
}

function dedupeUrls(urls) {
  return [...new Set(urls.filter(Boolean))];
}

function getHistoryHit(rjCode, sourceChannelId = "") {
  const hit = historyCache.history?.[rjCode];
  if (!hit) return null;

  if (typeof hit === "string") {
    const legacyMessageId = normalizeMessageIdFromPayload(
      String(hit).match(/\/(\d+)(?:[/?#].*)?$/)?.[1],
    );

    if (legacyMessageId !== null) {
      const rebuiltLinkSet = buildMessageLinksByEntity(
        null,
        sourceChannelId,
        legacyMessageId,
      );
      if (rebuiltLinkSet.primaryUrl) {
        const mergedUrls = dedupeUrls([
          rebuiltLinkSet.primaryUrl,
          ...rebuiltLinkSet.alternateUrls,
          hit,
        ]);
        return {
          url: mergedUrls[0] || null,
          alternateUrls: mergedUrls.slice(1),
          source: "history",
          updatedAt: "",
        };
      }
    }

    return {
      url: hit,
      alternateUrls: [],
      source: "history",
      updatedAt: "",
    };
  }

  const messageId = normalizeMessageIdFromPayload(hit?.messageId);
  const baseAlternateUrls = getHistoryEntryAlternateUrls(hit);

  if (messageId !== null) {
    const rebuiltLinkSet = buildMessageLinksByEntity(
      null,
      sourceChannelId,
      messageId,
    );

    if (rebuiltLinkSet.primaryUrl) {
      const mergedUrls = dedupeUrls([
        rebuiltLinkSet.primaryUrl,
        ...rebuiltLinkSet.alternateUrls,
        hit.url,
        ...baseAlternateUrls,
      ]);

      return {
        url: mergedUrls[0] || null,
        alternateUrls: mergedUrls.slice(1),
        source: hit.source || "history",
        updatedAt: hit.updatedAt || "",
      };
    }
  }

  return {
    url: hit.url,
    alternateUrls: baseAlternateUrls,
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
    const preferredLinkChannelId = getPreferredLinkChannelId(runtimeConfig);

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
        preferredLinkChannelId,
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

export async function handleSearchRequest(rawInput, options = {}) {
  const rjCode = normalizeWorkCodeInput(rawInput);
  if (!rjCode) {
    return {
      success: false,
      message: "无效的编号格式，请使用 RJ/VJ/BJ + 数字（如 RJ123456）",
    };
  }

  const enableOneQueue = options.enableOneQueue === true;
  logSearchPipelineStage(rjCode, "总览", "start", `queue=${enableOneQueue}`);

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  await ensureHistoryLoaded(runtimeConfig);

  const preferredLinkChannelId = getPreferredLinkChannelId(runtimeConfig);
  logSearchPipelineStage(rjCode, SEARCH_PIPELINE_STAGE.history, "start");
  const historyHit = getHistoryHit(rjCode, preferredLinkChannelId);
  if (historyHit?.url) {
    logSearchPipelineStage(
      rjCode,
      SEARCH_PIPELINE_STAGE.history,
      "hit",
      `source=${historyHit.source || "-"}`,
    );
    logSearchPipelineSkipStages(
      rjCode,
      [
        SEARCH_PIPELINE_STAGE.preset,
        SEARCH_PIPELINE_STAGE.channel,
        SEARCH_PIPELINE_STAGE.one,
        SEARCH_PIPELINE_STAGE.queue,
      ],
      "reason=历史上传命中",
    );
    logSearchPipelineStage(rjCode, "总览", "done", "source=history");
    return {
      success: true,
      url: historyHit.url,
      alternateUrls: [],
      message: `找到 ${rjCode}（历史上传）`,
      source: historyHit.source,
    };
  }
  logSearchPipelineStage(rjCode, SEARCH_PIPELINE_STAGE.history, "miss");

  logSearchPipelineStage(rjCode, SEARCH_PIPELINE_STAGE.preset, "start");
  const presetResult = await searchRJInPresetFile(rjCode, runtimeConfig);
  if (presetResult) {
    logSearchPipelineStage(
      rjCode,
      SEARCH_PIPELINE_STAGE.preset,
      "hit",
      `source=${presetResult.source || "-"}`,
    );

    logSearchPipelineSkipStages(
      rjCode,
      [
        SEARCH_PIPELINE_STAGE.channel,
        SEARCH_PIPELINE_STAGE.one,
        SEARCH_PIPELINE_STAGE.queue,
      ],
      "reason=前置包命中",
    );
    logSearchPipelineStage(rjCode, "总览", "done", "source=preset");

    return {
      success: true,
      url: presetResult.url,
      alternateUrls: [],
      message: buildPresetFoundMessage(rjCode, presetResult),
      source: presetResult.source,
    };
  }
  logSearchPipelineStage(rjCode, SEARCH_PIPELINE_STAGE.preset, "miss");

  logSearchPipelineStage(
    rjCode,
    SEARCH_PIPELINE_STAGE.channel,
    "skip",
    "reason=仅使用历史上传和前置包，直接One",
  );

  if (enableOneQueue) {
    logSearchPipelineStage(rjCode, SEARCH_PIPELINE_STAGE.one, "start");
    const oneSearchResult = await searchWorkInOneByCode(rjCode);
    if (!oneSearchResult.success) {
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.one,
        "miss",
        `reason=${oneSearchResult.error || "not_found"}`,
      );
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.queue,
        "skip",
        "reason=One未命中",
      );
      logSearchPipelineStage(rjCode, "总览", "done", "source=not_found");
      return {
        success: false,
        retryable: oneSearchResult.retryable === true,
        message: oneSearchResult.retryable
          ? `One站检索暂时失败：${oneSearchResult.error || "网络错误"}`
          : oneSearchResult.error || `One站未找到 ${rjCode}`,
      };
    }

    const subtitleTarget = await resolveOneSubtitleTarget(
      oneSearchResult.work,
      rjCode,
    ).catch((error) => {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-search-bot] 查询 One 站字幕版本失败 code=${rjCode}`,
        normalizedError.message,
      );
      return null;
    });

    if (subtitleTarget?.workUrl) {
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.one,
        "hit",
        `subtitle=${subtitleTarget.sourceId || "-"} lang=${subtitleTarget.lang || "-"}`,
      );
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.queue,
        "skip",
        "reason=One字幕版本命中",
      );
      const subtitleHitMessage = buildOneSubtitleHitMessage(
        rjCode,
        subtitleTarget,
      );

      logger.info(
        `[tg-search-bot] 本地未命中，One站字幕版本命中 code=${rjCode} subtitle=${subtitleTarget.sourceId || "-"} lang=${
          subtitleTarget.lang || "-"
        }`,
      );

      logSearchPipelineStage(rjCode, "总览", "done", "source=one_subtitle");

      return {
        success: true,
        url: subtitleTarget.workUrl,
        alternateUrls:
          oneSearchResult.workUrl &&
          oneSearchResult.workUrl !== subtitleTarget.workUrl
            ? [oneSearchResult.workUrl]
            : [],
        message: subtitleHitMessage,
        source: "one_subtitle",
      };
    }

    logSearchPipelineStage(
      rjCode,
      SEARCH_PIPELINE_STAGE.one,
      "hit_no_subtitle",
      `work=${oneSearchResult.work?.source_id || rjCode}`,
    );

    const botRuntimeConfig = getBotRuntimeConfig(getConfig());
    const queueRuntimeConfig = getTranslationQueueRuntimeConfig(getConfig());
    await ensureTranslationQueueCacheLoaded(botRuntimeConfig);
    const queueCacheHit = findTranslationQueueCacheHit(
      rjCode,
      oneSearchResult.work?.id,
    );
    if (queueCacheHit) {
      const queueUrl = buildQueuePlaylistUrl(queueRuntimeConfig);
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.queue,
        "cached_already_queued",
        `playlist=${queueRuntimeConfig.playlistId || "-"}`,
      );
      logSearchPipelineStage(rjCode, "总览", "done", "source=one_queue_cache");
      return {
        success: true,
        url: queueUrl || oneSearchResult.workUrl,
        alternateUrls: oneSearchResult.workUrl ? [oneSearchResult.workUrl] : [],
        message: `本地未找到 ${rjCode}，该作品已在待翻译队列，无需重复入队`,
        source: "one_queue_cache",
      };
    }

    const blockedQueueTags = getBlockedQueueTags(
      oneSearchResult.blockedTagCandidates || oneSearchResult.tags,
    );

    if (blockedQueueTags.length) {
      const queueResult = buildMaskedQueueSuccessResult(queueRuntimeConfig);
      const oneQueueContext = {
        workUrl: oneSearchResult.workUrl || "",
        tags: oneSearchResult.tags || [],
        alreadyQueued: false,
        queueUrl: queueResult.queueUrl || "",
        playlistId: queueResult.playlistId || "",
        submittedIdentifier: "",
      };

      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.queue,
        "masked_success",
        `blockedTags=${blockedQueueTags.join("/")}`,
      );

      logger.info(
        `[tg-search-bot] 本地未命中，One站命中特殊Tag并跳过真实入队 code=${rjCode} blockedTags=${blockedQueueTags.join("|")} playlist=${oneQueueContext.playlistId || "-"}`,
      );

      logSearchPipelineStage(rjCode, "总览", "done", "source=one_queue_masked");

      return {
        success: true,
        url: oneQueueContext.queueUrl || oneQueueContext.workUrl,
        alternateUrls: oneQueueContext.workUrl ? [oneQueueContext.workUrl] : [],
        message: `本地未找到 ${rjCode}，已转入待翻译队列${buildQueueMessageSuffix(oneQueueContext)}`,
        source: "one_queue_masked",
      };
    }

    logSearchPipelineStage(
      rjCode,
      SEARCH_PIPELINE_STAGE.queue,
      "start",
      `playlist=${queueRuntimeConfig.playlistId || "-"}`,
    );
    const queueResult = await addWorkToTranslationQueue(
      rjCode,
      queueRuntimeConfig,
      oneSearchResult.work,
    );
    if (!queueResult.success) {
      logSearchPipelineStage(
        rjCode,
        SEARCH_PIPELINE_STAGE.queue,
        "fail",
        `reason=${queueResult.error || "unknown"}`,
      );
      logSearchPipelineStage(rjCode, "总览", "done", "source=queue_error");
      return {
        success: false,
        retryable: queueResult.retryable === true,
        message: `${rjCode} 在 One 站已找到，但加入待翻译队列失败：${queueResult.error}`,
      };
    }

    const oneQueueContext = {
      workUrl: oneSearchResult.workUrl || "",
      tags: oneSearchResult.tags || [],
      alreadyQueued: queueResult.alreadyQueued === true,
      queueUrl: queueResult.queueUrl || "",
      playlistId: queueResult.playlistId || "",
      submittedIdentifier: queueResult.submittedIdentifier || "",
    };
    await addWorkToTranslationQueueCache(oneSearchResult.work);
    const acceptedByRunningAutomation = enqueueRunningTranslationWork(
      oneSearchResult.work,
      "tg-search-bot",
    );

    logSearchPipelineStage(
      rjCode,
      SEARCH_PIPELINE_STAGE.queue,
      queueResult.alreadyQueued === true ? "already_queued" : "queued",
      `playlist=${oneQueueContext.playlistId || "-"} submitted=${oneQueueContext.submittedIdentifier || "-"}`,
    );

    logger.info(
      `[tg-search-bot] 本地未命中，One站已处理待翻译队列 code=${rjCode} playlist=${oneQueueContext.playlistId || "-"} submitted=${oneQueueContext.submittedIdentifier || "-"} alreadyQueued=${oneQueueContext.alreadyQueued} runtimeAccepted=${acceptedByRunningAutomation} tags=${oneQueueContext.tags.length}`,
    );

    logSearchPipelineStage(rjCode, "总览", "done", "source=one_queue");

    return {
      success: true,
      url: oneQueueContext.queueUrl || oneQueueContext.workUrl,
      alternateUrls: oneQueueContext.workUrl ? [oneQueueContext.workUrl] : [],
      message: `本地未找到 ${rjCode}，已转入待翻译队列${buildQueueMessageSuffix(oneQueueContext)}`,
      source: "one_queue",
    };
  }

  logSearchPipelineStage(
    rjCode,
    SEARCH_PIPELINE_STAGE.one,
    "skip",
    "reason=未启用One补链",
  );
  logSearchPipelineStage(
    rjCode,
    SEARCH_PIPELINE_STAGE.queue,
    "skip",
    "reason=未启用One补链",
  );
  logSearchPipelineStage(rjCode, "总览", "done", "source=not_found");

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
      `/status - 查看自动翻译队列状态\n` +
      `/zip - 获取最近上传资源整合包链接\n` +
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
      `/status - 查看自动翻译队列状态\n` +
      `/zip - 获取最近上传资源整合包链接\n` +
      `群聊也支持：/search@BotName RJ123456、@BotName /search RJ123456、@BotName RJ123456\n` +
      `/help - 查看帮助\n\n` +
      `搜索优先级：历史索引 -> 前置包缓存 -> 频道补充 -> One站字幕版直返 -> 无字幕时转待翻译队列\n` +
      `信息查询优先级：本地缓存 JSON -> 实时抓取并回填缓存`,
  );
}

const TRANSLATION_STATUS_LABELS = {
  disabled: "未启用",
  "waiting-window": "等待运行时段",
  scan: "扫描中",
  queue: "读取队列",
  download: "下载中",
  translate: "翻译中",
  package: "打包中",
  upload: "上传中",
  cleanup: "清理中",
  completed: "已完成",
  error: "异常",
  idle: "待机",
};

function formatNextTranslationProbeAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTranslationAutomationStatus(
  statusData = {},
  options = {},
) {
  const runtimeStatus = statusData.runtimeStatus || {};
  const progress = runtimeStatus.translationProgress || {};
  const count = (key) =>
    Array.isArray(progress[key]) ? progress[key].length : 0;
  const state =
    TRANSLATION_STATUS_LABELS[runtimeStatus.step] ||
    (statusData.running ? "运行中" : "待机");
  const currentCode = String(
    runtimeStatus.currentCode || progress.currentCode || "",
  ).trim();
  const nextProbeAt =
    runtimeStatus.step === "waiting-window"
      ? formatNextTranslationProbeAt(runtimeStatus.nextProbeAt)
      : "";
  const readyTranslateCodes = Array.isArray(progress.readyTranslateCodes)
    ? progress.readyTranslateCodes
    : [];
  const remainingTranslateCount =
    runtimeStatus.step === "translate" &&
    currentCode &&
    readyTranslateCodes.includes(currentCode)
      ? readyTranslateCodes.length - 1
      : readyTranslateCodes.length;
  const queueCount = Number(options.queueCount);
  const hasQueueCount =
    runtimeStatus.step !== "translate" && Number.isFinite(queueCount);
  const details =
    runtimeStatus.step === "translate" && currentCode
      ? [`${currentCode}，后续待翻译 ${remainingTranslateCount} 个`]
      : [
          currentCode,
          nextProbeAt ? `下次扫描：${nextProbeAt}` : "",
          hasQueueCount ? `待翻译队列 ${Math.max(0, queueCount)} 个` : "",
        ].filter(Boolean);

  return (
    `🤖 自动翻译：${state}${details.length ? `（${details.join(" · ")}）` : ""}\n` +
    `下载排队 ${count("queuedDownloadCodes")} · 下载中 ${count("downloadingCodes")} · ` +
    `待翻译 ${remainingTranslateCount} · 完成 ${count("completedCodes")} · ` +
    `失败 ${count("failedCodes")}`
  );
}

async function handleStatusCommand(msg) {
  if (!bot) return;

  if (msg.date < botStartTimestamp) {
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/status");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  const queueCount = await getTranslationQueueCachedCount(runtimeConfig);
  await bot.sendMessage(
    msg.chat.id,
    formatTranslationAutomationStatus(getTranslationAutomationStatus(), {
      queueCount,
    }),
  );
}

async function handleZipCommand(msg) {
  if (!bot) return;
  if (msg.date < botStartTimestamp) return;

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "/zip");
  if (!permission.allowed) {
    await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    return;
  }

  try {
    const result = await getLatestDailyZip();
    if (!result.url) {
      await bot.sendMessage(
        msg.chat.id,
        "📦 暂无可用整合包链接，请等待每日 19:00 自动生成。",
      );
      return;
    }

    await bot.sendMessage(
      msg.chat.id,
      `📦 当前整合包：${result.fileName || "kuruharu 每日整合包"}\n` +
        `包含 ${result.count || 0} 个去重资源\n` +
        `${result.url}`,
      { disable_web_page_preview: true },
    );
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error("[tg-search-bot] /zip 查询失败", normalizedError.message);
    await bot.sendMessage(
      msg.chat.id,
      `❌ 整合包链接查询失败：${normalizedError.message}`,
    );
  }
}

function getNextDailyZipDelayMs(targetHour) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const currentSeconds =
    (values.hour || 0) * 3600 +
    (values.minute || 0) * 60 +
    (values.second || 0);
  let delaySeconds = targetHour * 3600 - currentSeconds;
  if (delaySeconds <= 0) delaySeconds += 24 * 3600;
  return delaySeconds * 1000;
}

function getCurrentDailyZipHour() {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;
  return Number(hour || 0);
}

function stopDailyZipScheduler() {
  if (dailyZipInitialTimer) clearTimeout(dailyZipInitialTimer);
  if (dailyZipIntervalTimer) clearInterval(dailyZipIntervalTimer);
  if (dailyZipPrefetchInitialTimer) clearTimeout(dailyZipPrefetchInitialTimer);
  if (dailyZipPrefetchIntervalTimer)
    clearInterval(dailyZipPrefetchIntervalTimer);
  dailyZipInitialTimer = null;
  dailyZipIntervalTimer = null;
  dailyZipPrefetchInitialTimer = null;
  dailyZipPrefetchIntervalTimer = null;
}

function startDailyZipScheduler() {
  stopDailyZipScheduler();

  const runGenerate = () => {
    generateDailyZip({ scheduled: true }).then(
      (result) => {
        logger.info(
          `[tg-daily-zip] scheduled run updated=${result.updated === true} url=${result.url || "-"}`,
        );
      },
      (error) => {
        logger.error(
          "[tg-daily-zip] scheduled run failed",
          getNormalizedErrorMessage(error),
        );
      },
    );
  };

  const runPrefetch = () => {
    prefetchDailyZipSources().then(
      (result) => {
        logger.info(
          `[tg-daily-zip] prefetch completed count=${result.count || 0} reason=${result.reason || "-"}`,
        );
      },
      (error) => {
        logger.error(
          "[tg-daily-zip] prefetch failed",
          getNormalizedErrorMessage(error),
        );
      },
    );
  };

  const currentHour = getCurrentDailyZipHour();
  if (currentHour >= 19) {
    logger.warn(
      "[tg-daily-zip] Bot 在 19:00 后启动，检查并补发当天未完成的自动整合包",
    );
    runGenerate();
  } else if (currentHour >= 18) {
    logger.info("[tg-daily-zip] Bot 在 18:00 后启动，立即执行当天预下载");
    runPrefetch();
  }

  dailyZipPrefetchInitialTimer = setTimeout(() => {
    runPrefetch();
    dailyZipPrefetchIntervalTimer = setInterval(
      runPrefetch,
      24 * 60 * 60 * 1000,
    );
    dailyZipPrefetchIntervalTimer.unref?.();
  }, getNextDailyZipDelayMs(18));
  dailyZipPrefetchInitialTimer.unref?.();

  dailyZipInitialTimer = setTimeout(() => {
    runGenerate();
    dailyZipIntervalTimer = setInterval(runGenerate, 24 * 60 * 60 * 1000);
    dailyZipIntervalTimer.unref?.();
  }, getNextDailyZipDelayMs(19));
  dailyZipInitialTimer.unref?.();
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

function withOperationTimeout(task, timeoutMs, label = "操作") {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve(task);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} 超时，请稍后重试`));
    }, timeoutMs);

    Promise.resolve(task)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isOperationTimeoutError(error) {
  return /(?:超时|timeout)/i.test(getNormalizedErrorMessage(error, ""));
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
    const normalizedNumber = input.length === 7 ? `0${input}` : input;
    return `RJ${normalizedNumber}`;
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
  const input = String(text || "").trim();
  if (!input) {
    return false;
  }

  return /^(?:[RrVvBb][Jj]\d{6,8}|\d{6,8})$/.test(input);
}

function extractCodesFromPlainTextContext(msg, maxCount = 3) {
  const text = String(msg?.text || msg?.caption || "").trim();
  return extractPlainTextWorkCodes(text, maxCount);
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
  if (!isSingleWorkCodeText(text)) {
    logger.debug(
      `[tg-search-bot] 纯文本消息非单独编号，跳过自动回复 message=${msg.message_id}`,
    );
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const codes = extractCodesFromPlainTextContext(msg, 1);
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
  await runSearchReplyFlow({
    msg,
    requestedValue,
    rjCode,
    commandName: "/search",
    invalidInputMessage:
      "❌ 无效的编号格式，请使用如 /search RJ123456（支持 RJ/VJ/BJ）",
  });
}

async function runSearchReplyFlow({
  msg,
  requestedValue,
  rjCode,
  commandName = "/search",
  invalidInputMessage = "❌ 无效的编号格式，请使用如 /search RJ123456（支持 RJ/VJ/BJ）",
}) {
  if (!bot || !msg) return;

  let searchingMessage = null;
  const normalizedCode = rjCode || normalizeWorkCodeInput(requestedValue);
  if (!normalizedCode) {
    try {
      await bot.sendMessage(msg.chat.id, invalidInputMessage);
    } catch (error) {
      const errorMessage = getNormalizedErrorMessage(error);
      logger.warn(
        `[tg-search-bot] ${commandName} invalid-argument reply send failed chat=${msg.chat.id}`,
        errorMessage,
      );
    }
    return;
  }

  try {
    searchingMessage = await bot.sendMessage(
      msg.chat.id,
      `Searching ${normalizedCode}...`,
    );
  } catch (error) {
    const errorMessage = getNormalizedErrorMessage(error);
    if (isNotEnoughRightsToSendMessageError(error)) {
      logger.warn(
        `[tg-search-bot] ${commandName} cannot send message: insufficient chat rights chat=${msg.chat.id} code=${normalizedCode}`,
      );
      return;
    }

    logger.warn(
      `[tg-search-bot] ${commandName} failed to send placeholder message chat=${msg.chat.id} code=${normalizedCode}`,
      errorMessage,
    );
    return;
  }

  try {
    const result = await withOperationTimeout(
      handleSearchRequest(normalizedCode, {
        enableOneQueue: true,
      }),
      SEARCH_COMMAND_TIMEOUT_MS,
      `搜索 ${normalizedCode}`,
    );

    let responseText;
    if (result.success) {
      responseText = `\u2705 ${result.message}${
        shouldAppendResultUrl(result) ? `\n${result.url}` : ""
      }`;
    } else if (result.retryable === true) {
      const retryResult = await enqueueSearchRetry({
        msg,
        workCode: normalizedCode,
        commandName,
      });
      responseText = retryResult.queued
        ? "⌛ 搜索暂时失败，已加入本地错误池，网络恢复后会持续重试并在本群通知结果。"
        : "⌛ 搜索暂时失败，该编号已在本地错误池中，网络恢复后会继续重试。";
    } else {
      responseText = `\u274c ${result.message}`;
    }

    await bot.editMessageText(responseText, {
      chat_id: msg.chat.id,
      message_id: searchingMessage.message_id,
    });
  } catch (error) {
    const errorMessage = getNormalizedErrorMessage(error);
    logger.error(`[tg-search-bot] ${commandName} 处理失败`, errorMessage);

    try {
      const retryResult = isOperationTimeoutError(error)
        ? await enqueueSearchRetry({
            msg,
            workCode: normalizedCode,
            commandName,
          })
        : null;
      const timeoutReply = retryResult
        ? retryResult.queued
          ? "⌛ 搜索超时，已加入本地重试队列，稍后会自动重试并在本群通知结果。"
          : "⌛ 搜索超时，该编号已在本地重试队列中，请等待自动重试结果。"
        : `❌ 搜索失败：${errorMessage}`;
      await bot.editMessageText(timeoutReply, {
        chat_id: msg.chat.id,
        message_id: searchingMessage.message_id,
      });
    } catch (editError) {
      const editErrorMessage = getNormalizedErrorMessage(editError);
      logger.warn(
        `[tg-search-bot] ${commandName} failed to edit result message chat=${msg.chat.id} code=${normalizedCode}`,
        editErrorMessage,
      );
      try {
        await bot.sendMessage(msg.chat.id, `❌ 搜索失败：${errorMessage}`);
      } catch (sendError) {
        logger.warn(
          `[tg-search-bot] ${commandName} failed to send fallback error message chat=${msg.chat.id} code=${normalizedCode}`,
          getNormalizedErrorMessage(sendError),
        );
      }
    }
  }
}

function extractMentionSearchCodeForCurrentBot(msg) {
  const text = String(msg?.text || "").trim();
  if (!text || !currentBotUsername || isCommandLikeMessage(text)) {
    return null;
  }

  const token = extractMentionSearchWorkCodeToken(text, currentBotUsername);
  if (!token) {
    return null;
  }

  return normalizeWorkCodeInput(token);
}

async function handleMentionSearchMessage(msg) {
  if (!bot || !msg) return false;
  if (msg.date < botStartTimestamp) {
    return true;
  }

  const rjCode = extractMentionSearchCodeForCurrentBot(msg);
  if (!rjCode) {
    return false;
  }
  if (markAndCheckPlainTextMessageDedupe(msg)) {
    return true;
  }

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const permission = logIncomingRequest(msg, runtimeConfig, "@bot_search");
  if (!permission.allowed) {
    try {
      await bot.sendMessage(msg.chat.id, "❌ 您没有权限使用此 Bot。");
    } catch (error) {
      logger.warn(
        `[tg-search-bot] @bot_search denied reply send failed chat=${msg.chat.id}`,
        getNormalizedErrorMessage(error),
      );
    }
    return true;
  }

  await runSearchReplyFlow({
    msg,
    requestedValue: rjCode,
    rjCode,
    commandName: "@bot_search",
    invalidInputMessage:
      "❌ 无效的编号格式，请使用如 @BotName RJ123456（支持 RJ/VJ/BJ）",
  });
  return true;
}

async function handleChannelPost(msg) {
  if (!msg) return;
  if (msg.date < botStartTimestamp) return;

  const runtimeConfig = getBotRuntimeConfig(getConfig());
  const preferredLinkChannelId = getPreferredLinkChannelId(runtimeConfig);
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

    const linkSet = buildMessageLinksByEntity(
      { id: msg.chat?.id, username: msg.chat?.username },
      preferredLinkChannelId,
      messageId,
    );
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
  registerSafeOnText(STATUS_COMMAND_REGEX, handleStatusCommand, "/status");
  registerSafeOnText(ZIP_COMMAND_REGEX, handleZipCommand, "/zip");
  bot.on("message", (msg) => {
    handleMentionSearchMessage(msg)
      .then((handled) => {
        if (handled) {
          return;
        }

        return handlePlainTextInfoMessage(msg);
      })
      .catch((error) => {
        const normalizedError = normalizeError(error);
        logger.error(
          "[tg-search-bot] message 处理失败",
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
    currentBotUsername = String(botInfo?.username || "").trim();
    await syncBotCommandMenu();
    botRunning = true;
    startTranslationQueueCacheScheduler();
    startSearchRetryScheduler();
    startDailyZipScheduler();
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
    currentBotUsername = "";
    stopTranslationQueueCacheScheduler();
    stopSearchRetryScheduler();
    stopDailyZipScheduler();

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
    currentBotUsername = "";
    stopTranslationQueueCacheScheduler();
    stopSearchRetryScheduler();
    stopDailyZipScheduler();

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
    "tg-bot-generate-daily-zip",
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
    return await withOperationTimeout(
      handleSearchRequest(rjCode),
      SEARCH_COMMAND_TIMEOUT_MS,
      `搜索 ${normalizeWorkCodeInput(rjCode) || rjCode || "请求"}`,
    );
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

  ipcMain.handle("tg-bot-generate-daily-zip", async () => {
    logger.info("[tg-search-bot] IPC 强制生成每日 ZIP 请求");
    return await generateDailyZip({ force: true });
  });

  logger.debug("[tg-search-bot] 所有 IPC 处理器注册完成");
}
