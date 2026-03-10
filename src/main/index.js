import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from "electron";
import path, { join } from "path";
import fs from "fs";
import icon from "../../resources/icon.png?asset";
import trayIcon from "../../build/icon-tray.ico?asset";

// 引入子模块
import { setupAsmrIPC } from "./modules/asmr-localization";
import { setupWhisperIPC } from "./modules/whisper";
import { setupTelegramIPC } from "./utils/telegram-login";
import { setupTgHistoryIPC } from "./modules/tg-recent-activity";
import {
  setupTgSearchBotIPC,
  startBot,
  triggerStartupHistorySync,
} from "./modules/tg-search-bot";
import { setupTgInfoCacheIPC } from "./modules/tg-info-cache";
import { setupRjDuplicatesIPC } from "./modules/tg-rj-duplicates";
import { setupTgInfoErrorRecoverIPC } from "./modules/tg-info-error-recover";
import { setupConfigIPC, getConfig, saveConfig } from "./modules/config";
import { setupWorkflowRuntimeIPC } from "./workflow-runtime";
import { scanForArchives } from "./utils/archive-scanner";
import { createLogSender } from "./utils/logger";

// 全局窗口引用
let mainWindow = null;

// 创建日志发送器
const logger = createLogSender("app");

// 托盘图标
let tray = null;

const WINDOW_FRAME_MODE = {
  CUSTOM: "custom",
  SYSTEM: "system",
};

const DEFAULT_WINDOW_FRAME_MODE = WINDOW_FRAME_MODE.CUSTOM;
const DEFAULT_THEME_MODE = "auto";
const DEFAULT_WINDOW_OPACITY = 0.92;
const MIN_WINDOW_OPACITY = 0.55;
const DEFAULT_BLUR_INTENSITY = 8;
const MAX_BLUR_INTENSITY = 40;
const DEFAULT_ACCENT_COLOR = "#adb571";
const DEFAULT_BLUR_RENDER_MODE = "system";
let activeWindowFrameMode = resolveEffectiveWindowFrameMode(
  DEFAULT_WINDOW_FRAME_MODE,
);

function normalizeWindowFrameMode(rawMode) {
  if (rawMode === WINDOW_FRAME_MODE.SYSTEM) {
    return WINDOW_FRAME_MODE.SYSTEM;
  }
  return WINDOW_FRAME_MODE.CUSTOM;
}

function normalizeThemeMode(rawMode) {
  if (rawMode === "dark" || rawMode === "light" || rawMode === "auto") {
    return rawMode;
  }

  return DEFAULT_THEME_MODE;
}

function normalizeWindowOpacity(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINDOW_OPACITY;
  }

  return Math.min(1, Math.max(MIN_WINDOW_OPACITY, Number(parsed.toFixed(2))));
}

function normalizeBlurIntensity(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BLUR_INTENSITY;
  }

  return Math.min(MAX_BLUR_INTENSITY, Math.max(0, Math.round(parsed)));
}

function normalizeAccentColor(rawValue) {
  if (typeof rawValue === "string" && /^#[0-9a-fA-F]{6}$/.test(rawValue)) {
    return rawValue.toLowerCase();
  }

  return DEFAULT_ACCENT_COLOR;
}

function normalizeBlurRenderMode(rawValue) {
  if (rawValue === "gpu" || rawValue === "system") {
    return rawValue;
  }

  return DEFAULT_BLUR_RENDER_MODE;
}

function resolveThemeSource(themeMode) {
  if (themeMode === "dark" || themeMode === "light") {
    return themeMode;
  }

  return "system";
}

function resolveDarkModeFlag(themeMode) {
  if (themeMode === "dark") {
    return true;
  }

  if (themeMode === "light") {
    return false;
  }

  return Boolean(nativeTheme.shouldUseDarkColors);
}

function resolveWindowAppearanceConfig() {
  const config = getConfig();
  const systemConfig = config?.system || {};

  const themeMode = normalizeThemeMode(systemConfig.theme);
  const windowOpacity = normalizeWindowOpacity(systemConfig.windowOpacity);
  const blurEnabled =
    typeof systemConfig.blurEnabled === "boolean"
      ? systemConfig.blurEnabled
      : true;
  const blurIntensity = normalizeBlurIntensity(systemConfig.blurIntensity);
  const blurRenderMode = normalizeBlurRenderMode(systemConfig.blurRenderMode);
  const accentColor = normalizeAccentColor(systemConfig.accentColor);

  return {
    themeMode,
    windowOpacity,
    blurEnabled,
    blurIntensity,
    blurRenderMode,
    accentColor,
    proxyUrl:
      typeof systemConfig.proxyUrl === "string"
        ? systemConfig.proxyUrl.trim()
        : "",
  };
}

