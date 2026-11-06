/**
 * Telegram 历史文件处理模块 - 最终修复版 (v2.0)
 * * 功能亮点：
 * 1. 增量扫描：仅获取本地最新ID之后的消息，极速响应。
 * 2. 自动熔断：检测到 >150MB 的文件视为"新整合包"，自动重置计数列表。
 * 3. 冷启动回溯：若本地无缓存，自动倒序回溯查找最近的基准点。
 * 4. 稳定性：修复了下载连接、Entity解析和空指针异常。
 */

import { ipcMain, app } from "electron";
import fs from "fs";
import path from "path";
import { getConfig, getDataDir } from "./config"; // 确保 config 模块路径正确
import {
  createAnchorFromMessage,
  formatFile,
  getFileName,
  getMessageDocument,
  isReferenceFile,
  isValidRJFile,
  removeDuplicates,
} from "./tg-recent-activity-core/message-files";
import { parseRjListFromContent } from "./tg-recent-activity-core/rj-list-parser";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity";
import {
  normalizeBatchDownloadPayload,
  summarizeBatchDownloadResults,
} from "./tg-recent-activity-core/download-batch";

// ==========================================
// 全局配置与状态
// ==========================================

import { createLogSender } from "../utils/logger";

// 日志工具
const logger = createLogSender("tg-recent-activity");

let telegramClient = null;

// 缓存：对话列表 (避免重复获取 dialogs)
let cachedDialogs = null;
let cachedDialogsTime = 0;
const DIALOGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
const TELEGRAM_REQUEST_TIMEOUT_MS = 60 * 1000;
const DEFAULT_SCAN_TIMEOUT_MS = 5 * 60 * 1000;
let scanPromise = null;
let telegramClientGeneration = 0;

// ==========================================
// 核心工具函数
// ==========================================

/**
 * 核心修复：解析 Entity (群组/频道对象)
 * 解决 CHAT_ID_INVALID 的关键：如果直接用 ID 失败，就拉取列表刷新缓存
 * 优化：添加对话列表缓存，减少重复 API 调用
 */
async function resolveEntity(client, chatIdInput, options = {}) {
  const activeClient = client || telegramClient;
  const peerId = normalizePeerEntityInput(chatIdInput);
  const configuredTimeoutMs = Number(options.timeoutMs);
  const getRequestTimeoutMs = () =>
    Math.max(
      1,
      Math.min(
        TELEGRAM_REQUEST_TIMEOUT_MS,
        options.deadline
          ? getRemainingScanTime(options.deadline)
          : configuredTimeoutMs || TELEGRAM_REQUEST_TIMEOUT_MS,
      ),
    );

  const logResolvedEntity = (entity, source) => {
    const entityId =
      entity?.id ?? entity?.channelId ?? entity?.chatId ?? entity?.userId;
    logger.info(
      `[resolveEntity] ${source} 输入=${chatIdInput} => class=${entity?.className || "unknown"}, id=${entityId || "unknown"}, title=${entity?.title || "-"}, username=${entity?.username || "-"}`,
    );
  };

  // 2. 尝试直接获取 (利用 GramJS 本地缓存)
  try {
    const entity = await withTelegramRequestTimeout(
      activeClient.getEntity(peerId),
      "Telegram 实体解析",
      getRequestTimeoutMs(),
    );
    logResolvedEntity(entity, "直接命中");
    return entity;
  } catch {
    logger.warn(`本地缓存未找到 ID ${chatIdInput}，正在刷新对话列表...`);
  }

  // 3. 检查缓存是否有效
  const now = Date.now();
  const isCacheValid =
    cachedDialogs && now - cachedDialogsTime < DIALOGS_CACHE_TTL;

  // 4. 刷新对话列表 (使用缓存或获取新的)
  try {
    if (!isCacheValid) {
      logger.debug("[resolveEntity] 刷新对话列表缓存");
      await withTelegramRequestTimeout(
        activeClient.getDialogs({ limit: 100 }),
        "Telegram 对话列表刷新",
        getRequestTimeoutMs(),
      );
      cachedDialogs = true;
      cachedDialogsTime = now;
    } else {
      logger.debug("[resolveEntity] 使用缓存的对话列表");
    }
    const entity = await withTelegramRequestTimeout(
      activeClient.getEntity(peerId),
      "Telegram 实体解析",
      getRequestTimeoutMs(),
    );
    logResolvedEntity(entity, "刷新后命中");
    return entity;
  } catch (e) {
    logger.error(`无法解析群组 ID: ${chatIdInput}`, e.message);
    if (e?.code === "ETIMEDOUT") throw e;
    throw new Error(
      `无法找到群组/频道 (ID: ${chatIdInput})。请确保机器人已加入该群组且配置正确。`,
    );
  }
}

