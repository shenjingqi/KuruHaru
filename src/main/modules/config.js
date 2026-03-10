import fs from "fs";
import path from "path";
import { app, ipcMain } from "electron";
import { createLogSender } from "../utils/logger";

// 默认配置文件路径
const DEFAULT_CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

// 配置缓存
let configCache = null;
let configCacheTime = 0;
const CACHE_TTL = 5000; // 5秒缓存

/**
 * 获取默认配置
 */
const DEFAULT_CONFIG = {
  // 用户配置
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
    botAutoStartOnStartup: true,
    botAutoSyncOnStartup: true,
    botWhitelistDebugLog: false,
    infoCachePath: "",
    infoRequestTimeoutMs: 20000,
    infoCacheMaxConcurrency: 5,
    infoCacheMaxFileSizeMB: 50,
    infoCachePersistOnFetch: true,
    proxyUrl: "",
  },
  asmr: {
    username: "",
    password: "",
    token: "",
    playlistId: "",
    proxyUrl: "",
  },
  paths: {
    configDir: "",
    sourceDir: "",
    toolOutputDir: "",
    whisperTargetPath: "",
    dataDir: path.join(app.getPath("userData"), "data"),
    logsDir: path.join(app.getPath("userData"), "logs"),
    chineseListPath: undefined,
    tgDownloadDir: path.join(app.getPath("documents"), "KuruHaruDownloads"),
    uploadHistoryDir: path.join(
      app.getPath("userData"),
      "data",
      "upload_history",
    ),
  },
  // 上传配置
  upload: {
    channelId: "",
  },
  // 视频翻译配置
  whisper: {
    exePath: "",
    targetPath: "",
    subFormats: ["lrc"],
  },
  // 日志配置
  logging: {
    level: "info",
    enableFileLog: true,
  },
  // 系统配置
  system: {
    theme: "auto",
    language: "zh",
    autoStart: false,
    minimizeToTray: true,
    windowFrameMode: "custom",
    saveCustomPaths: true,
    proxyUrl: "",
    windowOpacity: 0.92,
    blurEnabled: true,
    blurIntensity: 8,
    blurRenderMode: "system",
    accentColor: "#adb571",
  },
};

// 创建日志发送器
const logger = createLogSender("config");

/**
 * 读取配置（带缓存，5秒有效）
 */