function resolveRequestedWindowFrameMode() {
  try {
    const config = getConfig();
    return normalizeWindowFrameMode(config?.system?.windowFrameMode);
  } catch {
    return DEFAULT_WINDOW_FRAME_MODE;
  }
}

function resolveEffectiveWindowFrameMode(requestedMode) {
  if (requestedMode === WINDOW_FRAME_MODE.SYSTEM) {
    return WINDOW_FRAME_MODE.SYSTEM;
  }

  // 目前仅在 Windows 启用完整无边框方案，其它平台兜底系统边框。
  if (process.platform === "win32") {
    return WINDOW_FRAME_MODE.CUSTOM;
  }

  return WINDOW_FRAME_MODE.SYSTEM;
}

function getWindowChromeOptions(frameMode) {
  if (frameMode === WINDOW_FRAME_MODE.CUSTOM && process.platform === "win32") {
    return {
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: true,
      // 保留系统缩放边界，否则无边框窗口无法拖拽调整大小
      thickFrame: true,
      resizable: true,
      roundedCorners: true,
    };
  }

  return {
    frame: true,
    transparent: false,
    backgroundColor: "#f7f8fa",
  };
}

function buildWindowStatePayload(windowInstance) {
  const requestedFrameMode = resolveRequestedWindowFrameMode();
  const requestedEffectiveFrameMode =
    resolveEffectiveWindowFrameMode(requestedFrameMode);
  const frameMode = activeWindowFrameMode || requestedEffectiveFrameMode;
  const appearance = resolveWindowAppearanceConfig();
  const isWindowValid =
    windowInstance &&
    !windowInstance.isDestroyed() &&
    !windowInstance.webContents.isDestroyed();

  return {
    frameMode,
    requestedFrameMode,
    frameModeNeedsRestart: frameMode !== requestedEffectiveFrameMode,
    customFrameEnabled: frameMode === WINDOW_FRAME_MODE.CUSTOM,
    windowControlSupported:
      process.platform === "win32" && frameMode === WINDOW_FRAME_MODE.CUSTOM,
    maximized: Boolean(isWindowValid && windowInstance.isMaximized()),
    focused: Boolean(isWindowValid && windowInstance.isFocused()),
    darkMode: resolveDarkModeFlag(appearance.themeMode),
    themeMode: appearance.themeMode,
    windowOpacity: appearance.windowOpacity,
    blurEnabled: appearance.blurEnabled,
    blurIntensity: appearance.blurIntensity,
    blurRenderMode: appearance.blurRenderMode,
    accentColor: appearance.accentColor,
  };
}

function emitWindowState(windowInstance) {
  if (
    !windowInstance ||
    windowInstance.isDestroyed() ||
    !windowInstance.webContents ||
    windowInstance.webContents.isDestroyed()
  ) {
    return;
  }

  windowInstance.webContents.send(
    "window-state-changed",
    buildWindowStatePayload(windowInstance),
  );
}

function resolveWindowsBackgroundMaterial(appearance) {
  if (!appearance?.blurEnabled) {
    return "none";
  }

  if (appearance.blurRenderMode === "gpu") {
    return "acrylic";
  }

  // system ????? Win11 Mica ???
  return "mica";
}

