import fs from "fs";
import path from "path";
import { ipcMain } from "electron";
import { getConfig } from "./config.js";
import { getAsmrClient } from "./httpClient.js";
import { createLogSender } from "../utils/logger.js";
import { normalizeError } from "../utils/errorHandler.js";
import { withRetry } from "../utils/retry.js";
import {
  DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK,
  buildDownloadPlanForWork,
  parseAudioNodes,
  parseBatchDownloadInput,
  shouldManualReviewByTaskCount,
} from "./asmr-core/audio-download-utils.js";

const logger = createLogSender("asmr-audio-downloader");

const CHANNEL_NAME = "asmr-audio-downloader-run";
const API_BASE_URL = "https://api.asmr-200.com/api/tracks/";
const ARIA2_INPUT_FILE = "aria2_tasks.txt";
const MANUAL_REVIEW_FILE = "manual_review.txt";
const DEFAULT_ARIA2_RPC_URL = "http://localhost:6800/jsonrpc";
const DEFAULT_ARIA2_SPLIT = "16";
const DEFAULT_ARIA2_MAX_CONNECTIONS = "16";
const API_REQUEST_DELAY_MS = 500;
const RATE_LIMIT_RETRY_MAX = 3;
const RATE_LIMIT_BASE_SLEEP_MS = 10000;
const NETWORK_RETRY_MAX = 3;
const NETWORK_RETRY_BACKOFF_MS = 1000;
const MAX_PATH_LIMIT = 250;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBoolean(value, fallbackValue) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallbackValue;
}

function trimString(value, fallbackValue = "") {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const trimmedValue = value.trim();
  return trimmedValue || fallbackValue;
}

function normalizePositiveInteger(value, fallbackValue) {
  const normalizedValue = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return fallbackValue;
  }

  return normalizedValue;
}

function resolveRuntimeOptions(payload = {}) {
  const config = getConfig();
  const asmrConfig = config?.asmr || {};
  const pathsConfig = config?.paths || {};

  return {
    inputText: String(payload.inputText || ""),
    downloadDir: trimString(
      payload.downloadDir,
      trimString(
        pathsConfig.asmrDownloadDir,
        trimString(pathsConfig.toolOutputDir, ""),
      ),
    ),
    useAria2: normalizeBoolean(
      payload.useAria2,
      asmrConfig.downloadUseAria2 !== false,
    ),
    testMode: normalizeBoolean(
      payload.testMode,
      asmrConfig.downloadTestMode === true,
    ),
    rpcUrl: trimString(
      payload.rpcUrl,
      trimString(asmrConfig.downloadRpcUrl, DEFAULT_ARIA2_RPC_URL),
    ),
    rpcSecret:
      typeof payload.rpcSecret === "string"
        ? payload.rpcSecret
        : String(asmrConfig.downloadRpcSecret || ""),
    maxAutoTasksPerWork: normalizePositiveInteger(
      payload.maxAutoTasksPerWork,
      normalizePositiveInteger(
        asmrConfig.downloadMaxAutoTasksPerWork,
        DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK,
      ),
    ),
  };
}

async function fetchTrackTree(apiId) {
  const client = getAsmrClient();
  const targetUrl = `${API_BASE_URL}${apiId}`;
  let sleepTime = RATE_LIMIT_BASE_SLEEP_MS;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_MAX; attempt += 1) {
    try {
      const response = await withRetry(
        () =>
          client.get(targetUrl, {
            timeout: 15000,
            validateStatus: () => true,
            headers: {
              "User-Agent": DEFAULT_USER_AGENT,
            },
          }),
        {
          maxRetries: NETWORK_RETRY_MAX,
          backoff: NETWORK_RETRY_BACKOFF_MS,
          onRetry: (retryAttempt, error) => {
            logger.warn(
              `[fetch] ${apiId} 网络重试 ${retryAttempt}/${NETWORK_RETRY_MAX}: ${error?.message || error}`,
            );
          },
        },
      );

      if (response.status === 404) {
        return {
          success: true,
          status: "not_found",
          data: null,
        };
      }

      if (response.status === 429) {
        if (attempt >= RATE_LIMIT_RETRY_MAX) {
          logger.warn(`[fetch] ${apiId} 命中限流且达到最大重试次数`);
          return {
            success: false,
            status: "rate_limited",
            message: "接口限流，达到最大重试次数",
          };
        }

        logger.warn(
          `[fetch] ${apiId} 命中限流，${sleepTime}ms 后重试 (${attempt + 1}/${RATE_LIMIT_RETRY_MAX})`,
        );
        await sleep(sleepTime);
        sleepTime *= 2;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          success: false,
          status: "http_error",
          message: `接口返回异常状态码 ${response.status}`,
        };
      }

      return {
        success: true,
        status: "ok",
        data: Array.isArray(response.data) ? response.data : [],
      };
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.error(
        `[fetch] ${apiId} 请求失败: ${normalizedError.message}`,
        normalizedError.details || "",
      );
      return {
        success: false,
        status: normalizedError.type || "error",
        message: normalizedError.message,
      };
    }
  }

  return {
    success: false,
    status: "unknown_error",
    message: "未知错误",
  };
}

