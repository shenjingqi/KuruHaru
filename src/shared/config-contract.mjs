// Static configuration contract shared by the main process, renderer tooling,
// and documentation checks. Runtime paths are filled by config.js.
export const CONFIG_SECTIONS = Object.freeze([
  "profile",
  "tg",
  "asmr",
  "paths",
  "upload",
  "whisper",
  "translationAutomation",
  "logging",
  "system",
]);

// Version the single formal configuration contract used by the v1 release.
export const CONFIG_VERSION = 1;

export const CONFIG_DEFAULTS = Object.freeze({
  profile: {
    username: "User",
    avatar: null,
    status: "online",
    lastActive: null,
  },
  tg: {
    apiId: "",
    apiHash: "",
    phone: "",
    session: "",
    discussion: "",
    channel: "",
    botToken: "",
    searchChannelId: "",
    prePackagePath: "",
    prePackageLink: "",
    botAllowedUsers: [],
    botAllowedChats: [],
    botMode: "polling",
    botWebhookUrl: "",
    botWebhookPort: 8443,
    botSearchLimit: 3000,
    botHistoryPath: "",
    translationQueueCachePath: "",
    translationQueueCacheRefreshMs: 300000,
    searchRetryQueuePath: "",
    searchRetryDelayMs: 60000,
    searchRetryMaxAttempts: 0,
    botAutoSyncOnStartup: true,
    botSyncSearchCacheOnUpload: true,
    botWhitelistDebugLog: false,
    dailyZipOutputDir: "",
    infoCachePath: "",
    infoRequestTimeoutMs: 20000,
    infoCacheMaxConcurrency: 5,
    infoCacheMaxFileSizeMB: 50,
    infoCachePersistOnFetch: true,
    infoHotCacheEnabled: true,
    infoHotCacheIntervalMs: 3600000,
    infoHotCacheActiveIntervalMs: 1200000,
    infoHotCacheCoolIntervalMs: 10800000,
    infoHotCacheActiveWindowMs: 86400000,
    infoHotCacheCoolAfterMs: 259200000,
    infoHotCachePageSize: 100,
    infoHotCacheStartupDelayMs: 1500,
    proxyUrl: "",
  },
  asmr: {
    username: "",
    password: "",
    token: "",
    playlistId: "",
    translationQueuePlaylistId: "",
    downloadRpcUrl: "http://localhost:6800/jsonrpc",
    downloadRpcSecret: "",
    downloadUseAria2: true,
    downloadTestMode: false,
    downloadMaxAutoTasksPerWork: 20,
    downloadFilterVideoFormats: true,
    proxyUrl: "",
  },
  paths: {
    configDir: "",
    sourceDir: "",
    toolOutputDir: "",
    asmrDownloadDir: "",
    whisperTargetPath: "",
    dataDir: "",
    logsDir: "",
    chineseListPath: "",
    tgDownloadDir: "",
    configFilePath: "",
    historyDir: "",
    uploadHistoryDir: "",
    tagsDir: "",
  },
  upload: { channelId: "" },
  whisper: {
    exePath: "",
    targetPath: "",
    subFormats: ["lrc"],
  },
  translationAutomation: {
    enabled: false,
    runOnStartup: true,
    // Cloudflare Bot origin or full heartbeat endpoint. The secret lives in
    // safeStorage and is never persisted in this JSON configuration.
    heartbeatUrl: "",
    scanIntervalMs: 1800000,
    recentOrder: "create_date",
    recentPageSize: 100,
    recentMaxPages: 3,
    maxWorksPerCycle: 3,
    maxDownloadTasksPerWork: 200,
    aria2RestartMaxAttempts: 3,
    aria2RestartCooldownMs: 300000,
    aria2EarlyRetryPercent: 80,
    includeTags: [],
    excludeTags: [],
    requireAllIncludeTags: false,
    startHour: 1,
    endHour: 7,
    downloadWaitTimeoutMs: 21600000,
    downloadPollIntervalMs: 30000,
    downloadStablePolls: 2,
    whisperStallTimeoutMs: 600000,
    whisperActivityPollMs: 15000,
    cleanupLocalAfterUpload: true,
    packageDirName: "_translated_packages",
  },
  logging: { level: "info", enableFileLog: true },
  system: {
    theme: "auto",
    language: "zh",
    autoStart: false,
    minimizeToTray: true,
    windowFrameMode: "custom",
    saveCustomPaths: true,
    proxyUrl: "",
    windowOpacity: 1,
    blurEnabled: false,
    blurIntensity: 8,
    blurRenderMode: "system",
    accentColor: "#adb571",
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultConfig(runtimePaths = {}) {
  const config = clone(CONFIG_DEFAULTS);
  config.configVersion = CONFIG_VERSION;
  config.paths = { ...config.paths, ...runtimePaths };
  return config;
}

export function createUserConfigTemplate() {
  const config = createDefaultConfig();
  const internalOnlyFields = {
    profile: ["status", "lastActive", "avatar"],
    tg: [
      "translationQueueCachePath",
      "translationQueueCacheRefreshMs",
      "searchRetryQueuePath",
      "searchRetryDelayMs",
      "searchRetryMaxAttempts",
      "botAutoSyncOnStartup",
      "botSyncSearchCacheOnUpload",
      "dailyZipOutputDir",
      "infoCachePath",
      "infoRequestTimeoutMs",
      "infoCacheMaxConcurrency",
      "infoCachePersistOnFetch",
      "infoHotCacheEnabled",
      "infoHotCachePageSize",
      "infoHotCacheIntervalMs",
      "infoHotCacheActiveIntervalMs",
      "infoHotCacheCoolIntervalMs",
      "infoHotCacheActiveWindowMs",
      "infoHotCacheCoolAfterMs",
      "infoHotCacheStartupDelayMs",
    ],
    paths: ["configFilePath", "historyDir", "tagsDir", "whisperTargetPath"],
    translationAutomation: [
      "recentOrder",
      "recentPageSize",
      "recentMaxPages",
      "aria2RestartCooldownMs",
      "downloadWaitTimeoutMs",
      "downloadPollIntervalMs",
      "downloadStablePolls",
      "whisperStallTimeoutMs",
      "whisperActivityPollMs",
      "packageDirName",
    ],
    system: ["language", "saveCustomPaths"],
  };

  for (const [section, omittedFields] of Object.entries(internalOnlyFields)) {
    if (omittedFields === null) {
      delete config[section];
      continue;
    }
    for (const field of omittedFields) delete config[section][field];
  }

  return config;
}

export function mergeConfigValues(baseConfig, overrideConfig) {
  const base = baseConfig || {};
  const override = overrideConfig || {};
  const merged = { ...base, ...override };
  for (const section of CONFIG_SECTIONS) {
    merged[section] = { ...(base[section] || {}), ...(override[section] || {}) };
  }
  return merged;
}

/**
 * Migrate persisted configuration without dropping unknown fields.
 * The operation is idempotent: applying it to a current config returns the
 * same shape and version.
 */
const SECRET_KEY_PATTERN = /(password|token|secret|session|apiHash|apiKey|authorization)/i;

/** Return a diagnostics-safe copy without exposing credentials. */
export function redactConfigSecrets(config) {
  const redact = (value, key = "") => {
    if (SECRET_KEY_PATTERN.test(key)) {
      return value == null || value === "" ? value : "[REDACTED]";
    }
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          redact(entryValue, entryKey),
        ]),
      );
    }
    return value;
  };

  return redact(config);
}