function applyWindowsDesktopMaterial(windowInstance) {
  if (!windowInstance || windowInstance.isDestroyed()) {
    return;
  }

  const appearance = resolveWindowAppearanceConfig();
  const useDarkSurface = resolveDarkModeFlag(appearance.themeMode);
  const requestedMaterial = resolveWindowsBackgroundMaterial(appearance);
  const canUseCustomMaterial =
    process.platform === "win32" &&
    activeWindowFrameMode === WINDOW_FRAME_MODE.CUSTOM &&
    requestedMaterial !== "none";

  if (typeof windowInstance.setOpacity === "function") {
    // ?????????????????????????????
    windowInstance.setOpacity(appearance.windowOpacity);
  }

  if (process.platform !== "win32") {
    return;
  }

  try {
    windowInstance.setBackgroundColor(useDarkSurface ? "#10151d" : "#f7f7f9");

    if (typeof windowInstance.setBackgroundMaterial === "function") {
      windowInstance.setBackgroundMaterial(
        canUseCustomMaterial ? requestedMaterial : "none",
      );
      logger.debug(
        canUseCustomMaterial
          ? `? Windows ???????: ${requestedMaterial}`
          : "? Windows ???????",
      );
      return;
    }

    if (typeof windowInstance.setVibrancy === "function") {
      windowInstance.setVibrancy(null);
      logger.debug("?? ?? Electron ????? setBackgroundMaterial????????");
      return;
    }

    logger.debug("?? ?? Electron API ?????????");
  } catch (error) {
    logger.warn(`?? ?? Windows ??????: ${error.message}`);
  }
}

function applyThemePreference() {
  const appearance = resolveWindowAppearanceConfig();
  const nextThemeSource = resolveThemeSource(appearance.themeMode);

  if (nativeTheme.themeSource !== nextThemeSource) {
    nativeTheme.themeSource = nextThemeSource;
    logger.debug(`✅ 主题模式已切换: ${appearance.themeMode}`);
  }
}

function ensureMainWindowContent(windowInstance) {
  if (!windowInstance || windowInstance.isDestroyed()) {
    return;
  }

  const currentUrl = windowInstance.webContents.getURL();

  if (currentUrl && currentUrl !== "about:blank") {
    return;
  }

  logger.warn("⚠️ 检测到窗口内容为空，尝试重新加载渲染页面");

  if (process.env.NODE_ENV === "development") {
    windowInstance.loadURL("http://localhost:5173");
    return;
  }

  windowInstance.loadFile(join(__dirname, "../renderer/index.html"));
}

function restoreAndRevealWindow(windowInstance) {
  if (!windowInstance || windowInstance.isDestroyed()) {
    return;
  }

  if (windowInstance.isMinimized()) {
    windowInstance.restore();
  }

  ensureMainWindowContent(windowInstance);

  const webContents = windowInstance.webContents;

  if (webContents?.isCrashed?.()) {
    logger.warn("⚠️ 渲染进程疑似崩溃，恢复时触发重载");
    webContents.reload();
  }

  applyWindowsDesktopMaterial(windowInstance);
  windowInstance.show();
  windowInstance.focus();
  webContents.invalidate();
}

function getAliveMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  return mainWindow;
}

function registerWindowControlIPC() {
  ipcMain.handle("window-minimize", () => {
    const win = getAliveMainWindow();
    if (!win) return false;

    const config = getConfig();

    if (config.system?.minimizeToTray) {
      win.hide();
      return true;
    }

    win.minimize();
    return true;
  });

  ipcMain.handle("window-toggle-maximize", () => {
    const win = getAliveMainWindow();
    if (!win) return false;

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return win.isMaximized();
  });

  ipcMain.handle("window-close", () => {
    const win = getAliveMainWindow();
    if (!win) return false;

    win.close();
    return true;
  });

  ipcMain.handle("window-is-maximized", () => {
    const win = getAliveMainWindow();
    if (!win) return false;

    return win.isMaximized();
  });

  ipcMain.handle("window-get-state", () => {
    const win = getAliveMainWindow();
    return buildWindowStatePayload(win);
  });

  ipcMain.handle("window-get-bounds", () => {
    const win = getAliveMainWindow();
    if (!win) return null;
    return win.getBounds();
  });

  ipcMain.handle("window-set-bounds", (_event, rawBounds) => {
    const win = getAliveMainWindow();
    if (!win || !rawBounds || typeof rawBounds !== "object") return false;

    const bounds = {
      x: Number.parseInt(rawBounds.x, 10),
      y: Number.parseInt(rawBounds.y, 10),
      width: Number.parseInt(rawBounds.width, 10),
      height: Number.parseInt(rawBounds.height, 10),
    };

    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width < 400 ||
      bounds.height < 300
    ) {
      return false;
    }

    win.setBounds(bounds, false);
    return true;
  });
}