export function getConfig() {
  const now = Date.now();

  // 检查缓存是否有效
  if (configCache && now - configCacheTime < CACHE_TTL) {
    return configCache;
  }

  try {
    const userDataPath = app.getPath("userData");
    const defaultConfigPath = path.join(userDataPath, "config.json");
    const projectConfigPath = path.join(process.cwd(), "config", "config.json");

    // 1. 读取 AppData 配置
    let appDataConfig = null;
    if (fs.existsSync(defaultConfigPath)) {
      try {
        appDataConfig = JSON.parse(fs.readFileSync(defaultConfigPath, "utf-8"));
      } catch {
        // 忽略错误
      }
    }

    // 2. 读取项目配置（如果存在）
    let projectConfig = null;
    if (fs.existsSync(projectConfigPath)) {
      try {
        projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
      } catch {
        // 忽略错误
      }
    }

    // 3. 确定用户设置的配置文件夹路径
    // 优先使用 AppData 中的 configDir，如果没有则使用项目配置中的
    let userConfigDir = "";
    if (appDataConfig?.paths?.configDir?.trim()) {
      userConfigDir = appDataConfig.paths.configDir;
    } else if (projectConfig?.paths?.configDir?.trim()) {
      userConfigDir = projectConfig.paths.configDir;
    }

    // 4. 如果用户设置了 configDir，从该目录读取配置
    if (userConfigDir) {
      const userConfigPath = path.join(userConfigDir, "config.json");
      if (fs.existsSync(userConfigPath)) {
        const userConfig = JSON.parse(fs.readFileSync(userConfigPath, "utf-8"));

        // 合并所有配置，userConfig 优先级最高
        configCache = {
          profile: { ...DEFAULT_CONFIG.profile, ...userConfig.profile },
          tg: { ...DEFAULT_CONFIG.tg, ...userConfig.tg },
          asmr: { ...DEFAULT_CONFIG.asmr, ...userConfig.asmr },
          paths: { ...DEFAULT_CONFIG.paths, ...userConfig.paths },
          upload: { ...DEFAULT_CONFIG.upload, ...userConfig.upload },
          whisper: { ...DEFAULT_CONFIG.whisper, ...userConfig.whisper },
          logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
          system: { ...DEFAULT_CONFIG.system, ...userConfig.system },
        };
        configCacheTime = now;
        return configCache;
      }
    }

    // 5. 使用 AppData 配置
    if (appDataConfig) {
      configCache = {
        profile: { ...DEFAULT_CONFIG.profile, ...appDataConfig.profile },
        tg: { ...DEFAULT_CONFIG.tg, ...appDataConfig.tg },
        asmr: { ...DEFAULT_CONFIG.asmr, ...appDataConfig.asmr },
        paths: { ...DEFAULT_CONFIG.paths, ...appDataConfig.paths },
        upload: { ...DEFAULT_CONFIG.upload, ...appDataConfig.upload },
        whisper: { ...DEFAULT_CONFIG.whisper, ...appDataConfig.whisper },
        logging: { ...DEFAULT_CONFIG.logging, ...appDataConfig.logging },
        system: { ...DEFAULT_CONFIG.system, ...appDataConfig.system },
      };
      configCacheTime = now;
      return configCache;
    }

    // 6. 如果都没有配置，返回默认配置
    configCache = { ...DEFAULT_CONFIG };
    configCacheTime = now;
    return configCache;
  } catch (e) {
    logger.error("Config read error:", e.message);
    configCache = DEFAULT_CONFIG;
    configCacheTime = Date.now();
    return DEFAULT_CONFIG;
  }
}

/**
 * 获取配置文件路径
 */
export function getConfigPath() {
  try {
    // 直接读取配置文件中的 configFilePath，不调用 getConfig() 避免递归
    if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
      try {
        const configData = JSON.parse(
          fs.readFileSync(DEFAULT_CONFIG_PATH, "utf-8"),
        );
        if (configData.paths?.configFilePath?.trim()) {
          return configData.paths.configFilePath;
        }
      } catch {
        // 忽略读取错误
      }
    }
    return DEFAULT_CONFIG_PATH;
  } catch {
    return DEFAULT_CONFIG_PATH;
  }
}

/**
 * 获取日志文件路径
 */
export function getLogPath(module) {
  const config = getDefaultConfig();
  const logsDir =
    config.paths.logsDir || path.join(app.getPath("userData"), "logs");

  const logFiles = {
    main: "app_main.log",
    asmr: "asmr_asmr-login.log",
    telegram: "telegram.log",
    upload: "upload.log",
    delete: "delete-tool.log",
    cleaner: "warehouse-cleaner.log",
    whisper: "whisper.log",
  };

  return path.join(logsDir, logFiles[module] || "app_main.log");
}

/**
 * 保存配置
 */
// 配置保存锁，防止并发写入
let saveConfigLock = Promise.resolve();

function normalizeConfigDir(rawConfigDir) {
  if (typeof rawConfigDir !== "string") {
    return "";
  }

  return rawConfigDir.trim();
}

function normalizePathPatch(pathsPatch) {
  const normalizedPaths = {};

  if (
    !pathsPatch ||
    typeof pathsPatch !== "object" ||
    Array.isArray(pathsPatch)
  ) {
    return normalizedPaths;
  }

  Object.entries(pathsPatch).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    normalizedPaths[key] = typeof value === "string" ? value.trim() : value;
  });

  return normalizedPaths;
}

