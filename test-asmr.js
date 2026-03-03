import pathModule from "path";
import { join } from "path";
import fs from "fs/promises";
import { ipcMain, app, webContents } from "electron";
import { normalizeError } from "../utils/errorHandler";
import { scanForIds } from "../utils";
import { getConfig, saveConfig } from "../modules/config";
import { createLogSender } from "../utils/logger";
import { getAsmrClient } from "./httpClient";
// ASMR 登录功能
async function loginAsmr(credentials) {
  // 这里应该是实际的登录逻辑
  // 目前返回模拟数据
  return {
    success: true,
    message: "登录成功",
    token: "mock-token-" + Date.now(),
  };
}

// 模拟检查登录状态函数
async function checkAsmrLoginStatus() {
  // 这里应该是实际的检查登录状态逻辑
  // 目前返回模拟数据
  return {
    isLoggedIn: false,
    username: null,
  };
}

// 模拟登出函数
async function logoutAsmr() {
  // 这里应该是实际的登出逻辑
  // 目前返回模拟数据
  return {
    success: true,
    message: "登出成功",
  };
}

// 模拟触发云数据同步函数
async function triggerCloudDataFetch() {
  // 这里应该是实际的触发云数据同步逻辑
  // 目前返回模拟数据
  return {
    success: true,
    message: "数据同步成功",
  };
}

// 创建日志发送器
const logger = createLogSender("asmr");

// 云端作品列表缓存（全局变量）
let cloudWorksCache = [];
// 文件锁，防止并发访问TXT文件
let fileLock = Promise.resolve();
// 扫描锁，防止并发扫描
let scanLock = Promise.resolve();
// HTTP 客户端
let asmrHttpClient = null;

// TXT文件路径（支持自定义配置）
const getTxtPath = async () => {
  const config = await getConfig();
  const customPath = config.paths?.chineseListPath?.trim();
  const timestamp = new Date().toISOString();

  logger.debug(
    `[${timestamp}] getTxtPath: customPath="${customPath}", configDir="${config.paths?.configDir}"`,
  );

  if (customPath && customPath.length > 0) {
    // 使用自定义路径
    const txtPath = customPath.endsWith(".txt")
      ? customPath
      : pathModule.join(customPath, "one站汉化.txt");
    logger.debug(`[${timestamp}] 使用自定义TXT路径: ${txtPath}`);
    return txtPath;
  }

  // 默认路径
  const dataDir = app.getPath("userData");
  const txtPath = pathModule.join(dataDir, "one站汉化.txt");
  logger.debug(`[${timestamp}] 使用默认TXT路径: ${txtPath}`);
  return txtPath;
};

// 标签库缓存（1分钟有效）
let tagsCache = null;
let tagsCacheTime = 0;
const TAGS_CACHE_TTL = 60000;

/**
 * 触发获取云端列表
 */
export async function syncCloudWorksData() {
  return await triggerCloudDataFetch();
}