// 应用系统设置
function applySystemSettings() {
  try {
    const config = getConfig();
    applyThemePreference();

    // 应用开机自启动设置
    if (config.system?.autoStart) {
      const settings = {
        openAtLogin: true,
        path: process.execPath,
        args: [],
        name: app.getName(),
      };
      app.setLoginItemSettings(settings);
      logger.debug("✅ 开机自启动已启用", settings);
    } else {
      app.setLoginItemSettings({ openAtLogin: false });
      logger.debug("❌ 开机自启动已禁用");
    }

    // 如果启用最小化到托盘，创建托盘图标
    if (config.system?.minimizeToTray) {
      createTray();
      logger.debug("✅ 最小化到托盘已启用");
    } else {
      destroyTray();
      logger.debug("❌ 最小化到托盘已禁用");
    }
  } catch (error) {
    logger.error("❌ 应用系统设置失败:", error.message);
    console.error("应用系统设置失败:", error);
  }
}

// 创建托盘图标
function createTray() {
  if (tray) {
    logger.debug("托盘图标已存在，跳过创建");
    return;
  }

  try {
    const { Tray, Menu } = require("electron");

    logger.debug("开始创建托盘图标...");
    // Windows平台使用专门的托盘图标
    const trayIconToUse = process.platform === "win32" ? trayIcon : icon;
    tray = new Tray(trayIconToUse);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          logger.debug("托盘菜单: 显示窗口");
          if (mainWindow) {
            restoreAndRevealWindow(mainWindow);
          }
        },
      },
      {
        label: "退出",
        click: () => {
          logger.debug("托盘菜单: 退出应用");
          app.quit();
        },
      },
    ]);

    tray.setToolTip("KuruHaru");
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      logger.debug("托盘图标被点击");
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          restoreAndRevealWindow(mainWindow);
        }
      }
    });

    // 双击托盘图标切换窗口显示状态
    tray.on("double-click", () => {
      logger.debug("托盘图标被双击");
      if (mainWindow) {
        restoreAndRevealWindow(mainWindow);
      }
    });

    logger.debug("✅ 托盘图标已创建");
  } catch (error) {
    logger.error("❌ 创建托盘图标失败:", error.message);
    console.error("创建托盘图标失败:", error);
  }
}

// 销毁托盘图标
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    logger.debug("托盘图标已销毁");
  }
}

function createWindow() {
  logger.debug("开始创建窗口...");
  const requestedFrameMode = resolveRequestedWindowFrameMode();
  const effectiveFrameMode =
    resolveEffectiveWindowFrameMode(requestedFrameMode);
  activeWindowFrameMode = effectiveFrameMode;
  logger.debug(
    `窗口边框模式 requested=${requestedFrameMode} effective=${effectiveFrameMode}`,
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
    skipTaskbar: false,
    icon: icon,
    ...getWindowChromeOptions(effectiveFrameMode),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  applyWindowsDesktopMaterial(mainWindow);

  logger.debug("窗口对象已创建");

  // 加载开发服务器页面
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools({ mode: "detach" }); // 使用独立窗口模式
    logger.debug("开发模式：强制打开 DevTools");
    mainWindow.loadURL("http://localhost:5173");
    logger.debug("加载开发服务器: http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    logger.debug("加载生产构建页面");
  }

  mainWindow.on("ready-to-show", () => {
    logger.debug("ready-to-show 事件触发，显示窗口");
    applyWindowsDesktopMaterial(mainWindow);
    mainWindow.show();
    emitWindowState(mainWindow);
  });

  mainWindow.on("show", () => {
    logger.debug("窗口已显示");
    ensureMainWindowContent(mainWindow);
    emitWindowState(mainWindow);
  });

  mainWindow.on("restore", () => {
    logger.debug("窗口已还原");
    ensureMainWindowContent(mainWindow);
    emitWindowState(mainWindow);
  });

  mainWindow.on("focus", () => {
    emitWindowState(mainWindow);
  });

  mainWindow.on("blur", () => {
    emitWindowState(mainWindow);
  });

  mainWindow.on("maximize", () => {
    emitWindowState(mainWindow);
  });

  mainWindow.on("unmaximize", () => {
    emitWindowState(mainWindow);
  });

  mainWindow.on("enter-full-screen", () => {
    emitWindowState(mainWindow);
  });

  mainWindow.on("leave-full-screen", () => {
    emitWindowState(mainWindow);
  });

  // 处理窗口最小化事件
  mainWindow.on("minimize", (event) => {
    const config = getConfig();

    if (config.system?.minimizeToTray) {
      event.preventDefault();

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }

      logger.debug("窗口已最小化到托盘");
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logger.debug("页面加载完成");
    emitWindowState(mainWindow);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error(
      `渲染进程退出: reason=${details?.reason || "unknown"}, code=${details?.exitCode ?? "unknown"}`,
    );

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      ensureMainWindowContent(mainWindow);
      mainWindow.webContents.reload();
    }, 180);
  });

  mainWindow.on("unresponsive", () => {
    logger.warn("窗口出现无响应，尝试触发重绘");

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.invalidate();
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      logger.error("页面加载失败:", errorCode, errorDescription, validatedURL);
    },
  );

  return mainWindow;
}