async function writeBackupFiles({ downloadDir, manualItems, tasks }) {
  await fs.promises.mkdir(downloadDir, { recursive: true });

  let manualReviewPath = null;
  let aria2InputPath = null;

  if (manualItems.length > 0) {
    manualReviewPath = path.join(downloadDir, MANUAL_REVIEW_FILE);
    await fs.promises.writeFile(
      manualReviewPath,
      `${manualItems.join("\n")}\n`,
      "utf-8",
    );
  }

  if (tasks.length > 0) {
    aria2InputPath = path.join(downloadDir, ARIA2_INPUT_FILE);
    const content = tasks
      .map(
        (task) =>
          `${task.downloadUrl}\n\tout=${task.outPath.replace(/\\/g, "/")}\n`,
      )
      .join("");
    await fs.promises.writeFile(aria2InputPath, content, "utf-8");
  }

  return {
    manualReviewPath,
    aria2InputPath,
  };
}

async function pushTasksToAria2({ tasks, downloadDir, rpcUrl, rpcSecret }) {
  const aria2Client = getAsmrClient();

  let pushedCount = 0;
  const pushErrors = [];

  for (const task of tasks) {
    const payload = {
      jsonrpc: "2.0",
      id: "kuruharu_asmr_downloader",
      method: "aria2.addUri",
      params: [],
    };

    if (rpcSecret) {
      payload.params.push(`token:${rpcSecret}`);
    }

    payload.params.push([task.downloadUrl], {
      dir: downloadDir,
      out: task.outPath.replace(/\\/g, "/"),
      split: DEFAULT_ARIA2_SPLIT,
      "max-connection-per-server": DEFAULT_ARIA2_MAX_CONNECTIONS,
      "user-agent": DEFAULT_USER_AGENT,
      continue: "true",
    });

    try {
      const response = await withRetry(
        () => aria2Client.post(rpcUrl, payload),
        {
          maxRetries: NETWORK_RETRY_MAX,
          backoff: NETWORK_RETRY_BACKOFF_MS,
          onRetry: (attempt, error) => {
            logger.warn(
              `[aria2] ${task.outPath} 推送重试 ${attempt}/${NETWORK_RETRY_MAX}: ${error?.message || error}`,
            );
          },
        },
      );

      if (response.status === 200 && response.data?.result) {
        pushedCount += 1;
        continue;
      }

      const errorMessage =
        response.data?.error?.message || `RPC 返回状态 ${response.status}`;
      pushErrors.push({
        outPath: task.outPath,
        message: errorMessage,
      });
    } catch (error) {
      const normalizedError = normalizeError(error);
      pushErrors.push({
        outPath: task.outPath,
        message: normalizedError.message,
      });
      logger.error(
        `[aria2] 推送失败: ${task.outPath} -> ${normalizedError.message}`,
      );
      break;
    }
  }

  return {
    pushedCount,
    pushErrors,
  };
}

