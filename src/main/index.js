import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path, { join } from "path";
import fs from "fs";
import icon from "../../resources/icon.png?asset";
import trayIcon from "../../build/icon-tray.ico?asset";

// 引入子模块
import { setupAsmrIPC } from "./modules/asmr-localization";
import { setupWhisperIPC } from "./modules/whisper";
import { setupTelegramIPC } from "./utils/telegram-login";
import { setupTgHistoryIPC } from "./modules/tg-recent-activity";
import { setupConfigIPC, getConfig, saveConfig } from "./modules/config";
import { scanForArchives } from "./utils";
import { createLogSender } from "./utils/logger";

// 全局窗口引用
let mainWindow = null;

// 创建日志发送器
const logger = createLogSender("app");

// 托盘图标
let tray = null;

// 应用系统设置
function applySystemSettings() {
  try {
    const config = getConfig();

    // 应用开机自启动设置
    if (config.system?.autoStart) {
      const settings = {
        openAtLogin: true,
        path: process.execPath,
        args: [],
        name: app.getName(),
      };
      app.setLoginItemSettings(settings);
      logger.info("✅ 开机自启动已启用", settings);
    } else {
      app.setLoginItemSettings({ openAtLogin: false });
      logger.info("❌ 开机自启动已禁用");
    }

    // 如果启用最小化到托盘，创建托盘图标
    if (config.system?.minimizeToTray) {
      createTray();
      logger.info("✅ 最小化到托盘已启用");
    } else {
      destroyTray();
      logger.info("❌ 最小化到托盘已禁用");
    }
  } catch (error) {
    logger.error("❌ 应用系统设置失败:", error.message);
    console.error("应用系统设置失败:", error);
  }
}

// 创建托盘图标
function createTray() {
  if (tray) {
    logger.info("托盘图标已存在，跳过创建");
    return;
  }

  try {
    const { Tray, Menu } = require("electron");

    logger.info("开始创建托盘图标...");
    // Windows平台使用专门的托盘图标
    const trayIconToUse = process.platform === "win32" ? trayIcon : icon;
    tray = new Tray(trayIconToUse);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示窗口",
        click: () => {
          logger.info("托盘菜单: 显示窗口");
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "退出",
        click: () => {
          logger.info("托盘菜单: 退出应用");
          app.quit();
        },
      },
    ]);

    tray.setToolTip("KuruHaru");
    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      logger.info("托盘图标被点击");
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    // 双击托盘图标切换窗口显示状态
    tray.on("double-click", () => {
      logger.info("托盘图标被双击");
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    logger.info("✅ 托盘图标已创建");
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
    logger.info("托盘图标已销毁");
  }
}

function createWindow() {
  logger.info("开始创建窗口...");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: false,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
    },
  });

  logger.info("窗口对象已创建");

  // 加载开发服务器页面
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools({ mode: "detach" }); // 使用独立窗口模式
    logger.info("开发模式：强制打开 DevTools");
    mainWindow.loadURL("http://localhost:5173");
    logger.info("加载开发服务器: http://localhost:5173");
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    logger.info("加载生产构建页面");
  }

  mainWindow.on("ready-to-show", () => {
    logger.info("ready-to-show 事件触发，显示窗口");
    mainWindow.show();
  });

  mainWindow.on("show", () => {
    logger.info("窗口已显示");
  });

  // 处理窗口最小化事件
  mainWindow.on("minimize", (event) => {
    const config = getConfig();

    if (config.system?.minimizeToTray) {
      // 延迟隐藏窗口，但保留任务栏图标
      event.preventDefault();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }, 100);
      logger.info("窗口已最小化到托盘");
    }
  });

  mainWindow.on("show", () => {
    logger.info("窗口已显示");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logger.info("页面加载完成");
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      logger.error("页面加载失败:", errorCode, errorDescription, validatedURL);
    },
  );

  return mainWindow;
}

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

    logger.info("尝试查找默认头像文件...");

    for (const avatarPath of possiblePaths) {
      logger.info(`检查路径: ${avatarPath}`);
      if (fs.existsSync(avatarPath)) {
        logger.info(`✅ 找到默认头像: ${avatarPath}`);
        const data = fs.readFileSync(avatarPath);
        const base64 = `data:image/png;base64,${data.toString("base64")}`;
        logger.info(`✅ 默认头像加载成功，大小: ${data.length} bytes`);
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
  logger.info("所有窗口已关闭");
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(() => {
  logger.info("KuruHaru app 已准备就绪");

  // 设置应用用户模型ID，确保任务栏图标正确显示
  app.setAppUserModelId("com.kuruharu.app");

  // 1. 创建窗口
  createWindow();

  // 2. 应用系统设置
  applySystemSettings();

  // 3. 加载各个功能模块
  logger.info("开始加载功能模块...");
  setupAsmrIPC(join(app.getPath("userData"), "data", "uploaded_records.json"));
  setupWhisperIPC();
  setupTelegramIPC();
  setupTgHistoryIPC();
  setupConfigIPC();
  logger.info("所有功能模块加载完成");

  app.on("activate", () => {
    logger.info(
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