registerWindowControlIPC();

nativeTheme.on("updated", () => {
  const win = getAliveMainWindow();
  emitWindowState(win);
});

app.on("config-updated", () => {
  const win = getAliveMainWindow();
  applySystemSettings();
  applyWindowsDesktopMaterial(win);
  emitWindowState(win);
});

// 注册通用文件选择接口
ipcMain.handle("dialog:openFile", async (_event, options = {}) => {
  const type = typeof options === "string" ? options : options.type || "all";
  const properties =
    type !== "dir" ? ["openFile", "multiSelections"] : ["openDirectory"];
  const filters =
    type === "file" ? [{ name: "All Files", extensions: ["*"] }] : [];
  const res = await dialog.showOpenDialog({ properties, filters });

  if (res.canceled || !res.filePaths.length) {
    return { canceled: true, filePath: null, filePaths: [] };
  }

  const isDirectory = type === "dir";
  return {
    canceled: false,
    filePath: isDirectory ? res.filePaths[0] : res.filePaths[0],
    filePaths: res.filePaths,
  };
});

// 保存文件对话框
ipcMain.handle("dialog:saveFile", async (_event, options = {}) => {
  const { defaultPath, filters } = options;
  const res = await dialog.showSaveDialog({ defaultPath, filters });

  if (res.canceled || !res.filePath) {
    return { canceled: true, filePath: null };
  }

  return {
    canceled: false,
    filePath: res.filePath,
  };
});

// 选择目录（用于TG下载目录等）
ipcMain.handle("dialog:openDirectory", async () => {
  const res = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (res.canceled || !res.filePaths.length) {
    return { canceled: true, filePath: null };
  }

  return {
    canceled: false,
    filePath: res.filePaths[0],
  };
});

// 读取图片文件并转换为 base64
ipcMain.handle("read-image-as-base64", async (event, filePath) => {
  if (!filePath) return null;
  try {
    const fs = require("fs");
    const data = fs.readFileSync(filePath);
    const ext = filePath.split(".").pop().toLowerCase();
    const mimeTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mimeType = mimeTypes[ext] || "image/png";
    return `data:${mimeType};base64,${data.toString("base64")}`;
  } catch (e) {
    console.error("读取图片失败:", e);
    return null;
  }
});

// 获取默认头像
ipcMain.handle("get-default-avatar", async () => {
  try {
    const fs = require("fs");
    const path = require("path");

    // 尝试多个可能的路径
    const possiblePaths = [
      path.join(
        process.resourcesPath || process.cwd(),
        "resources",
        "default-avatar.png",
      ),
      path.join(process.resourcesPath || process.cwd(), "default-avatar.png"),
      path.join(process.cwd(), "resources", "default-avatar.png"),
      path.join(__dirname, "../../resources/default-avatar.png"),
    ];

    logger.debug("尝试查找默认头像文件...");

    for (const avatarPath of possiblePaths) {
      logger.debug(`检查路径: ${avatarPath}`);
      if (fs.existsSync(avatarPath)) {
        logger.debug(`✅ 找到默认头像: ${avatarPath}`);
        const data = fs.readFileSync(avatarPath);
        const base64 = `data:image/png;base64,${data.toString("base64")}`;
        logger.debug(`✅ 默认头像加载成功，大小: ${data.length} bytes`);
        return base64;
      }
    }

    logger.warn("❌ 未找到默认头像文件");
    return null;
  } catch (e) {
    logger.error("❌ 读取默认头像失败:", e);
    return null;
  }
});

