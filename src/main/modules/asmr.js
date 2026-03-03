import axios from "axios";
import pathModule from "path";
import { join } from "path";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ipcMain, app, webContents } from "electron";
import { scanForIds } from "../utils";
import {
  login_ as asmrLogin_,
  checkLoginStatus_ as checkLoginStatus_,
  logout_ as logout_,
  triggerCloudDataFetch as triggerCloudDataFetchFromLogin,
} from "../modules/asmr-login";
import { getConfig, saveConfig } from "../modules/config";
import { createLogSender } from "../utils/logger";

// 创建日志发送器
const logger = createLogSender("asmr");

// 云端作品列表缓存（全局变量）
let cloudWorksCache = [];

// 创建HTTP客户端，支持代理和直连两种模式
const createClient = () => {
  try {
    const PROXY_URL = "http://127.0.0.1:7890";
    const agent = new HttpsProxyAgent(PROXY_URL);
    logger.info("使用代理连接:", PROXY_URL);
    return axios.create({ timeout: 30000, httpsAgent: agent, proxy: false });
  } catch (e) {
    logger.error("代理设置失败，使用直连:", e.message);
    return axios.create({ timeout: 30000 });
  }
};

/**
 * 触发获取云端列表（从 asmr-login.js 导入完整实现）
 */
export async function triggerCloudDataFetch() {
  return await triggerCloudDataFetchFromLogin();
}

