import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { app, ipcMain, webContents } from "electron";
import archiver from "archiver";
import { getAsmrClient } from "./httpClient.js";
import { getConfig, getDataDir, saveConfig } from "./config.js";
import { createLogSender } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { runAsmrAudioDownloader } from "./asmr-audio-downloader.js";
import { extractWorksArrayExtended } from "./asmr-core/search-utils.js";
import { collectPackFilesInDirectory } from "./whisper-pack-utils.js";
import { requireConnectedTelegramClient } from "../utils/telegram-login.js";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity.js";

const logger = createLogSender("translation-automation");
const AUTOMATION_STATE_FILE = "translation-automation-state.json";
const DOWNLOAD_PROGRESS_POLL_INTERVAL_MS = 5 * 1000;
const MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".wma",
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".flv",
  ".wmv",
]);
const SUBTITLE_EXTENSIONS = new Set([".lrc", ".srt", ".vtt", ".ass", ".ssa"]);
const DEFAULTS = {
  enabled: false,
  runOnStartup: true,
  scanIntervalMs: 30 * 60 * 1000,
  recentOrder: "create_date",
  recentPageSize: 100,
  recentMaxPages: 3,
  maxWorksPerCycle: 3,
  maxDownloadTasksPerWork: 200,
  aria2RestartMaxAttempts: 3,
  aria2RestartCooldownMs: 5 * 60 * 1000,
  aria2EarlyRetryPercent: 80,
  includeTags: [],
  excludeTags: [],
  requireAllIncludeTags: false,
  startHour: 1,
  endHour: 7,
  downloadWaitTimeoutMs: 6 * 60 * 60 * 1000,
  downloadPollIntervalMs: 30 * 1000,
  downloadStablePolls: 2,
  whisperStallTimeoutMs: 10 * 60 * 1000,
  whisperActivityPollMs: 15 * 1000,
  cleanupLocalAfterUpload: true,
  packageDirName: "_translated_packages",
};
const WHISPER_DIAGNOSTIC_LOG_DIRNAME = "whisper-runs";
const WHISPER_DIAGNOSTIC_LOG_LIMIT = 100;
const WHISPER_STDERR_TAIL_LIMIT = 64 * 1024;

let timer = null;
let running = false;
let lastRun = null;
let currentRunPromise = null;
let activeQueuedWorkReceiver = null;
let runtimeStatus = {
  step: "idle",
  currentCode: "",
  message: "等待自动任务启动",
  updatedAt: "",
  nextProbeAt: "",
};

const normalizeCode = (value) => {
  const match = String(value || "")
    .toUpperCase()
    .match(/(?:RJ|VJ|BJ)\d{6,8}/);
  return match ? match[0] : "";
};

export const enqueueRunningTranslationWork = (work, source = "external") => {
  const code = normalizeCode(work?.source_id || work?.rj_code || work?.id);
  if (!code || !activeQueuedWorkReceiver) return false;
  return activeQueuedWorkReceiver(work, source) === true;
};

const normalizeTag = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const getTagNames = (work) =>
  (Array.isArray(work?.tags) ? work.tags : [])
    .flatMap((tag) => {
      if (typeof tag === "string") return [tag];
      return [
        tag?.name,
        tag?.tag?.name,
        tag?.attributes?.name,
        tag?.i18n?.["zh-cn"]?.name,
        tag?.i18n?.["ja-jp"]?.name,
        tag?.i18n?.["en-us"]?.name,
        tag?.tag?.i18n?.["zh-cn"]?.name,
        tag?.tag?.i18n?.["ja-jp"]?.name,
        tag?.tag?.i18n?.["en-us"]?.name,
      ];
    })
    .map(normalizeTag)
    .filter(Boolean);

const normalizeTagRules = (rules) => {
  const normalized = new Set();
  const add = (value) => {
    const tag = normalizeTag(value);
    if (!tag) return;
    normalized.add(tag);
    String(value)
      .split(/[／/]/)
      .map(normalizeTag)
      .filter(Boolean)
      .forEach((alias) => normalized.add(alias));
  };

  (Array.isArray(rules) ? rules : []).forEach((rule) => {
    const rawRule = String(rule || "").trim();
    if (!rawRule) return;

    rawRule
      .split(/[\r\n,，;；$]+/)
      .map((value) => value.trim())
      .filter(
        (value) =>
          value &&
          !/^-?tagw?\s*[:：]/i.test(value) &&
          !/^-?lang\s*[:：]/i.test(value) &&
          !/^duration\s*[:：]/i.test(value) &&
          !/^rate\s*[:：]/i.test(value),
      )
      .forEach(add);

    for (const match of rawRule.matchAll(
      /\$?-?tagw?\s*[:：]\s*([^$\s,，;；]+)/gi,
    )) {
      add(match[1]);
    }
  });

  return [...normalized];
};

const getRuntimeConfig = () => {
  const config = getConfig();
  return {
    ...DEFAULTS,
    ...(config.translationAutomation || {}),
    includeTags: Array.isArray(config.translationAutomation?.includeTags)
      ? config.translationAutomation.includeTags
      : DEFAULTS.includeTags,
    excludeTags: Array.isArray(config.translationAutomation?.excludeTags)
      ? config.translationAutomation.excludeTags
      : DEFAULTS.excludeTags,
  };
};

const migrateLegacyScanInterval = async () => {
  const configuredInterval = Number(
    getConfig()?.translationAutomation?.scanIntervalMs,
  );
  const legacyInterval = 60 * 60 * 1000;
  if (configuredInterval !== legacyInterval) return false;

  const saved = await saveConfig({
    translationAutomation: {
      ...getRuntimeConfig(),
      scanIntervalMs: DEFAULTS.scanIntervalMs,
    },
  });
  if (!saved) {
    logger.warn("[automation] 扫描周期迁移失败，仍使用已保存的一小时配置");
    return false;
  }

  logger.info("[automation] 已将旧的一小时扫描周期迁移为三十分钟");
  return true;
};

const getAria2RestartMaxAttempts = (config) => {
  const configuredAttempts = Number(config?.aria2RestartMaxAttempts);
  if (!Number.isFinite(configuredAttempts)) {
    return DEFAULTS.aria2RestartMaxAttempts;
  }
  return Math.max(0, Math.floor(configuredAttempts));
};

const getAria2RestartCooldownMs = (config) => {
  const configuredCooldown = Number(config?.aria2RestartCooldownMs);
  if (!Number.isFinite(configuredCooldown)) {
    return DEFAULTS.aria2RestartCooldownMs;
  }
  return Math.max(60 * 1000, Math.floor(configuredCooldown));
};

const getAria2EarlyRetryPercent = (config) => {
  const configuredPercent = Number(config?.aria2EarlyRetryPercent);
  if (!Number.isFinite(configuredPercent)) {
    return DEFAULTS.aria2EarlyRetryPercent;
  }
  return Math.min(99, Math.max(50, Math.floor(configuredPercent)));
};

const getQueueRuntimeConfig = () => {
  const asmrConfig = getConfig()?.asmr || {};
  return {
    token: String(asmrConfig.token || "").trim(),
    playlistId: String(
      asmrConfig.translationQueuePlaylistId ||
        asmrConfig.pendingTranslationQueuePlaylistId ||
        asmrConfig.pendingTranslationPlaylistId ||
        asmrConfig.playlistId ||
        "",
    ).trim(),
  };
};

const getStatePath = () => {
  return path.join(getDataDir(), AUTOMATION_STATE_FILE);
};

const readState = async () => {
  try {
    return JSON.parse(await fs.promises.readFile(getStatePath(), "utf8"));
  } catch {
    return { completedCodes: [], failedCodes: {}, updatedAt: "" };
  }
};

const writeState = async (state) => {
  await fs.promises.mkdir(path.dirname(getStatePath()), { recursive: true });
  await fs.promises.writeFile(
    getStatePath(),
    JSON.stringify(
      {
        completedCodes: [...new Set(state.completedCodes || [])].slice(-5000),
        failedCodes: state.failedCodes || {},
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
};

const emit = (message, { persistLog = true, ...payload } = {}) => {
  if (persistLog) {
    logger.info(message);
  }

  webContents.getAllWebContents().forEach((contents) => {
    if (!contents.isDestroyed()) {
      contents.send("translation-automation-event", {
        type: "log",
        message,
        ...payload,
      });
    }
  });
};

const setRuntimeStatus = (step, message, currentCode = "", options = {}) => {
  const hasTranslationProgress = Object.hasOwn(options, "translationProgress");
  runtimeStatus = {
    ...runtimeStatus,
    step,
    currentCode,
    message,
    updatedAt: new Date().toISOString(),
    nextProbeAt: runtimeStatus.nextProbeAt || "",
    ...(hasTranslationProgress
      ? { translationProgress: options.translationProgress }
      : {}),
  };
  emit(message, { type: "status", status: runtimeStatus, running });
};

const publishTranslationProgress = (
  tracker,
  currentCode = tracker.currentCode || "",
) => {
  runtimeStatus = {
    ...runtimeStatus,
    translationProgress: {
      queuedDownloadCodes: [...tracker.queuedDownloadCodes],
      downloadingCodes: [...tracker.downloadingCodes],
      readyTranslateCodes: [...tracker.readyTranslateCodes],
      completedCodes: [...tracker.completedCodes],
      failedCodes: [...tracker.failedCodes],
      failedItems: [...tracker.failedCodes].map((code) => ({
        code,
        reason: tracker.failedReasons.get(code) || "",
      })),
      currentCode,
    },
    updatedAt: new Date().toISOString(),
  };
  emit("", {
    persistLog: false,
    type: "status",
    status: runtimeStatus,
    running,
  });
};

const setRuntimeProgress = (step, message, currentCode, progress) => {
  runtimeStatus = {
    ...runtimeStatus,
    step,
    currentCode,
    message,
    progress,
    updatedAt: new Date().toISOString(),
  };
  emit(message, { type: "status", status: runtimeStatus, running });
};

const isWithinQuietHours = (config, date = new Date()) => {
  const hour = date.getHours();
  const start = Number(config.startHour);
  const end = Number(config.endHour);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) {
    return true;
  }
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
};

const getVisibleRuntimeStatus = () => {
  const config = getRuntimeConfig();
  if (
    runtimeStatus.step === "waiting-window" &&
    config.enabled &&
    isWithinQuietHours(config)
  ) {
    return {
      ...runtimeStatus,
      step: "idle",
      message: "当前处于低峰运行时段，等待下一轮扫描",
      updatedAt: new Date().toISOString(),
    };
  }
  return runtimeStatus;
};

export function getTranslationAutomationStatus() {
  return {
    config: getRuntimeConfig(),
    running,
    lastRun,
    scheduled: Boolean(timer),
    runtimeStatus: getVisibleRuntimeStatus(),
  };
}

const matchesTags = (work, config) => {
  const tags = new Set(getTagNames(work));
  const include = normalizeTagRules(config.includeTags);
  const exclude = normalizeTagRules(config.excludeTags);
  if (exclude.some((tag) => tags.has(tag))) return false;
  if (!include.length) return true;
  return config.requireAllIncludeTags
    ? include.every((tag) => tags.has(tag))
    : include.some((tag) => tags.has(tag));
};

const collectCodesFromText = (rawText) => [
  ...new Set(
    String(rawText || "")
      .toUpperCase()
      .match(/(?:RJ|VJ|BJ)\d{6,8}/g) || [],
  ),
];

const isChineseText = (value) =>
  /(?:^|[-_])(zh|cn)(?:$|[-_])|chinese|中文|汉化|漢化|简体|繁體/i.test(
    String(value || ""),
  );

const workHasExistingSubtitle = (work) => {
  if (
    work?.has_subtitle === true ||
    work?.subtitle === true ||
    (Array.isArray(work?.subtitles) && work.subtitles.length > 0)
  ) {
    return true;
  }

  const editions = Array.isArray(work?.other_language_editions_in_db)
    ? work.other_language_editions_in_db
    : [];
  return editions.some((edition) =>
    [
      edition?.lang,
      edition?.language,
      edition?.title,
      edition?.name,
      edition?.source_id,
    ].some(isChineseText),
  );
};

const resolveChineseListPaths = () => {
  const configuredPath = String(
    getConfig()?.paths?.chineseListPath || "",
  ).trim();
  if (!configuredPath) {
    return [
      path.join(app.getPath("userData"), "one站汉化.txt"),
      path.join(
        getConfig()?.paths?.dataDir || path.join(process.cwd(), "data"),
        "one站汉化.txt",
      ),
    ];
  }

  return [
    configuredPath.toLowerCase().endsWith(".txt")
      ? configuredPath
      : path.join(configuredPath, "one站汉化.txt"),
  ];
};

const collectCodesFromJsonFiles = async (dirPath, maxFiles = 200) => {
  if (!dirPath || !fs.existsSync(dirPath)) return new Set();
  const codes = new Set();
  const pending = [dirPath];
  let readFiles = 0;

  while (pending.length && readFiles < maxFiles) {
    const current = pending.shift();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (
        !entry.isFile() ||
        path.extname(entry.name).toLowerCase() !== ".json"
      ) {
        continue;
      }
      readFiles += 1;
      try {
        collectCodesFromText(
          await fs.promises.readFile(fullPath, "utf8"),
        ).forEach((code) => codes.add(code));
      } catch {
        // 单个历史文件损坏时忽略，避免阻断自动任务。
      }
      if (readFiles >= maxFiles) break;
    }
  }
  return codes;
};

const collectLocalSubtitleCodes = async (rootPath, maxFiles = 10000) => {
  if (!rootPath || !fs.existsSync(rootPath)) return new Set();
  const codes = new Set();
  const pending = [rootPath];
  let inspectedFiles = 0;
  while (pending.length && inspectedFiles < maxFiles) {
    const current = pending.shift();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      inspectedFiles += 1;
      if (SUBTITLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        collectCodesFromText(fullPath).forEach((code) => codes.add(code));
      }
      if (inspectedFiles >= maxFiles) break;
    }
  }
  return codes;
};