// 注册压缩包扫描接口
ipcMain.handle("scan-local-archives", async (event, dir) => {
  const results = [];
  if (dir) scanForArchives(dir, results);

  // 基于路径去重
  const seen = new Map();
  const deduplicated = [];
  for (const item of results) {
    const normalizedPath = item.path.toLowerCase();
    if (!seen.has(normalizedPath)) {
      seen.set(normalizedPath, true);
      deduplicated.push(item);
    }
  }

  // 确保每个结果都有 tags 字段（前端需要）
  deduplicated.forEach((r) => {
    if (!r.tags) r.tags = [];
  });
  return deduplicated;
});

// 提取文件名到txt（异步版本，避免阻塞主线程）
ipcMain.handle(
  "extract-file-names",
  async (_event, { sourceDir, outputDir, fileName }) => {
    try {
      if (!fs.existsSync(sourceDir)) {
        return { success: false, msg: "源目录不存在" };
      }

      const outputFilePath = path.join(outputDir, fileName);
      const entries = [];

      // 异步扫描函数
      async function scan(dir) {
        try {
          const items = await fs.promises.readdir(dir);
          const scanPromises = items.map(async (item) => {
            const fullPath = path.join(dir, item);
            const stat = await fs.promises.stat(fullPath);

            if (stat.isDirectory()) {
              // 递归进入所有子文件夹
              await scan(fullPath);
            } else {
              // 只提取 RJ/VJ/BJ 开头的文件
              if (/^(RJ|VJ|BJ)\d+/i.test(item)) {
                let rjCode = item.replace(
                  /\.(zip|rar|7z|tar|gz|mp4|mkv|avi|mov)$/i,
                  "",
                );
                entries.push(rjCode);
              }
            }
          });
          await Promise.all(scanPromises);
        } catch {
          // 忽略读取错误
        }
      }

      await scan(sourceDir);

      // 去重并排序
      const uniqueEntries = [...new Set(entries)].sort();

      // 异步写入文件
      await fs.promises.writeFile(
        outputFilePath,
        uniqueEntries.join("\n"),
        "utf-8",
      );

      return {
        success: true,
        fileCount: uniqueEntries.length,
        outputPath: outputFilePath,
      };
    } catch (e) {
      return { success: false, msg: e.message };
    }
  },
);

// 读取文件内容
ipcMain.handle("fs-read-file", async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
});

// 数据清洗
ipcMain.handle(
  "clean-data",
  async (_event, { mainFile, compareDir, deleteFiles = false }) => {
    try {
      logger.info(
        `[clean-data] 收到请求: mainFile=${mainFile}, compareDir=${compareDir}, deleteFiles=${deleteFiles}, type=${typeof deleteFiles}`,
      );

      if (!fs.existsSync(mainFile)) {
        return { success: false, msg: "主文件不存在" };
      }
      if (!fs.existsSync(compareDir)) {
        return { success: false, msg: "比对文件夹不存在" };
      }

      // 读取主文件内容，提取 RJ/VJ/BJ 号（支持 6-8 位数字）
      const mainContent = fs.readFileSync(mainFile, "utf-8");
      const mainMatches = mainContent.match(/(RJ|VJ|BJ)\d{6,8}/gi) || [];
      const mainCodes = mainMatches.map((c) => c.toUpperCase());

      // 扫描比对文件夹中的 zip 文件
      const files = fs.readdirSync(compareDir);
      const zipFiles = files.filter((file) =>
        file.toLowerCase().endsWith(".zip"),
      );

      // 从 zip 文件名中提取 RJ/VJ/BJ 号
      const fileCodeMap = new Map(); // 文件名 -> 提取的 codes
      const allCodes = [];

      for (const zipFile of zipFiles) {
        const matches = zipFile.match(/(RJ|VJ|BJ)\d{6,8}/gi);
        if (matches) {
          const codes = matches.map((c) => c.toUpperCase());
          fileCodeMap.set(zipFile, codes);
          allCodes.push(...codes);
        } else {
          fileCodeMap.set(zipFile, []);
        }
      }

      // 主文件中的 code 集合
      const mainSet = new Set(mainCodes);

      // 找出需要保留的文件（包含不在主文件中的 code）
      const filesToKeep = new Set();
      const filesToDelete = [];
      const deletedCodes = [];

      for (const [zipFile, codes] of fileCodeMap) {
        // 检查该文件的所有 code 是否都在主文件中存在
        const allInMain = codes.every((code) => mainSet.has(code));

        if (allInMain && codes.length > 0) {
          // 该文件的所有 code 都在主文件中，应该删除
          filesToDelete.push(zipFile);
          deletedCodes.push(...codes);

          // 如果启用了删除，实际删除文件
          if (deleteFiles === true) {
            const filePath = path.join(compareDir, zipFile);
            try {
              fs.unlinkSync(filePath);
              logger.info(`[clean-data] ✅ 已删除文件: ${zipFile}`);
            } catch (err) {
              logger.error(
                `[clean-data] ❌ 删除文件失败: ${zipFile}`,
                err.message,
              );
            }
          } else {
            logger.info(`[clean-data] ℹ️ 预览模式，未删除: ${zipFile}`);
          }
        } else {
          // 保留该文件（至少有一个 code 不在主文件中，或没有提取到 code）
          filesToKeep.add(zipFile);
        }
      }

      // 去重统计
      const uniqueDeletedCodes = [...new Set(deletedCodes)].sort();

      logger.info(
        `[clean-data] 扫描 ${zipFiles.length} 个文件，删除 ${filesToDelete.length} 个，保留 ${filesToKeep.size} 个`,
      );

      return {
        success: true,
        originalCount: zipFiles.length,
        cleanedCount: filesToKeep.size,
        deletedCount: filesToDelete.length,
        deletedCodes: uniqueDeletedCodes,
        filesToDelete: filesToDelete,
        filesToKeep: [...filesToKeep],
        zipFileCount: zipFiles.length,
        actuallyDeleted: deleteFiles === true,
      };
    } catch (e) {
      logger.error("[clean-data] 错误:", e.message);
      return { success: false, msg: e.message };
    }
  },
);

