import pathModule from "path";
import { join } from "path";
import fs from "fs";
import { ipcMain, app, webContents } from "electron";
import { scanForIds } from "../utils/archive-scanner";
import {
  login_ as asmrLogin_,
  checkLoginStatus_,
  logout_,
  triggerCloudDataFetch as syncCloudWorksDataFromLogin,
} from "../modules/asmr-login";
import { getConfig, saveConfig } from "../modules/config";
import { createLogSender } from "../utils/logger";
import { getAsmrClient } from "./httpClient";
import {
  buildAsmrSearchBaseUrl,
  buildAsmrSearchPageUrl,
  computeAsmrSearchTotalPages,
  extractAsmrSearchTotalCount,
  collectSourceIdsFromWorks,
  extractSearchQueryParam,
  extractWorksArrayExtended,
  extractWorksArrayLite,
  formatAsmrWorkData,
  getAsmrSearchBrowserHeaders,
} from "./asmr-core/search-utils";
import {
  readLineSetFromFile,
  writeUniqueLinesToFile,
} from "./asmr-core/file-list-utils";
import {
  collectRjNumbersFromLines,
  getWorkComparableRjNumber,
  matchWorkIdsByRjCodesCaseInsensitive,
  matchWorkIdsByRjCodesExact,
} from "./asmr-core/rj-filter-utils";
import {
  buildAsmrSearchApiUrl,
  detectAsmrApiMode,
  filterWorksByAfterDate,
  mapWorksToRjFilterResult,
} from "./asmr-core/url-filter-utils";
import { fetchAsmrPlaylistWorks } from "./asmr-core/playlist-fetch-utils";

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
const getTxtPath = () => {
  const config = getConfig();
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
 * 触发获取云端列表（从 asmr-login.js 导入完整实现）
 */
export async function syncCloudWorksData() {
  return await syncCloudWorksDataFromLogin();
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
      const loginResult = await asmrLogin_(null, {
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

      const config = getConfig();

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
      if (tagsFilePath && fs.existsSync(tagsFilePath)) {
        paths.push(tagsFilePath);
      }
      paths.push(
        join(process.cwd(), "config", "tags.json"),
        join(process.resourcesPath, "config", "tags.json"),
      );

      let target = paths.find((p) => fs.existsSync(p));

      if (!target) {
        return { success: false, msg: "未找到 tags.json" };
      }

      const tagsData = JSON.parse(fs.readFileSync(target, "utf-8"));

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
      return await fetchAsmrPlaylistWorks({
        httpClient: asmrHttpClient,
        token,
        playlistId,
        sendLog: (message) => sendLogToSender(event.sender, message),
      });
    },
  );

  // 3. 扫描本地文件夹（RJ号）
  ipcMain.handle("scan-local-ids", async (event, { path: dirPath }) => {
    try {
      sendLogToSender(event.sender, `🔍 开始扫描本地文件夹: ${dirPath}`);

      const fileList = [];
      scanForIds(dirPath, fileList);

      console.log(`[ASMR] 扫描完成，找到 ${fileList.length} 个文件`);
      sendLogToSender(
        event.sender,
        `✅ 扫描完成，找到 ${fileList.length} 个作品文件`,
      );

      if (fileList.length > 0) {
        sendLogToSender(event.sender, `📋 扫描到的文件（前10个）：`);
        fileList.slice(0, 10).forEach((file) => {
          sendLogToSender(
            event.sender,
            `   - ${file.code || "(无RJ号)"}: ${file.name}`,
          );
        });
      }

      return fileList;
    } catch (e) {
      console.error("[ASMR] 扫描失败:", e);
      sendLogToSender(event.sender, `❌ 扫描失败: ${e.message}`);
      return [];
    }
  });

  // 4. 获取历史记录
  ipcMain.handle("get-upload-history", async () => {
    if (!fs.existsSync(historyPath)) return [];
    try {
      const records = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
      logger.info(`读取历史记录: ${records.length} 条`);
      return records;
    } catch (e) {
      logger.error("读取历史记录失败:", e.message);
      return [];
    }
  });

  // 5. 通过 RJ 号删除作品（不依赖云端数据）
  ipcMain.on(
    "asmr-remove-works-by-rj",
    async (event, { token, playlistId, rjCodes }) => {
      const sender = event.sender;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      sendLogToSender(
        sender,
        `🚀 开始通过 ${rjCodes.length} 个 RJ 号删除作品...`,
      );
      console.log("[ASMR] RJ号删除参数:", {
        playlistId,
        rjCodesCount: rjCodes.length,
        tokenPreview: token ? `${token.substring(0, 20)}...` : "空",
      });

      // 直接使用传统方式：通过 workId 删除
      try {
        // 获取云端作品列表，匹配 RJ 号到 workId
        sendLogToSender(sender, `📋 获取云端作品列表...`);
        const playlistUrl = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=1&pageSize=100`;
        const playlistRes = await asmrHttpClient.get(playlistUrl, {
          headers,
          timeout: 30000,
        });

        // 提取所有作品
        const allWorks = extractWorksArrayLite(playlistRes.data);

        console.log("[ASMR] 获取到作品数:", allWorks.length);

        // 匹配 RJ 号到 workId
        const { matchedWorkIds, notFoundRJ } = matchWorkIdsByRjCodesExact(
          allWorks,
          rjCodes,
        );

        if (notFoundRJ.length > 0) {
          sendLogToSender(
            sender,
            `⚠️ 未找到云端作品: ${notFoundRJ.join(", ")}`,
          );
        }

        if (matchedWorkIds.length === 0) {
          sender.send("task-finished", {
            code: 1,
            msg: `未找到匹配的云端作品（${rjCodes.length} 个 RJ 号均未匹配）`,
          });
          return;
        }

        sendLogToSender(
          sender,
          `✅ 匹配到 ${matchedWorkIds.length} 个作品，开始删除...`,
        );

        // 使用传统方式删除
        const deleteUrl =
          "https://api.asmr.one/api/playlist/remove-works-from-playlist";
        const deleteRes = await asmrHttpClient.post(
          deleteUrl,
          { id: playlistId, works: matchedWorkIds },
          { headers, timeout: 30000 },
        );

        if (deleteRes.status === 200) {
          sender.send("task-finished", {
            code: 0,
            msg: `删除成功（匹配 ${matchedWorkIds.length}/${rjCodes.length} 个）`,
          });
        } else {
          sender.send("task-finished", {
            code: 1,
            msg: `删除失败: HTTP ${deleteRes.status}`,
          });
        }
      } catch (fetchError) {
        console.error("[ASMR] 删除失败:", fetchError.message);
        sender.send("task-finished", {
          code: 1,
          msg: `删除失败: ${fetchError.message}`,
        });
      }
    },
  );

  // 6. 删除作品
  ipcMain.on(
    "asmr-remove-works",
    async (event, { token, playlistId, workIds }) => {
      const sender = event.sender;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      sendLogToSender(sender, `🚀 开始删除 ${workIds.length} 个作品...`);
      console.log("[ASMR] 删除参数:", {
        playlistId,
        workIds,
        workIdsCount: workIds.length,
        tokenPreview: token ? `${token.substring(0, 20)}...` : "空",
      });

      const batchSize = 100;
      let success = 0;
      let fail = 0;
      const batches = Math.ceil(workIds.length / batchSize);

      for (let i = 0; i < batches; i++) {
        const batch = workIds.slice(i * batchSize, (i + 1) * batchSize);
        sendLogToSender(
          sender,
          `🔄 处理第 ${i + 1}/${batches} 批 (${batch.length}个作品）...`,
        );

        console.log(`[ASMR] 第 ${i + 1} 批作品:`, batch);

        try {
          const requestBody = { id: playlistId, works: batch };
          console.log("[ASMR] 请求体:", JSON.stringify(requestBody));

          const res = await asmrHttpClient.post(
            "https://api.asmr.one/api/playlist/remove-works-from-playlist",
            requestBody,
            { headers, timeout: 30000 },
          );

          console.log(`[ASMR] 第 ${i + 1} 批响应:`, res.status, res.data);

          if (res.status === 200) {
            success += batch.length;
            sendLogToSender(sender, `✅ 第 ${i + 1} 批成功`);
          } else {
            fail += batch.length;
            sendLogToSender(
              sender,
              `❌ 第 ${i + 1} 批失败: HTTP ${res.status}`,
            );
            console.log("[ASMR] 失败响应数据:", res.data);
          }
        } catch (e) {
          fail += batch.length;
          console.error("[ASMR] 删除异常:", e.message);
          if (e.response) {
            console.error("[ASMR] 响应状态:", e.response.status);
            console.error("[ASMR] 响应数据:", e.response.data);
            sendLogToSender(
              sender,
              `❌ 异常: HTTP ${e.response.status} - ${JSON.stringify(e.response.data)}`,
            );
          } else {
            sendLogToSender(sender, `❌ 异常: ${e.message}`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      sender.send("task-finished", {
        code: 0,
        msg: `删除完成: 成功 ${success}, 失败 ${fail}`,
      });
    },
  );

  // 7. 登录 - 使用统一的登录工具
  ipcMain.handle("asmr-login", async (event, params) => {
    return await asmrLogin_(event.sender, params);
  });

  // 检查登录状态
  ipcMain.handle("asmr-check-login", async () => {
    return await checkLoginStatus_();
  });

  // 退出登录
  ipcMain.handle("asmr-logout", async () => {
    return await logout_();
  });

  // 删除云端作品（直接执行，不走事件）
  ipcMain.handle("asmr-delete-works", async (event, workIds) => {
    try {
      const config = getConfig();
      const token = config.asmr?.token;
      const playlistId = config.asmr?.playlistId;

      if (!token || !playlistId) {
        return { success: false, error: "未配置登录信息" };
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      logger.info(`开始删除 ${workIds.length} 个云端作品...`);

      const batchSize = 100;
      let success = 0;
      let fail = 0;

      for (let i = 0; i < Math.ceil(workIds.length / batchSize); i++) {
        const batch = workIds.slice(i * batchSize, (i + 1) * batchSize);
        logger.info(`处理第 ${i + 1} 批 (${batch.length}个)...`);

        try {
          const res = await asmrHttpClient.post(
            "https://api.asmr.one/api/playlist/remove-works-from-playlist",
            { id: playlistId, works: batch },
            { headers, timeout: 30000 },
          );

          if (res.status === 200) {
            success += batch.length;
            logger.info(`第 ${i + 1} 批成功`);
          } else {
            fail += batch.length;
            logger.warn(`第 ${i + 1} 批失败: HTTP ${res.status}`);
          }
        } catch (e) {
          fail += batch.length;
          logger.error(`第 ${i + 1} 批异常: ${e.message}`);
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      logger.info(`删除完成: 成功 ${success}, 失败 ${fail}`);
      return { success: fail === 0, deletedCount: success, failedCount: fail };
    } catch (error) {
      logger.error("删除云端作品失败:", error.message);
      return { success: false, error: error.message };
    }
  });

  // 删除本地文件
  ipcMain.handle("asmr-delete-local-files", async (_event, filePaths) => {
    const fs = await import("fs");
    let deletedCount = 0;
    let failedCount = 0;

    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.info(`已删除本地文件: ${filePath}`);
        } else {
          logger.warn(`文件不存在: ${filePath}`);
          failedCount++;
        }
      } catch (e) {
        logger.error(`删除文件失败: ${filePath}, ${e.message}`);
        failedCount++;
      }
    }

    return {
      success: failedCount === 0,
      deletedCount,
      failedCount,
      error: failedCount > 0 ? `${failedCount} 个文件删除失败` : null,
    };
  });

  // 根据 RJ 号删除云端作品（本地清理用）
  // 注意：API remove-works-by-rj 返回 404，改用传统方法：获取播放列表→匹配RJ→workId删除
  ipcMain.handle("asmr-delete-by-rj", async (event, rjCodes) => {
    try {
      const config = getConfig();
      const token = config.asmr?.token;
      const playlistId = config.asmr?.playlistId;

      if (!token || !playlistId) {
        return { success: false, error: "未配置登录信息" };
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      logger.info(`开始通过 RJ 号删除 ${rjCodes.length} 个云端作品...`);
      logger.info(`使用播放列表: ${playlistId}`);

      // 步骤1: 获取播放列表所有作品（分页获取全部）
      logger.info("获取云端播放列表...");
      let allWorks = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        const playlistUrl = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=${page}&pageSize=${pageSize}`;
        let playlistRes;
        try {
          playlistRes = await asmrHttpClient.get(playlistUrl, {
            headers,
            timeout: 30000,
          });
        } catch (e) {
          logger.error(`获取播放列表第 ${page} 页失败:`, e.message);
          return { success: false, error: "获取播放列表失败: " + e.message };
        }

        // 提取当前页作品
        const pageWorks = extractWorksArrayLite(playlistRes.data);

        allWorks = allWorks.concat(pageWorks);
        logger.info(`第 ${page} 页: 获取到 ${pageWorks.length} 个作品`);

        // 如果当前页数量少于 pageSize，说明已到最后一页
        if (pageWorks.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      logger.info(`总计获取到 ${allWorks.length} 个云端作品`);

      // 步骤2: 匹配 RJ 号到 workId
      const { matchedWorkIds, notFoundRJ } =
        matchWorkIdsByRjCodesCaseInsensitive(allWorks, rjCodes);

      if (notFoundRJ.length > 0) {
        logger.warn(`未找到云端作品: ${notFoundRJ.join(", ")}`);
      }

      if (matchedWorkIds.length === 0) {
        logger.warn("没有匹配到任何云端作品");
        return {
          success: true,
          deletedCount: 0,
          failedCount: 0,
          notFound: notFoundRJ,
        };
      }

      logger.info(`匹配到 ${matchedWorkIds.length} 个作品，开始删除...`);

      // 步骤3: 使用 workId 删除
      let success = 0;
      let fail = 0;

      const batchSize = 50;
      for (let i = 0; i < Math.ceil(matchedWorkIds.length / batchSize); i++) {
        const batch = matchedWorkIds.slice(i * batchSize, (i + 1) * batchSize);
        logger.info(`删除第 ${i + 1} 批 (${batch.length}个作品)...`);

        try {
          const deleteRes = await asmrHttpClient.post(
            "https://api.asmr.one/api/playlist/remove-works-from-playlist",
            { id: playlistId, works: batch },
            { headers, timeout: 30000 },
          );

          if (deleteRes.status === 200) {
            success += batch.length;
            logger.info(`第 ${i + 1} 批删除成功`);
          } else {
            fail += batch.length;
            logger.warn(`第 ${i + 1} 批删除失败: HTTP ${deleteRes.status}`);
          }
        } catch (e) {
          fail += batch.length;
          logger.error(`第 ${i + 1} 批异常: ${e.message}`);
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      logger.info(
        `RJ号删除完成: 成功 ${success}, 失败 ${fail}, 未找到 ${notFoundRJ.length}`,
      );
      return {
        success: fail === 0,
        deletedCount: success,
        failedCount: fail,
        notFound: notFoundRJ,
      };
    } catch (error) {
      logger.error("RJ号删除失败:", error.message);
      return { success: false, error: error.message };
    }
  });

  // 默认路径
  const dataDir = app.getPath("userData");
  const txtPath = pathModule.join(dataDir, "one站汉化.txt");
  logger.debug(`使用默认TXT路径: ${txtPath}`);
  return txtPath;
}

// 读取已有的汉化列表（带锁）
const readLocalizedWorksList = async () => {
  return fileLock.then(() => {
    const txtPath = getTxtPath();
    return readLineSetFromFile(txtPath, logger);
  });
};

// 写入汉化列表到TXT（带锁）
const writeLocalizedWorksList = async (rjCodes) => {
  const txtPath = getTxtPath();
  return fileLock.then(async () => {
    const writeResult = writeUniqueLinesToFile(txtPath, rjCodes, logger);
    if (writeResult.success && writeResult.count > 0) {
      logger.info(`已写入汉化列表: ${writeResult.count} 个RJ号`);
    }
  });
};

// 从页数据提取RJ号（服务器已用subtitle=1过滤）
const extractLocalizedRjCodesFromPage = (works) => {
  return collectSourceIdsFromWorks(works);
};

// 7. 获取汉化作品列表（带字幕/多语种）
ipcMain.handle("asmr-fetch-chinese-works", async (event, options = {}) => {
  const { stopCondition = 5 } = options;
  const config = getConfig();
  const token = config.asmr?.token;
  const sender = event.sender;

  // 检查是否已有扫描在进行
  const currentScanLock = scanLock;
  if (currentScanLock !== scanLock) {
    return { success: false, error: "已有扫描任务在进行中，请稍候..." };
  }

  // 创建新的扫描锁
  let releaseScanLock;
  scanLock = new Promise((resolve) => {
    releaseScanLock = resolve;
  });

  try {
    // 等待当前扫描完成后再开始（如果有）
    await currentScanLock;
  } catch {
    // 忽略错误
  }

  if (!token) {
    releaseScanLock();
    return { success: false, error: "未配置登录信息" };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const sendProgress = (progress) => {
    if (sender && !sender.isDestroyed()) {
      sender.send("chinese-list-progress", progress);
    }
  };

  // 扫描完成后释放锁
  const cleanup = () => {
    if (releaseScanLock) releaseScanLock();
  };

  // 获取单页数据
  const fetchPage = async (page) => {
    // subtitle=1: 只返回有字幕的作品（服务器过滤，更快）
    const url = `https://api.asmr-200.com/api/works?order=create_date&sort=desc&page=${page}&pageSize=100&subtitle=1`;
    const res = await asmrHttpClient.get(url, { headers, timeout: 30000 });
    return extractWorksArrayExtended(res.data);
  };

  // 获取第1页及分页信息
  const fetchFirstPageWithInfo = async () => {
    const url = `https://api.asmr-200.com/api/works?order=create_date&sort=desc&page=1&pageSize=100&subtitle=1`;
    const res = await asmrHttpClient.get(url, { headers, timeout: 30000 });
    return {
      works: extractWorksArrayExtended(res.data),
      totalCount: res.data?.pagination?.totalCount || 0,
    };
  };

  try {
    // 读取已有的汉化列表
    const existingSet = await readLocalizedWorksList();
    logger.info(`已有 ${existingSet.size} 个汉化作品记录`);

    // 先获取第1页，检查是否有新增
    const { works: firstPageWorks, totalCount } =
      await fetchFirstPageWithInfo();
    const maxPages = Math.ceil(totalCount / 100) + 2;
    const maxConcurrency = 10; // 合理并发数，平衡速度和稳定性
    logger.info(
      `总作品数 ${totalCount}，需扫描约 ${maxPages} 页，并发数 ${maxConcurrency}`,
    );

    let newChineseWorks = [];
    let firstRJCode = null;
    const scannedPages = new Set(); // 记录已扫描的页码

    // 检查第1页是否有新增
    const firstPageRjCodes = extractLocalizedRjCodesFromPage(firstPageWorks);
    const firstPageNewCodes = firstPageRjCodes.filter(
      (rj) => !existingSet.has(rj),
    );
    // 记录第1页已被扫描
    scannedPages.add(1);

    // 第1页有新增，收集新增并继续扫描
    if (firstPageNewCodes.length > 0) {
      newChineseWorks.push(...firstPageNewCodes);
      firstRJCode = firstPageNewCodes[0];
    }

    // 扫描方向：全部前往后
    const forward = true;
    const startPage = 2;
    const endPage = maxPages;
    const step = 1;

    // 全部从前往后扫描，使用增量扫描逻辑（连续5页无新增则停止）

    const scanPages = async () => {
      logger.info(`扫描方向: ${forward ? "前往后（全量）" : "后往前（增量）"}`);

      // 顺序批处理：每批并发请求，完成后按顺序处理，再发下一批
      const batchSize = 3; // 每批3页
      const pagesToFetch = [];
      let pagesWithoutNewWorks = 0; // 记录连续无新增的页数

      // 计算要扫描的页码
      for (
        let page = startPage;
        forward ? page <= endPage : page >= endPage;
        page += step
      ) {
        pagesToFetch.push(page);
      }

      // 分批处理
      for (let i = 0; i < pagesToFetch.length; i += batchSize) {
        const batchPages = pagesToFetch.slice(i, i + batchSize);

        // 并发请求这一批的所有页，带超时
        const promises = batchPages.map((page) =>
          Promise.race([
            fetchPage(page).then((works) => ({ page, works })),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 15000),
            ),
          ])
            .then((result) => result)
            .catch((e) => ({ page, works: [], error: e.message })),
        );

        try {
          const results = await Promise.all(promises);

          // 按页号排序（前往后=升序，后往前=降序）
          results.sort((a, b) => (forward ? a.page - b.page : b.page - a.page));

          // 按顺序处理每一页（增量扫描逻辑，连续5页无新增则停止）
          for (const result of results) {
            scannedPages.add(result.page); // 记录已扫描的页码
            const rjCodes = extractLocalizedRjCodesFromPage(result.works || []);
            const newInThisPage = rjCodes.filter((rj) => !existingSet.has(rj));

            if (newInThisPage.length > 0) {
              // 找到新作品，收集并重置计数
              pagesWithoutNewWorks = 0;
              for (const rj of rjCodes) {
                if (!existingSet.has(rj)) {
                  newChineseWorks.push(rj);
                  if (!firstRJCode) firstRJCode = rj;
                }
              }
            } else {
              // 本页无新作品，计数+1
              pagesWithoutNewWorks++;
              // 扫满 stopCondition 页仍无新作品，停止
              if (pagesWithoutNewWorks >= stopCondition) {
                logger.info(`扫描 ${stopCondition} 页无新增，停止扫描`);
                return;
              }
            }

            sendProgress({
              page: result.page,
              status: "processing",
              total: newChineseWorks.length,
            });
          }
        } catch (e) {
          logger.warn(`批次处理超时或失败: ${e.message}`);
        }
      }
    };

    await scanPages();

    // 合并到原有数据并写入
    if (newChineseWorks.length > 0) {
      const allChineseWorks = [...existingSet, ...newChineseWorks];
      await writeLocalizedWorksList(allChineseWorks);
      const sortedPages = Array.from(scannedPages).sort((a, b) => a - b);
      logger.info(
        `扫描完成: 新增 ${newChineseWorks.length} 个汉化作品，扫描页码: ${sortedPages.join(", ")}`,
      );
      cleanup();
      return {
        success: true,
        data: newChineseWorks,
        total: newChineseWorks.length,
        existingCount: existingSet.size,
        firstRJCode,
      };
    } else {
      // 没有新增，返回已有数据
      const existingArray = [...existingSet];
      const sortedPages = Array.from(scannedPages).sort((a, b) => a - b);
      logger.info(
        `扫描完成: 无新增，共 ${existingArray.length} 个，扫描页码: ${sortedPages.join(", ")}`,
      );
      // 即使没有新增，也要确保文件存在于正确的位置
      await writeLocalizedWorksList(existingArray);
      cleanup();
      return {
        success: true,
        data: existingArray,
        total: existingArray.length,
        existingCount: existingSet.size,
        message: "无新增内容",
      };
    }
  } catch (e) {
    logger.error("扫描失败:", e.message);
    cleanup();
    return { success: false, error: e.message };
  }
});

// 设置汉化列表TXT文件路径
ipcMain.handle("asmr-set-chinese-list-path", async (event, txtPath) => {
  try {
    logger.info(`设置汉化列表路径: "${txtPath}" (类型: ${typeof txtPath})`);
    if (!txtPath || typeof txtPath !== "string" || txtPath.trim() === "") {
      logger.warn("尝试设置空的汉化列表路径，将清除配置");
      await saveConfig({ paths: { chineseListPath: null } });
      return { success: true };
    }

    // 获取当前的默认路径，检查是否有现有文件
    const oldTxtPath = getTxtPath(); // 这会返回旧路径下的文件位置

    // 保存新路径配置
    logger.info(`准备保存 chineseListPath: "${txtPath.trim()}"`);
    const result = await saveConfig({
      paths: { chineseListPath: txtPath.trim() },
    });
    logger.info(`saveConfig 返回结果: ${result}`);

    // 计算新路径
    const newTxtPath = getTxtPath(); // 这会返回新路径下的文件位置

    // 如果存在旧文件且新旧路径不同，则复制文件
    if (fs.existsSync(oldTxtPath) && oldTxtPath !== newTxtPath) {
      try {
        // 确保新目录存在
        const newDir = pathModule.dirname(newTxtPath);
        if (!fs.existsSync(newDir)) {
          fs.mkdirSync(newDir, { recursive: true });
        }
        // 复制文件到新位置
        fs.copyFileSync(oldTxtPath, newTxtPath);
        logger.info(`已将汉化列表文件从 ${oldTxtPath} 复制到 ${newTxtPath}`);
      } catch (copyError) {
        logger.warn(`复制汉化列表文件失败: ${copyError.message}`);
        // 复制失败不影响路径设置，继续执行
      }
    }

    logger.info(`汉化列表路径设置成功: ${newTxtPath}`);
    return { success: true };
  } catch (e) {
    logger.error("设置汉化列表路径失败:", e.message);
    return { success: false, error: e.message };
  }
});

// 获取当前汉化列表路径
ipcMain.handle("asmr-get-chinese-list-path", async () => {
  const txtPath = getTxtPath();
  const config = getConfig();
  const isCustom = !!config.paths?.chineseListPath?.trim();
  return { path: txtPath, isCustom };
});

// 读取TXT文件内容
ipcMain.handle("asmr-read-chinese-list", async () => {
  const txtPath = getTxtPath();
  try {
    if (fs.existsSync(txtPath)) {
      const content = fs.readFileSync(txtPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      return { success: true, data: lines, count: lines.length };
    }
    return { success: false, error: "文件不存在" };
  } catch (e) {
    logger.error("读取汉化列表失败:", e.message);
    return { success: false, error: e.message };
  }
});

// 写入TXT文件内容
ipcMain.handle("asmr-write-chinese-list", async (event, rjCodes = []) => {
  try {
    const normalizedCodes = Array.isArray(rjCodes) ? rjCodes : [];
    await writeLocalizedWorksList(normalizedCodes);
    return { success: true, count: normalizedCodes.length };
  } catch (e) {
    logger.error("写入汉化列表失败:", e.message);
    return { success: false, error: e.message };
  }
});

// ========== RJ号筛选工具 ==========

// 从URL获取并筛选RJ号
const handleFilterRjFromUrl = async (
  event,
  { url, dateMode, beforeDate, compareFilePath },
) => {
  try {
    logger.info(`开始筛选RJ号: ${url}`);
    logger.info(`日期模式: ${dateMode}, 日期: ${beforeDate}`);
    logger.info(`比对文件: ${compareFilePath || "无"}`);

    // 解析链接类型
    const { isSearchApi, isListApi } = detectAsmrApiMode(url);

    logger.info(`isSearchApi: ${isSearchApi}, isListApi: ${isListApi}`);

    // 获取工作列表
    let works = [];

    if (isSearchApi || isListApi) {
      // 直接用 axios 获取（不使用代理）
      logger.info(`使用 HTTP 客户端（带代理）获取数据`);
      works = await fetchSearchFromPage(asmrHttpClient, url, beforeDate);
      logger.info(`获取到 ${works.length} 个作品`);
    } else {
      // 默认尝试搜索API格式
      const searchUrl = buildAsmrSearchApiUrl(url);
      logger.info(`默认搜索URL: ${searchUrl}`);
      works = await fetchSearchFromPage(asmrHttpClient, searchUrl, beforeDate);
    }

    logger.info(`总共获取到 ${works.length} 个作品`);

    // 如果没有获取到作品，返回提示
    if (works.length === 0) {
      logger.warn("未获取到任何作品，请检查URL是否正确");
      return {
        success: false,
        msg: "未获取到任何作品，请检查URL是否正确。可能是网络问题或API限制。",
      };
    }

    // 日期筛选
    if (dateMode === "after" && beforeDate) {
      logger.info(`日期筛选: 保留 ${beforeDate} 之后的作品`);
      logger.info(
        `示例作品日期: ${works
          .slice(0, 5)
          .map((w) => w.date)
          .join(", ")}`,
      );

      const beforeFilter = works.length;
      works.forEach((work) => {
        if (!work?.date) return;
        const workDate = new Date(work.date);
        if (isNaN(workDate.getTime())) {
          logger.warn(`无效日期: ${work.date}`);
        }
      });

      const { filteredWorks, filteredOut } = filterWorksByAfterDate(
        works,
        beforeDate,
      );
      works = filteredWorks;

      logger.info(
        `日期筛选后剩余 ${works.length} 个作品 (从 ${beforeFilter} 筛选)`,
      );

      if (filteredOut.length > 0) {
        logger.info(`被筛选掉的 ${filteredOut.length} 个作品日期:`);
        filteredOut.forEach((item) => {
          logger.info(`  - ${item.rj}: ${item.date}`);
        });
      }
    }

    // TXT比对筛选
    let existingRjs = new Set();
    if (compareFilePath && fs.existsSync(compareFilePath)) {
      const content = fs.readFileSync(compareFilePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      existingRjs = collectRjNumbersFromLines(lines);
      logger.info(`已读取TXT文件，包含 ${existingRjs.size} 个RJ号`);
    }

    // 筛选出不存在的RJ号（以 source_id 为主）
    const filteredWorks = works.filter(
      (work) => !existingRjs.has(getWorkComparableRjNumber(work)),
    );

    logger.info(`TXT比对后剩余 ${filteredWorks.length} 个RJ号`);

    return {
      success: true,
      data: mapWorksToRjFilterResult(filteredWorks),
      total: works.length,
      filtered: filteredWorks.length,
    };
  } catch (e) {
    logger.error("筛选RJ号失败:", e.message);
    return { success: false, msg: e.message };
  }
};

ipcMain.handle("filter-rj-from-url", handleFilterRjFromUrl);
ipcMain.handle("filter_rj_from_url", handleFilterRjFromUrl);

// 直接请求搜索API（使用代理）
async function fetchSearchFromPage(_client, url, beforeDate) {
  try {
    logger.info(`请求搜索API（使用代理）`);
    logger.info(`原始URL: ${url}`);

    const queryParam = extractSearchQueryParam(url);

    logger.info(`提取的查询参数: ${queryParam}`);

    // 构建 API 基础 URL - 正确的格式
    const baseUrl = buildAsmrSearchBaseUrl(
      queryParam,
      100,
      "https://api.asmr-200.com/api/search/",
    );

    // 先获取第一页获取总数
    const firstUrl = buildAsmrSearchPageUrl(baseUrl, 1);
    logger.info(`第一页URL: ${firstUrl}`);

    // 模拟浏览器请求头 - 更完整
    if (!asmrHttpClient) asmrHttpClient = getAsmrClient();
    const browserHeaders = getAsmrSearchBrowserHeaders({
      includeCompression: true,
    });

    let firstRes;
    try {
      firstRes = await asmrHttpClient.get(firstUrl, {
        timeout: 30000,
        headers: browserHeaders,
      });
    } catch (firstError) {
      logger.warn(`第一次请求失败: ${firstError.message}`);
      // 等待2秒后尝试不使用代理
      await new Promise((resolve) => setTimeout(resolve, 2000));
      logger.info(`尝试不使用代理...`);
      try {
        firstRes = await asmrHttpClient.get(firstUrl, {
          timeout: 30000,
          headers: browserHeaders,
          proxy: false,
        });
      } catch (secondError) {
        logger.error(`第二次请求也失败: ${secondError.message}`);
        // 返回空结果而不是抛出错误
        return [];
      }
    }

    logger.info(`第一页响应状态: ${firstRes.status}`);
    logger.info(`响应数据类型: ${typeof firstRes.data}`);

    // 打印响应数据的前 1000 个字符
    const dataStr = JSON.stringify(firstRes.data);
    logger.info(`响应数据长度: ${dataStr.length}`);
    logger.info(`响应数据前500字符: ${dataStr.substring(0, 500)}`);

    // 解析第一页数据
    let allItems = extractWorksArrayExtended(firstRes.data);
    if (allItems.length > 0) {
      logger.info(`标准字段解析成功，长度: ${allItems.length}`);
    } else {
      // 遍历所有键查找数组
      logger.info(`未找到标准数组字段，遍历响应数据...`);
      for (const key in firstRes.data) {
        const val = firstRes.data[key];
        if (Array.isArray(val)) {
          logger.info(`找到数组字段: ${key}, 长度: ${val.length}`);
          if (val.length > 0) {
            logger.info(
              `字段 ${key} 的第一个元素: ${JSON.stringify(val[0]).substring(0, 200)}`,
            );
          }
        } else if (typeof val === "object" && val !== null) {
          logger.info(`字段 ${key} 是对象`);
          for (const subKey in val) {
            if (Array.isArray(val[subKey])) {
              logger.info(
                `找到嵌套数组字段: ${key}.${subKey}, 长度: ${val[subKey].length}`,
              );
            }
          }
        }
      }
    }

    logger.info(`第一页获取 ${allItems.length} 个作品`);

    // 获取总数
    const totalCount = extractAsmrSearchTotalCount(
      firstRes.data,
      allItems.length,
    );

    logger.info(`总数: ${totalCount}`);

    // 计算总页数（每页100个）
    const totalPages = computeAsmrSearchTotalPages(totalCount, 100);
    logger.info(`总页数: ${totalPages}`);

    // 如果只有一页，直接返回
    if (totalPages <= 1) {
      return allItems.map(formatAsmrWorkData);
    }

    // 带重试的获取单页函数
    const fetchPageWithRetry = async (pageNum, maxRetries = 3) => {
      const pageUrl = buildAsmrSearchPageUrl(baseUrl, pageNum);

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const res = await asmrHttpClient.get(pageUrl, {
            timeout: 30000,
            headers: getAsmrSearchBrowserHeaders({
              includeCompression: false,
            }),
          });

          const items = extractWorksArrayExtended(res.data);

          logger.info(`第 ${pageNum}/${totalPages} 页: ${items.length} 个作品`);
          return items;
        } catch (e) {
          if (retry < maxRetries - 1) {
            const waitTime = (retry + 1) * 2000; // 重试间隔2秒起
            logger.warn(
              `第 ${pageNum} 页第 ${retry + 1} 次重试，等待 ${waitTime}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          } else {
            logger.warn(`第 ${pageNum} 页最终失败: ${e.message}`);
            return [];
          }
        }
      }
    };

    // ========== 并行二分查找优化 ==========
    let maxPageToFetch = totalPages;

    if (beforeDate && totalPages > 1) {
      const targetDate = new Date(beforeDate);
      logger.info(
        `并行二分查找: 目标日期 = ${targetDate.toISOString()}, 总页数 = ${totalPages}`,
      );

      const getOldestDateInPage = async (pageNum) => {
        const items = await fetchPageWithRetry(pageNum);
        if (!items || items.length === 0) return null;
        const lastItem = items[items.length - 1];
        const dateStr =
          lastItem.date || lastItem.release_date || lastItem.release;
        if (!dateStr) return null;
        return new Date(dateStr);
      };

      logger.info(
        `并行查找 第1轮: 并行检查第 1, ${Math.floor(totalPages / 2)}, ${totalPages} 页`,
      );

      const [date1, dateMid, dateEnd] = await Promise.all([
        getOldestDateInPage(1),
        getOldestDateInPage(Math.floor(totalPages / 2)),
        getOldestDateInPage(totalPages),
      ]);

      logger.info(`第1页最旧日期: ${date1 ? date1.toISOString() : "N/A"}`);
      logger.info(
        `第${Math.floor(totalPages / 2)}页最旧日期: ${dateMid ? dateMid.toISOString() : "N/A"}`,
      );
      logger.info(
        `第${totalPages}页最旧日期: ${dateEnd ? dateEnd.toISOString() : "N/A"}`,
      );

      let left = 1,
        right = totalPages;

      if (dateEnd && dateEnd > targetDate) {
        maxPageToFetch = totalPages;
        logger.info(`→ 最后一页符合条件，全部获取`);
      } else if (date1 && date1 <= targetDate) {
        maxPageToFetch = 0;
        logger.info(`→ 第一页已不符合，无需获取`);
      } else {
        if (dateMid && dateMid > targetDate) {
          left = Math.floor(totalPages / 2);
          logger.info(`→ 中点符合，搜索范围: ${left}-${totalPages}`);
        } else {
          right = Math.floor(totalPages / 2);
          logger.info(`→ 中点不符合，搜索范围: 1-${right}`);
        }

        let boundaryPage = right;
        let round = 1;
        while (left <= right) {
          round++;
          const mid = Math.floor((left + right) / 2);
          logger.info(`并行查找 第${round}轮: 检查 ${mid} 页`);

          const oldestDate = await getOldestDateInPage(mid);
          if (!oldestDate || isNaN(oldestDate.getTime())) {
            right = mid - 1;
            continue;
          }
          logger.info(`第 ${mid} 页最旧日期: ${oldestDate.toISOString()}`);
          if (oldestDate > targetDate) {
            boundaryPage = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }
        maxPageToFetch = boundaryPage;
      }
      logger.info(
        `并行二分查找完成: 只需获取前 ${maxPageToFetch} 页 (总共 ${totalPages} 页)`,
      );
    }
    // ========== 二分查找结束 ==========

    // 并发获取其余页面（带重试和限流）
    const pagePromises = [];

    logger.info(
      `将获取第 2-${maxPageToFetch} 页 (跳过 ${maxPageToFetch + 1}-${totalPages} 页)`,
    );

    for (let page = 2; page <= maxPageToFetch; page++) {
      pagePromises.push(fetchPageWithRetry(page));
    }

    const results = await Promise.all(pagePromises);

    // 合并所有结果
    results.forEach((items) => {
      allItems.push(...items);
    });

    logger.info(`总共获取 ${allItems.length} 个作品`);

    return allItems.map(formatAsmrWorkData);
  } catch (e) {
    logger.error(`备用方法失败: ${e.message}`);
    return [];
  }
}