const collectHistoricalTranslatedCodes = async () => {
  const config = getConfig();
  const externalTranslatedCodes = new Set();
  for (const chineseListPath of resolveChineseListPaths()) {
    try {
      collectCodesFromText(
        await fs.promises.readFile(chineseListPath, "utf8"),
      ).forEach((code) => externalTranslatedCodes.add(code));
    } catch {
      // 汉化列表不存在时使用其余来源继续判断。
    }
  }

  const uploadHistoryCodes = await collectCodesFromJsonFiles(
    config?.paths?.uploadHistoryDir,
  );
  uploadHistoryCodes.forEach((code) => externalTranslatedCodes.add(code));

  const dataDirectories = [
    String(config?.paths?.uploadHistoryDir || "").trim(),
    String(config?.paths?.dataDir || "").trim(),
    getDataDir(),
    path.join(app.getPath("userData"), "data"),
    path.join(process.cwd(), "data"),
  ].filter(Boolean);
  const recentActivityPaths = [
    ...new Set(
      dataDirectories.map((dataDir) =>
        path.join(dataDir, "recent_activity.json"),
      ),
    ),
  ];
  const configuredBotHistoryPath = String(
    config?.tg?.botHistoryPath || "",
  ).trim();
  const tgBotHistoryPaths = [
    configuredBotHistoryPath,
    ...dataDirectories.map((dataDir) =>
      path.join(dataDir, "tg-bot-history.json"),
    ),
  ].filter(Boolean);
  let recentActivityCodeCount = 0;
  let loadedRecentActivityPaths = 0;
  for (const recentActivityPath of recentActivityPaths) {
    try {
      const recentActivityCodes = collectCodesFromText(
        await fs.promises.readFile(recentActivityPath, "utf8"),
      );
      recentActivityCodeCount += recentActivityCodes.length;
      recentActivityCodes.forEach((code) => externalTranslatedCodes.add(code));
      loadedRecentActivityPaths += 1;
      logger.info(
        `[automation] 已载入历史上传记录: path=${recentActivityPath} codes=${recentActivityCodes.length}`,
      );
    } catch {
      // 最近上传索引不存在时使用其他历史来源继续判断。
    }
  }

  let tgBotHistoryCodeCount = 0;
  let loadedTgBotHistoryPaths = 0;
  for (const tgBotHistoryPath of [...new Set(tgBotHistoryPaths)]) {
    try {
      const tgBotHistory = JSON.parse(
        await fs.promises.readFile(tgBotHistoryPath, "utf8"),
      );
      const tgBotHistoryCodes = collectCodesFromText(
        Object.keys(tgBotHistory?.history || {}).join("\n"),
      );
      tgBotHistoryCodeCount += tgBotHistoryCodes.length;
      tgBotHistoryCodes.forEach((code) => externalTranslatedCodes.add(code));
      loadedTgBotHistoryPaths += 1;
      logger.info(
        `[automation] 已载入 Bot 上传历史: path=${tgBotHistoryPath} codes=${tgBotHistoryCodes.length}`,
      );
    } catch {
      // Bot 上传历史不存在或格式损坏时，继续使用其他历史来源。
    }
  }

  const localSubtitleCodes = await collectLocalSubtitleCodes(
    config?.paths?.asmrDownloadDir || config?.paths?.toolOutputDir,
  );
  const historicalTranslatedCodes = new Set([
    ...externalTranslatedCodes,
    ...localSubtitleCodes,
  ]);
  logger.info(
    `[automation] 历史翻译索引: total=${historicalTranslatedCodes.size} external=${externalTranslatedCodes.size} localSubtitles=${localSubtitleCodes.size} recentActivity=${recentActivityCodeCount} botHistory=${tgBotHistoryCodeCount} recentPaths=${loadedRecentActivityPaths}/${recentActivityPaths.length} botHistoryPaths=${loadedTgBotHistoryPaths}/${new Set(tgBotHistoryPaths).size}`,
  );
  return {
    historicalTranslatedCodes,
    externalTranslatedCodes,
    localSubtitleCodes,
  };
};

const fetchRecentWorks = async (config) => {
  const appConfig = getConfig();
  const token = String(appConfig?.asmr?.token || "").trim();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const client = getAsmrClient();
  const works = [];
  for (let page = 1; page <= Number(config.recentMaxPages); page += 1) {
    const url =
      "https://api.asmr.one/api/works" +
      `?order=${encodeURIComponent(config.recentOrder)}` +
      `&sort=desc&page=${page}&pageSize=${Number(config.recentPageSize)}&subtitle=0`;
    const response = await withRetry(
      () => client.get(url, { headers, timeout: 30000 }),
      { maxRetries: 2, backoff: 1000 },
    );
    const pageWorks = extractWorksArrayExtended(response?.data);
    works.push(...pageWorks);
    if (
      pageWorks.length < Number(config.recentPageSize) ||
      (response?.data?.pagination?.totalCount &&
        page * Number(config.recentPageSize) >=
          Number(response.data.pagination.totalCount))
    ) {
      break;
    }
  }
  return works;
};