export async function runAsmrAudioDownloader(payload = {}) {
  const options = resolveRuntimeOptions(payload);
  if (!options.inputText.trim()) {
    return {
      success: false,
      message: "请输入 RJ/VJ/BJ 编号列表",
    };
  }

  if (!options.downloadDir) {
    return {
      success: false,
      message: "请选择下载目录",
    };
  }

  const { workItems, invalidItems } = parseBatchDownloadInput(
    options.inputText,
  );
  const manualItems = invalidItems.map(
    (item) => `${item.input} | Reason: ${item.reason}`,
  );
  const processedItems = [];
  const allTasks = [];

  logger.info(
    `[run] 开始处理 ${workItems.length} 个有效编号，下载目录: ${options.downloadDir}`,
  );

  for (const workItem of workItems) {
    logger.info(`[run] 正在处理 ${workItem.displayCode}`);

    const fetchResult = await fetchTrackTree(workItem.apiId);
    await sleep(API_REQUEST_DELAY_MS);

    if (!fetchResult.success || fetchResult.status !== "ok") {
      const reason =
        fetchResult.status === "not_found"
          ? "API获取失败或作品不存在"
          : fetchResult.message || "作品轨道获取失败";

      manualItems.push(`${workItem.displayCode} | Reason: ${reason}`);
      processedItems.push({
        input: workItem.rawInput,
        workCode: workItem.displayCode,
        status: "manual",
        reason,
      });
      continue;
    }

    const filesData = parseAudioNodes(fetchResult.data);
    const { tasks, overflowPaths } = buildDownloadPlanForWork({
      workCode: workItem.displayCode,
      filesData,
      downloadDir: options.downloadDir,
      maxPathLimit: MAX_PATH_LIMIT,
    });

    if (tasks.length === 0) {
      const reason = "全目录被过滤，无有效音频";
      manualItems.push(`${workItem.displayCode} | Reason: ${reason}`);
      processedItems.push({
        input: workItem.rawInput,
        workCode: workItem.displayCode,
        status: "manual",
        reason,
      });
      continue;
    }

    if (overflowPaths.length > 0) {
      const longestPathLength = Math.max(
        ...overflowPaths.map((item) => item.length),
      );
      const reason = `${overflowPaths.length} 条路径超长（最长 ${longestPathLength} 字符），触发 MAX_PATH 限制`;
      manualItems.push(`${workItem.displayCode} | Reason: ${reason}`);
      processedItems.push({
        input: workItem.rawInput,
        workCode: workItem.displayCode,
        status: "manual",
        reason,
      });
      continue;
    }

    if (shouldManualReviewByTaskCount(tasks, options.maxAutoTasksPerWork)) {
      const reason = `下载任务数量 ${tasks.length} 超过自动处理上限 ${options.maxAutoTasksPerWork}，请人工筛选`;
      manualItems.push(`${workItem.displayCode} | Reason: ${reason}`);
      processedItems.push({
        input: workItem.rawInput,
        workCode: workItem.displayCode,
        status: "manual",
        reason,
      });
      continue;
    }

    allTasks.push(...tasks);
    processedItems.push({
      input: workItem.rawInput,
      workCode: workItem.displayCode,
      status: "queued",
      taskCount: tasks.length,
    });
  }

  try {
    const backupFiles = await writeBackupFiles({
      downloadDir: options.downloadDir,
      manualItems,
      tasks: allTasks,
    });

    let aria2PushResult = {
      pushedCount: 0,
      pushErrors: [],
    };

    if (allTasks.length > 0 && options.useAria2 && !options.testMode) {
      aria2PushResult = await pushTasksToAria2({
        tasks: allTasks,
        downloadDir: options.downloadDir,
        rpcUrl: options.rpcUrl,
        rpcSecret: options.rpcSecret,
      });
    }

    return {
      success: true,
      message: "音声下载任务处理完成",
      summary: {
        inputCount: workItems.length + invalidItems.length,
        validCount: workItems.length,
        invalidCount: invalidItems.length,
        manualCount: manualItems.length,
        taskCount: allTasks.length,
        pushedCount: aria2PushResult.pushedCount,
        pushErrorCount: aria2PushResult.pushErrors.length,
        useAria2: options.useAria2,
        testMode: options.testMode,
        maxAutoTasksPerWork: options.maxAutoTasksPerWork,
        downloadDir: options.downloadDir,
        manualReviewPath: backupFiles.manualReviewPath,
        aria2InputPath: backupFiles.aria2InputPath,
      },
      manualItems,
      processedItems,
      pushErrors: aria2PushResult.pushErrors,
      taskPreview: allTasks.slice(0, 50).map((task) => task.outPath),
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.error(`[run] 处理失败: ${normalizedError.message}`);
    return {
      success: false,
      message: normalizedError.message,
      details: normalizedError.details,
    };
  }
}

export function setupAsmrAudioDownloaderIPC() {
  try {
    ipcMain.removeHandler(CHANNEL_NAME);
  } catch {
    // ignore duplicate registration cleanup
  }

  ipcMain.handle(CHANNEL_NAME, async (_event, payload = {}) =>
    runAsmrAudioDownloader(payload),
  );
}