// 写入文件
ipcMain.handle("write-file", async (event, { path: filePath, content }) => {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 保存自定义路径配置
ipcMain.handle("save-custom-paths", async (event, paths) => {
  try {
    const result = await saveConfig({ paths });
    return { success: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Electron生命周期事件
app.on("window-all-closed", () => {
  logger.debug("所有窗口已关闭");
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(() => {
  logger.debug("KuruHaru app 已准备就绪");

  // 设置应用用户模型ID，确保任务栏图标正确显示
  app.setAppUserModelId("com.kuruharu.app");

  // 1. 创建窗口
  createWindow();

  // 2. 应用系统设置
  applySystemSettings();

  // 3. 加载各个功能模块
  logger.debug("开始加载功能模块...");
  setupAsmrIPC(join(app.getPath("userData"), "data", "uploaded_records.json"));
  setupWhisperIPC();
  setupTelegramIPC();
  setupTgHistoryIPC();
  setupTgSearchBotIPC();
  setupTgInfoCacheIPC();
  setupRjDuplicatesIPC();
  setupTgInfoErrorRecoverIPC();
  setupConfigIPC();
  setupWorkflowRuntimeIPC().catch((error) => {
    logger.error("[workflow-runtime] IPC 注册失败", error?.message || error);
  });

  // 4. 启动后自动启动 Bot（默认开启）+ TG 索引同步（异步，不阻塞应用启动）
  setTimeout(() => {
    const config = getConfig();
    const autoStartBot = config?.tg?.botAutoStartOnStartup !== false;

    if (autoStartBot) {
      startBot()
        .then((result) => {
          if (!result?.success) {
            logger.warn(
              `[tg-search-bot] 启动自动拉起 Bot 失败: ${result?.error || result?.message || "unknown"}`,
            );
            return;
          }

          logger.debug("[tg-search-bot] 启动自动拉起 Bot 完成");
        })
        .catch((error) => {
          logger.error(
            "[tg-search-bot] 启动自动拉起 Bot 异常",
            error?.message || error,
          );
        });
    } else {
      logger.debug("[tg-search-bot] 启动自动拉起 Bot 已关闭，跳过执行");
    }

    triggerStartupHistorySync().catch((error) => {
      logger.error(
        "[tg-search-bot] 启动自动同步任务异常",
        error?.message || error,
      );
    });
  }, 1500);

  logger.debug("所有功能模块加载完成");

  app.on("activate", () => {
    logger.debug(
      "activate 事件触发，当前窗口数:",
      BrowserWindow.getAllWindows().length,
    );
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (process.env.NODE_ENV === "development") {
    const mainProcess = process;
    mainProcess.on("message", (event, data) => {
      if (data === "open-devtools" && mainWindow) {
        mainWindow.webContents.openDevTools();
      }
    });
  }
});

// 导出函数供其他模块使用
module.exports = {
  applySystemSettings,
};
