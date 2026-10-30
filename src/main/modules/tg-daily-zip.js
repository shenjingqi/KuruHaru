import archiver from "archiver";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import { getConfig, getDataDir } from "./config";
import { buildMessageLinksByEntity } from "./tg-search-bot-core/link-builders";
import { createLogSender } from "../utils/logger";
import {
  downloadTelegramFileByMessage,
  loadRecentActivity,
  scanAndSaveRecentActivity,
} from "./tg-recent-activity";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity";

const TIME_ZONE = "Asia/Shanghai";
const CODE_PATTERN = /^(?:RJ|BJ|VJ)\d{6,8}/i;
const DAILY_ZIP_FILE_PATTERN = /^kuruharu-\d{4}\.zip$/i;
const DOWNLOAD_CONCURRENCY = 4;
const AGGREGATE_UPLOAD_MAX_ATTEMPTS = 5;
const AGGREGATE_UPLOAD_INITIAL_DELAY_MS = 5 * 60 * 1000;
const statePath = path.join(getDataDir(), "tg-daily-zip.json");

const logger = createLogSender("tg-daily-zip");
let generationTask = null;
let stateCache = null;

function getDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateName(dateKey) {
  return `kuruharu-${dateKey.slice(5, 7)}${dateKey.slice(8, 10)}`;
}

function normalizeState(raw) {
  return {
    records: Array.isArray(raw?.records) ? raw.records : [],
    generated:
      raw?.generated && typeof raw.generated === "object" ? raw.generated : {},
    scheduled:
      raw?.scheduled && typeof raw.scheduled === "object" ? raw.scheduled : {},
    latestUrl: String(raw?.latestUrl || ""),
    latestSourceSignature: String(raw?.latestSourceSignature || ""),
  };
}

