import { ref, reactive, watch } from "vue";
import { loadConfig, saveConfig } from "../api/configApi";
import { tgCheckLogin } from "../api/tgApi";

const DEFAULT_BOT_SEARCH_LIMIT = 3000;
const MIN_BOT_SEARCH_LIMIT = 100;
const DEFAULT_INFO_CACHE_MAX_FILE_SIZE_MB = 50;
const MIN_INFO_CACHE_MAX_FILE_SIZE_MB = 1;
const MAX_INFO_CACHE_MAX_FILE_SIZE_MB = 4096;
const DEFAULT_WINDOW_OPACITY = 0.92;
const MIN_WINDOW_OPACITY = 0.55;
const MAX_WINDOW_OPACITY = 1;
const DEFAULT_BLUR_INTENSITY = 8;
const MAX_BLUR_INTENSITY = 40;
const DEFAULT_BLUR_RENDER_MODE = "system";
const DEFAULT_ACCENT_COLOR = "#adb571";

const normalizeThemeMode = (rawValue) => {
  const mode = String(rawValue || "auto")
    .trim()
    .toLowerCase();
  if (mode === "dark" || mode === "light" || mode === "auto") {
    return mode;
  }
  return "auto";
};

const normalizeWindowOpacity = (rawValue) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINDOW_OPACITY;
  }
  return Math.min(
    MAX_WINDOW_OPACITY,
    Math.max(MIN_WINDOW_OPACITY, Number(parsed.toFixed(2))),
  );
};

const normalizeBlurIntensity = (rawValue) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BLUR_INTENSITY;
  }

  return Math.min(MAX_BLUR_INTENSITY, Math.max(0, Math.round(parsed)));
};

const normalizeAccentColor = (rawValue) => {
  if (typeof rawValue !== "string") {
    return DEFAULT_ACCENT_COLOR;
  }

  const normalized = rawValue.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return DEFAULT_ACCENT_COLOR;
};

const normalizeBlurRenderMode = (rawValue) => {
  const mode = String(rawValue || DEFAULT_BLUR_RENDER_MODE)
    .trim()
    .toLowerCase();
  if (mode === "gpu" || mode === "system") {
    return mode;
  }
  return DEFAULT_BLUR_RENDER_MODE;
};

const normalizeProxyUrl = (rawValue) => {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue.trim();
};