async function withTelegramRequestTimeout(
  request,
  operation,
  timeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS,
) {
  let timeoutId = null;

  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(
            `${operation} 超时（${Math.round(timeoutMs / 1000)} 秒）`,
          );
          error.code = "ETIMEDOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resetTelegramClientAfterTimeout() {
  // The Telegram client is owned by telegram-login and shared by all domains.
  telegramClientGeneration += 1;
  telegramClient = null;
  cachedDialogs = null;
  cachedDialogsTime = 0;
  try {
    const { disconnectTelegram } = await import("../utils/telegram-login");
    await disconnectTelegram("recent-history-timeout");
  } catch (error) {
    logger.warn("超时后清理 Telegram 客户端失败", error?.message || error);
  }
}

function getScanDeadline(options = {}) {
  const configuredTimeout = Number(options.timeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_SCAN_TIMEOUT_MS;
  return Date.now() + timeoutMs;
}

function getRemainingScanTime(deadline) {
  return Math.max(1, deadline - Date.now());
}

function assertScanDeadline(deadline, operation) {
  if (Date.now() >= deadline) {
    const error = new Error(
      `${operation} 超时（${Math.round(DEFAULT_SCAN_TIMEOUT_MS / 1000)} 秒）`,
    );
    error.code = "ETIMEDOUT";
    throw error;
  }
}

/**
 * 获取连接的客户端 (单例模式，防止重复连接)
 */
async function getConnectedClient() {
  const generation = telegramClientGeneration;
  const { requireConnectedTelegramClient } = await import(
    "../utils/telegram-login"
  );
  const connectedClient = await requireConnectedTelegramClient();
  if (generation !== telegramClientGeneration) {
    try {
      await connectedClient?.disconnect?.();
    } catch {
      // A stale connection may already be closed after a timeout.
    }
    const error = new Error("Telegram 客户端连接已失效");
    error.code = "ETIMEDOUT";
    throw error;
  }
  telegramClient = connectedClient;
  return telegramClient;
}

// ==========================================
// 业务逻辑函数
// ==========================================

/**
 * 倒序回溯初始化：从当前时间往历史查找最近的整合包
 * 【场景】只在本地没有数据、或清空缓存后首次运行时调用
 */
async function findLatestAnchorAndFill(_client, options = {}) {
  logger.debug("[初始化] 本地为空，正在倒序回溯寻找最近的整合包(>150MB)...");

  const BACKWARD_LIMIT = 10000; // 限制回溯最近 10000 条消息，避免卡死
  const tempFiles = [];
  let foundAnchor = null;
  let maxIdScanned = 0;
  const client = _client || telegramClient;
  const deadline = options.deadline || getScanDeadline(options);
  let iterator = null;
  let scannedMessages = 0;

  try {
    const config = getConfig();
    const chatIdStr =
      String(options.chatIdStr || "").trim() ||
      config.tg.discussion ||
      config.tg.channel;
    if (!chatIdStr) throw new Error("未配置讨论组或频道 ID");

    logger.info(`[初始化] 选用扫描目标: ${chatIdStr}`);

    const entity = await resolveEntity(client, chatIdStr, {
      deadline,
    });

    // 使用 iterMessages 进行倒序遍历（从新到旧）
    iterator = client.iterMessages(entity, {
      limit: BACKWARD_LIMIT,
    });
    const iteratorHandle = iterator[Symbol.asyncIterator]();

    logger.info("[初始化] 从当前最新消息开始向更旧消息回溯扫描");

    while (true) {
      assertScanDeadline(deadline, "Telegram 最近历史初始化扫描");
      const { value: msg, done } = await withTelegramRequestTimeout(
        iteratorHandle.next(),
        "Telegram 最近历史初始化扫描",
        getRemainingScanTime(deadline),
      );
      if (done) break;
      scannedMessages += 1;
      if (scannedMessages % 100 === 0) {
        logger.info(`[初始化] 最近历史扫描进度 scanned=${scannedMessages}`);
      }
      // 记录见过的最大 ID，作为下次增量扫描的起点
      if (msg.id > maxIdScanned) maxIdScanned = msg.id;

      const document = getMessageDocument(msg);

      if (!msg || !document) {
        logger.debug(`[初始化][跳过] ID ${msg?.id ?? "unknown"} 没有 document`);
        continue;
      }

      const fileName = getFileName(document);
      const fileSizeMB = ((document.size || 0) / 1024 / 1024).toFixed(2);
      const mimeType = document.mimeType || "unknown";
      const referenceMatched = isReferenceFile(msg);
      const validMatched = isValidRJFile(msg);

      logger.debug(
        `[初始化][扫描] ID ${msg.id}, fileName=${fileName}, size=${fileSizeMB}MB, mimeType=${mimeType}, ref=${referenceMatched}, valid=${validMatched}`,
      );

      // 1. 判断是否是整合包（基准点）
      if (referenceMatched) {
        if (!foundAnchor) {
          logger.info(
            `[初始化] 找到基准整合包: ID ${msg.id}, 大小: ${(document.size / 1024 / 1024).toFixed(2)}MB, 文件名: ${fileName}`,
          );
          foundAnchor = createAnchorFromMessage(msg);
          logger.info("[初始化] 已记录基准整合包，停止向更旧消息扫描...");
        } else {
          logger.debug(
            `[初始化][忽略] 更旧的整合包: ID ${msg.id}, 文件名: ${fileName}`,
          );
        }
        break;
      }

      // 2. 还没找到基准，先把路过的有效 RJ 文件收集起来
      if (validMatched) {
        const formattedFile = formatFile(msg);
        logger.debug(
          `[formatFile] Formatted file: name=${formattedFile.name}, id=${formattedFile.id}`,
        );
        tempFiles.push(formattedFile);
      }
    }

    // 因为是倒序找的 [新 -> 旧]，需要反转回 [旧 -> 新]
    tempFiles.reverse();

    if (!foundAnchor) {
      logger.warn(
        "[初始化] 警告：在最近限制范围内未找到整合包，仅显示已扫描到的文件。",
      );
    }

    return {
      metadata: {
        lastScannedId: maxIdScanned,
        anchor: foundAnchor,
        lastUpdated: new Date().toISOString(),
      },
      files: tempFiles,
      statistics: {
        totalFiles: tempFiles.length,
        anchorRj: foundAnchor ? foundAnchor.rjCode : "N/A",
      },
    };
  } catch (error) {
    if (iterator?.return) {
      try {
        void iterator.return();
      } catch {
        // 迭代器关闭失败不应覆盖原始扫描错误。
      }
    }
    if (error?.code === "ETIMEDOUT") {
      await resetTelegramClientAfterTimeout();
    }
    logger.error("[初始化] 倒序回溯失败:", error.message);
    if (options.strict) throw error;
    // 失败时返回空结构防止前端报错
    return {
      metadata: {
        lastScannedId: 0,
        anchor: null,
        lastUpdated: new Date().toISOString(),
      },
      files: [],
      statistics: { totalFiles: 0, anchorRj: "N/A" },
    };
  }
}

/**
 * 辅助函数：获取增量消息（使用 min_id 参数）
 */
async function getNewMessages(_client, discussionId, minId, options = {}) {
  try {
    if (!discussionId) return [];
    const client = _client || telegramClient;
    const deadline = options.deadline || getScanDeadline(options);
    assertScanDeadline(deadline, "Telegram 最近历史增量扫描");
    const entity = await withTelegramRequestTimeout(
      resolveEntity(client, discussionId, {
        deadline,
      }),
      "讨论组实体解析",
      getRemainingScanTime(deadline),
    );

    // 使用 min_id 只获取比指定 ID 更新的消息
    // GramJS getMessages 返回顺序通常是 [最新 -> 最旧]，我们需要反转
    const messages = await withTelegramRequestTimeout(
      client.getMessages(entity, {
        limit: 500, // 一次最多拿500条，不够再拿（通常够了）
        minId: minId,
      }),
      "讨论组增量消息扫描",
      getRemainingScanTime(deadline),
    );

    // 过滤无文件的消息并反转顺序 -> [旧 -> 新]
    return messages.filter((msg) => getMessageDocument(msg)).reverse();
  } catch (error) {
    logger.error("获取增量消息失败:", error.message);
    if (error?.code === "ETIMEDOUT") {
      logger.warn(
        "讨论组扫描超时，已重置 Telegram 客户端并使用本地最近上传缓存",
      );
      await resetTelegramClientAfterTimeout();
    }
    if (options.strict) throw error;
    return [];
  }
}

/**
 * 主逻辑：执行完整的最近活动扫描和保存流程
 */
async function performScanAndSaveRecentActivity(options = {}) {
  const deadline = options.deadline || getScanDeadline(options);
  try {
    const config = getConfig();
    const telegramClient = await withTelegramRequestTimeout(
      getConnectedClient(),
      "Telegram 客户端连接",
      getRemainingScanTime(deadline),
    ); // 确保连接
    const scanChatId =
      String(options.chatIdStr || "").trim() ||
      config.tg.discussion ||
      config.tg.channel;

    // 1. 读取本地缓存
    const store = loadRecentActivity(config.paths.uploadHistoryDir);

    // 初始化数据结构 (如果读取失败或为空)
    let localData = {
      metadata: { lastScannedId: 0, anchor: null, lastUpdated: null },
      files: [],
      statistics: { totalFiles: 0 },
    };

    if (store.success && store.data) {
      localData = store.data;
      // 防御性：确保 files 是数组
      if (!Array.isArray(localData.files)) localData.files = [];
    }

    // =========================================================
    // 分支 1：如果本地无记录，执行"倒序初始化"
    // =========================================================
    if (!localData.metadata.lastScannedId) {
      logger.debug("[状态] 全新环境或缓存丢失，执行回溯初始化...");
      const initData = await findLatestAnchorAndFill(telegramClient, {
        chatIdStr: scanChatId,
        deadline,
        strict: options.strict === true,
      });
      saveRecentActivity(config.paths.uploadHistoryDir, initData);
      return { success: true, data: initData };
    }

    // =========================================================
    // 分支 2：执行"增量更新"
    // =========================================================
    const minId = localData.metadata.lastScannedId;
    logger.info(`[状态] 增量更新，起点 Message ID: ${minId}`);
    logger.info(`[状态] 选用增量扫描目标: ${scanChatId || "未配置"}`);

    const newMessages = await getNewMessages(telegramClient, scanChatId, minId, {
      deadline,
      strict: options.strict === true,
    });

    if (newMessages.length === 0) {
      logger.info("没有新消息，无需更新");
      return { success: true, data: localData };
    }

    logger.info(`获取到 ${newMessages.length} 条新消息，开始处理...`);

    let hasChanges = false;
    let newFilesBuffer = []; // 暂存本次发现的新资源
    let maxScannedMessageId = localData.metadata.lastScannedId;

    for (const msg of newMessages) {
      if (msg.id > maxScannedMessageId) {
        maxScannedMessageId = msg.id;
      }

      const document = getMessageDocument(msg);
      if (!document) {
        logger.debug(`[增量][跳过] ID ${msg?.id ?? "unknown"} 没有 document`);
        continue;
      }

      const fileName = getFileName(document);
      const fileSizeMB = ((document.size || 0) / 1024 / 1024).toFixed(2);
      const mimeType = document.mimeType || "unknown";
      const referenceMatched = isReferenceFile(msg);
      const validMatched = isValidRJFile(msg);

      logger.debug(
        `[增量][扫描] ID ${msg.id}, fileName=${fileName}, size=${fileSizeMB}MB, mimeType=${mimeType}, ref=${referenceMatched}, valid=${validMatched}`,
      );

      // Check A: 发现新整合包 (体积 > 150MB)
      if (referenceMatched) {
        logger.info(
          `🔥 [重置] 发现新整合包 (ID: ${msg.id}, Size: ${document.size})，清空旧列表。`,
        );

        // 1. 更新基准信息
        localData.metadata.anchor = createAnchorFromMessage(msg);

        // 2. 关键：清空历史列表，重新计数！
        localData.files = [];
        newFilesBuffer = []; // 清空当前缓存
        hasChanges = true;

        continue; // 整合包本身不进入资源列表
      }

      // Check B: 有效资源文件
      if (validMatched) {
        const formattedFile = formatFile(msg);
        logger.debug(
          `[formatFile] Formatted file: name=${formattedFile.name}, id=${formattedFile.id}`,
        );
        newFilesBuffer.push(formattedFile);
        hasChanges = true;
      } else {
        // 调试日志：记录被过滤的消息
        const fileSize = document.size || 0;
        logger.info(
          `[过滤] 消息 ID ${msg.id} 被过滤: 文件名=${fileName}, 大小=${(fileSize / 1024 / 1024).toFixed(2)}MB`,
        );
      }
      if (msg.id > localData.metadata.lastScannedId) {
        localData.metadata.lastScannedId = msg.id;
      }
    }

    localData.metadata.lastScannedId = maxScannedMessageId;

    // 合并新文件到旧列表
    if (newFilesBuffer.length > 0) {
      localData.files = [...localData.files, ...newFilesBuffer];
    }

    logger.info(
      `[处理结果] 新文件缓冲区: ${newFilesBuffer.length} 个, hasChanges: ${hasChanges}`,
    );

    if (hasChanges) {
      // 去重 (防止 Message ID 重复)
      localData.files = removeDuplicates(localData.files);

      // 更新统计信息
      localData.statistics = {
        totalFiles: localData.files.length,
        anchorRj: localData.metadata.anchor?.rjCode || "N/A",
      };
      localData.metadata.lastUpdated = new Date().toISOString();

      // 写入磁盘
      saveRecentActivity(config.paths.uploadHistoryDir, localData);
      logger.info(`更新完成，当前列表数量: ${localData.files.length}`);
    }

    return { success: true, data: localData };
  } catch (error) {
    if (error?.code === "ETIMEDOUT") {
      await resetTelegramClientAfterTimeout();
    }
    logger.error("扫描失败:", error.message);
    return { success: false, error: error.message };
  }
}

// Home and Recent Activity can request the same scan during startup. Reuse the
// in-flight operation instead of opening duplicate Telegram requests.
export async function scanAndSaveRecentActivity(options = {}) {
  if (scanPromise) return scanPromise;
  scanPromise = performScanAndSaveRecentActivity(options).finally(() => {
    scanPromise = null;
  });
  return scanPromise;
}

// ==========================================
// 下载功能 (核心修复)
// ==========================================

export async function downloadTelegramFileByMessage(
  messageId,
  savePath,
  context = {},
) {
  try {
    const telegramClient =
      context.telegramClient || (await getConnectedClient());
    const config = context.config || getConfig();
    const chatIdStr =
      context.chatIdStr || config.tg.discussion || config.tg.channel;

    logger.info(`准备下载消息 ID: ${messageId} 到 ${savePath}`);

    const entity =
      context.entity || (await resolveEntity(telegramClient, chatIdStr));

    // 获取单条消息对象
    const messages = await telegramClient.getMessages(entity, {
      ids: [messageId],
    });
    const msg = messages[0];

    if (!msg || !msg.document) {
      throw new Error("未找到消息或消息不包含文件");
    }

    // 进度回调 (可选：如果前端需要进度条，可通过 IPC 发送)
    const progressCallback = () => {
      // const percent = Math.round((received / total) * 100);
      // console.log(`下载进度: ${percent}%`);
    };

    // 调用 GramJS 下载媒体
    await telegramClient.downloadMedia(msg, {
      outputFile: savePath,
      progressCallback: progressCallback,
      workers: 1, // 建议设为 1 避免某些情况下的文件损坏
    });

    logger.info("下载完成");
    return { success: true, path: savePath };
  } catch (e) {
    logger.error(`下载失败: ${e.message}`);
    return { success: false, error: e.message };
  }
}

function resolveTelegramDownloadPath(downloadDir, item) {
  const safeFileName = item.fileName || `download_${item.tgMessageId}.zip`;

  return {
    fileName: safeFileName,
    filePath: path.join(downloadDir, safeFileName),
  };
}

async function downloadTelegramFilesBatch(payload) {
  const { items, concurrency } = normalizeBatchDownloadPayload(payload);
  const rawPayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  const batchIndex = Number(rawPayload.batchIndex);
  const totalBatches = Number(rawPayload.totalBatches);
  const hasBatchMeta =
    Number.isInteger(batchIndex) &&
    batchIndex > 0 &&
    Number.isInteger(totalBatches) &&
    totalBatches >= batchIndex;

  if (items.length === 0) {
    return {
      success: false,
      error: "缺少有效的 tgMessageId",
      results: [],
      totalCount: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const config = getConfig();
  const downloadDir =
    config.paths?.tgDownloadDir ||
    path.join(app.getPath("downloads"), "TG_Downloads");

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const telegramClient = await getConnectedClient();
  const chatIdStr = config.tg.discussion || config.tg.channel;
  const entity = await resolveEntity(telegramClient, chatIdStr);
  const results = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const batchLabel = hasBatchMeta
    ? `第 ${batchIndex}/${totalBatches} 批`
    : "当前批次";

  logger.info(
    `[批量下载] ${batchLabel} 开始，本批 ${items.length} 个，并发 ${workerCount}`,
  );

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const item = items[currentIndex];
      const { fileName, filePath } = resolveTelegramDownloadPath(
        downloadDir,
        item,
      );

      if (fs.existsSync(filePath)) {
        results[currentIndex] = {
          ...item,
          fileName,
          path: filePath,
          success: true,
          skipped: true,
          msg: "文件已存在",
        };
        continue;
      }

      const result = await downloadTelegramFileByMessage(
        item.tgMessageId,
        filePath,
        {
          telegramClient,
          entity,
          config,
          chatIdStr,
        },
      );

      results[currentIndex] = {
        ...item,
        fileName,
        ...result,
        path: result.path || filePath,
      };
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const summary = summarizeBatchDownloadResults(results);

  logger.info(
    `[批量下载] ${batchLabel} 完成，成功 ${summary.successCount}，跳过 ${summary.skippedCount}，失败 ${summary.failedCount}`,
  );

  return {
    success: summary.failedCount === 0,
    downloadDir,
    concurrency: workerCount,
    batchIndex: hasBatchMeta ? batchIndex : null,
    totalBatches: hasBatchMeta ? totalBatches : null,
    results,
    ...summary,
  };
}

// ==========================================
// 数据存取 (保持通用性)
// ==========================================

function compactRecentActivityFile(file) {
  const timestamp = Number(file?.timestamp);
  const date =
    typeof file?.date === "string" && file.date
      ? file.date
      : Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null;
  const fileSize = Number(file?.fileSize ?? file?.size);

  return {
    rjCode: file?.rjCode || file?.id || null,
    messageId: file?.messageId ?? file?.tgMessageId ?? null,
    date,
    fileName: file?.fileName || file?.name || "unknown",
    fileSize: Number.isFinite(fileSize) ? fileSize : 0,
  };
}

function compactRecentActivityData(activityData) {
  return {
    ...activityData,
    files: Array.isArray(activityData?.files)
      ? activityData.files.map(compactRecentActivityFile)
      : [],
  };
}

export function saveRecentActivity(outputDir, activityData) {
  try {
    let targetDir =
      outputDir || getDataDir() || path.join(app.getPath("userData"), "data");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const outputPath = path.join(targetDir, "recent_activity.json");
    fs.writeFileSync(
      outputPath,
      JSON.stringify(compactRecentActivityData(activityData), null, 2),
      "utf-8",
    );
    return { success: true, filePath: outputPath };
  } catch (error) {
    logger.error("保存数据失败:", error.message);
    return { success: false, error: error.message };
  }
}

export function loadRecentActivity(inputDir) {
  try {
    let targetDir =
      inputDir || getDataDir() || path.join(app.getPath("userData"), "data");
    const inputPath = path.join(targetDir, "recent_activity.json");

    if (!fs.existsSync(inputPath))
      return { success: false, error: "文件不存在" };

    const content = fs.readFileSync(inputPath, "utf-8");
    if (!content.trim()) return { success: false, error: "文件为空" };

    const data = JSON.parse(content);
    const compactData = compactRecentActivityData(data);

    if (
      JSON.stringify(data.files || []) !== JSON.stringify(compactData.files)
    ) {
      logger.info("检测到旧版最近上传缓存，已自动精简文件记录字段");
      saveRecentActivity(inputDir, compactData);
    }

    return { success: true, data: compactData };
  } catch (error) {
    logger.error("读取数据失败:", error.message);
    return { success: false, error: error.message };
  }
}

// 兼容日志写入
export function saveRecentActivityLog() {
  return Promise.resolve({ success: true });
}

// ==========================================
// IPC 注册 (Electron 通信)
// ==========================================

export function setupTgHistoryIPC() {
  logger.debug("[tg-recent-activity] initializing IPC handlers...");

  // 先移除已存在的处理器，避免热重载时重复注册
  const handlers = [
    "tg-scan-recent-activity",
    "tg-read-recent-activity",
    "download-tg-file",
    "download-tg-files",
    "clear-cache",
    "read-rj-list",
  ];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
      logger.debug(`[tg-recent-activity] removed previous handler: ${handler}`);
    } catch {
      // 处理器不存在，忽略错误
    }
  }

  logger.debug("[tg-recent-activity] registering IPC handlers...");
  logger.debug("[tg-recent-activity] registering tg-scan-recent-activity...");

  // 1. 扫描最近活动 (前端点击刷新时调用)
  ipcMain.handle("tg-scan-recent-activity", async () => {
    logger.debug("IPC: tg-scan-recent-activity");
    return await scanAndSaveRecentActivity();
  });

  // 2. 读取缓存 (前端启动/挂载时调用)
  ipcMain.handle("tg-read-recent-activity", () => {
    const config = getConfig();
    return loadRecentActivity(config.paths?.uploadHistoryDir);
  });

  // 3. 下载文件
  ipcMain.handle(
    "download-tg-file",
    async (event, { tgMessageId, fileName }) => {
      try {
        const config = getConfig();
        const downloadDir =
          config.paths?.tgDownloadDir ||
          path.join(app.getPath("downloads"), "TG_Downloads");

        if (!fs.existsSync(downloadDir))
          fs.mkdirSync(downloadDir, { recursive: true });

        const { filePath } = resolveTelegramDownloadPath(downloadDir, {
          tgMessageId,
          fileName,
        });

        // 检查文件是否存在
        if (fs.existsSync(filePath)) {
          return {
            success: true,
            skipped: true,
            msg: "文件已存在",
            path: filePath,
          };
        }

        if (!tgMessageId) return { success: false, error: "缺少 tgMessageId" };

        return await downloadTelegramFileByMessage(tgMessageId, filePath);
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );

  ipcMain.handle("download-tg-files", async (event, payload) => {
    try {
      return await downloadTelegramFilesBatch(payload);
    } catch (e) {
      return {
        success: false,
        error: e.message,
        results: [],
        totalCount: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
      };
    }
  });

  // 4. 清除缓存
  ipcMain.handle("clear-cache", async (event, { cacheFile }) => {
    const config = getConfig();
    // recent_activity.json 存储在 uploadHistoryDir，不是 dataDir
    const targetDir = config.paths?.uploadHistoryDir || getDataDir();
    const targetPath = path.join(targetDir, cacheFile);

    logger.debug(`[clear-cache] delete attempt: ${targetPath}`);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      logger.debug(`[clear-cache] deleted: ${targetPath}`);
      return { success: true };
    }
    logger.debug(`[clear-cache] file not found: ${targetPath}`);
    return { success: false, error: "File not found" };
  });

  // 6. 读取RJ号列表文件
  ipcMain.handle("read-rj-list", async (event, { path }) => {
    logger.debug("[tg-recent-activity] IPC handlers registered");
    try {
      if (!path || !fs.existsSync(path)) {
        return { success: false, error: "文件不存在" };
      }

      const content = fs.readFileSync(path, "utf-8");
      const rjList = parseRjListFromContent(content);

      return { success: true, data: rjList, count: rjList.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}