async function loadState() {
  if (stateCache) return stateCache;

  try {
    stateCache = normalizeState(
      JSON.parse(await fs.readFile(statePath, "utf8")),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    stateCache = normalizeState({});
  }
  return stateCache;
}

async function saveState(state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  stateCache = state;
}

function extractCode(record) {
  return (
    String(record?.rjCode || record?.code || record?.name || "")
      .match(CODE_PATTERN)?.[0]
      ?.toUpperCase() || ""
  );
}

function isZipRecord(record) {
  return (
    /\.zip$/i.test(String(record?.fileName || record?.name || "")) &&
    Boolean(extractCode(record))
  );
}

async function resolveGroupEntity(client, groupId) {
  const peerInput = normalizePeerEntityInput(groupId);

  try {
    return await client.getEntity(peerInput);
  } catch {
    await client.getDialogs({ limit: 100 });
  }

  try {
    return await client.getEntity(peerInput);
  } catch (error) {
    throw new Error(
      `无法解析上传讨论群 ${groupId}。请确认当前 Telegram 账号已加入该群：${error?.message || error}`,
    );
  }
}

async function sendAggregateArchive(client, groupId, archivePath) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= AGGREGATE_UPLOAD_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const groupEntity = await resolveGroupEntity(client, groupId);
      const uploadedMessage = await client.sendFile(groupEntity, {
        file: archivePath,
        forceDocument: true,
      });
      return { uploadedMessage, groupEntity };
    } catch (error) {
      lastError = error;
      if (attempt >= AGGREGATE_UPLOAD_MAX_ATTEMPTS) break;

      const delay =
        AGGREGATE_UPLOAD_INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(
        `[tg-daily-zip] 整合包发送失败，第 ${attempt}/${AGGREGATE_UPLOAD_MAX_ATTEMPTS} 次将在 ${Math.round(delay / 60000)} 分钟后重试: ${error?.message || error}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `整合包已压缩完成，但发送失败（已重试 ${AGGREGATE_UPLOAD_MAX_ATTEMPTS} 次）：${lastError?.message || lastError || "未知错误"}`,
  );
}

export function getDailyZipDateKey(date = new Date()) {
  return getDateKey(date);
}

export function getDailyZipFileName(dateKey = getDateKey()) {
  return `${getDateName(dateKey)}.zip`;
}

export async function getLatestDailyZip() {
  let state = await loadState();
  let latest = Object.values(state.generated)
    .filter((item) => item?.url)
    .sort((left, right) =>
      String(right.generatedAt || right.dateKey || "").localeCompare(
        String(left.generatedAt || left.dateKey || ""),
      ),
    )[0];

  // 状态文件为空（无任何已生成整合包记录）时，回填讨论组最新整合包信息
  if (!latest && !state.latestUrl) {
    const recovered = await recoverLatestDailyZipIfEmpty().catch((error) => {
      logger.warn(
        `[tg-daily-zip] 空状态回填失败: ${error?.message || error}`,
      );
      return null;
    });
    if (recovered?.recovered) {
      state = await loadState();
      latest = Object.values(state.generated)
        .filter((item) => item?.url)
        .sort((left, right) =>
          String(right.generatedAt || right.dateKey || "").localeCompare(
            String(left.generatedAt || left.dateKey || ""),
          ),
        )[0];
    }
  }

  return {
    success: true,
    ...(latest || {}),
    url: latest?.url || state.latestUrl || "",
  };
}

let dailyZipRecoveryAttempted = false;

async function findLatestDailyZipMessage(channelId, targetFileName = "") {
  const { requireConnectedTelegramClient } = await import(
    "../utils/telegram-login"
  );
  const client = await requireConnectedTelegramClient();
  const groupEntity = await resolveGroupEntity(client, channelId);
  const messages = await client.getMessages(groupEntity, { limit: 100 });
  let best = null;

  for (const msg of Array.isArray(messages) ? messages : []) {
    const document = msg?.document || msg?.media?.document || null;
    if (!document) continue;

    let fileName = "";
    if (Array.isArray(document.attributes)) {
      fileName =
        document.attributes.find(
          (attr) => typeof attr?.fileName === "string" && attr.fileName.trim(),
        )?.fileName || "";
    }
    fileName = String(fileName || document.name || "").trim();
    if (targetFileName) {
      if (fileName.toLowerCase() !== targetFileName.toLowerCase()) continue;
    } else if (!DAILY_ZIP_FILE_PATTERN.test(fileName)) {
      continue;
    }

    const messageId = Number(msg?.id || 0);
    if (!Number.isInteger(messageId) || messageId <= 0) continue;
    if (!best || messageId > best.messageId) {
      best = {
        messageId,
        fileName,
        date: msg.date ? new Date(Number(msg.date) * 1000) : new Date(),
        entity: groupEntity,
      };
    }
  }

  return best;
}

export async function recoverLatestDailyZipIfEmpty(options = {}) {
  const state = await loadState();
  const hasRecord =
    Object.values(state.generated).some((item) => item?.url) ||
    Boolean(state.latestUrl);

  if (hasRecord) {
    return { success: true, recovered: false, reason: "state-not-empty" };
  }

  if (dailyZipRecoveryAttempted && options.force !== true) {
    return { success: true, recovered: false, reason: "already-attempted" };
  }
  dailyZipRecoveryAttempted = true;

  const channelId = resolveDailyZipChannelId(options);
  if (!channelId) {
    return {
      success: false,
      recovered: false,
      error: "未配置每日 ZIP 上传讨论群",
    };
  }

  const latestMessage = await findLatestDailyZipMessage(channelId);
  if (!latestMessage) {
    return { success: true, recovered: false, reason: "no-daily-zip-found" };
  }

  const dateKey = getDateKey(latestMessage.date);
  const linkSet = buildMessageLinksByEntity(
    latestMessage.entity,
    channelId,
    latestMessage.messageId,
  );
  if (!linkSet.primaryUrl) {
    return { success: false, recovered: false, error: "无法生成整合包下载地址" };
  }

  // 同步当前资源签名，避免回填后立刻触发一次重复的整合包生成
  const uniqueRecords = await getRecentZipRecords(channelId).catch(() => []);
  const sourceSignature = buildSourceSignature(uniqueRecords);
  const result = {
    dateKey,
    fileName: getDailyZipFileName(dateKey),
    url: linkSet.primaryUrl,
    messageId: latestMessage.messageId,
    generatedAt: latestMessage.date.toISOString(),
    count: uniqueRecords.length,
    sourceSignature,
    deliveryType: "recovered",
  };

  state.generated[dateKey] = result;
  state.latestUrl = result.url;
  state.latestSourceSignature = sourceSignature;
  await saveState(state);
  logger.info(
    `[tg-daily-zip] 空状态已回填: ${result.fileName} url=${result.url}`,
  );
  return { success: true, recovered: true, ...result };
}

async function getRecentZipRecords(scanChatId) {
  const config = getConfig();
  logger.info(
    `[tg-daily-zip] 扫描讨论组最近上传后再下载: ${scanChatId || "未配置"}`,
  );
  const scanResult = await scanAndSaveRecentActivity({ chatIdStr: scanChatId });
  const fallbackResult = loadRecentActivity(config.paths?.uploadHistoryDir);
  const activity = scanResult.success ? scanResult.data : fallbackResult.data;
  if (!scanResult.success) {
    logger.warn(
      `[tg-daily-zip] 讨论组扫描失败，使用本地最近上传缓存: ${scanResult.error || "未知错误"}`,
    );
  }
  const recordsByCode = new Map();

  for (const file of Array.isArray(activity?.files) ? activity.files : []) {
    if (!isZipRecord(file)) continue;
    const messageId = Number(file.messageId || file.tgMessageId);
    if (!Number.isInteger(messageId) || messageId <= 0) continue;
    recordsByCode.set(extractCode(file), {
      code: extractCode(file),
      name: path.basename(String(file.fileName || file.name)),
      fileMessageId: messageId,
    });
  }

  return [...recordsByCode.values()];
}

function buildSourceSignature(records) {
  return records
    .map((record) => `${record.code}:${record.fileMessageId}`)
    .sort()
    .join("|");
}

function sanitizePathSegment(value) {
  return Array.from(String(value || ""))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/[<>:"/\\|?*]/g, "_");
}

async function loadCacheIndex(cacheDir) {
  const indexPath = path.join(cacheDir, "cache-index.json");

  try {
    const content = (await fs.readFile(indexPath, "utf8")).replace(
      /^\uFEFF/,
      "",
    );
    const parsed = JSON.parse(content);
    return {
      indexPath,
      files:
        parsed?.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { indexPath, files: {} };
  }
}

async function saveCacheIndex(cacheIndex) {
  await fs.writeFile(
    cacheIndex.indexPath,
    JSON.stringify({ files: cacheIndex.files }, null, 2),
    "utf8",
  );
}

async function getCachedMediaPath(record, channelId, cacheDir, cacheIndex) {
  const cacheFileName = sanitizePathSegment(record.name);
  const cachePath = path.join(cacheDir, cacheFileName);
  const cachedEntry = cacheIndex.files[cacheFileName];

  try {
    const cachedFile = await fs.stat(cachePath);
    if (
      cachedFile.size > 0 &&
      Number(cachedEntry?.messageId) === Number(record.fileMessageId)
    ) {
      return cachePath;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await fs.mkdir(cacheDir, { recursive: true });
  const legacyCachePath = path.join(
    cacheDir,
    `${record.fileMessageId}-${cacheFileName}`,
  );
  try {
    const legacyFile = await fs.stat(legacyCachePath);
    if (legacyFile.size > 0) {
      await fs.rm(cachePath, { force: true });
      await fs.rename(legacyCachePath, cachePath);
      cacheIndex.files[cacheFileName] = {
        messageId: record.fileMessageId,
      };
      return cachePath;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await fs.rm(cachePath, { force: true });
  const partialPath = `${cachePath}.part`;
  await fs.rm(partialPath, { force: true });
  const downloadResult = await downloadTelegramFileByMessage(
    record.fileMessageId,
    partialPath,
    { chatIdStr: channelId },
  );
  if (!downloadResult?.success) {
    throw new Error(
      downloadResult?.error ||
        `Telegram 文件下载失败: ${record.fileMessageId} (${record.name})`,
    );
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const downloadedFile = await fs.stat(partialPath);
      if (downloadedFile.size > 0) {
        await fs.rename(partialPath, cachePath);
        cacheIndex.files[cacheFileName] = {
          messageId: record.fileMessageId,
        };
        return cachePath;
      }
    } catch (error) {
      if (!["ENOENT", "EACCES", "EPERM", "EBUSY"].includes(error?.code)) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Telegram 文件下载超时或为空: ${record.fileMessageId}`);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => worker(),
    ),
  );
  return results;
}

