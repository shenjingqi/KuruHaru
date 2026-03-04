import pathModule from "path";
import { join } from "path";
import fs from "fs";
import { ipcMain, app, webContents } from "electron";
import { scanForIds } from "../utils";
import {
  login_ as asmrLogin_,
  checkLoginStatus_,
  logout_,
  triggerCloudDataFetch as syncCloudWorksDataFromLogin,
} from "../modules/asmr-login";
import { getConfig, saveConfig } from "../modules/config";
import { createLogSender } from "../utils/logger";
import { getAsmrClient } from "./httpClient";

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

        let firstRes;
        try {
          firstRes = await asmrHttpClient.get(firstPageUrl, {
            headers,
            timeout: 30000,
          });
        } catch (error) {
          console.error("[ASMR] 获取第一页失败:", error.message);
          sendLogToSender(event.sender, `❌ 获取第一页失败: ${error.message}`);
          return { success: false, msg: error.message };
        }

        console.log(`[ASMR] 第一页响应状态: ${firstRes.status}`);

        let items = [];
        if (Array.isArray(firstRes.data)) {
          items = firstRes.data;
        } else if (firstRes.data.works && Array.isArray(firstRes.data.works)) {
          items = firstRes.data.works;
        } else if (firstRes.data.data && Array.isArray(firstRes.data.data)) {
          items = firstRes.data.data;
        } else if (firstRes.data.items && Array.isArray(firstRes.data.items)) {
          items = firstRes.data.items;
        } else if (firstRes.data.list && Array.isArray(firstRes.data.list)) {
          items = firstRes.data.list;
        }

        if (items.length === 0) {
          sendLogToSender(event.sender, `⚠️ 第一页没有数据`);
          return { success: true, data: [] };
        }

        if (firstRes.data.pagination) {
          const pagination = firstRes.data.pagination;
          totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);
          console.log(
            `[ASMR] 总页数: ${totalPages}，总作品数: ${pagination.totalCount}`,
          );
          sendLogToSender(
            event.sender,
            `📊 总页数: ${totalPages}，总作品数: ${pagination.totalCount}`,
          );
        } else {
          return {
            success: true,
            data: items.map((item) => ({
              id: String(item.id),
              source_id: item.source_id,
              title: item.title,
              tags: item.tags || [],
            })),
          };
        }

        console.log(
          `[ASMR] ========== 开始并发获取第2-${totalPages}页（带重试）=========`,
        );
        sendLogToSender(
          event.sender,
          `⚡ 正在并发获取第 2-${totalPages} 页（共 ${totalPages - 1} 页，每页自动重试3次）...`,
        );

        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
          const url = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=${page}&pageSize=${pageSize}`;

          const fetchWithRetry = async (pageNum) => {
            let retryCount = 0;
            const maxRetries = 3;
            let res;

            while (retryCount < maxRetries) {
              try {
                res = await asmrHttpClient.get(url, {
                  headers,
                  timeout: 30000,
                });
                break;
              } catch (error) {
                retryCount++;
                if (retryCount >= maxRetries) {
                  console.error(
                    `[ASMR] 第 ${pageNum} 页第 ${maxRetries} 次重试后仍失败:`,
                    error.message,
                  );
                  return { pageNum, error: true, errorMsg: error.message };
                }
                console.log(
                  `[ASMR] 第 ${pageNum} 页第 ${retryCount} 次重试...`,
                );
                sendLogToSender(
                  event.sender,
                  `⚠️ 第 ${pageNum} 页第 ${retryCount} 次重试...`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * retryCount),
                );
              }
            }

            return { pageNum, res };
          };

          pagePromises.push(fetchWithRetry(page));
        }

        const results = await Promise.all(pagePromises);

        console.log(
          `[ASMR] 所有请求完成，成功: ${results.filter((r) => !r.error).length}/${results.length}`,
        );

        let successCount = 0;
        let failCount = 0;
        results.forEach((result) => {
          const page = result.pageNum;

          if (result.error) {
            failCount++;
            sendLogToSender(
              event.sender,
              `❌ 第 ${page} 页获取失败（${result.errorMsg || "未知错误"}）`,
            );
            return;
          }

          successCount++;
          const res = result.res;

          let pageItems = [];
          if (Array.isArray(res.data)) {
            pageItems = res.data;
          } else if (res.data.works && Array.isArray(res.data.works)) {
            pageItems = res.data.works;
          } else if (res.data.data && Array.isArray(res.data.data)) {
            pageItems = res.data.data;
          } else if (res.data.items && Array.isArray(res.data.items)) {
            pageItems = res.data.items;
          } else if (res.data.list && Array.isArray(res.data.list)) {
            pageItems = res.data.list;
          }

          console.log(`[ASMR] 第 ${page} 页获取到 ${pageItems.length} 个作品`);
          sendLogToSender(
            event.sender,
            `📄 第 ${page}/${totalPages} 页：获取到 ${pageItems.length} 个作品`,
          );

          works.push(
            ...pageItems.map((item) => ({
              id: String(item.id),
              source_id: item.source_id,
              title: item.title,
              tags: item.tags || [],
            })),
          );
        });

        works.unshift(
          ...items.map((item) => ({
            id: String(item.id),
            source_id: item.source_id,
            title: item.title,
            tags: item.tags || [],
          })),
        );

        sendLogToSender(
          event.sender,
          `✅ 并发获取完成！成功: ${successCount}，失败: ${failCount}，共 ${works.length} 个作品`,
        );

        return { success: true, data: works };
      } catch (e) {
        console.error("[ASMR] 获取播放列表失败:", e.message);
        if (e.response) {
          console.error("[ASMR] 响应状态:", e.response.status);
          console.error("[ASMR] 响应数据:", e.response.data);
          sendLogToSender(
            event.sender,
            `❌ 获取播放列表失败: HTTP ${e.response.status}`,
          );
          return {
            success: false,
            msg: `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`,
          };
        }
        sendLogToSender(event.sender, `❌ 获取播放列表失败: ${e.message}`);
        return { success: false, msg: e.message };
      }
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
        let allWorks = [];
        if (Array.isArray(playlistRes.data)) {
          allWorks = playlistRes.data;
        } else if (
          playlistRes.data.works &&
          Array.isArray(playlistRes.data.works)
        ) {
          allWorks = playlistRes.data.works;
        } else if (
          playlistRes.data.data &&
          Array.isArray(playlistRes.data.data)
        ) {
          allWorks = playlistRes.data.data;
        }

        console.log("[ASMR] 获取到作品数:", allWorks.length);

        // 匹配 RJ 号到 workId
        const matchedWorkIds = [];
        const notFoundRJ = [];
        for (const rjCode of rjCodes) {
          const matched = allWorks.find(
            (work) => work.source_id === rjCode || String(work.id) === rjCode,
          );
          if (matched) {
            matchedWorkIds.push(String(matched.id));
          } else {
            notFoundRJ.push(rjCode);
          }
        }

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
        let pageWorks = [];
        if (Array.isArray(playlistRes.data)) {
          pageWorks = playlistRes.data;
        } else if (
          playlistRes.data.works &&
          Array.isArray(playlistRes.data.works)
        ) {
          pageWorks = playlistRes.data.works;
        } else if (
          playlistRes.data.data &&
          Array.isArray(playlistRes.data.data)
        ) {
          pageWorks = playlistRes.data.data;
        }

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
      const rjCodeSet = new Set(rjCodes.map((c) => c.toUpperCase()));
      const matchedWorkIds = [];
      const notFoundRJ = [];

      for (const work of allWorks) {
        const workRJ = work.source_id || String(work.id);
        if (rjCodeSet.has(workRJ.toUpperCase())) {
          matchedWorkIds.push(String(work.id));
        }
      }

      // 找出未匹配的 RJ 号
      for (const rj of rjCodes) {
        const found = allWorks.some(
          (w) =>
            (w.source_id && w.source_id.toUpperCase() === rj.toUpperCase()) ||
            String(w.id) === rj,
        );
        if (!found) {
          notFoundRJ.push(rj);
        }
      }

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
    try {
      if (fs.existsSync(txtPath)) {
        const content = fs.readFileSync(txtPath, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim());
        return new Set(lines);
      }
    } catch (e) {
      logger.error(`读取汉化列表失败: ${e.message}`);
    }
    return new Set();
  });
};

// 写入汉化列表到TXT（带锁）
const writeLocalizedWorksList = async (rjCodes) => {
  const txtPath = getTxtPath();
  return fileLock.then(async () => {
    try {
      if (!rjCodes || rjCodes.length === 0) return;
      // 确保目录存在
      const dataDir = pathModule.dirname(txtPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      // 去重并排序
      const uniqueCodes = [...new Set(rjCodes)].sort();
      fs.writeFileSync(txtPath, uniqueCodes.join("\n"), "utf-8");
      logger.info(`已写入汉化列表: ${uniqueCodes.length} 个RJ号`);
    } catch (e) {
      logger.error(`写入汉化列表失败: ${e.message}`);
      logger.error(`Error name: ${e.name}, code: ${e.code}`);
      logger.error(`Stack: ${e.stack}`);
    }
  });
};

// 从页数据提取RJ号（服务器已用subtitle=1过滤）
const extractLocalizedRjCodesFromPage = (works) => {
  const rjCodes = [];
  for (let i = 0; i < works.length; i++) {
    const work = works[i];

    // Python逻辑：如果 other_language_editions_in_db 不为空，记录所有语种的 source_id
    const ol = work.other_language_editions_in_db;

    if (ol && Array.isArray(ol) && ol.length > 0) {
      // 先保存作品本身的 source_id
      const sourceId =
        work.source_id || `RJ${String(work.id).padStart(8, "0")}`;
      rjCodes.push(sourceId);
      // 再保存所有语种的 source_id
      for (let j = 0; j < ol.length; j++) {
        if (ol[j].source_id) {
          rjCodes.push(ol[j].source_id);
        }
      }
    } else {
      // 取整个作品的 source_id
      const sourceId =
        work.source_id || `RJ${String(work.id).padStart(8, "0")}`;
      rjCodes.push(sourceId);
    }
  }
  return rjCodes;
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
    return res.data?.works || [];
  };

  // 获取第1页及分页信息
  const fetchFirstPageWithInfo = async () => {
    const url = `https://api.asmr-200.com/api/works?order=create_date&sort=desc&page=1&pageSize=100&subtitle=1`;
    const res = await asmrHttpClient.get(url, { headers, timeout: 30000 });
    return {
      works: res.data?.works || [],
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

// ========== RJ号筛选工具 ==========

// 从URL获取并筛选RJ号
ipcMain.handle(
  "filter-rj-from-url",
  async (event, { url, dateMode, beforeDate, compareFilePath }) => {
    try {
      logger.info(`开始筛选RJ号: ${url}`);
      logger.info(`日期模式: ${dateMode}, 日期: ${beforeDate}`);
      logger.info(`比对文件: ${compareFilePath || "无"}`);

      // 解析链接类型
      let isSearchApi = url.includes("/api/search/");
      let isListApi =
        url.includes("/api/playlist/") || url.includes("/api/works/");

      logger.info(`isSearchApi: ${isSearchApi}, isListApi: ${isListApi}`);

      if (!isSearchApi && !isListApi) {
        // 尝试直接作为网页链接处理
        isSearchApi =
          url.includes("asmr-200.com/search") ||
          url.includes("asmr-200.com/api/search");
        logger.info(`二次检查后 isSearchApi: ${isSearchApi}`);
      }

      // 获取工作列表
      let works = [];

      if (isSearchApi || isListApi) {
        // 直接用 axios 获取（不使用代理）
        logger.info(`使用 HTTP 客户端（带代理）获取数据`);
        works = await fetchSearchFromPage(asmrHttpClient, url, beforeDate);
        logger.info(`获取到 ${works.length} 个作品`);
      } else {
        // 默认尝试搜索API格式
        const searchUrl = url.includes("/api/search/")
          ? url
          : `https://api.asmr-200.com/api/search/${encodeURIComponent(url)}`;
        logger.info(`默认搜索URL: ${searchUrl}`);
        works = await fetchSearchFromPage(
          asmrHttpClient,
          searchUrl,
          beforeDate,
        );
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
        const after = new Date(beforeDate);
        logger.info(`日期筛选: 保留 ${beforeDate} 之后的作品`);
        logger.info(
          `示例作品日期: ${works
            .slice(0, 5)
            .map((w) => w.date)
            .join(", ")}`,
        );

        let beforeFilter = works.length;
        const filteredOut = [];

        works = works.filter((work) => {
          if (!work.date) return true;
          const workDate = new Date(work.date);
          if (isNaN(workDate.getTime())) {
            logger.warn(`无效日期: ${work.date}`);
            return true;
          }
          const keep = workDate > after;
          if (!keep) {
            filteredOut.push({ rj: work.rj_code, date: work.date });
          }
          return keep;
        });

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
        lines.forEach((line) => {
          // 提取RJ号（可能格式: RJ123456, rj123456, 123456）
          const match = line.match(/RJ?(\d+)/i);
          if (match) {
            existingRjs.add(match[1]);
          } else if (/^\d+$/.test(line.trim())) {
            existingRjs.add(line.trim());
          }
        });
        logger.info(`已读取TXT文件，包含 ${existingRjs.size} 个RJ号`);
      }

      // 筛选出不存在的RJ号（以 source_id 为主）
      const filteredWorks = works.filter((work) => {
        const rjNum =
          work.rj_number ||
          work.rj_code ||
          work.id?.replace("RJ", "") ||
          work.id;
        return !existingRjs.has(rjNum);
      });

      logger.info(`TXT比对后剩余 ${filteredWorks.length} 个RJ号`);

      return {
        success: true,
        data: filteredWorks.map((w) => ({
          rj_code: w.rj_code || w.id,
          title: w.title,
          date: w.date || w.release,
        })),
        total: works.length,
        filtered: filteredWorks.length,
      };
    } catch (e) {
      logger.error("筛选RJ号失败:", e.message);
      return { success: false, msg: e.message };
    }
  },
);

// 直接请求搜索API（使用代理）
async function fetchSearchFromPage(_client, url, beforeDate) {
  try {
    logger.info(`请求搜索API（使用代理）`);
    logger.info(`原始URL: ${url}`);

    // 提取查询参数
    let queryParam = "";
    if (url.includes("/api/search/")) {
      queryParam = url.split("/api/search/")[1] || "";
      // 移除已有的查询参数
      const queryIndex = queryParam.indexOf("?");
      if (queryIndex > -1) {
        queryParam = queryParam.substring(0, queryIndex);
      }
      try {
        queryParam = decodeURIComponent(queryParam);
      } catch {
        // 忽略解码错误
      }
    } else {
      // 如果是完整URL，提取搜索关键词
      try {
        const urlObj = new URL(url);
        queryParam =
          urlObj.searchParams.get("keyword") ||
          urlObj.searchParams.get("q") ||
          url;
      } catch {
        queryParam = url;
      }
    }

    logger.info(`提取的查询参数: ${queryParam}`);

    // 构建 API 基础 URL - 正确的格式
    const baseUrl = `https://api.asmr-200.com/api/search/${encodeURIComponent(queryParam)}?order=create_date&sort=desc&pageSize=100`;

    // 先获取第一页获取总数
    const firstUrl = `${baseUrl}&page=1`;
    logger.info(`第一页URL: ${firstUrl}`);

    // 模拟浏览器请求头 - 更完整
    if (!asmrHttpClient) asmrHttpClient = getAsmrClient();
    const browserHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      Referer: "https://asmr-200.com/",
      Origin: "https://asmr-200.com",
    };

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
    let allItems = [];
    if (Array.isArray(firstRes.data)) {
      allItems = firstRes.data;
      logger.info(`数据是数组，长度: ${allItems.length}`);
    } else if (firstRes.data.works) {
      allItems = firstRes.data.works;
      logger.info(`数据在 works 中，长度: ${allItems.length}`);
    } else if (firstRes.data.data) {
      allItems = firstRes.data.data;
      logger.info(`数据在 data 中，长度: ${allItems.length}`);
    } else if (firstRes.data.items) {
      allItems = firstRes.data.items;
      logger.info(`数据在 items 中，长度: ${allItems.length}`);
    } else if (firstRes.data.list) {
      allItems = firstRes.data.list;
      logger.info(`数据在 list 中，长度: ${allItems.length}`);
    } else if (firstRes.data.pagination?.works) {
      allItems = firstRes.data.pagination.works;
      logger.info(`数据在 pagination.works 中，长度: ${allItems.length}`);
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
    let totalCount = 0;
    if (firstRes.data.pagination?.totalCount) {
      totalCount = firstRes.data.pagination.totalCount;
    } else if (firstRes.data.total) {
      totalCount = firstRes.data.total;
    } else if (firstRes.data.total_count) {
      totalCount = firstRes.data.total_count;
    }

    if (totalCount === 0) {
      totalCount = allItems.length;
    }

    logger.info(`总数: ${totalCount}`);

    // 计算总页数（每页100个）
    const pageSize = 100;
    const totalPages = Math.ceil(totalCount / pageSize);
    logger.info(`总页数: ${totalPages}`);

    // 如果只有一页，直接返回
    if (totalPages <= 1) {
      return allItems.map(formatWorkData);
    }

    // 带重试的获取单页函数
    const fetchPageWithRetry = async (pageNum, maxRetries = 3) => {
      const pageUrl = `${baseUrl}&page=${pageNum}`;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          const res = await asmrHttpClient.get(pageUrl, {
            timeout: 30000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json, text/plain, */*",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
              Origin: "https://asmr-200.com",
              Referer: "https://asmr-200.com/",
            },
          });

          let items = [];
          if (Array.isArray(res.data)) {
            items = res.data;
          } else if (res.data.works) {
            items = res.data.works;
          } else if (res.data.data) {
            items = res.data.data;
          } else if (res.data.items) {
            items = res.data.items;
          } else if (res.data.list) {
            items = res.data.list;
          } else if (res.data.pagination?.works) {
            items = res.data.pagination.works;
          }

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

    // 格式化作品数据
    function formatWorkData(item) {
      // source_id 是主要的RJ号标识
      const rjCode =
        item.source_id ||
        item.rj_code ||
        item.id ||
        item.work_id ||
        item.rj ||
        "";
      const title = item.title || item.work_title || item.name || "未知标题";
      // API返回的日期字段是 release
      const date =
        item.date ||
        item.release_date ||
        item.release ||
        item.created_at ||
        item.publish_date ||
        "";

      // 提取纯RJ号（确保是字符串）
      let rjNum = "";
      if (typeof rjCode === "string") {
        rjNum = rjCode.replace(/^RJ?/i, "");
      } else if (rjCode) {
        rjNum = String(rjCode).replace(/^RJ?/i, "");
      }

      return {
        rj_code:
          typeof rjCode === "string" ? rjCode : rjCode ? String(rjCode) : "",
        rj_number: rjNum,
        title: typeof title === "string" ? title : "未知标题",
        date: typeof date === "string" ? date : "",
      };
    }

    return allItems.map(formatWorkData);
  } catch (e) {
    logger.error(`备用方法失败: ${e.message}`);
    return [];
  }
}