export const useSettingsConfigState = () => {
  const tgConnected = ref(false);
  const asmrLoggedIn = ref(false);
  const showToast = ref(false);
  const toastMessage = ref("");
  const toastType = ref("success");

  const config = reactive({
    tg: {
      botToken: "",
      botMode: "polling",
      botWebhookUrl: "",
      botWebhookPort: 8443,
      searchChannelId: "",
      prePackagePath: "",
      prePackageLink: "",
      botAllowedUsers: "",
      botAllowedChats: "",
      botWhitelistDebugLog: false,
      botSearchLimit: 3000,
      botHistoryPath: "",
      botAutoStartOnStartup: true,
      infoCacheMaxFileSizeMB: DEFAULT_INFO_CACHE_MAX_FILE_SIZE_MB,
      proxyUrl: "",
      apiId: "",
      apiHash: "",
      phone: "",
      session: "",
      discussion: "",
      channel: "",
    },
    asmr: {
      username: "",
      password: "",
      token: "",
      playlistId: "",
      rememberMe: false,
      proxyUrl: "",
    },
    paths: {
      configDir: "",
      logsDir: "",
      sourceDir: "",
      toolOutputDir: "",
      whisperTargetPath: "",
      dataDir: "",
      configFilePath: "",
      chineseListPath: "",
      tgDownloadDir: "",
    },
    upload: { channelId: "" },
    logging: { level: "info", enableFileLog: true },
    system: {
      theme: "auto",
      autoStart: false,
      minimizeToTray: false,
      windowFrameMode: "custom",
      proxyUrl: "",
      windowOpacity: DEFAULT_WINDOW_OPACITY,
      blurEnabled: true,
      blurIntensity: DEFAULT_BLUR_INTENSITY,
      blurRenderMode: DEFAULT_BLUR_RENDER_MODE,
      accentColor: DEFAULT_ACCENT_COLOR,
    },
  });

  const formatIdListForInput = (rawValue) => {
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(", ");
    }

    if (typeof rawValue === "string") {
      return rawValue;
    }

    return "";
  };

  const parseIdListFromInput = (rawValue) => {
    if (!rawValue) return [];

    return String(rawValue)
      .split(/[\n,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const parseBotSearchLimit = (
    rawValue,
    fallbackValue = DEFAULT_BOT_SEARCH_LIMIT,
  ) => {
    // 支持 3k/3w/3000 等输入，统一转为整数并设置最小值下限。
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

    return Math.max(Math.floor(parsedLimit), MIN_BOT_SEARCH_LIMIT);
  };

  const parseInfoCacheMaxFileSizeMB = (
    rawValue,
    fallbackValue = DEFAULT_INFO_CACHE_MAX_FILE_SIZE_MB,
  ) => {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      return fallbackValue;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return fallbackValue;
    }

    return Math.min(
      MAX_INFO_CACHE_MAX_FILE_SIZE_MB,
      Math.max(MIN_INFO_CACHE_MAX_FILE_SIZE_MB, parsed),
    );
  };

  const toSafeNumber = (rawValue, fallbackValue) => {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  };

  const toSafeBoolean = (rawValue, fallbackValue = false) => {
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
  };

  const showToastMessage = (message, type = "success") => {
    toastMessage.value = message;
    toastType.value = type;
    showToast.value = true;
    setTimeout(() => {
      showToast.value = false;
    }, 3000);
  };

  let lastSavedSignature = "";

  const buildNormalizedPayload = () => {
    const tgSettings = {
      ...config.tg,
      botAllowedUsers: parseIdListFromInput(config.tg.botAllowedUsers),
      botAllowedChats: parseIdListFromInput(config.tg.botAllowedChats),
      botWhitelistDebugLog: toSafeBoolean(
        config.tg.botWhitelistDebugLog,
        false,
      ),
      botAutoStartOnStartup: toSafeBoolean(
        config.tg.botAutoStartOnStartup,
        true,
      ),
      botWebhookPort: toSafeNumber(config.tg.botWebhookPort, 8443),
      botSearchLimit: parseBotSearchLimit(config.tg.botSearchLimit),
      infoCacheMaxFileSizeMB: parseInfoCacheMaxFileSizeMB(
        config.tg.infoCacheMaxFileSizeMB,
      ),
    };

    const systemSettings = {
      ...config.system,
      theme: normalizeThemeMode(config.system.theme),
      proxyUrl: normalizeProxyUrl(config.system.proxyUrl),
      windowOpacity: normalizeWindowOpacity(config.system.windowOpacity),
      blurEnabled: toSafeBoolean(config.system.blurEnabled, true),
      blurIntensity: normalizeBlurIntensity(config.system.blurIntensity),
      blurRenderMode: normalizeBlurRenderMode(config.system.blurRenderMode),
      accentColor: normalizeAccentColor(config.system.accentColor),
    };

    return JSON.parse(
      JSON.stringify({
        asmr: config.asmr,
        tg: tgSettings,
        logging: config.logging,
        system: systemSettings,
        upload: config.upload,
        paths: config.paths,
      }),
    );
  };

  const saveAllSettings = async () => {
    try {
      // 使用归一化快照去重，避免“保存导致 watch 再保存”的循环。
      const settingsToSave = buildNormalizedPayload();
      const nextSignature = JSON.stringify(settingsToSave);
      if (nextSignature === lastSavedSignature) {
        return;
      }

      const result = await saveConfig(settingsToSave);
      const isSuccess = result && (result.success === true || result === true);

      if (isSuccess) {
        lastSavedSignature = nextSignature;
        showToastMessage("设置已保存", "success");
      } else {
        showToastMessage("保存失败: 未知错误", "error");
      }
    } catch (error) {
      showToastMessage("保存失败: " + error.message, "error");
    }
  };

  let autoSaveTimer = null;
  let autoSaveEnabled = false;
  const debouncedAutoSave = () => {
    if (!autoSaveEnabled) {
      return;
    }

    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = setTimeout(() => {
      console.log("[Settings] 自动保存配置...");
      saveAllSettings();
    }, 500);
  };

  // 深度监听 + 防抖自动保存，降低输入过程中频繁触发写配置的成本。
  watch(
    () => ({
      asmr: config.asmr,
      tg: config.tg,
      logging: config.logging,
      system: config.system,
      upload: config.upload,
      paths: config.paths,
    }),
    () => {
      debouncedAutoSave();
    },
    { deep: true },
  );

  const initializeBaseSettings = async () => {
    autoSaveEnabled = false;
    console.log("Settings: 开始加载配置");
    try {
      const result = await loadConfig();
      console.log("Settings: 获取到的配置结果:", result);
      const cfg = result?.data || result;
      console.log("Settings: 提取的配置数据:", cfg);

      if (cfg) {
        // 首次加载时统一做字段合并与类型归一化，兼容旧配置格式。
        if (cfg.tg) {
          config.tg = { ...config.tg, ...cfg.tg };
          config.tg.botAllowedUsers = formatIdListForInput(
            config.tg.botAllowedUsers,
          );
          config.tg.botAllowedChats = formatIdListForInput(
            config.tg.botAllowedChats,
          );
          config.tg.botWebhookPort = toSafeNumber(
            config.tg.botWebhookPort,
            8443,
          );
          config.tg.botWhitelistDebugLog = toSafeBoolean(
            config.tg.botWhitelistDebugLog,
            false,
          );
          config.tg.botAutoStartOnStartup = toSafeBoolean(
            config.tg.botAutoStartOnStartup,
            true,
          );
          config.tg.botSearchLimit = parseBotSearchLimit(
            config.tg.botSearchLimit,
          );
          config.tg.infoCacheMaxFileSizeMB = parseInfoCacheMaxFileSizeMB(
            config.tg.infoCacheMaxFileSizeMB,
          );
          config.tg.botMode = config.tg.botMode || "polling";
          console.log("Settings: tg 更新后:", config.tg);
        }
        if (cfg.asmr) {
          config.asmr = { ...config.asmr, ...cfg.asmr };
          console.log("Settings: asmr 更新后:", config.asmr);
        }
        if (cfg.paths) {
          config.paths = { ...config.paths, ...cfg.paths };
          console.log("Settings: paths 更新后:", config.paths);
        }
        if (cfg.logging) {
          config.logging = { ...config.logging, ...cfg.logging };
          console.log("Settings: logging 更新后:", config.logging);
        }
        if (cfg.system) {
          config.system = { ...config.system, ...cfg.system };
          config.system.theme = normalizeThemeMode(config.system.theme);
          config.system.proxyUrl = normalizeProxyUrl(config.system.proxyUrl);
          config.system.windowOpacity = normalizeWindowOpacity(
            config.system.windowOpacity,
          );
          config.system.blurEnabled = toSafeBoolean(
            config.system.blurEnabled,
            true,
          );
          config.system.blurIntensity = normalizeBlurIntensity(
            config.system.blurIntensity,
          );
          config.system.blurRenderMode = normalizeBlurRenderMode(
            config.system.blurRenderMode,
          );
          config.system.accentColor = normalizeAccentColor(
            config.system.accentColor,
          );
          console.log("Settings: system 更新后:", config.system);
        }
        if (cfg.upload) {
          config.upload = { ...config.upload, ...cfg.upload };
          console.log("Settings: upload 更新后:", config.upload);
        }
        // 初始化后写入当前签名，避免刚加载就被自动保存再次落盘。
        lastSavedSignature = JSON.stringify(buildNormalizedPayload());
        console.log("Settings: 配置加载完成，当前 config:", config);
      }

      tgConnected.value = await tgCheckLogin();
      asmrLoggedIn.value = !!config.asmr.token;
      console.log(
        "Settings: 登录状态 - TG:",
        tgConnected.value,
        "ASMR:",
        asmrLoggedIn.value,
      );
    } finally {
      autoSaveEnabled = true;
    }
  };

  return {
    tgConnected,
    asmrLoggedIn,
    showToast,
    toastMessage,
    toastType,
    config,
    saveAllSettings,
    showToastMessage,
    initializeBaseSettings,
  };
};