function mergeConfigPatch(currentConfig, newConfig) {
  const patchConfig =
    newConfig && typeof newConfig === "object" && !Array.isArray(newConfig)
      ? newConfig
      : {};

  const finalConfig = {
    ...currentConfig,
    ...patchConfig,
  };

  const normalizedPaths = normalizePathPatch(patchConfig.paths);
  finalConfig.paths = {
    ...currentConfig.paths,
    ...normalizedPaths,
  };

  return finalConfig;
}

function resolveConfigSavePath(config) {
  const configDir = normalizeConfigDir(config?.paths?.configDir);
  if (!configDir) {
    return DEFAULT_CONFIG_PATH;
  }

  return path.join(configDir, "config.json");
}

function writeJsonFileSync(filePath, payload) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function syncAppDataConfigDirPointer(configDir) {
  const normalizedConfigDir = normalizeConfigDir(configDir);

  let appDataConfig = {};
  if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
    try {
      appDataConfig = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, "utf-8"));
    } catch {
      appDataConfig = {};
    }
  }

  const nextAppDataConfig = {
    ...appDataConfig,
    paths: {
      ...(appDataConfig.paths || {}),
      configDir: normalizedConfigDir,
    },
  };

  writeJsonFileSync(DEFAULT_CONFIG_PATH, nextAppDataConfig);
}

export async function saveConfig(newConfig) {
  // 清除缓存，强制下次读取重新加载
  configCache = null;

  // 等待之前的保存完成
  await saveConfigLock;

  // 创建新的锁
  let resolveLock;
  saveConfigLock = new Promise((resolve) => (resolveLock = resolve));

  try {
    const current = getConfig();
    logger.info(`当前 chineseListPath: ${current.paths?.chineseListPath}`);

    // 允许显式清空路径（空字符串 / null），并在本次保存中生效。
    const final = mergeConfigPatch(current, newConfig);
    const configPath = resolveConfigSavePath(final);
    logger.info(`准备保存配置，configPath: ${configPath}`);

    writeJsonFileSync(configPath, final);

    // 自定义 configDir 模式下，保持 AppData 里有 configDir 指针用于下次启动发现配置。
    if (configPath !== DEFAULT_CONFIG_PATH) {
      syncAppDataConfigDirPointer(final.paths?.configDir);
    }

    // 写盘后立即刷新缓存，避免 TTL 窗口内读到旧值导致“看起来没保存”。
    configCache = final;
    configCacheTime = Date.now();

    const hasSystemPatch =
      newConfig &&
      typeof newConfig === "object" &&
      !Array.isArray(newConfig) &&
      Object.prototype.hasOwnProperty.call(newConfig, "system");
    const didSystemSettingsChange =
      JSON.stringify(current.system || {}) !==
      JSON.stringify(final.system || {});
    if (hasSystemPatch || didSystemSettingsChange) {
      // 只要请求里包含 system 补丁就重应用，避免“保存成功但视觉不刷新”的体感问题。
      app.emit("config-updated");
    }

    logger.info(
      `配置保存成功，chineseListPath: "${final.paths?.chineseListPath}"`,
    );

    return true;
  } catch (e) {
    logger.error("保存配置失败:", e);
    return false;
  } finally {
    // 释放锁
    resolveLock();
  }
}

/**
 * 获取数据目录路径
 */
export function getDataDir() {
  try {
    const config = getConfig();
    if (!config || !config.paths) {
      const defaultPath = path.join(app.getPath("userData"), "data");
      logger.info("[getDataDir] Config invalid, using default:", defaultPath);
      return defaultPath;
    }

    // 兜底处理：如果 config.paths.dataDir 是空字符串或 undefined，使用默认路径
    const dataDir = config.paths.dataDir?.trim();
    if (dataDir) {
      return dataDir;
    }

    const defaultPath = path.join(app.getPath("userData"), "data");
    logger.info(
      "[getDataDir] config.paths.dataDir is empty, using default:",
      defaultPath,
    );
    return defaultPath;
  } catch (e) {
    const defaultPath = path.join(app.getPath("userData"), "data");
    logger.error(
      "[getDataDir] Error:",
      e.message,
      "using default:",
      defaultPath,
    );
    return defaultPath;
  }
}