const fetchQueueWorks = async () => {
  const { token, playlistId } = getQueueRuntimeConfig();
  if (!token || !playlistId) {
    throw new Error(
      `待翻译队列配置不完整：token=${token ? "已配置" : "缺失"}，playlistId=${playlistId ? "已配置" : "缺失"}（支持 translationQueuePlaylistId 或回退 playlistId）`,
    );
  }
  const client = getAsmrClient();
  const works = [];
  const pageSize = 100;
  for (let page = 1; page <= 200; page += 1) {
    const response = await withRetry(
      () =>
        client.get(
          `https://api.asmr.one/api/playlist/get-playlist-works?id=${encodeURIComponent(
            playlistId,
          )}&page=${page}&pageSize=${pageSize}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000,
          },
        ),
      {
        maxRetries: 3,
        backoff: 1000,
        onRetry: (attempt, error) => {
          logger.warn(
            `[automation] 读取待翻译队列第 ${page} 页网络失败，${attempt}/3 次请求后重试: ${error?.message || error}`,
          );
        },
      },
    );
    const pageWorks = extractWorksArrayExtended(response?.data);
    works.push(...pageWorks);
    const totalCount = Number(response?.data?.pagination?.totalCount || 0);
    if (
      pageWorks.length < pageSize ||
      (totalCount && page * pageSize >= totalCount)
    ) {
      break;
    }
  }
  return works;
};

const waitForQueueVisibility = async (expectedCodes = []) => {
  const normalizedExpectedCodes = new Set(
    expectedCodes.map(normalizeCode).filter(Boolean),
  );
  let latestWorks = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    latestWorks = await fetchQueueWorks();
    if (
      !normalizedExpectedCodes.size ||
      latestWorks.some((work) =>
        normalizedExpectedCodes.has(
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        ),
      )
    ) {
      return latestWorks;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    `批量入队接口已返回成功，但回读队列仍未发现作品: ${[
      ...normalizedExpectedCodes,
    ].join(", ")}`,
  );
};

const removeWorksFromQueue = async (works) => {
  const { token, playlistId } = getQueueRuntimeConfig();
  const workIds = [
    ...new Set(
      (Array.isArray(works) ? works : [works])
        .map((work) => String(work?.id || work || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!token || !playlistId || !workIds.length) {
    throw new Error("待翻译队列删除缺少 token、playlistId 或作品 id");
  }
  const client = getAsmrClient();
  const response = await client.post(
    "https://api.asmr.one/api/playlist/remove-works-from-playlist",
    { id: playlistId, works: workIds },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );
  if (response?.status < 200 || response?.status >= 300) {
    throw new Error(`待翻译队列删除失败: HTTP ${response?.status}`);
  }
};

const deleteFromQueue = (work) => removeWorksFromQueue([work]);

const addWorksToQueue = async (works) => {
  const { token, playlistId } = getQueueRuntimeConfig();
  const workIds = [
    ...new Set(
      works
        .map((work) => String(work?.id || work?.source_id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!token || !playlistId || !workIds.length) return 0;

  const client = getAsmrClient();
  let addedCount = 0;
  for (let index = 0; index < workIds.length; index += 50) {
    const batch = workIds.slice(index, index + 50);
    const response = await client.post(
      "https://api.asmr-200.com/api/playlist/add-works-to-playlist",
      { id: playlistId, works: batch },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    if (response?.status < 200 || response?.status >= 300) {
      throw new Error(`批量加入待翻译队列失败: HTTP ${response?.status}`);
    }
    addedCount += batch.length;
  }
  return addedCount;
};

const findWorkDir = async (rootPath, code) => {
  if (!rootPath || !fs.existsSync(rootPath)) return "";
  const pending = [rootPath];
  while (pending.length) {
    const current = pending.shift();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    if (normalizeCode(path.basename(current)) === code) return current;
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(target);
      }
    }
  }
  return "";
};

const getDirectoryActivity = async (dirPath) => {
  const summary = {
    fileCount: 0,
    mediaFileCount: 0,
    mediaBytes: 0,
    mediaLatestMtimeMs: 0,
    subtitleFileCount: 0,
    lrcFileCount: 0,
    aria2TempFileCount: 0,
    totalBytes: 0,
    latestMtimeMs: 0,
  };
  if (!dirPath || !fs.existsSync(dirPath)) return summary;
  const pending = [dirPath];
  while (pending.length) {
    const current = pending.shift();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      const stat = await fs.promises.stat(fullPath);
      const extension = path.extname(entry.name).toLowerCase();
      summary.fileCount += 1;
      summary.totalBytes += stat.size;
      summary.latestMtimeMs = Math.max(summary.latestMtimeMs, stat.mtimeMs);
      if (MEDIA_EXTENSIONS.has(extension)) {
        summary.mediaFileCount += 1;
        summary.mediaBytes += stat.size;
        summary.mediaLatestMtimeMs = Math.max(
          summary.mediaLatestMtimeMs,
          stat.mtimeMs,
        );
      }
      if (SUBTITLE_EXTENSIONS.has(extension)) summary.subtitleFileCount += 1;
      if (extension === ".lrc") summary.lrcFileCount += 1;
      if (entry.name.toLowerCase().endsWith(".aria2")) {
        summary.aria2TempFileCount += 1;
      }
    }
  }
  return summary;
};

const getAria2BatchTaskStates = async (batchDownload) => {
  const gids = new Set(
    [...batchDownload.taskManifestByCode.values()]
      .flat()
      .map((task) => task.gid)
      .filter((gid) => gid && !String(gid).startsWith("local:")),
  );
  if (!gids.size) return { available: true, states: new Map() };

  const asmrConfig = getConfig()?.asmr || {};
  const rpcUrl = String(
    asmrConfig.downloadRpcUrl || "http://localhost:6800/jsonrpc",
  ).trim();
  const rpcSecret = String(asmrConfig.downloadRpcSecret || "").trim();
  const fields = [
    "gid",
    "status",
    "errorCode",
    "errorMessage",
    "completedLength",
    "totalLength",
    "downloadSpeed",
  ];
  const makeParams = (params) => [
    ...(rpcSecret ? [`token:${rpcSecret}`] : []),
    ...params,
  ];
  const client = getAsmrClient();

  try {
    const [active, waiting, stopped] = await Promise.all([
      client.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: "kuruharu-translation-active",
          method: "aria2.tellActive",
          params: makeParams([fields]),
        },
        { timeout: 10000 },
      ),
      client.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: "kuruharu-translation-waiting",
          method: "aria2.tellWaiting",
          params: makeParams([0, 1000, fields]),
        },
        { timeout: 10000 },
      ),
      client.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: "kuruharu-translation-stopped",
          method: "aria2.tellStopped",
          params: makeParams([0, 1000, fields]),
        },
        { timeout: 10000 },
      ),
    ]);
    const states = new Map();
    [active, waiting, stopped].forEach((response) => {
      (response?.data?.result || []).forEach((task) => {
        if (gids.has(task?.gid)) states.set(task.gid, task);
      });
    });
    const responseCount = (response) => (response?.data?.result || []).length;
    const stateCounts = [...states.values()].reduce((counts, task) => {
      const status = String(task?.status || "unknown");
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    const trackedStateText =
      Object.entries(stateCounts)
        .map(([status, count]) => `${status}=${count}`)
        .join(" ") || "无匹配任务";
    logger.info(
      `[automation] aria2 RPC 状态已读取: tracked=${gids.size} matched=${states.size} replies(active=${responseCount(active)} waiting=${responseCount(waiting)} stopped=${responseCount(stopped)}) ${trackedStateText}`,
    );
    return { available: true, states };
  } catch (error) {
    logger.warn(
      "[automation] aria2 状态读取失败，改用轨道数量与临时文件校验",
      error?.message || error,
    );
    return { available: false, states: new Map() };
  }
};

const getPlannedTrackActivity = async (batchDownload, taskManifest) => {
  const tracks = await Promise.all(
    taskManifest.map(async (task) => {
      const outputPath = path.resolve(
        batchDownload.downloadDir,
        String(task.outPath || "").replace(/[\\/]/g, path.sep),
      );
      const [fileExists, tempExists] = await Promise.all([
        fs.promises
          .stat(outputPath)
          .then((stat) => stat.isFile() && stat.size > 0)
          .catch(() => false),
        fs.promises
          .access(`${outputPath}.aria2`, fs.constants.F_OK)
          .then(() => true)
          .catch(() => false),
      ]);
      return {
        ...task,
        fileExists,
        tempExists,
      };
    }),
  );
  return {
    completeCount: tracks.filter((track) => track.fileExists).length,
    tempCount: tracks.filter((track) => track.tempExists).length,
    incompleteOutPaths: tracks
      .filter((track) => !track.fileExists || track.tempExists)
      .map((track) => track.outPath),
  };
};

const getDownloadProgressSnapshot = (
  batchDownload,
  code,
  activity,
  taskManifest,
  aria2TaskStates,
) => {
  const timestamp = Date.now();
  const activeTasks = taskManifest
    .map((task) => aria2TaskStates.states.get(task.gid))
    .filter((task) => task?.status === "active");
  const aria2DownloadSpeed = activeTasks.reduce(
    (total, task) => total + Number(task?.downloadSpeed || 0),
    0,
  );
  const aria2CompletedBytes = activeTasks.reduce(
    (total, task) => total + Number(task?.completedLength || 0),
    0,
  );
  const current = {
    timestamp,
    mediaBytes: Number(activity?.mediaBytes || 0),
    mediaLatestMtimeMs: Number(activity?.mediaLatestMtimeMs || 0),
    aria2CompletedBytes,
    aria2DownloadSpeed,
  };
  const previous = batchDownload.downloadProgressByCode.get(code);
  batchDownload.downloadProgressByCode.set(code, current);
  const mediaBytesDelta = previous
    ? Math.max(0, current.mediaBytes - previous.mediaBytes)
    : 0;
  const aria2BytesDelta = previous
    ? Math.max(0, current.aria2CompletedBytes - previous.aria2CompletedBytes)
    : 0;
  const mediaMtimeAdvanced =
    Boolean(previous) &&
    current.mediaLatestMtimeMs > previous.mediaLatestMtimeMs;
  const elapsedMs = previous ? Math.max(1, timestamp - previous.timestamp) : 0;
  const observedSpeed =
    elapsedMs > 0
      ? Math.max(mediaBytesDelta, aria2BytesDelta) / (elapsedMs / 1000)
      : 0;
  const isGrowing = mediaBytesDelta > 0 || aria2BytesDelta > 0;
  return {
    aria2DownloadSpeed,
    aria2BytesDelta,
    mediaBytesDelta,
    mediaMtimeAdvanced,
    observedSpeed,
    isGrowing,
    isProgressing: aria2DownloadSpeed > 0 || isGrowing,
  };
};

const inspectDownload = async (batchDownload, code, aria2TaskStates) => {
  const expectedTaskCount = batchDownload.expectedTaskCounts.get(code) || 0;
  const taskManifest = batchDownload.taskManifestByCode.get(code) || [];
  const taskErrors = taskManifest
    .map((task) => aria2TaskStates.states.get(task.gid))
    .filter(
      (task) =>
        task?.status === "error" ||
        (task?.status === "removed" && String(task?.errorCode || "0") !== "0"),
    );
  const activeTaskCount = taskManifest.filter(
    (task) => aria2TaskStates.states.get(task.gid)?.status === "active",
  ).length;
  const pendingTaskCount = taskManifest.filter((task) =>
    ["active", "waiting", "paused"].includes(
      aria2TaskStates.states.get(task.gid)?.status,
    ),
  ).length;
  const matchedTaskCount = taskManifest.filter((task) =>
    aria2TaskStates.states.has(task.gid),
  ).length;
  const completedTaskCount = taskManifest.filter(
    (task) => aria2TaskStates.states.get(task.gid)?.status === "complete",
  ).length;
  const missingTaskCount = taskManifest.filter((task) => !task.gid).length;
  const failureReason = taskErrors.length
    ? `${taskErrors.length} 个 aria2 任务失败: ${
        taskErrors[0]?.errorMessage || taskErrors[0]?.errorCode || "未知错误"
      }`
    : missingTaskCount
      ? `${missingTaskCount} 个下载任务未获得 aria2 gid`
      : "";
  const workDir = await findWorkDir(batchDownload.downloadDir, code);
  if (!workDir) {
    const missingOutputReason =
      aria2TaskStates.available &&
      expectedTaskCount > 0 &&
      pendingTaskCount === 0 &&
      !failureReason
        ? matchedTaskCount === 0
          ? `aria2 未找到 ${code} 的已提交任务记录，本地也没有 RJ 文件夹；可能未成功推送到 aria2，或 aria2 重启后清除了任务记录，需要重新提交下载`
          : completedTaskCount === expectedTaskCount
            ? `aria2 显示 ${code} 的 ${completedTaskCount}/${expectedTaskCount} 个任务已完成，但下载目录未生成 RJ 文件夹或音频；可能下载目录不一致，需要重新提交下载`
            : `aria2 已无 ${code} 的运行任务，但下载目录未生成 RJ 文件夹或音频，需要重新提交下载`
        : "";
    logger.info(
      `[automation] aria2 下载监控 ${code}: 未找到本地目录，预期音频=${expectedTaskCount}，运行中=${pendingTaskCount}，${missingOutputReason || "等待 aria2 创建下载目录"}`,
    );
    return {
      workDir: "",
      activity: null,
      complete: false,
      failed: Boolean(failureReason),
      failureReason,
      expectedTaskCount,
      pendingTaskCount,
      hasDownloadActivity: activeTaskCount > 0 || Boolean(missingOutputReason),
      shouldRetryEarly: Boolean(missingOutputReason),
      earlyRetryReason: missingOutputReason,
      shouldRecoverTempFiles: false,
      tempFileRecoveryReason: "",
    };
  }

  const activity = await getDirectoryActivity(workDir);
  const plannedTrackActivity = await getPlannedTrackActivity(
    batchDownload,
    taskManifest,
  );
  const downloadProgress = getDownloadProgressSnapshot(
    batchDownload,
    code,
    activity,
    taskManifest,
    aria2TaskStates,
  );
  const taskStateCounts = taskManifest.reduce((counts, task) => {
    const status = !task?.gid
      ? "missing-gid"
      : String(task.gid).startsWith("local:")
        ? "local-complete"
        : String(aria2TaskStates.states.get(task.gid)?.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const taskStateText =
    Object.entries(taskStateCounts)
      .map(([status, count]) => `${status}=${count}`)
      .join(" ") || "无任务";
  const earlyRetryRequiredCount = Math.ceil(
    expectedTaskCount * (batchDownload.aria2EarlyRetryPercent / 100),
  );
  const missingTaskRecordReason =
    aria2TaskStates.available &&
    expectedTaskCount > 0 &&
    plannedTrackActivity.completeCount < expectedTaskCount &&
    pendingTaskCount === 0 &&
    matchedTaskCount < expectedTaskCount &&
    !failureReason
      ? `aria2 只找到 ${matchedTaskCount}/${expectedTaskCount} 个任务记录，但计划轨道为 ${plannedTrackActivity.completeCount}/${expectedTaskCount}，需要重新提交缺失下载`
      : "";
  const earlyRetryReason =
    missingTaskRecordReason ||
    (aria2TaskStates.available &&
    expectedTaskCount > 0 &&
    plannedTrackActivity.completeCount < expectedTaskCount &&
    plannedTrackActivity.completeCount >= earlyRetryRequiredCount &&
    plannedTrackActivity.tempCount === 0 &&
    pendingTaskCount === 0 &&
    !downloadProgress.isProgressing
      ? `已下载计划轨道 ${plannedTrackActivity.completeCount}/${expectedTaskCount}（达到 ${batchDownload.aria2EarlyRetryPercent}% 提前重试阈值），但 aria2 已无运行任务`
      : "");
  const tempFileRecoveryReason =
    aria2TaskStates.available &&
    expectedTaskCount > 0 &&
    activity.aria2TempFileCount > 0 &&
    pendingTaskCount === 0 &&
    !downloadProgress.isProgressing &&
    !failureReason
      ? `aria2 已无运行任务，但 RJ 目录仍有 ${activity.aria2TempFileCount} 个 .aria2 临时文件，需要重新提交以续传`
      : "";
  setRuntimeProgress(
    "download",
    `下载 ${code}：计划轨道 ${plannedTrackActivity.completeCount}/${expectedTaskCount}，实际音频 ${activity.mediaFileCount}，${formatBytes(activity.totalBytes)}，速度 ${formatBytes(downloadProgress.aria2DownloadSpeed || downloadProgress.observedSpeed)}/s，5 秒增长 ${formatBytes(Math.max(downloadProgress.mediaBytesDelta, downloadProgress.aria2BytesDelta))}，aria2 临时文件 ${activity.aria2TempFileCount} 个，运行中 ${pendingTaskCount} 个`,
    code,
    {
      mediaFileCount: activity.mediaFileCount,
      expectedTaskCount,
      plannedTrackCount: plannedTrackActivity.completeCount,
      totalBytes: activity.totalBytes,
      aria2TempFileCount: activity.aria2TempFileCount,
      pendingTaskCount,
      aria2DownloadSpeed: downloadProgress.aria2DownloadSpeed,
      observedDownloadSpeed: downloadProgress.observedSpeed,
      mediaBytesDelta: downloadProgress.mediaBytesDelta,
      aria2BytesDelta: downloadProgress.aria2BytesDelta,
      isDownloadProgressing: downloadProgress.isProgressing,
      stablePolls: 0,
      stablePollsRequired: 0,
    },
  );
  logger.info(
    `[automation] aria2 下载监控 ${code}: 计划轨道=${plannedTrackActivity.completeCount}/${expectedTaskCount} 实际音频=${activity.mediaFileCount} 临时文件=${activity.aria2TempFileCount} 已落盘=${formatBytes(activity.totalBytes)} aria2速度=${formatBytes(downloadProgress.aria2DownloadSpeed)}/s 文件增长=${formatBytes(downloadProgress.mediaBytesDelta)}/5秒 RPC增长=${formatBytes(downloadProgress.aria2BytesDelta)}/5秒 状态=${downloadProgress.isProgressing ? "增长中" : "未增长"} RPC=${aria2TaskStates.available ? "已读取" : "不可用"} 任务=${taskStateText}`,
  );
  return {
    workDir,
    activity,
    expectedTaskCount,
    failed: Boolean(failureReason),
    failureReason,
    hasDownloadActivity:
      activeTaskCount > 0 ||
      activity.aria2TempFileCount > 0 ||
      (plannedTrackActivity.completeCount > 0 &&
        plannedTrackActivity.completeCount < expectedTaskCount) ||
      Boolean(missingTaskRecordReason),
    shouldRetryEarly: Boolean(earlyRetryReason),
    earlyRetryReason,
    shouldRecoverTempFiles: Boolean(tempFileRecoveryReason),
    tempFileRecoveryReason,
    isDownloadProgressing: downloadProgress.isProgressing,
    complete:
      expectedTaskCount > 0 &&
      plannedTrackActivity.completeCount === expectedTaskCount &&
      plannedTrackActivity.tempCount === 0 &&
      activity.aria2TempFileCount === 0 &&
      pendingTaskCount === 0 &&
      !failureReason,
  };
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const waitForDownload = async (
  rootPath,
  code,
  timeoutMs,
  pollMs,
  stablePollsRequired,
) => {
  const deadline = Date.now() + timeoutMs;
  let previousFingerprint = "";
  let stablePolls = 0;
  while (Date.now() < deadline) {
    const workDir = await findWorkDir(rootPath, code);
    if (workDir) {
      const activity = await getDirectoryActivity(workDir);
      const fingerprint = `${activity.fileCount}:${activity.totalBytes}:${activity.latestMtimeMs}`;
      stablePolls = fingerprint === previousFingerprint ? stablePolls + 1 : 0;
      previousFingerprint = fingerprint;
      setRuntimeProgress(
        "download",
        `下载 ${code}：${activity.mediaFileCount} 个媒体文件，${formatBytes(activity.totalBytes)}，aria2 临时文件 ${activity.aria2TempFileCount} 个，稳定检测 ${stablePolls}/${stablePollsRequired}`,
        code,
        {
          mediaFileCount: activity.mediaFileCount,
          totalBytes: activity.totalBytes,
          aria2TempFileCount: activity.aria2TempFileCount,
          stablePolls,
          stablePollsRequired,
        },
      );
      if (
        activity.mediaFileCount > 0 &&
        activity.aria2TempFileCount === 0 &&
        stablePolls >= stablePollsRequired
      ) {
        return workDir;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`等待 ${code} 下载完成超时`);
};

const execFileAsync = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const getAria2ExecutablePath = async () => {
  const configuredPath = String(
    getConfig()?.asmr?.downloadAria2Path || getConfig()?.asmr?.aria2Path || "",
  ).trim();
  if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;
  if (process.platform !== "win32") return "";

  try {
    const result = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-CimInstance Win32_Process -Filter \"Name='aria2c.exe'\" | Select-Object -First 1 -ExpandProperty ExecutablePath)",
    ]);
    return String(result.stdout || "").trim();
  } catch {
    return "";
  }
};

const parseWindowsCommandLine = (commandLine) => {
  const tokens = [];
  let current = "";
  let inQuotes = false;
  for (const char of String(commandLine || "")) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
};

const getAria2ProcessLaunchInfo = async () => {
  if (process.platform !== "win32") return null;
  try {
    const result = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$p = Get-CimInstance Win32_Process -Filter \"Name='aria2c.exe'\" | Select-Object -First 1; if ($p) { @{ executablePath = $p.ExecutablePath; commandLine = $p.CommandLine } | ConvertTo-Json -Compress }",
    ]);
    const raw = String(result.stdout || "").trim();
    if (!raw) return null;
    const info = JSON.parse(raw);
    const executablePath = String(info?.executablePath || "").trim();
    const commandLine = String(info?.commandLine || "").trim();
    if (!executablePath) return null;
    const tokens = parseWindowsCommandLine(commandLine);
    const args =
      tokens.length > 1
        ? tokens.slice(1).filter((token) => token !== executablePath)
        : [];
    return {
      executablePath,
      commandLine,
      args,
      cwd: path.dirname(executablePath),
    };
  } catch {
    return null;
  }
};

const hasAria2Argument = (args, name) =>
  args.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));

const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
};

const getAria2GlobalOptions = async (client, rpcUrl, rpcSecret) => {
  try {
    const response = await client.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: "kuruharu-translation-global-options",
        method: "aria2.getGlobalOption",
        params: rpcSecret ? [`token:${rpcSecret}`] : [],
      },
      { timeout: 5000 },
    );
    return response?.data?.result || null;
  } catch {
    return null;
  }
};

let cachedAria2LaunchSpec = null;

const resolveAria2LaunchSpec = async ({ client, rpcUrl, rpcSecret }) => {
  if (cachedAria2LaunchSpec) return cachedAria2LaunchSpec;

  const processInfo = await getAria2ProcessLaunchInfo();
  const executablePath =
    processInfo?.executablePath || (await getAria2ExecutablePath());
  if (!executablePath) return null;

  let cwd = processInfo?.cwd || path.dirname(executablePath);
  let args = processInfo?.args?.length ? [...processInfo.args] : [];

  if (!args.length) {
    args = [
      "--enable-rpc=true",
      "--rpc-listen-port=6800",
      "--rpc-listen-all=false",
    ];
    if (rpcSecret) args.push(`--rpc-secret=${rpcSecret}`);
  }

  // 原进程可能用相对路径启动 --conf-path。若只有一个猜测目录，恢复出的实例会
  // 找不到配置并重新变成“裸 aria2”，因此先把相对配置路径解析为绝对路径。
  const confArgIndex = args.findIndex((arg) => arg.startsWith("--conf-path="));
  if (confArgIndex >= 0) {
    const confValue = args[confArgIndex].slice("--conf-path=".length);
    if (confValue && !path.isAbsolute(confValue)) {
      const confPath = [
        path.resolve(cwd, confValue),
        path.resolve(process.cwd(), confValue),
      ].find(fileExists);
      if (confPath) {
        cwd = path.dirname(confPath);
        args[confArgIndex] = `--conf-path=${confPath}`;
      }
    }
  }

  // 沿用原 aria2 的 save-session/input-file。否则重启后的新实例既不读取也不更新
  // 原会话文件，旧任务会在下一次开机时被 aria2 重新载入，形成“翻译完重启后残留”。
  const globalOptions = await getAria2GlobalOptions(client, rpcUrl, rpcSecret);
  const saveSession = String(globalOptions?.["save-session"] || "").trim();
  let sessionPath = "";
  if (saveSession) {
    const sessionCandidates = path.isAbsolute(saveSession)
      ? [saveSession]
      : [
          path.resolve(cwd, saveSession),
          path.resolve(process.cwd(), saveSession),
        ];
    sessionPath = sessionCandidates.find(fileExists) || sessionCandidates[0];
    if (!hasAria2Argument(args, "save-session")) {
      args.push(`--save-session=${sessionPath}`);
    }
    if (!hasAria2Argument(args, "input-file") && fileExists(sessionPath)) {
      args.push(`--input-file=${sessionPath}`);
    }
    if (!hasAria2Argument(args, "save-session-interval")) {
      args.push("--save-session-interval=1");
    }
  }

  cachedAria2LaunchSpec = {
    executablePath,
    args,
    cwd,
    sourceCommandLine: processInfo?.commandLine || "",
    sessionPath,
  };
  logger.info(
    `[automation] aria2 重启将沿用原启动参数: exe=${executablePath} cwd=${cwd} args=${args.join(" ")} session=${cachedAria2LaunchSpec.sessionPath || "(未配置)"}`,
  );
  return cachedAria2LaunchSpec;
};

const clearAria2TrackedDownloadResults = async (batchDownload) => {
  const gids = [
    ...new Set(
      [...(batchDownload?.taskManifestByCode?.values() || [])]
        .flat()
        .map((task) => String(task?.gid || "").trim())
        .filter((gid) => gid && !gid.startsWith("local:")),
    ),
  ];
  if (!gids.length) return;

  const asmrConfig = getConfig()?.asmr || {};
  const rpcUrl = String(
    asmrConfig.downloadRpcUrl || "http://localhost:6800/jsonrpc",
  ).trim();
  const rpcSecret = String(asmrConfig.downloadRpcSecret || "").trim();
  const client = getAsmrClient();
  let removed = 0;
  let nextIndex = 0;
  const concurrency = Math.min(20, gids.length);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < gids.length) {
        const gid = gids[nextIndex];
        nextIndex += 1;
        try {
          const response = await client.post(
            rpcUrl,
            {
              jsonrpc: "2.0",
              id: `kuruharu-translation-clear-${gid}`,
              method: "aria2.removeDownloadResult",
              params: [...(rpcSecret ? [`token:${rpcSecret}`] : []), gid],
            },
            { timeout: 5000 },
          );
          if (response?.data?.error) {
            throw new Error(
              response.data.error.message || "removeDownloadResult failed",
            );
          }
          removed += 1;
        } catch {
          // 任务仍在运行或已被 aria2 清理，忽略即可。
        }
      }
    }),
  );
  if (removed) {
    logger.info(
      `[automation] 已清理 ${removed}/${gids.length} 个本轮 aria2 下载结果，避免任务残留在会话中`,
    );
  }
};

const waitForAria2ProcessExit = async (timeoutMs = 10000) => {
  if (process.platform !== "win32") return false;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "(@(Get-Process -Name aria2c -ErrorAction SilentlyContinue)).Count",
      ]);
      if (Number(String(result.stdout || "").trim()) === 0) {
        return true;
      }
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

const restartAria2 = async () => {
  const asmrConfig = getConfig()?.asmr || {};
  const rpcUrl = String(
    asmrConfig.downloadRpcUrl || "http://localhost:6800/jsonrpc",
  ).trim();
  const rpcSecret = String(asmrConfig.downloadRpcSecret || "").trim();
  const client = getAsmrClient();

  if (process.platform !== "win32") {
    logger.warn("[automation] 当前平台未实现 aria2 自动重启，保留 aria2 运行");
    return false;
  }

  const launchSpec = await resolveAria2LaunchSpec({
    client,
    rpcUrl,
    rpcSecret,
  });
  if (!launchSpec) {
    logger.warn("[automation] 找不到 aria2c.exe，无法自动重启");
    return false;
  }

  try {
    await client.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: "kuruharu-translation-restart",
        method: "aria2.shutdown",
        params: rpcSecret ? [`token:${rpcSecret}`] : [],
      },
      { timeout: 5000 },
    );
    logger.info("[automation] 已请求 aria2 优雅关闭，等待完成控制文件清理");
  } catch {
    logger.warn("[automation] aria2 优雅关闭请求失败，将检查进程是否仍在运行");
  }

  let exited = await waitForAria2ProcessExit();
  if (!exited) {
    logger.warn("[automation] aria2 未在优雅关闭期限内退出，尝试强制关闭");
    try {
      await client.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: "kuruharu-translation-force-restart",
          method: "aria2.forceShutdown",
          params: rpcSecret ? [`token:${rpcSecret}`] : [],
        },
        { timeout: 5000 },
      );
    } catch {
      // forceShutdown 可能在响应返回前断开，继续检查退出状态。
    }
    exited = await waitForAria2ProcessExit(5000);
  }
  if (!exited) {
    logger.warn("[automation] aria2 仍未退出，最后才使用 taskkill 强制结束");
    try {
      await execFileAsync("taskkill", ["/IM", "aria2c.exe", "/F"]);
    } catch {
      // 进程可能已在 taskkill 前退出。
    }
    exited = await waitForAria2ProcessExit(3000);
  }
  if (!exited) {
    logger.error("[automation] aria2 进程未能退出，取消本次自动重启");
    return false;
  }

  const child = spawn(launchSpec.executablePath, launchSpec.args, {
    cwd: launchSpec.cwd,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.unref();
  logger.info(
    `[automation] 已按原配置重新启动 aria2: pid=${child.pid || "unknown"} cwd=${launchSpec.cwd}`,
  );

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await client.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: "kuruharu-translation-restart-check",
          method: "aria2.getVersion",
          params: rpcSecret ? [`token:${rpcSecret}`] : [],
        },
        { timeout: 3000 },
      );
      if (response?.status === 200 && response.data?.result) {
        logger.info("[automation] aria2 已重启并恢复 RPC");
        return true;
      }
    } catch {
      // 等待 aria2 RPC 恢复。
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  logger.warn("[automation] aria2 重启后 RPC 未恢复");
  return false;
};

const createWhisperDiagnosticLog = async ({
  code,
  exePath,
  args,
  targetPath,
}) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logRoot =
    getConfig().paths?.logsDir || path.join(app.getPath("userData"), "logs");
  const logDir = path.join(logRoot, WHISPER_DIAGNOSTIC_LOG_DIRNAME);
  const filePath = path.join(
    logDir,
    `${code || "unknown"}-${timestamp}-${process.pid}.jsonl`,
  );
  let writeQueue = Promise.resolve();
  const write = (event, details = {}) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    });
    writeQueue = writeQueue
      .then(() => fs.promises.appendFile(filePath, `${entry}\n`, "utf8"))
      .catch((error) => {
        logger.warn(
          `[automation] Whisper 子进程诊断日志写入失败: ${error?.message || error}`,
        );
      });
    return writeQueue;
  };

  try {
    await fs.promises.mkdir(logDir, { recursive: true });
    const entries = await fs.promises.readdir(logDir, { withFileTypes: true });
    const oldLogs = (
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
          .map(async (entry) => {
            const fullPath = path.join(logDir, entry.name);
            const stats = await fs.promises.stat(fullPath);
            return { fullPath, mtimeMs: stats.mtimeMs };
          }),
      )
    )
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(WHISPER_DIAGNOSTIC_LOG_LIMIT - 1);
    await Promise.all(
      oldLogs.map(({ fullPath }) =>
        fs.promises.unlink(fullPath).catch(() => undefined),
      ),
    );
    await write("spawn-requested", {
      code,
      executablePath: exePath,
      args,
      targetPath,
      parentProcessId: process.pid,
      workingDirectory: process.cwd(),
    });
  } catch (error) {
    logger.warn(
      `[automation] Whisper 子进程诊断日志初始化失败: ${error?.message || error}`,
    );
    return {
      filePath: "",
      flush: () => Promise.resolve(),
      write: () => Promise.resolve(),
    };
  }

  return {
    filePath,
    flush: () => writeQueue,
    write,
  };
};

const translateSubtitles = async ({
  exePath,
  targetPath,
  subFormats,
  stallTimeoutMs,
  activityPollMs,
  code,
}) => {
  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error("Whisper 引擎路径未配置或文件不存在");
  }
  if (!targetPath || !fs.existsSync(targetPath)) {
    throw new Error("Whisper 翻译目录不存在");
  }
  const formats =
    Array.isArray(subFormats) && subFormats.length
      ? subFormats.join(",")
      : "lrc";
  const args = [
    "--audio_suffixes=mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv",
    `--sub_formats=${formats}`,
    "--device=cuda",
    targetPath,
  ];
  const diagnosticLog = await createWhisperDiagnosticLog({
    code,
    exePath,
    args,
    targetPath,
  });
  emit(
    `开始 Whisper 翻译: ${path.basename(targetPath)}${
      diagnosticLog.filePath ? `，诊断日志: ${diagnosticLog.filePath}` : ""
    }`,
  );
  await new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;
    let lastActivityAt = Date.now();
    let previousFingerprint = "";
    let pendingOutputLines = [];
    let outputFlushTimer = null;
    void diagnosticLog.write("spawned", { childProcessId: child.pid || null });
    const flushOutput = () => {
      outputFlushTimer = null;
      if (!pendingOutputLines.length) {
        return;
      }

      const lines = pendingOutputLines;
      pendingOutputLines = [];
      const visibleLines = lines.slice(-3);
      const omittedCount = lines.length - visibleLines.length;
      const summary = [
        omittedCount > 0 ? `已合并 ${omittedCount} 行输出` : "",
        ...visibleLines,
      ]
        .filter(Boolean)
        .join(" | ");

      emit(`[Whisper] ${summary}`, { persistLog: false });
    };
    const stopChildProcess = (reason) => {
      void diagnosticLog.write("termination-requested", {
        childProcessId: child.pid || null,
        reason,
      });
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
          windowsHide: true,
        });
        return;
      }
      child.kill("SIGKILL");
    };
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      clearInterval(activityTimer);
      if (outputFlushTimer) {
        clearTimeout(outputFlushTimer);
      }
      flushOutput();
      handler(value);
    };
    const onOutput = (chunk) => {
      const text = String(chunk);
      lastActivityAt = Date.now();
      void diagnosticLog.write("output", { stream: "stdout", text });
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        return;
      }

      pendingOutputLines.push(...lines);
      if (!outputFlushTimer) {
        outputFlushTimer = setTimeout(flushOutput, 750);
      }
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr = `${stderr}${text}`.slice(-WHISPER_STDERR_TAIL_LIMIT);
      lastActivityAt = Date.now();
      void diagnosticLog.write("output", { stream: "stderr", text });
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        return;
      }

      pendingOutputLines.push(...lines);
      if (!outputFlushTimer) {
        outputFlushTimer = setTimeout(flushOutput, 750);
      }
    });
    const activityTimer = setInterval(async () => {
      try {
        const activity = await getDirectoryActivity(targetPath);
        const fingerprint = `${activity.fileCount}:${activity.totalBytes}:${activity.latestMtimeMs}`;
        if (fingerprint !== previousFingerprint) {
          previousFingerprint = fingerprint;
          lastActivityAt = Date.now();
        }
        const idleMs = Date.now() - lastActivityAt;
        setRuntimeProgress(
          "translate",
          `Whisper 翻译 ${code}：${activity.subtitleFileCount} 个字幕，${formatBytes(activity.totalBytes)}，${Math.floor(idleMs / 1000)} 秒无新活动`,
          code,
          {
            subtitleFileCount: activity.subtitleFileCount,
            totalBytes: activity.totalBytes,
            idleMs,
            stallTimeoutMs,
          },
        );
        if (idleMs >= stallTimeoutMs) {
          stopChildProcess("watchdog-stall-timeout");
          void diagnosticLog.write("watchdog-timeout", {
            activity,
            idleMs,
            stallTimeoutMs,
          });
          settle(
            reject,
            new Error(
              `Whisper 翻译疑似卡死：${Math.floor(stallTimeoutMs / 60000)} 分钟无日志或文件变化`,
            ),
          );
        }
      } catch (error) {
        logger.warn(
          "[automation] Whisper 活动检测失败",
          error?.message || error,
        );
      }
    }, activityPollMs);
    activityTimer.unref?.();
    child.on("error", async (error) => {
      await diagnosticLog.write("process-error", {
        childProcessId: child.pid || null,
        error: {
          name: error?.name,
          message: error?.message || String(error),
          stack: error?.stack,
        },
      });
      await diagnosticLog.flush();
      settle(reject, error);
    });
    child.on("close", async (exitCode, signal) => {
      await diagnosticLog.write("process-closed", {
        childProcessId: child.pid || null,
        exitCode,
        signal,
        stderrTail: stderr,
      });
      await diagnosticLog.flush();
      if (exitCode === 0) {
        settle(resolve);
        return;
      }
      try {
        const activity = await getDirectoryActivity(targetPath);
        if (
          activity.mediaFileCount > 0 &&
          activity.lrcFileCount === activity.mediaFileCount
        ) {
          const message =
            `Whisper 异常退出 (exit ${exitCode})，但已生成 ` +
            `${activity.lrcFileCount}/${activity.mediaFileCount} 个 LRC，继续打包`;
          logger.warn(`[automation] ${code} ${message}`);
          emit(message);
          settle(resolve);
          return;
        }
      } catch (error) {
        logger.warn(
          `[automation] ${code} Whisper 退出后字幕检查失败`,
          error?.message || error,
        );
      }
      settle(
        reject,
        new Error(
          `Whisper 翻译失败 (exit ${exitCode}, signal ${signal || "none"})，` +
            `诊断日志: ${diagnosticLog.filePath || "写入失败"}: ${stderr.slice(-500)}`,
        ),
      );
    });
  });
};

const packSubtitles = async ({ targetPath, outputDir, code }) => {
  const activity = await getDirectoryActivity(targetPath);
  if (
    activity.mediaFileCount <= 0 ||
    activity.lrcFileCount !== activity.mediaFileCount
  ) {
    throw new Error(
      `${code} LRC/音频数量不一致: ${activity.lrcFileCount}/${activity.mediaFileCount}，不执行打包`,
    );
  }
  const { subtitleFiles } = await collectPackFilesInDirectory({
    folderPath: targetPath,
    basePath: targetPath,
  });
  if (!subtitleFiles.length) {
    throw new Error(`${code} 未找到可打包字幕`);
  }
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${code}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    subtitleFiles.forEach((file) => {
      archive.file(file.fullPath, { name: file.relativePath });
    });
    archive.finalize();
  });
  return outputPath;
};

const uploadSubtitlePackage = async ({ filePath, code, channelId }) => {
  if (!channelId) throw new Error("未配置 Telegram 上传频道");
  const client = await requireConnectedTelegramClient();
  const peer = normalizePeerEntityInput(channelId);
  const titleMessage = await client.sendMessage(peer, { message: code });
  await new Promise((resolve) => setTimeout(resolve, 3500));
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await client.sendFile(peer, {
        file: filePath,
        forceDocument: true,
        commentTo: titleMessage.id,
        progressCallback: (progress) => {
          const percent = Math.round(Number(progress || 0) * 100);
          if (percent > 0 && percent % 25 === 0) {
            emit(`${code} 上传进度 ${percent}%`);
          }
        },
      });
      return;
    } catch (error) {
      lastError = error;
      if (
        !String(error?.message || "").includes("MSG_ID_INVALID") ||
        attempt === 3
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  throw lastError || new Error(`${code} Telegram 上传失败`);
};

const packageUploadAndCleanupWork = async ({
  work,
  code,
  config,
  workDir,
  downloadDir,
}) => {
  const packageDir = path.join(downloadDir, config.packageDirName);
  setRuntimeStatus("package", `正在打包 ${code} 字幕`, code);
  const packagePath = await packSubtitles({
    targetPath: workDir,
    outputDir: packageDir,
    code,
  });
  setRuntimeStatus("upload", `正在上传 ${code} 字幕包`, code);
  await uploadSubtitlePackage({
    filePath: packagePath,
    code,
    channelId: getConfig()?.upload?.channelId || "",
  });
  setRuntimeStatus("cleanup", `正在从待翻译队列删除 ${code}`, code);
  await deleteFromQueue(work);
  if (config.cleanupLocalAfterUpload) {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
  setRuntimeStatus("completed", `${code} 已上传并从待翻译队列删除`, code);
};

const getAutomationDownloadDir = () =>
  getConfig()?.paths?.asmrDownloadDir ||
  getConfig()?.paths?.toolOutputDir ||
  path.join(getDataDir(), "asmr-downloads");

const buildDownloadTracking = (downloadResult) => {
  const expectedTaskCounts = new Map(
    (downloadResult?.processedItems || [])
      .filter((item) => item?.status === "queued")
      .map((item) => [
        normalizeCode(item?.workCode || item?.input),
        Number(item?.taskCount) || 0,
      ])
      .filter(([code]) => Boolean(code)),
  );
  const taskManifestByCode = new Map();
  (downloadResult?.taskManifest || []).forEach((task) => {
    const code = normalizeCode(task?.workCode || task?.outPath);
    if (!code) return;
    const tasks = taskManifestByCode.get(code) || [];
    tasks.push(task);
    taskManifestByCode.set(code, tasks);
  });
  return { expectedTaskCounts, taskManifestByCode };
};

const submitBatchDownload = async (works, config) => {
  const codes = [
    ...new Set(
      works
        .map((work) =>
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        )
        .filter(Boolean),
    ),
  ];
  const downloadDir = getAutomationDownloadDir();
  await fs.promises.mkdir(downloadDir, { recursive: true });
  if (!codes.length) {
    return {
      downloadDir,
      failedCodes: new Map(),
      manualCodes: new Map(),
      aria2RestartAttempts: 0,
      aria2RestartMaxAttempts: getAria2RestartMaxAttempts(config),
      aria2RestartCooldownMs: getAria2RestartCooldownMs(config),
      aria2RestartNotBefore: 0,
      aria2EarlyRetryPercent: getAria2EarlyRetryPercent(config),
      earlyRetryNotBefore: 0,
      codes,
      expectedTaskCounts: new Map(),
      taskManifestByCode: new Map(),
      downloadProgressByCode: new Map(),
    };
  }

  setRuntimeStatus("download", `正在批量提交 ${codes.length} 个作品的下载任务`);
  const maxAutoTasksPerWork = Math.max(
    1,
    Number(config?.maxDownloadTasksPerWork) || DEFAULTS.maxDownloadTasksPerWork,
  );
  const downloadResult = await runAsmrAudioDownloader({
    inputText: codes.join("\n"),
    downloadDir,
    maxAutoTasksPerWork,
  });
  if (!downloadResult?.success) {
    throw new Error(downloadResult?.message || "批量下载任务提交失败");
  }

  const manualCodes = new Map(
    (downloadResult.processedItems || [])
      .filter((item) => item?.status === "manual")
      .map((item) => [
        normalizeCode(item?.workCode || item?.input),
        item?.reason || "下载器未生成可用任务",
      ])
      .filter(([code]) => Boolean(code)),
  );
  const failedCodes = new Map(
    (downloadResult.processedItems || [])
      .filter((item) => item?.status !== "queued" && item?.status !== "manual")
      .map((item) => [
        normalizeCode(item?.workCode || item?.input),
        item?.reason || "下载器未生成可用任务",
      ])
      .filter(([code]) => Boolean(code)),
  );
  const { expectedTaskCounts, taskManifestByCode } =
    buildDownloadTracking(downloadResult);
  expectedTaskCounts.forEach((expectedTaskCount, code) => {
    const taskManifest = taskManifestByCode.get(code) || [];
    if (taskManifest.length !== expectedTaskCount) {
      failedCodes.set(
        code,
        `下载任务清单不完整: ${taskManifest.length}/${expectedTaskCount}`,
      );
      return;
    }
    const missingGidCount = taskManifest.filter((task) => !task.gid).length;
    if (missingGidCount) {
      failedCodes.set(
        code,
        `${missingGidCount} 个下载任务未获得 aria2 gid，未确认提交成功`,
      );
    }
  });
  logger.info(
    `[automation] 批量下载已提交: works=${codes.length} tasks=${downloadResult?.summary?.taskCount || 0} pushed=${downloadResult?.summary?.pushedCount || 0} manual=${downloadResult?.summary?.manualCount || 0} taskLimit=${maxAutoTasksPerWork}`,
  );
  failedCodes.forEach((reason, code) => {
    logger.warn(`[automation] ${code} 未生成下载任务: ${reason}`);
  });
  manualCodes.forEach((reason, code) => {
    logger.warn(`[automation] ${code} 需要人工筛选，不会重启 aria2: ${reason}`);
  });
  return {
    downloadDir,
    failedCodes,
    manualCodes,
    aria2RestartAttempts: 0,
    aria2RestartMaxAttempts: getAria2RestartMaxAttempts(config),
    aria2RestartCooldownMs: getAria2RestartCooldownMs(config),
    aria2RestartNotBefore: 0,
    aria2EarlyRetryPercent: getAria2EarlyRetryPercent(config),
    earlyRetryNotBefore: 0,
    codes,
    maxAutoTasksPerWork,
    expectedTaskCounts,
    taskManifestByCode,
    downloadProgressByCode: new Map(),
  };
};

const resubmitBatchDownload = async (
  batchDownload,
  codes = batchDownload.codes,
) => {
  const requestedOutPathsByCode = {};
  const requestedCodes = [
    ...new Set((codes || []).map(normalizeCode).filter(Boolean)),
  ];
  const retryCodes = [];
  for (const code of requestedCodes) {
    const taskManifest = batchDownload.taskManifestByCode.get(code) || [];
    if (!taskManifest.length) {
      retryCodes.push(code);
      continue;
    }

    const { incompleteOutPaths } = await getPlannedTrackActivity(
      batchDownload,
      taskManifest,
    );
    if (!incompleteOutPaths.length) {
      logger.info(
        `[automation] ${code} 的计划轨道已完整，跳过重复提交 aria2 任务`,
      );
      continue;
    }
    requestedOutPathsByCode[code] = incompleteOutPaths;
    retryCodes.push(code);
  }
  if (!retryCodes.length) return;

  const result = await runAsmrAudioDownloader({
    inputText: retryCodes.join("\n"),
    downloadDir: batchDownload.downloadDir,
    maxAutoTasksPerWork: batchDownload.maxAutoTasksPerWork,
    requestedOutPathsByCode,
  });
  if (!result?.success) {
    throw new Error(result?.message || "aria2 重启后批量下载任务重新提交失败");
  }

  retryCodes.forEach((code) => {
    batchDownload.failedCodes.delete(code);
  });
  const handledCodes = new Set();
  for (const item of result.processedItems || []) {
    const code = normalizeCode(item?.workCode || item?.input);
    if (!code || !retryCodes.includes(code)) continue;
    handledCodes.add(code);
    if (item?.status === "queued") {
      batchDownload.failedCodes.delete(code);
    } else {
      batchDownload.failedCodes.set(
        code,
        item?.reason || "下载器未生成可用任务",
      );
    }
  }
  const { expectedTaskCounts, taskManifestByCode } =
    buildDownloadTracking(result);
  retryCodes.forEach((code) => {
    if (!handledCodes.has(code)) {
      batchDownload.failedCodes.set(code, "下载器未返回此作品的重新提交结果");
      return;
    }
    const expectedTaskCount =
      batchDownload.expectedTaskCounts.get(code) ||
      expectedTaskCounts.get(code) ||
      0;
    const originalTaskManifest =
      batchDownload.taskManifestByCode.get(code) || [];
    const resubmittedTaskManifest = taskManifestByCode.get(code) || [];
    const resubmittedTasksByOutPath = new Map(
      resubmittedTaskManifest.map((task) => [task.outPath, task]),
    );
    const mergedTaskManifest = originalTaskManifest.length
      ? originalTaskManifest.map(
          (task) => resubmittedTasksByOutPath.get(task.outPath) || task,
        )
      : resubmittedTaskManifest;
    if (!batchDownload.failedCodes.has(code)) {
      if (!expectedTaskCount) {
        batchDownload.failedCodes.set(code, "重新提交后未生成下载轨道");
      } else if (mergedTaskManifest.length !== expectedTaskCount) {
        batchDownload.failedCodes.set(
          code,
          `重新提交后的下载任务清单不完整: ${mergedTaskManifest.length}/${expectedTaskCount}`,
        );
      } else if (mergedTaskManifest.some((task) => !task.gid)) {
        batchDownload.failedCodes.set(
          code,
          "重新提交后存在未获得 aria2 gid 的下载任务",
        );
      }
    }
    if (expectedTaskCount) {
      batchDownload.expectedTaskCounts.set(code, expectedTaskCount);
    }
    if (mergedTaskManifest.length) {
      batchDownload.taskManifestByCode.set(code, mergedTaskManifest);
    }
  });
  logger.info(
    `[automation] aria2 重启后已重新提交缺失下载: works=${retryCodes.length} tasks=${result?.summary?.taskCount || 0} pushed=${result?.summary?.pushedCount || 0}`,
  );
};

const restartAndResubmitBatchDownload = async (
  batchDownload,
  codes,
  reason,
) => {
  if (
    batchDownload.aria2RestartAttempts >= batchDownload.aria2RestartMaxAttempts
  ) {
    return false;
  }

  batchDownload.aria2RestartAttempts += 1;
  batchDownload.aria2RestartNotBefore =
    Date.now() + Number(batchDownload.aria2RestartCooldownMs || 60 * 1000);
  batchDownload.earlyRetryNotBefore = batchDownload.aria2RestartNotBefore;
  const attempt = batchDownload.aria2RestartAttempts;
  const maximum = batchDownload.aria2RestartMaxAttempts;
  setRuntimeStatus(
    "download",
    `${reason}，正在重启 aria2 并重新提交下载补丁（${attempt}/${maximum}）`,
  );
  logger.warn(
    `[automation] aria2 下载异常，开始第 ${attempt}/${maximum} 次重启并重新提交补丁: ${reason}`,
  );

  const restarted = await restartAria2();
  if (!restarted) {
    logger.warn(
      `[automation] aria2 第 ${attempt}/${maximum} 次重启失败，待翻译队列将继续保留`,
    );
    return false;
  }

  try {
    await resubmitBatchDownload(batchDownload, codes);
    return true;
  } catch (error) {
    logger.error(
      `[automation] aria2 第 ${attempt}/${maximum} 次重启后重新提交补丁失败: ${error?.message || error}`,
    );
    return false;
  }
};

const processWork = async (
  work,
  config,
  batchDownload,
  downloadedWorkDir = "",
) => {
  const code = normalizeCode(work?.source_id || work?.rj_code || work?.id);
  if (!code) throw new Error("队列作品缺少 RJ/VJ/BJ 编号");
  if (batchDownload.failedCodes.has(code)) {
    throw new Error(
      `${code} 下载任务未提交: ${batchDownload.failedCodes.get(code)}`,
    );
  }
  const workDir =
    downloadedWorkDir ||
    (await waitForDownload(
      batchDownload.downloadDir,
      code,
      Number(config.downloadWaitTimeoutMs),
      Number(config.downloadPollIntervalMs),
      Number(config.downloadStablePolls),
    ));
  const whisper = getConfig()?.whisper || {};
  setRuntimeStatus("translate", `正在翻译 ${code}`, code);
  await translateSubtitles({
    exePath: whisper.exePath,
    targetPath: workDir,
    subFormats: whisper.subFormats || ["lrc"],
    stallTimeoutMs: Number(config.whisperStallTimeoutMs),
    activityPollMs: Number(config.whisperActivityPollMs),
    code,
  });
  await packageUploadAndCleanupWork({
    work,
    code,
    config,
    workDir,
    downloadDir: batchDownload.downloadDir,
  });
  return { code, success: true };
};

const recoverExistingSubtitles = async (work, config) => {
  const code = normalizeCode(work?.source_id || work?.rj_code || work?.id);
  if (!code) throw new Error("队列作品缺少 RJ/VJ/BJ 编号");
  const downloadDir = getAutomationDownloadDir();
  const workDir = await findWorkDir(downloadDir, code);
  if (!workDir) throw new Error(`${code} 未找到本地字幕目录`);

  let activity = await getDirectoryActivity(workDir);
  if (activity.mediaFileCount <= 0) {
    throw new Error(`${code} 本地未找到可翻译音频，不能恢复打包`);
  }
  if (activity.lrcFileCount > activity.mediaFileCount) {
    throw new Error(
      `${code} 本地 LRC/音频数量异常: ${activity.lrcFileCount}/${activity.mediaFileCount}，不进入恢复打包`,
    );
  }
  if (activity.lrcFileCount < activity.mediaFileCount) {
    const whisper = getConfig()?.whisper || {};
    setRuntimeStatus(
      "translate",
      `检测到 ${code} 本地 LRC/音频为 ${activity.lrcFileCount}/${activity.mediaFileCount}，正在使用 Whisper 补齐缺少字幕`,
      code,
    );
    await translateSubtitles({
      exePath: whisper.exePath,
      targetPath: workDir,
      subFormats: whisper.subFormats || ["lrc"],
      stallTimeoutMs: Number(config.whisperStallTimeoutMs),
      activityPollMs: Number(config.whisperActivityPollMs),
      code,
    });
    activity = await getDirectoryActivity(workDir);
    if (activity.lrcFileCount !== activity.mediaFileCount) {
      throw new Error(
        `${code} Whisper 补齐后 LRC/音频数量仍不一致: ${activity.lrcFileCount}/${activity.mediaFileCount}，不进入恢复打包`,
      );
    }
  }
  setRuntimeStatus(
    "package",
    `检测到 ${code} LRC/音频数量为 ${activity.lrcFileCount}/${activity.mediaFileCount}，跳过下载并进入打包`,
    code,
  );
  await packageUploadAndCleanupWork({
    work,
    code,
    config,
    workDir,
    downloadDir,
  });
  return { code, success: true, recovered: true };
};

const runOnce = async ({ force = false } = {}) => {
  if (running) return { success: false, skipped: true, reason: "running" };
  const config = getRuntimeConfig();
  if (!config.enabled && !force) {
    setRuntimeStatus("disabled", "自动翻译队列未启用");
    return { success: true, skipped: true, reason: "disabled" };
  }
  if (!force && !isWithinQuietHours(config)) {
    setRuntimeStatus("waiting-window", "当前不在低峰运行时段");
    return { success: true, skipped: true, reason: "peak-hours" };
  }
  running = true;
  setRuntimeStatus("scan", "正在扫描 ASMR.ONE 最近作品", "", {
    translationProgress: null,
  });
  const state = await readState();
  const summary = {
    discovered: 0,
    queued: 0,
    queueBefore: 0,
    queueAfterCleanup: 0,
    queueReady: 0,
    processed: 0,
    recovered: 0,
    skippedTranslated: 0,
    failed: 0,
  };
  try {
    const {
      historicalTranslatedCodes,
      externalTranslatedCodes,
      localSubtitleCodes,
    } = await collectHistoricalTranslatedCodes();
    setRuntimeStatus("queue", "正在读取并预清理待翻译队列");
    let queueWorks = await fetchQueueWorks();
    summary.queueBefore = queueWorks.length;
    const translatedQueueWorks = queueWorks.filter(
      (work) =>
        externalTranslatedCodes.has(
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        ) || workHasExistingSubtitle(work),
    );
    if (translatedQueueWorks.length) {
      setRuntimeStatus(
        "cleanup",
        `入队前清理 ${translatedQueueWorks.length} 个已翻译作品`,
      );
      await removeWorksFromQueue(translatedQueueWorks);
      summary.skippedTranslated += translatedQueueWorks.length;
      queueWorks = queueWorks.filter(
        (work) => !translatedQueueWorks.includes(work),
      );
    }
    summary.queueAfterCleanup = queueWorks.length;

    const recentWorks = await fetchRecentWorks(config);
    const existingQueueCodes = new Set(
      queueWorks
        .map((work) =>
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        )
        .filter(Boolean),
    );
    const filterStats = {
      missingCode: 0,
      completed: 0,
      alreadyQueued: 0,
      historicalTranslated: 0,
      existingSubtitle: 0,
      tagMismatch: 0,
    };
    const candidates = recentWorks.filter((work) => {
      const code = normalizeCode(work?.source_id || work?.rj_code || work?.id);
      if (!code) {
        filterStats.missingCode += 1;
        return false;
      }
      if (state.completedCodes.includes(code)) {
        filterStats.completed += 1;
        return false;
      }
      if (existingQueueCodes.has(code)) {
        filterStats.alreadyQueued += 1;
        return false;
      }
      if (historicalTranslatedCodes.has(code)) {
        filterStats.historicalTranslated += 1;
        return false;
      }
      if (workHasExistingSubtitle(work)) {
        filterStats.existingSubtitle += 1;
        return false;
      }
      if (!matchesTags(work, config)) {
        filterStats.tagMismatch += 1;
        return false;
      }
      return true;
    });
    summary.discovered = candidates.length;
    logger.info(
      `[automation] 最近作品筛选: total=${recentWorks.length} candidates=${summary.discovered} missingCode=${filterStats.missingCode} completed=${filterStats.completed} alreadyQueued=${filterStats.alreadyQueued} historicalTranslated=${filterStats.historicalTranslated} existingSubtitle=${filterStats.existingSubtitle} tagMismatch=${filterStats.tagMismatch}`,
    );
    setRuntimeStatus(
      "enqueue",
      `筛选到 ${summary.discovered} 个候选作品，正在批量加入待翻译队列`,
    );
    const worksToAdd = candidates.slice(0, Number(config.maxWorksPerCycle));
    if (worksToAdd.length) {
      summary.queued = await addWorksToQueue(worksToAdd);
      setRuntimeStatus(
        "queue",
        `已提交 ${summary.queued} 个作品，正在回读确认队列`,
      );
      queueWorks = await waitForQueueVisibility(
        worksToAdd.map((work) => work?.source_id || work?.rj_code || work?.id),
      );
    } else {
      summary.queued = 0;
      setRuntimeStatus(
        "queue",
        `没有新增作品，直接处理已读取的待翻译队列（${queueWorks.length} 个）`,
      );
    }
    summary.queueReady = queueWorks.length;
    if (!queueWorks.length) {
      lastRun = { at: new Date().toISOString(), ...summary };
      setRuntimeStatus("idle", "本轮检查完成：待翻译队列为空，没有可处理作品");
      return { success: true, ...summary, lastRun };
    }
    const worksToProcess = queueWorks
      .slice(0, Number(config.maxWorksPerCycle))
      .filter((work) => {
        const code = normalizeCode(
          work?.source_id || work?.rj_code || work?.id,
        );
        return (
          code &&
          !state.completedCodes.includes(code) &&
          !externalTranslatedCodes.has(code) &&
          !workHasExistingSubtitle(work)
        );
      });
    const recoveryWorks = worksToProcess.filter((work) =>
      localSubtitleCodes.has(
        normalizeCode(work?.source_id || work?.rj_code || work?.id),
      ),
    );
    const downloadWorks = worksToProcess.filter(
      (work) =>
        !localSubtitleCodes.has(
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        ),
    );
    const getWorkCodes = (works) =>
      works
        .map((work) =>
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
        )
        .filter(Boolean);
    const translationTracker = {
      queuedDownloadCodes: new Set(getWorkCodes(downloadWorks)),
      downloadingCodes: new Set(),
      readyTranslateCodes: new Set(getWorkCodes(recoveryWorks)),
      completedCodes: new Set(),
      failedCodes: new Set(),
      failedReasons: new Map(),
      currentCode: "",
    };
    const markTranslationProgress = (code, result) => {
      translationTracker.queuedDownloadCodes.delete(code);
      translationTracker.downloadingCodes.delete(code);
      translationTracker.readyTranslateCodes.delete(code);
      if (translationTracker.currentCode === code) {
        translationTracker.currentCode = "";
      }
      if (result === "completed") {
        translationTracker.completedCodes.add(code);
        translationTracker.failedReasons.delete(code);
      } else if (result === "failed") {
        translationTracker.failedCodes.add(code);
        translationTracker.failedReasons.set(
          code,
          state.failedCodes[code] || "",
        );
      }
      publishTranslationProgress(translationTracker);
    };
    const moveToReadyForTranslation = (code) => {
      translationTracker.queuedDownloadCodes.delete(code);
      translationTracker.downloadingCodes.delete(code);
      translationTracker.readyTranslateCodes.add(code);
      publishTranslationProgress(translationTracker);
    };
    const moveToDownloading = (code) => {
      if (translationTracker.downloadingCodes.has(code)) return;
      translationTracker.queuedDownloadCodes.delete(code);
      translationTracker.downloadingCodes.add(code);
      publishTranslationProgress(translationTracker);
    };
    publishTranslationProgress(translationTracker);

    const readyTranslationQueue = recoveryWorks.map((work) => ({
      work,
      workDir: "",
      recovery: true,
    }));
    let downloadWorkerFinished = false;
    let translationWorkerActive = false;
    let wakeTranslationWorker = null;
    let stateWritePromise = Promise.resolve();
    const persistState = () => {
      stateWritePromise = stateWritePromise.then(() => writeState(state));
      return stateWritePromise;
    };
    const notifyTranslationWorker = () => {
      wakeTranslationWorker?.();
      wakeTranslationWorker = null;
    };
    const waitForTranslationWork = () =>
      new Promise((resolve) => {
        wakeTranslationWorker = resolve;
      });
    const batchDownload = await submitBatchDownload(downloadWorks, config);
    batchDownload.downloadPollIntervalMs = Number(
      config.downloadPollIntervalMs,
    );
    const pendingWorks = new Map(
      downloadWorks
        .filter((work) => {
          const code = normalizeCode(
            work?.source_id || work?.rj_code || work?.id,
          );
          return code && !batchDownload.manualCodes.has(code);
        })
        .map((work) => [
          normalizeCode(work?.source_id || work?.rj_code || work?.id),
          work,
        ]),
    );
    batchDownload.manualCodes.forEach((reason, code) => {
      state.failedCodes[code] =
        `${code} 下载轨道超过自动处理上限，需人工筛选；未提交 aria2，也不会重启其他下载任务: ${reason}`;
      summary.failed += 1;
      markTranslationProgress(code, "failed");
      logger.warn(
        `[automation] ${code} 已移出下载池并保留待翻译队列：${state.failedCodes[code]}`,
      );
    });
    const activeRunCodes = new Set([
      ...getWorkCodes(worksToProcess),
      ...(state.completedCodes || []),
      ...externalTranslatedCodes,
    ]);
    const incomingDownloadWorks = new Map();
    let wakeDownloadWorker = null;
    const notifyDownloadWorker = () => {
      wakeDownloadWorker?.();
      wakeDownloadWorker = null;
    };
    const waitForDownloadWorker = (timeoutMs) =>
      new Promise((resolve) => {
        const timeout = setTimeout(() => {
          wakeDownloadWorker = null;
          resolve();
        }, timeoutMs);
        wakeDownloadWorker = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
    const mergeDownloadBatch = (nextBatch) => {
      nextBatch.failedCodes.forEach((reason, code) => {
        batchDownload.failedCodes.set(code, reason);
      });
      nextBatch.manualCodes.forEach((reason, code) => {
        batchDownload.manualCodes.set(code, reason);
      });
      nextBatch.expectedTaskCounts.forEach((count, code) => {
        batchDownload.expectedTaskCounts.set(code, count);
      });
      nextBatch.taskManifestByCode.forEach((tasks, code) => {
        batchDownload.taskManifestByCode.set(code, tasks);
      });
      batchDownload.codes.push(...nextBatch.codes);
    };
    const submitIncomingDownloads = async () => {
      const works = [...incomingDownloadWorks.values()];
      incomingDownloadWorks.clear();
      if (!works.length) return 0;

      const nextBatch = await submitBatchDownload(works, config);
      mergeDownloadBatch(nextBatch);
      works.forEach((work) => {
        const code = normalizeCode(
          work?.source_id || work?.rj_code || work?.id,
        );
        if (!code) return;
        if (nextBatch.manualCodes.has(code)) {
          state.failedCodes[code] =
            `${code} 下载轨道超过自动处理上限，需人工筛选；未提交 aria2，也不会重启其他下载任务: ${nextBatch.manualCodes.get(code)}`;
          summary.failed += 1;
          markTranslationProgress(code, "failed");
          logger.warn(
            `[automation] ${code} 已移出下载池并保留待翻译队列：${state.failedCodes[code]}`,
          );
          return;
        }
        pendingWorks.set(code, work);
      });
      downloadDeadline = Date.now() + Number(config.downloadWaitTimeoutMs);
      logger.info(
        `[automation] 下载 worker 已接收运行中新入队的 ${works.length} 个作品并提交 aria2`,
      );
      return works.length;
    };
    activeQueuedWorkReceiver = (work, source) => {
      const code = normalizeCode(work?.source_id || work?.rj_code || work?.id);
      if (
        !code ||
        activeRunCodes.has(code) ||
        state.completedCodes.includes(code) ||
        externalTranslatedCodes.has(code) ||
        workHasExistingSubtitle(work)
      ) {
        return false;
      }

      activeRunCodes.add(code);
      incomingDownloadWorks.set(code, work);
      translationTracker.queuedDownloadCodes.add(code);
      publishTranslationProgress(translationTracker);
      logger.info(
        `[automation] 收到运行中新入队作品 ${code} source=${source}，已加入待下载池`,
      );
      notifyDownloadWorker();
      return true;
    };
    const runTranslationWorker = async () => {
      logger.info(
        `[automation] 翻译 worker 已启动：准备翻译池初始 ${readyTranslationQueue.length} 个作品`,
      );
      while (!downloadWorkerFinished || readyTranslationQueue.length) {
        if (!readyTranslationQueue.length) {
          await waitForTranslationWork();
          continue;
        }

        const item = readyTranslationQueue.shift();
        const code = normalizeCode(
          item?.work?.source_id || item?.work?.rj_code || item?.work?.id,
        );
        if (!code) continue;
        translationWorkerActive = true;
        try {
          translationTracker.currentCode = code;
          publishTranslationProgress(translationTracker, code);
          if (item.recovery) {
            await recoverExistingSubtitles(item.work, config);
            summary.recovered += 1;
            logger.info(`[automation] ${code} 已从本地字幕恢复并上传`);
          } else {
            await processWork(item.work, config, batchDownload, item.workDir);
          }
          state.completedCodes.push(code);
          delete state.failedCodes[code];
          summary.processed += 1;
          markTranslationProgress(code, "completed");
        } catch (error) {
          state.failedCodes[code] = String(error?.message || error);
          summary.failed += 1;
          markTranslationProgress(code, "failed");
          logger.error(
            `[automation] ${code} 翻译 worker 处理失败: ${state.failedCodes[code]}`,
          );
        } finally {
          translationWorkerActive = false;
          notifyDownloadWorker();
        }
        await persistState();
      }
      logger.info("[automation] 翻译 worker 已结束：准备翻译池已清空");
    };
    const translationWorkerPromise = runTranslationWorker();

    logger.info(
      `[automation] 下载 worker 已启动：待下载池初始 ${pendingWorks.size} 个作品`,
    );
    let downloadDeadline = Date.now() + Number(config.downloadWaitTimeoutMs);
    const waitForAria2RestartCooldown = async () => {
      const remaining =
        Number(batchDownload.aria2RestartNotBefore || 0) - Date.now();
      if (remaining <= 0) return false;

      const waitSeconds = Math.ceil(remaining / 1000);
      setRuntimeStatus(
        "download",
        `aria2 补救冷却中：${waitSeconds} 秒后才能再次重启；仍持续检测音频、.aria2 与任务状态`,
      );
      await waitForDownloadWorker(
        Math.min(remaining, DOWNLOAD_PROGRESS_POLL_INTERVAL_MS),
      );
      return true;
    };
    try {
      while (
        pendingWorks.size ||
        incomingDownloadWorks.size ||
        translationWorkerActive ||
        readyTranslationQueue.length
      ) {
        await submitIncomingDownloads();
        if (!pendingWorks.size) {
          await waitForDownloadWorker(DOWNLOAD_PROGRESS_POLL_INTERVAL_MS);
          continue;
        }
        const readyWorks = [];
        const failedWorks = [];
        const earlyRetryWorks = [];
        const tempFileRecoveryWorks = [];
        const progressingWorks = [];
        const aria2TaskStates = await getAria2BatchTaskStates(batchDownload);
        for (const [code, work] of pendingWorks) {
          if (batchDownload.failedCodes.has(code)) {
            failedWorks.push({
              code,
              reason: batchDownload.failedCodes.get(code),
            });
            continue;
          }
          const inspection = await inspectDownload(
            batchDownload,
            code,
            aria2TaskStates,
          );
          if (inspection.isDownloadProgressing) {
            progressingWorks.push(code);
          }
          if (inspection.failed) {
            failedWorks.push({ code, reason: inspection.failureReason });
            continue;
          }
          if (!inspection.complete && inspection.hasDownloadActivity) {
            moveToDownloading(code);
          }
          if (
            inspection.shouldRetryEarly &&
            Date.now() >= batchDownload.earlyRetryNotBefore
          ) {
            earlyRetryWorks.push({ code, reason: inspection.earlyRetryReason });
            continue;
          }
          if (inspection.shouldRecoverTempFiles) {
            tempFileRecoveryWorks.push({
              code,
              reason: inspection.tempFileRecoveryReason,
            });
            continue;
          }
          if (inspection.complete) {
            readyWorks.push({ code, work, workDir: inspection.workDir });
          }
        }

        if (readyWorks.length) {
          for (const { code, work, workDir } of readyWorks) {
            pendingWorks.delete(code);
            moveToReadyForTranslation(code);
            readyTranslationQueue.push({ work, workDir, recovery: false });
          }
          logger.info(
            `[automation] 下载 worker 已投递 ${readyWorks.length} 个完整作品到准备翻译池，池内 ${readyTranslationQueue.length} 个`,
          );
          notifyTranslationWorker();
          await persistState();
          if (!pendingWorks.size) continue;
        }

        if (failedWorks.length) {
          if (progressingWorks.length) {
            setRuntimeStatus(
              "download",
              `检测到 ${progressingWorks.length} 个作品仍在真实增长，延后 aria2 错误补救`,
            );
            logger.info(
              `[automation] aria2 错误补救已延后：${progressingWorks.join(", ")} 仍在下载，避免重启打断正常任务`,
            );
            await waitForDownloadWorker(DOWNLOAD_PROGRESS_POLL_INTERVAL_MS);
            continue;
          }
          const retryReason = failedWorks
            .map(({ code, reason }) => `${code}: ${reason}`)
            .join("；");
          if (await waitForAria2RestartCooldown()) continue;
          const restarted = await restartAndResubmitBatchDownload(
            batchDownload,
            [...pendingWorks.keys()],
            `检测到 ${failedWorks.length} 个 aria2 下载失败；重启后恢复 ${pendingWorks.size} 个未完成作品（${retryReason}）`,
          );
          if (
            restarted ||
            batchDownload.aria2RestartAttempts <
              batchDownload.aria2RestartMaxAttempts
          ) {
            downloadDeadline =
              Date.now() + Number(config.downloadWaitTimeoutMs);
            continue;
          }

          for (const { code, reason } of failedWorks) {
            pendingWorks.delete(code);
            state.failedCodes[code] =
              `${code} aria2 下载连续失败，已重启 ${batchDownload.aria2RestartAttempts}/${batchDownload.aria2RestartMaxAttempts} 次，暂不翻译、打包或上传并保留待翻译队列: ${reason}`;
            summary.failed += 1;
            markTranslationProgress(code, "failed");
            logger.error(
              `[automation] ${code} 处理失败: ${state.failedCodes[code]}`,
            );
          }
          await persistState();
        }
        if (!pendingWorks.size) break;

        if (tempFileRecoveryWorks.length) {
          const retryReason = tempFileRecoveryWorks
            .map(({ code, reason }) => `${code}: ${reason}`)
            .join("；");
          if (await waitForAria2RestartCooldown()) continue;
          const restarted = await restartAndResubmitBatchDownload(
            batchDownload,
            [...pendingWorks.keys()],
            `检测到 ${tempFileRecoveryWorks.length} 个作品 aria2 已停止但残留临时文件；重启后恢复 ${pendingWorks.size} 个未完成作品（${retryReason}）`,
          );
          if (
            restarted ||
            batchDownload.aria2RestartAttempts <
              batchDownload.aria2RestartMaxAttempts
          ) {
            downloadDeadline =
              Date.now() + Number(config.downloadWaitTimeoutMs);
            continue;
          }

          for (const { code, reason } of tempFileRecoveryWorks) {
            pendingWorks.delete(code);
            state.failedCodes[code] =
              `${code} aria2 已停止但 .aria2 临时文件无法续传，已重启 ${batchDownload.aria2RestartAttempts}/${batchDownload.aria2RestartMaxAttempts} 次，暂不翻译、打包或上传并保留待翻译队列: ${reason}`;
            summary.failed += 1;
            markTranslationProgress(code, "failed");
            logger.error(
              `[automation] ${code} 处理失败: ${state.failedCodes[code]}`,
            );
          }
          await persistState();
          continue;
        }

        if (earlyRetryWorks.length) {
          const retryReason = earlyRetryWorks
            .map(({ code, reason }) => `${code}: ${reason}`)
            .join("；");
          if (await waitForAria2RestartCooldown()) continue;
          const restarted = await restartAndResubmitBatchDownload(
            batchDownload,
            [...pendingWorks.keys()],
            `检测到 ${earlyRetryWorks.length} 个作品下载了绝大多数轨道但 aria2 已停止；重启后恢复 ${pendingWorks.size} 个未完成作品（${retryReason}）`,
          );
          if (
            restarted ||
            batchDownload.aria2RestartAttempts <
              batchDownload.aria2RestartMaxAttempts
          ) {
            downloadDeadline =
              Date.now() + Number(config.downloadWaitTimeoutMs);
            continue;
          }

          for (const { code, reason } of earlyRetryWorks) {
            pendingWorks.delete(code);
            state.failedCodes[code] =
              `${code} 下载未完整且 aria2 已停止，已重启 ${batchDownload.aria2RestartAttempts}/${batchDownload.aria2RestartMaxAttempts} 次，暂不翻译、打包或上传并保留待翻译队列: ${reason}`;
            summary.failed += 1;
            markTranslationProgress(code, "failed");
            logger.error(
              `[automation] ${code} 处理失败: ${state.failedCodes[code]}`,
            );
          }
          await persistState();
          continue;
        }

        if (Date.now() < downloadDeadline) {
          setRuntimeStatus(
            "download",
            `下载 worker 等待完成：仍有 ${pendingWorks.size} 个作品存在未完成 aria2 任务、临时文件或缺少音频`,
          );
          await waitForDownloadWorker(DOWNLOAD_PROGRESS_POLL_INTERVAL_MS);
          continue;
        }

        if (progressingWorks.length) {
          downloadDeadline = Date.now() + Number(config.downloadWaitTimeoutMs);
          setRuntimeStatus(
            "download",
            `检测到 ${progressingWorks.length} 个作品仍在真实增长，延后下载超时补救`,
          );
          logger.info(
            `[automation] 下载超时检查已延后：${progressingWorks.join(", ")} 仍有 aria2 速度或媒体文件增长，不重启 aria2`,
          );
          await waitForDownloadWorker(DOWNLOAD_PROGRESS_POLL_INTERVAL_MS);
          continue;
        }

        if (await waitForAria2RestartCooldown()) continue;
        const restarted = await restartAndResubmitBatchDownload(
          batchDownload,
          [...pendingWorks.keys()],
          `仍有 ${pendingWorks.size} 个作品在下载超时后未完成`,
        );
        if (
          restarted ||
          batchDownload.aria2RestartAttempts <
            batchDownload.aria2RestartMaxAttempts
        ) {
          downloadDeadline = Date.now() + Number(config.downloadWaitTimeoutMs);
          continue;
        }

        for (const [code] of pendingWorks) {
          state.failedCodes[code] =
            `${code} 下载连续超时，已重启 ${batchDownload.aria2RestartAttempts}/${batchDownload.aria2RestartMaxAttempts} 次，暂不翻译、打包或上传并保留待翻译队列`;
          summary.failed += 1;
          markTranslationProgress(code, "failed");
          logger.error(
            `[automation] ${code} 处理失败: ${state.failedCodes[code]}`,
          );
        }
        pendingWorks.clear();
        await persistState();
      }
    } finally {
      downloadWorkerFinished = true;
      notifyTranslationWorker();
    }
    await translationWorkerPromise;
    await clearAria2TrackedDownloadResults(batchDownload).catch(
      () => undefined,
    );
    await persistState();
    lastRun = { at: new Date().toISOString(), ...summary };
    setRuntimeStatus(
      "idle",
      `本轮完成：新增 ${summary.queued}，处理 ${summary.processed}（本地字幕恢复 ${summary.recovered}），跳过已汉化 ${summary.skippedTranslated}，失败 ${summary.failed}`,
    );
    return { success: true, ...summary, lastRun };
  } catch (error) {
    setRuntimeStatus("error", `自动任务异常: ${error?.message || error}`);
    throw error;
  } finally {
    activeQueuedWorkReceiver = null;
    running = false;
  }
};

const schedule = () => {
  if (timer) clearInterval(timer);
  const interval = Math.max(
    60 * 1000,
    Number(getRuntimeConfig().scanIntervalMs),
  );
  const updateNextProbeAt = () => {
    runtimeStatus = {
      ...runtimeStatus,
      nextProbeAt: new Date(Date.now() + interval).toISOString(),
    };
  };
  updateNextProbeAt();
  timer = setInterval(() => {
    updateNextProbeAt();
    currentRunPromise = runOnce()
      .catch((error) => {
        logger.error("[automation] 定时任务失败", error?.message || error);
      })
      .finally(() => {
        currentRunPromise = null;
      });
  }, interval);
  timer.unref?.();
};

export function setupTranslationAutomationIPC() {
  [
    "translation-automation-status",
    "translation-automation-run",
    "translation-automation-save-config",
  ].forEach((channel) => {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // ignore
    }
  });
  ipcMain.handle("translation-automation-status", () => ({
    success: true,
    data: getTranslationAutomationStatus(),
  }));
  ipcMain.handle("translation-automation-run", () => {
    currentRunPromise = runOnce({ force: true });
    return currentRunPromise;
  });
  ipcMain.handle("translation-automation-save-config", async (_event, next) => {
    const result = await saveConfig({
      translationAutomation: { ...getRuntimeConfig(), ...(next || {}) },
    });
    if (!result) {
      logger.error("[automation] 保存运行策略失败");
      return {
        success: false,
        error: "配置文件写入失败，请检查日志和文件权限",
      };
    }
    schedule();
    const config = getRuntimeConfig();
    logger.info(
      `[automation] 运行策略已保存: enabled=${config.enabled} window=${config.startHour}-${config.endHour} maxWorks=${config.maxWorksPerCycle}`,
    );
    if (config.enabled && config.runOnStartup && !running) {
      currentRunPromise = runOnce().catch((error) => {
        logger.error(
          "[automation] 保存策略后启动任务失败",
          error?.message || error,
        );
      });
    }
    return {
      success: true,
      data: {
        config,
        scheduled: Boolean(timer),
        runtimeStatus: getVisibleRuntimeStatus(),
      },
    };
  });
  schedule();
  void migrateLegacyScanInterval().then((migrated) => {
    if (migrated) schedule();
  });
  if (getRuntimeConfig().enabled && getRuntimeConfig().runOnStartup) {
    setTimeout(() => {
      currentRunPromise = runOnce().catch((error) => {
        logger.error("[automation] 启动任务失败", error?.message || error);
      });
    }, 5000).unref?.();
  }
}