async function prepareCachedMedia(records, channelId, cacheDir) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheIndex = await loadCacheIndex(cacheDir);
  const cachedMediaPaths = await mapWithConcurrency(
    records,
    DOWNLOAD_CONCURRENCY,
    (record) => getCachedMediaPath(record, channelId, cacheDir, cacheIndex),
  );
  await saveCacheIndex(cacheIndex);
  return cachedMediaPaths;
}

async function createArchive(records, channelId, archivePath, cacheDir) {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  const cachedMediaPaths = await prepareCachedMedia(
    records,
    channelId,
    cacheDir,
  );
  const output = createWriteStream(archivePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const closePromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);

  for (const [index, record] of records.entries()) {
    archive.file(cachedMediaPaths[index], { name: record.name });
  }

  await archive.finalize();
  await closePromise;
}

function getDailyZipPaths(config, channelId, dateKey = getDateKey()) {
  const baseDir =
    config?.tg?.dailyZipOutputDir ||
    config?.paths?.dataDir ||
    app.getPath("userData");

  return {
    archivePath: path.join(
      baseDir,
      "tg-daily-zips",
      dateKey,
      getDailyZipFileName(dateKey),
    ),
    cacheDir: path.join(
      baseDir,
      "tg-daily-zip-cache",
      sanitizePathSegment(channelId),
    ),
  };
}