/**
 * 获取默认配置（不读取文件）
 */
export function getDefaultConfig() {
  return DEFAULT_CONFIG;
}

/**
 * 设置配置 IPC
 */
export function setupConfigIPC() {
  // 每次调用都实时获取配置，确保一致性

  // 先移除已存在的处理器，避免热重载时重复注册
  try {
    ipcMain.removeHandler("get-config");
    ipcMain.removeHandler("save-config");
    ipcMain.removeHandler("get-asmr-config");
    ipcMain.removeHandler("save-asmr-config");
    ipcMain.removeHandler("get-tg-config");
    ipcMain.removeHandler("save-tg-config");
    ipcMain.removeHandler("get-paths");
    ipcMain.removeHandler("save-paths");
    ipcMain.removeHandler("get-upload-config");
    ipcMain.removeHandler("save-upload-config");
    ipcMain.removeHandler("get-whisper-config");
    ipcMain.removeHandler("save-whisper-config");
    ipcMain.removeHandler("get-system-config");
    ipcMain.removeHandler("save-system-config");
    ipcMain.removeHandler("get-logging-config");
    ipcMain.removeHandler("save-logging-config");
  } catch {
    // 忽略移除错误
  }

  ipcMain.handle("get-config", () => {
    const config = getConfig();
    return { success: true, data: config };
  });

  // 通用保存配置
  ipcMain.handle("save-config", async (event, configData) => {
    try {
      const result = await saveConfig(configData);
      return { success: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ASMR 相关
  ipcMain.handle("get-asmr-config", () => {
    const config = getConfig();
    return { success: true, data: config.asmr };
  });

  ipcMain.handle("save-asmr-config", async (_event, _asmrConfig) => {
    try {
      const result = await saveConfig({ asmr: _asmrConfig });
      return { success: result };
    } catch (_e) {
      return { success: false, error: _e.message };
    }
  });

  // Telegram 相关
  ipcMain.handle("get-tg-config", () => {
    const config = getConfig();
    return { success: true, data: config.tg };
  });

  ipcMain.handle("save-tg-config", async (_event, _tgConfig) => {
    try {
      const result = await saveConfig({ tg: _tgConfig });
      return { success: result };
    } catch (_e) {
      return { success: false, error: _e.message };
    }
  });

  // Paths 相关
  ipcMain.handle("get-paths", () => {
    const config = getConfig();
    return { success: true, data: config.paths };
  });

  ipcMain.handle("save-paths", async (_event, paths) => {
    try {
      const result = await saveConfig({ paths });
      return { success: result };
    } catch (_e) {
      return { success: false, error: _e.message };
    }
  });

  // Upload 相关
  ipcMain.handle("get-upload-config", () => {
    const config = getConfig();
    return { success: true, data: config.upload };
  });

  ipcMain.handle("save-upload-config", async (_event, upload) => {
    try {
      const result = await saveConfig({ upload });
      return { success: result };
    } catch (_e) {
      return { success: false, error: _e.message };
    }
  });

  // Whisper 相关
  ipcMain.handle("get-whisper-config", () => {
    const config = getConfig();
    return { success: true, data: config.whisper };
  });

  ipcMain.handle("save-whisper-config", async (event, whisper) => {
    try {
      const result = await saveConfig({ whisper });
      return { success: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // System 相关
  ipcMain.handle("get-system-config", () => {
    const config = getConfig();
    return { success: true, data: config.system };
  });

  ipcMain.handle("save-system-config", async (event, system) => {
    try {
      const result = await saveConfig({ system });
      return { success: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Logging 相关
  ipcMain.handle("get-logging-config", () => {
    const config = getConfig();
    return { success: true, data: config.logging };
  });

  ipcMain.handle("save-logging-config", async (event, logging) => {
    try {
      const result = await saveConfig({ logging });
      return { success: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  logger.info("配置模块已加载");
}