export function setupAsmrIPC(historyPath) {
  // 初始化 HTTP 客户端
  if (!asmrHttpClient) {
    asmrHttpClient = getAsmrClient();
  }

  // 发送带 Tag 的日志
  const sendLogToSender = (sender, msg) => {
    if (sender && !sender.isDestroyed()) {
      sender.send("log-update", { type: "asmr", msg });
    }
  };

  // 触发异步获取云端列表（登录成功后调用）
  ipcMain.handle("asmr-trigger-cloud-data-fetch", async () => {
    return await syncCloudWorksData();
  });

  // 获取缓存的云端列表
  ipcMain.handle("asmr-get-cached-cloud-works", async () => {
    return { success: true, data: cloudWorksCache };
  });

  // 触发云端数据获取
  ipcMain.handle("asmr-fetch-cloud-works", async () => {
    try {
      const result = await syncCloudWorksData();
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 监听云端列表更新事件（从 ipcMain 事件接收）
  ipcMain.on("cloud-works-updated", (event, data) => {
    if (data && data.data) {
      cloudWorksCache = data.data;
      logger.info(`云端列表缓存已更新，共 ${cloudWorksCache.length} 个作品`);
      // 发送到所有前端窗口
      const allContents = webContents.getAllWebContents();
      allContents.forEach((contents) => {
        if (!contents.isDestroyed()) {
          contents.send("cloud-works-updated", { data: cloudWorksCache });
        }
      });
    }
  });

  // 监听登录成功事件，广播到前端
  app.on("asmr-logged-in", () => {
    logger.info("登录成功事件触发，广播到前端");
    const allContents = webContents.getAllWebContents();
    allContents.forEach((contents) => {
      if (!contents.isDestroyed()) {
        contents.send("asmr-logged-in");
      }
    });
  });

  // 自动登录（应用启动时）
  async function autoLoginOnStartup() {
    try {
      const config = await getConfig();

      // 检查是否保存了 ASMR 登录信息
      if (
        !config.asmr ||
        !config.asmr.username ||
        !config.asmr.password ||
        !config.asmr.playlistId
      ) {
        logger.info("未保存 ASMR 登录信息，跳过自动登录");
        return;
      }

      logger.info("检测到 ASMR 登录信息，自动登录...");

      // 自动登录
      const loginResult = await loginAsmr({
        username: config.asmr.username,
        password: config.asmr.password,
        playlistId: config.asmr.playlistId,
      });

      if (loginResult.success) {
        logger.info("自动登录成功，云端列表将在后台异步获取");

        // 登录成功后自动获取云端列表（已在 login_ 中处理）
        // 不需要再次调用 syncCloudWorksData
      } else {
        logger.warn("自动登录失败:", loginResult.msg || "未知错误");
      }
    } catch (error) {
      logger.error("自动登录错误:", error.message);
    }
  }

  // 调用自动登录
  autoLoginOnStartup();

  // 1. 加载标签库（带缓存，1分钟有效）
  ipcMain.handle("load-tag-db", async () => {
    try {
      const now = Date.now();

      // 检查缓存
      if (tagsCache && now - tagsCacheTime < TAGS_CACHE_TTL) {
        logger.debug("[Tags] 使用缓存的标签库");
        return tagsCache;
      }

      const config = await getConfig();

      let tagsFilePath = null;

      if (config.paths && config.paths.tagsDir) {
        const tagsDir = config.paths.tagsDir.trim();

        // 检查是否是完整文件路径（以 .json 结尾）
        if (tagsDir.endsWith(".json")) {
          // 已经是完整文件路径，直接使用
          tagsFilePath = tagsDir;
        } else {
          // 是目录路径，拼上文件名
          tagsFilePath = pathModule.join(tagsDir, "tags.json");
        }
      }

      const paths = [];
      if (tagsFilePath) {
        try {
          await fs.access(tagsFilePath);
          paths.push(tagsFilePath);
        } catch {
          // 文件不存在，跳过
        }
      }
      paths.push(
        join(process.cwd(), "config", "tags.json"),
        join(process.resourcesPath, "config", "tags.json"),
      );

      let target = null;
      for (const p of paths) {
        try {
          await fs.access(p);
          target = p;
          break;
        } catch {
          // 文件不存在，继续查找下一个
        }
      }

      if (!target) {
        return { success: false, msg: "未找到 tags.json" };
      }

      const tagsContent = await fs.readFile(target, "utf-8");
      const tagsData = JSON.parse(tagsContent);

      // 更新缓存
      tagsCache = Array.isArray(tagsData) ? tagsData : tagsData || {};
      tagsCacheTime = now;
      logger.info(
        `[Tags] 标签库已加载并缓存 (${Object.keys(tagsCache).length} 个标签)`,
      );

      if (Array.isArray(tagsData)) {
        return tagsCache;
      } else if (typeof tagsData === "object" && tagsData !== null) {
        return tagsCache;
      }

      return {};
    } catch (e) {
      console.error("加载标签库失败:", e.message);
      return { success: false, msg: e.message };
    }
  });

  // 2. 获取播放列表（并发获取所有页面）
  ipcMain.handle(
    "asmr-fetch-playlist",
    async (event, { token, playlistId }) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const pageSize = 100;
      let totalPages = 1;
      const works = [];

      try {
        sendLogToSender(event.sender, `🚀 开始并发获取播放列表: ${playlistId}`);

        const firstPageUrl = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=1&pageSize=${pageSize}`;
        console.log(`[ASMR] ========== 获取第一页 ==========`);
        console.log(`[ASMR] 获取播放列表: ${firstPageUrl}`);
        console.log(`[ASMR] 使用Token: ${token.substring(0, 20)}...`);