function resolveDailyZipChannelId(options = {}) {
  return (
    String(options.channelId || "").trim() ||
    String(
      getConfig()?.tg?.discussion || getConfig()?.tg?.channel || "",
    ).trim() ||
    String(getConfig()?.tg?.searchChannelId || "").trim()
  );
}

export async function prefetchDailyZipSources(options = {}) {
  const channelId = resolveDailyZipChannelId(options);
  if (!channelId) throw new Error("未配置每日 ZIP 上传讨论群");

  const uniqueRecords = await getRecentZipRecords(channelId);
  if (!uniqueRecords.length) {
    return { success: true, count: 0, reason: "no-recent-upload" };
  }

  const config = getConfig();
  const { cacheDir } = getDailyZipPaths(config, channelId);
  await prepareCachedMedia(uniqueRecords, channelId, cacheDir);
  return { success: true, count: uniqueRecords.length };
}

export async function generateDailyZip(options = {}) {
  if (generationTask) return generationTask;

  generationTask = (async () => {
    const state = await loadState();
    const dateKey = options.dateKey || getDateKey();
    const existing = state.generated[dateKey];
    const isScheduledRun = options.scheduled === true;
    const scheduled = state.scheduled[dateKey];

    if (isScheduledRun && scheduled?.url) {
      logger.info(
        `[tg-daily-zip] 跳过定时发送：${dateKey} 已在 19:00 自动发送成功`,
      );
      return {
        success: true,
        updated: false,
        reason: "scheduled-already-sent",
        ...scheduled,
      };
    }

    if (!isScheduledRun && !options.force && existing?.url) {
      return { success: true, updated: false, ...existing };
    }

    const channelId = resolveDailyZipChannelId(options);
    if (!channelId) throw new Error("未配置每日 ZIP 上传讨论群");

    const uniqueRecords = await getRecentZipRecords(channelId);
    const sourceSignature = buildSourceSignature(uniqueRecords);

    if (!uniqueRecords.length) {
      return {
        success: true,
        updated: false,
        dateKey,
        url: state.latestUrl || "",
        reason: "no-recent-upload",
      };
    }
    if (
      !options.force &&
      sourceSignature === state.latestSourceSignature &&
      state.latestUrl
    ) {
      if (isScheduledRun) {
        const latestGenerated = Object.values(state.generated).find(
          (item) => item?.url === state.latestUrl,
        );
        const reusedResult = {
          dateKey,
          fileName: latestGenerated?.fileName || "",
          url: state.latestUrl,
          generatedAt: new Date().toISOString(),
          count: uniqueRecords.length,
          sourceSignature,
          deliveryType: "scheduled",
          reused: true,
        };
        state.generated[dateKey] = reusedResult;
        state.scheduled[dateKey] = reusedResult;
        await saveState(state);
      }
      return {
        success: true,
        updated: false,
        dateKey,
        url: state.latestUrl || "",
        reason: "no-new-upload",
      };
    }

    // 频道里已有的 kuruharu-*.zip 如果不晚于最新资源上传，则直接复用，不重新下载打包
    if (options.force !== true) {
      const remoteLatest = await findLatestDailyZipMessage(channelId).catch(
        (error) => {
          logger.warn(
            `[tg-daily-zip] 检测频道已有整合包失败: ${error?.message || error}`,
          );
          return null;
        },
      );

      if (remoteLatest) {
        const maxResourceMessageId = uniqueRecords.reduce(
          (max, record) => Math.max(max, Number(record.fileMessageId) || 0),
          0,
        );

        if (remoteLatest.messageId >= maxResourceMessageId) {
          const linkSet = buildMessageLinksByEntity(
            remoteLatest.entity,
            channelId,
            remoteLatest.messageId,
          );

          if (linkSet.primaryUrl) {
            const result = {
              dateKey,
              fileName: remoteLatest.fileName || getDailyZipFileName(dateKey),
              url: linkSet.primaryUrl,
              messageId: remoteLatest.messageId,
              generatedAt: remoteLatest.date.toISOString(),
              count: uniqueRecords.length,
              sourceSignature,
              deliveryType: isScheduledRun ? "scheduled" : "manual",
              reused: true,
            };
            state.generated[dateKey] = result;
            if (isScheduledRun) {
              state.scheduled[dateKey] = result;
            }
            state.latestUrl = result.url;
            state.latestSourceSignature = sourceSignature;
            await saveState(state);
            logger.info(
              `[tg-daily-zip] 频道已有的整合包仍有效，直接复用: ${result.fileName} url=${result.url}`,
            );
            return {
              success: true,
              updated: true,
              reason: "reuse-remote",
              ...result,
            };
          }
        }
      }
    }

    const { requireConnectedTelegramClient } =
      await import("../utils/telegram-login");
    const client = await requireConnectedTelegramClient();
    const config = getConfig();
    const { archivePath, cacheDir } = getDailyZipPaths(
      config,
      channelId,
      dateKey,
    );
    const outputDir = path.dirname(archivePath);

    let uploaded = false;
    try {
      await createArchive(uniqueRecords, channelId, archivePath, cacheDir);
      const { uploadedMessage, groupEntity: uploadGroupEntity } =
        await sendAggregateArchive(client, channelId, archivePath);
      uploaded = true;
      const messageId = Number(uploadedMessage?.id || 0);
      const linkSet = buildMessageLinksByEntity(
        uploadGroupEntity,
        channelId,
        messageId,
      );
      if (!linkSet.primaryUrl) throw new Error("无法生成每日 ZIP 下载地址");

      const result = {
        dateKey,
        fileName: getDailyZipFileName(dateKey),
        url: linkSet.primaryUrl,
        messageId,
        generatedAt: new Date().toISOString(),
        count: uniqueRecords.length,
        sourceSignature,
        deliveryType: isScheduledRun ? "scheduled" : "manual",
      };
      state.generated[dateKey] = result;
      if (isScheduledRun) {
        state.scheduled[dateKey] = result;
      }
      state.latestUrl = result.url;
      state.latestSourceSignature = sourceSignature;
      await saveState(state);
      return { success: true, updated: true, ...result };
    } finally {
      if (uploaded) {
        await fs
          .rm(outputDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }
  })();

  try {
    return await generationTask;
  } finally {
    generationTask = null;
  }
}