export function setupAsmrIPC(historyPath) {
  const client = createClient();

  // 发送带 Tag 的日志
  const sendLogToSender = (sender, msg) => {
    if (sender && !sender.isDestroyed()) {
      sender.send("log-update", { type: "asmr", msg });
    }
  };

  // 触发异步获取云端列表（登录成功后调用）
  ipcMain.handle("asmr-trigger-cloud-data-fetch", async () => {
    return await triggerCloudDataFetch();
  });

  // 获取缓存的云端列表
  ipcMain.handle("asmr-get-cached-cloud-works", async () => {
    return { success: true, data: cloudWorksCache };
  });

  // 触发云端数据获取
  ipcMain.handle("asmr-fetch-cloud-works", async () => {
    try {
      const result = await triggerCloudDataFetch();
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
        // 不需要再次调用 triggerCloudDataFetch
      } else {
        logger.warn("自动登录失败:", loginResult.msg || "未知错误");
      }
    } catch (error) {
      logger.error("自动登录错误:", error.message);
    }
  }

  // 调用自动登录
  autoLoginOnStartup();

  // 1. 加载标签库
  ipcMain.handle("load-tag-db", async () => {
    try {
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

      if (Array.isArray(tagsData)) {
        return tagsData;
      } else if (typeof tagsData === "object" && tagsData !== null) {
        return tagsData;
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
          firstRes = await client.get(firstPageUrl, {
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
                res = await client.get(url, { headers, timeout: 30000 });
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
        const playlistRes = await client.get(playlistUrl, {
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
        const deleteRes = await client.post(
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

          const res = await client.post(
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
          const res = await client.post(
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
  ipcMain.handle("asmr-delete-local-files", async (event, filePaths) => {
    const fs = await import("fs");
    const path = await import("path");
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

      // 步骤1: 获取播放列表所有作品
      logger.info("获取云端播放列表...");
      const playlistUrl = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=1&pageSize=100`;
      let playlistRes;
      try {
        playlistRes = await client.get(playlistUrl, {
          headers,
          timeout: 30000,
        });
      } catch (e) {
        logger.error("获取播放列表失败:", e.message);
        return { success: false, error: "获取播放列表失败: " + e.message };
      }

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

      logger.info(`获取到 ${allWorks.length} 个云端作品`);

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
          const deleteRes = await client.post(
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

  // 缓存文件路径
  const getCachePath = () => {
    const dataDir = app.getPath("userData");
    return path.join(dataDir, "chinese_list_cache.json");
  };

  // 防止并发访问TXT文件的锁
  let fileLock = Promise.resolve();
  // 防止并发扫描
  let scanLock = Promise.resolve();

  // TXT文件路径（支持自定义配置）
  const getTxtPath = () => {
    const config = getConfig();
    const customPath = config.paths?.chineseListPath?.trim();

    if (customPath) {
      // 使用自定义路径
      const txtPath = customPath.endsWith(".txt")
        ? customPath
        : pathModule.join(customPath, "one站汉化.txt");
      logger.debug(`使用自定义TXT路径: ${txtPath}`);
      return txtPath;
    }

    // 默认路径
    const dataDir = app.getPath("userData");
    const txtPath = pathModule.join(dataDir, "one站汉化.txt");
    logger.debug(`使用默认TXT路径: ${txtPath}`);
    return txtPath;
  };

  // 读取已有的汉化列表（带锁）
  const readExistingChineseList = async () => {
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
  const writeChineseList = async (rjCodes) => {
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

  // 判断是否为汉化作品（优化版）
  const isChineseWork = (work) => {
    // 条件1: 有字幕标记（最快判断）
    if (work.has_subtitle === true) return true;

    // 条件2: 检查语言版本
    const editions = work.language_editions;
    if (!editions || !Array.isArray(editions) || editions.length === 0)
      return false;

    // 快速检查：language_editions 存在且长度>0，且至少有一个非日语
    // 只检查 lang 字段，避免深层遍历
    for (let i = 0; i < editions.length; i++) {
      const lang = editions[i].lang;
      // CHI_HANS=简体中文, CHI_HANT=繁体中文, KO_KR=韩语, ENG=英语
      if (
        lang === "CHI_HANS" ||
        lang === "CHI_HANT" ||
        lang === "KO_KR" ||
        lang === "ENG"
      ) {
        return true;
      }
    }
    return false;
  };

  // 从页数据提取RJ号（服务器已用subtitle=1过滤）
  const extractChineseRjFromPage = (works) => {
    const rjCodes = [];
    for (let i = 0; i < works.length; i++) {
      const work = works[i];

      // 查找目标RJ号进行调试
      if (
        work.id === 1508514 ||
        work.source_id === "RJ1508514" ||
        work.source_id === "1508514"
      ) {
        logger.info(`[DEBUG] 找到目标作品 RJ1508514:`);
        logger.info(`  id: ${work.id}`);
        logger.info(`  source_id: ${work.source_id}`);
        logger.info(`  title: ${work.title}`);
        logger.info(`  has_subtitle: ${work.has_subtitle}`);
        logger.info(`  release: ${work.release}`);
        logger.info(
          `  other_language_editions_in_db: ${JSON.stringify(work.other_language_editions_in_db || [])}`,
        );
      }

      // Python逻辑：如果 other_language_editions_in_db 不为空，记录所有语种的 source_id
      const ol = work.other_language_editions_in_db;

      // 调试：查找目标RJ号
      const currentSourceId =
        work.source_id || `RJ${String(work.id).padStart(8, "0")}`;
      const currentId = String(work.id);
      if (currentSourceId === "RJ01087430" || currentId === "1087430") {
        logger.info(`[DEBUG] 找到 RJ01087430:`);
        logger.info(`  source_id: ${work.source_id}`);
        logger.info(`  id: ${work.id}`);
        logger.info(`  has_subtitle: ${work.has_subtitle}`);
        logger.info(
          `  other_language_editions_in_db: ${JSON.stringify(ol || [])}`,
        );
        // 检查是否有其他作品引用了这个 RJ 号
        if (ol && ol.length > 0) {
          logger.info(`  该作品包含其他语种版本`);
        }
      }
      // 检查 other_language_editions_in_db 中是否包含 RJ01087430
      if (ol && ol.length > 0) {
        for (const edition of ol) {
          if (
            edition.source_id === "RJ01087430" ||
            String(edition.id) === "1087430"
          ) {
            logger.info(`[DEBUG] 在其他作品的其他语言版本中找到 RJ01087430`);
            logger.info(`  当前作品 source_id: ${work.source_id}`);
            logger.info(`  当前作品 id: ${work.id}`);
            logger.info(`  当前作品 has_subtitle: ${work.has_subtitle}`);
          }
        }
      }

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

  // 在页数据中查找RJ号的位置
  const findRjPositionInPage = (works, targetRjCode) => {
    for (let i = 0; i < works.length; i++) {
      const work = works[i];
      const rjCode = work.source_id || `RJ${String(work.id).padStart(8, "0")}`;
      if (rjCode.toUpperCase() === targetRjCode.toUpperCase()) {
        return i; // 返回在该页的位置
      }
    }
    return -1;
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
    } catch (e) {
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
      const res = await client.get(url, { headers, timeout: 30000 });
      return res.data?.works || [];
    };

    // 获取第1页及分页信息
    const fetchFirstPageWithInfo = async () => {
      const url = `https://api.asmr-200.com/api/works?order=create_date&sort=desc&page=1&pageSize=100&subtitle=1`;
      const res = await client.get(url, { headers, timeout: 30000 });
      return {
        works: res.data?.works || [],
        totalCount: res.data?.pagination?.totalCount || 0,
      };
    };

    try {
      // 读取已有的汉化列表
      const existingSet = await readExistingChineseList();
      logger.info(`已有 ${existingSet.size} 个汉化作品记录`);

      // 先获取第1页，检查是否有新增
      const { works: firstPageWorks, totalCount } =
        await fetchFirstPageWithInfo();
      const maxPages = Math.ceil(totalCount / 100) + 2;
      const maxConcurrency = 20;
      logger.info(
        `总作品数 ${totalCount}，需扫描约 ${maxPages} 页，并发数 ${maxConcurrency}`,
      );

      let newChineseWorks = [];
      let firstRjCode = null;

      // 检查第1页是否有新增
      const firstPageRjCodes = extractChineseRjFromPage(firstPageWorks);
      const firstPageNewCodes = firstPageRjCodes.filter(
        (rj) => !existingSet.has(rj),
      );

      // 第1页有新增，收集新增并继续扫描
      if (firstPageNewCodes.length > 0) {
        newChineseWorks.push(...firstPageNewCodes);
        firstRjCode = firstPageNewCodes[0];
      }

      // 扫描方向：全部前往后
      const forward = true;
      const startPage = 2;
      const endPage = maxPages;
      const step = 1;

      // 全部从前往后扫描，使用增量扫描逻辑（连续5页无新增则停止）

      const scanPages = async () => {
        logger.info(
          `扫描方向: ${forward ? "前往后（全量）" : "后往前（增量）"}`,
        );

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

        // 最后5页必须扫完（页1-5）
        const forceScanPages = new Set([1, 2, 3, 4, 5]);

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
            results.sort((a, b) =>
              forward ? a.page - b.page : b.page - a.page,
            );

            // 按顺序处理每一页（增量扫描逻辑，连续5页无新增则停止）
            for (const result of results) {
              const rjCodes = extractChineseRjFromPage(result.works || []);
              const newInThisPage = rjCodes.filter(
                (rj) => !existingSet.has(rj),
              );

              if (newInThisPage.length > 0) {
                // 找到新作品，收集并重置计数
                pagesWithoutNewWorks = 0;
                for (const rj of rjCodes) {
                  if (!existingSet.has(rj)) {
                    newChineseWorks.push(rj);
                    if (!firstRjCode) firstRjCode = rj;
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
        await writeChineseList(allChineseWorks);
        logger.info(`扫描完成: 新增 ${newChineseWorks.length} 个汉化作品`);
        cleanup();
        return {
          success: true,
          data: newChineseWorks,
          total: newChineseWorks.length,
          existingCount: existingSet.size,
          firstRjCode,
        };
      } else {
        // 没有新增，返回已有数据
        const existingArray = [...existingSet];
        logger.info(`扫描完成: 无新增，共 ${existingArray.length} 个`);
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
      logger.info(`设置汉化列表路径: ${txtPath}`);
      await saveConfig({ paths: { chineseListPath: txtPath } });
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
    "filter_rj_from_url",
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
          logger.info(`使用 axios 直接获取数据`);
          works = await fetchSearchFromPage(client, url);
          logger.info(`获取到 ${works.length} 个作品`);
        } else {
          // 默认尝试搜索API格式
          const searchUrl = url.includes("/api/search/")
            ? url
            : `https://api.asmr-200.com/api/search/${encodeURIComponent(url)}`;
          logger.info(`默认搜索URL: ${searchUrl}`);
          works = await fetchSearchFromPage(client, searchUrl);
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

  // 辅助函数：获取搜索结果总数
  async function getSearchTotal(client, url) {
    try {
      // 先请求一次获取总数
      const testUrl = url.includes("?")
        ? `${url}&pageSize=1`
        : `${url}?pageSize=1`;
      const res = await client.get(testUrl, { timeout: 10000 });

      if (res.data.pagination?.totalCount) {
        return res.data.pagination.totalCount;
      }
      if (res.data.total) {
        return res.data.total;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // 辅助函数：获取搜索结果总数（备用方法）
  async function getSearchTotalFromContent(client, url) {
    try {
      const { default: axios } = await import("axios");
      const res = await axios.get(url, { timeout: 10000 });

      // 尝试各种可能的响应格式
      if (res.data?.works?.length > 0) return res.data.works.length;
      if (res.data?.data?.length > 0) return res.data.data.length;
      if (res.data?.items?.length > 0) return res.data.items.length;
      if (res.data?.list?.length > 0) return res.data.list.length;
      if (Array.isArray(res.data)) return res.data.length;

      return 0;
    } catch (e) {
      return 0;
    }
  }

  // 辅助函数：并发获取所有搜索结果
  async function fetchAllSearchResults(client, baseUrl) {
    const works = [];
    let totalCount = 0;
    const pageSize = 30;

    try {
      // 先获取第一页和总数
      const firstUrl = baseUrl.includes("?")
        ? `${baseUrl}&page=1&pageSize=${pageSize}`
        : `${baseUrl}?page=1&pageSize=${pageSize}`;

      const firstRes = await client.get(firstUrl, { timeout: 30000 });

      logger.info(`第一页响应状态: ${firstRes.status}`);
      logger.info(`响应数据类型: ${typeof firstRes.data}`);
      logger.info(
        `响应数据: ${JSON.stringify(firstRes.data).substring(0, 500)}`,
      );

      // 解析第一页数据
      let items = [];
      if (Array.isArray(firstRes.data)) {
        items = firstRes.data;
        logger.info(`数据是数组，长度: ${items.length}`);
      } else if (firstRes.data.works) {
        items = firstRes.data.works;
        logger.info(`数据在 works 中，长度: ${items.length}`);
      } else if (firstRes.data.data) {
        items = firstRes.data.data;
        logger.info(`数据在 data 中，长度: ${items.length}`);
      } else if (firstRes.data.items) {
        items = firstRes.data.items;
        logger.info(`数据在 items 中，长度: ${items.length}`);
      } else if (firstRes.data.list) {
        items = firstRes.data.list;
        logger.info(`数据在 list 中，长度: ${items.length}`);
      } else {
        // 尝试查找任何包含数组的字段
        logger.info(`未知响应结构，尝试查找数组字段`);
        for (const key in firstRes.data) {
          if (Array.isArray(firstRes.data[key])) {
            logger.info(
              `找到数组字段: ${key}, 长度: ${firstRes.data[key].length}`,
            );
          }
        }
      }

      // 获取总数
      if (firstRes.data.pagination?.totalCount) {
        totalCount = firstRes.data.pagination.totalCount;
      } else if (firstRes.data.total) {
        totalCount = firstRes.data.total;
      }

      if (items.length === 0) {
        // 没有获取到数据，抛出异常触发备用方法
        throw new Error("未获取到搜索结果数据");
      }

      works.push(...items.map(formatWorkData));

      // 计算总页数
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1;

      // 如果只有一页，直接返回
      if (totalPages <= 1) {
        return works;
      }

      logger.info(`搜索共 ${totalCount} 条结果，${totalPages} 页`);

      // 并发获取其余页面
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        const pageUrl = baseUrl.includes("?")
          ? `${baseUrl}&page=${page}&pageSize=${pageSize}`
          : `${baseUrl}?page=${page}&pageSize=${pageSize}`;

        pagePromises.push(
          client
            .get(pageUrl, { timeout: 30000 })
            .then((res) => {
              let pageItems = [];
              if (Array.isArray(res.data)) {
                pageItems = res.data;
              } else if (res.data.works) {
                pageItems = res.data.works;
              } else if (res.data.data) {
                pageItems = res.data.data;
              } else if (res.data.items) {
                pageItems = res.data.items;
              } else if (res.data.list) {
                pageItems = res.data.list;
              }
              return pageItems;
            })
            .catch((e) => {
              logger.warn(`获取第 ${page} 页失败: ${e.message}`);
              return [];
            }),
        );
      }

      const allResults = await Promise.all(pagePromises);

      allResults.forEach((pageItems) => {
        works.push(...pageItems.map(formatWorkData));
      });

      return works;
    } catch (e) {
      logger.error("获取搜索结果失败:", e.message);
      // 抛出异常触发备用方法
      throw e;
    }
  }

  // 辅助函数：并发获取列表所有作品
  async function fetchAllListWorks(client, url) {
    const works = [];

    try {
      const res = await client.get(url, { timeout: 30000 });

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
      }

      works.push(...items.map(formatWorkData));
      return works;
    } catch (e) {
      logger.error("获取列表作品失败:", e.message);
      return [];
    }
  }

  // 备用方法：直接用 axios 获取搜索结果（绕过代理问题）
  async function fetchSearchFromPage(client, url) {
    try {
      logger.info(`备用方法: 直接请求搜索API`);
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
        } catch (e) {
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
        } catch (e) {
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
      const axios = (await import("axios")).default;
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
        firstRes = await axios.get(firstUrl, {
          timeout: 30000,
          headers: browserHeaders,
        });
      } catch (firstError) {
        logger.warn(`第一次请求失败: ${firstError.message}`);
        // 尝试不使用代理
        logger.info(`尝试不使用代理...`);
        try {
          firstRes = await axios.get(firstUrl, {
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
            const res = await axios.get(pageUrl, {
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

            logger.info(
              `第 ${pageNum}/${totalPages} 页: ${items.length} 个作品`,
            );
            return items;
          } catch (e) {
            if (retry < maxRetries - 1) {
              const waitTime = (retry + 1) * 1000;
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
        return [];
      };

      // 并发获取其余页面（带重试）
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(fetchPageWithRetry(page));
      }

      const results = await Promise.all(pagePromises);

      // 合并所有结果
      results.forEach((items) => {
        allItems.push(...items);
      });

      logger.info(`总共获取 ${allItems.length} 个作品`);
      return allItems.map(formatWorkData);
    } catch (e) {
      logger.error(`备用方法失败: ${e.message}`);
      return [];
    }
  }

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
}
