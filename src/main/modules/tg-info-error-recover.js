import fs from "fs";
import path from "path";
import { app, ipcMain } from "electron";
import { getConfig } from "./config";
import { normalizePeerEntityInput } from "./tg-common-core/peer-entity";
import {
  normalizeMessageIdFromPayload,
  normalizePositiveMessageId,
} from "./tg-common-core/id-normalizers";
import { getTelegramMessageText } from "./tg-common-core/message-text";
import { createLogSender } from "../utils/logger";
import { normalizeError } from "../utils/errorHandler";
import { requireConnectedTelegramClient } from "../utils/telegram-login";

const logger = createLogSender("tg-info-error-recover");

const DEFAULT_KEYWORD = "获取作品信息失败";
const DEFAULT_REPLY_SCAN_LIMIT = 200;
const DEFAULT_FILE_PREFIX = "subtitle";
const DEFAULT_SEARCH_BEFORE_LIMIT = 6;
const DEFAULT_SEARCH_AFTER_LIMIT = 4;
const DEFAULT_CANDIDATE_PROBE_LIMIT = 5;
const WORK_CODE_PATTERN = /(RJ|VJ|BJ)\d{6,8}/i;

function toErrorMessage(error) {
  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }
  if (
    typeof error?.errorMessage === "string" &&
    error.errorMessage.trim().length > 0
  ) {
    return error.errorMessage;
  }
  return String(error || "Unknown Error");
}

function normalizeBoolean(rawValue, defaultValue) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return defaultValue;
}

function normalizeTrimmedString(rawValue, fallback = "") {
  if (typeof rawValue === "number" || typeof rawValue === "bigint") {
    return String(rawValue);
  }
  if (typeof rawValue !== "string") {
    return fallback;
  }
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizePositiveInt(rawValue, fallback = 0) {
  const normalized = Number(rawValue);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function resolveSafetyMode(rawOptions) {
  if (typeof rawOptions?.safetyMode === "boolean") {
    return rawOptions.safetyMode;
  }
  if (typeof rawOptions?.dryRun === "boolean") {
    return rawOptions.dryRun;
  }
  if (typeof rawOptions?.deleteMessages === "boolean") {
    return !rawOptions.deleteMessages;
  }
  return true;
}

function normalizeRecoverOptions(rawOptions, config) {
  const tgConfig = config?.tg || {};
  const pathsConfig = config?.paths || {};

  const groupId = normalizeTrimmedString(
    rawOptions?.groupId ??
      rawOptions?.discussionId ??
      rawOptions?.discussion ??
      tgConfig.discussion,
  );
  const channelId = normalizeTrimmedString(
    rawOptions?.channelId ?? rawOptions?.channel ?? tgConfig.channel,
  );
  const keyword = normalizeTrimmedString(
    rawOptions?.keyword ?? rawOptions?.searchKeyword,
    DEFAULT_KEYWORD,
  );
  const replyScanLimit = normalizePositiveInt(
    rawOptions?.replyScanLimit,
    DEFAULT_REPLY_SCAN_LIMIT,
  );
  const searchBeforeLimit = normalizePositiveInt(
    rawOptions?.searchBeforeLimit ??
      rawOptions?.nearbyBeforeLimit ??
      rawOptions?.beforeLimit,
    DEFAULT_SEARCH_BEFORE_LIMIT,
  );
  const searchAfterLimit = normalizePositiveInt(
    rawOptions?.searchAfterLimit ??
      rawOptions?.nearbyAfterLimit ??
      rawOptions?.afterLimit,
    DEFAULT_SEARCH_AFTER_LIMIT,
  );
  const candidateProbeLimit = normalizePositiveInt(
    rawOptions?.candidateProbeLimit ?? rawOptions?.probeLimit,
    DEFAULT_CANDIDATE_PROBE_LIMIT,
  );
  const scanLimit = normalizePositiveInt(
    rawOptions?.scanLimit ?? rawOptions?.limit,
    0,
  );
  const downloadZip = normalizeBoolean(rawOptions?.downloadZip, true);
  const safetyMode = resolveSafetyMode(rawOptions);

  const fallbackDownloadDir = path.join(
    app.getPath("downloads"),
    "KuruHaruTGInfoRecover",
  );
  const downloadDir = path.resolve(
    normalizeTrimmedString(
      rawOptions?.downloadDir ??
        rawOptions?.downloadPath ??
        pathsConfig.tgDownloadDir,
      fallbackDownloadDir,
    ),
  );

  return {
    groupId,
    channelId,
    keyword,
    safetyMode,
    downloadZip,
    downloadDir,
    scanLimit,
    replyScanLimit,
    searchBeforeLimit,
    searchAfterLimit,
    candidateProbeLimit,
  };
}

function sanitizeFileName(rawName, fallbackName) {
  const withoutInvalidSymbols = normalizeTrimmedString(rawName, fallbackName)
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  const sanitized = [...withoutInvalidSymbols]
    .map((char) => (char.charCodeAt(0) < 32 ? "_" : char))
    .join("")
    .trim();

  return sanitized.length > 0 ? sanitized : fallbackName;
}

function ensureZipExtension(fileName) {
  if (fileName.toLowerCase().endsWith(".zip")) {
    return fileName;
  }
  return `${fileName}.zip`;
}

function buildUniqueFilePath(downloadDir, fileName) {
  const extension = path.extname(fileName) || ".zip";
  const baseName = path.basename(fileName, extension);

  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : ` (${index})`;
    const candidatePath = path.join(
      downloadDir,
      `${baseName}${suffix}${extension}`,
    );
    if (!fs.existsSync(candidatePath)) {
      return candidatePath;
    }
    index += 1;
  }
}

function getDocumentFileName(message) {
  const attributes = message?.document?.attributes;
  if (!Array.isArray(attributes)) {
    return "";
  }

  for (const attr of attributes) {
    if (typeof attr?.fileName === "string" && attr.fileName.trim().length > 0) {
      return attr.fileName;
    }
  }

  return "";
}

function isZipDocumentMessage(message) {
  if (!message?.document) {
    return false;
  }

  const fileName = getDocumentFileName(message).toLowerCase();
  if (fileName.endsWith(".zip")) {
    return true;
  }

  const mimeType = String(message.document?.mimeType || "").toLowerCase();
  return mimeType.includes("zip");
}

function collectForwardChannelPostIds(...messages) {
  const channelPostIds = new Set();

  for (const message of messages) {
    const candidate = normalizePositiveMessageId(
      message?.fwdFrom?.channelPost ?? message?.fwdFrom?.savedFromMsgId,
    );
    if (candidate !== null) {
      channelPostIds.add(candidate);
    }
  }

  return [...channelPostIds];
}

function buildMessagePreview(message) {
  const text = getTelegramMessageText(message).replace(/\s+/g, " ").trim();
  if (text.length <= 80) {
    return text;
  }
  return `${text.slice(0, 80)}...`;
}

function extractWorkCodeFromText(rawText) {
  if (typeof rawText !== "string") {
    return "";
  }

  const match = rawText.match(WORK_CODE_PATTERN);
  return match ? match[0].toUpperCase() : "";
}

function extractWorkCodeFromMessage(message) {
  return extractWorkCodeFromText(getTelegramMessageText(message));
}

function isErrorKeywordMessage(message, keyword) {
  const text = getTelegramMessageText(message);
  return Boolean(text && keyword && text.includes(keyword));
}

function collectMessageDistance(errorMessageId, targetMessageId) {
  return Math.abs(errorMessageId - targetMessageId);
}

function buildCandidateScore({
  errorMessageId,
  errorWorkCode,
  candidateMessage,
  candidateMessageId,
  candidateWorkCode,
  keyword,
}) {
  const distance = collectMessageDistance(errorMessageId, candidateMessageId);
  const hasForwardChannelPost =
    collectForwardChannelPostIds(candidateMessage).length > 0;
  const isKeywordError = isErrorKeywordMessage(candidateMessage, keyword);
  const replyToMessageId = normalizePositiveMessageId(
    candidateMessage?.replyToMsgId ?? candidateMessage?.replyTo?.replyToMsgId,
  );

  let score = 0;

  if (
    errorWorkCode &&
    candidateWorkCode &&
    errorWorkCode === candidateWorkCode
  ) {
    score += 220;
  } else if (!errorWorkCode && candidateWorkCode) {
    score += 90;
  }

  if (hasForwardChannelPost) {
    score += 40;
  }

  if (isKeywordError) {
    score -= 160;
  }

  if (replyToMessageId !== null) {
    score -= 12;
  }

  score += candidateMessageId < errorMessageId ? 8 : 2;
  score -= Math.min(distance, 40) * 4;

  return {
    score,
    distance,
    hasForwardChannelPost,
    isKeywordError,
  };
}

async function collectNearbyMessages(
  telegramClient,
  entity,
  errorMessageId,
  searchBeforeLimit,
  searchAfterLimit,
) {
  const normalizedBeforeLimit = normalizePositiveInt(
    searchBeforeLimit,
    DEFAULT_SEARCH_BEFORE_LIMIT,
  );
  const normalizedAfterLimit = normalizePositiveInt(
    searchAfterLimit,
    DEFAULT_SEARCH_AFTER_LIMIT,
  );
  const results = [];

  if (normalizedBeforeLimit > 0) {
    const beforeIterator = telegramClient.iterMessages(entity, {
      limit: normalizedBeforeLimit,
      maxId: errorMessageId,
    });

    for await (const message of beforeIterator) {
      const messageId = normalizeMessageIdFromPayload(message);
      if (messageId !== null && messageId !== errorMessageId) {
        results.push(message);
      }
    }
  }

  if (normalizedAfterLimit > 0) {
    const afterIterator = telegramClient.iterMessages(entity, {
      limit: normalizedAfterLimit,
      minId: errorMessageId,
    });

    for await (const message of afterIterator) {
      const messageId = normalizeMessageIdFromPayload(message);
      if (messageId !== null && messageId !== errorMessageId) {
        results.push(message);
      }
    }
  }

  const dedupedMap = new Map();
  for (const message of results) {
    const messageId = normalizeMessageIdFromPayload(message);
    if (messageId !== null) {
      dedupedMap.set(messageId, message);
    }
  }

  return [...dedupedMap.values()];
}

function buildTargetCandidates(errorMessage, nearbyMessages, keyword) {
  const errorMessageId = normalizeMessageIdFromPayload(errorMessage);
  if (errorMessageId === null) {
    return [];
  }

  const errorWorkCode = extractWorkCodeFromMessage(errorMessage);

  const candidates = [];
  for (const message of nearbyMessages) {
    const candidateMessageId = normalizeMessageIdFromPayload(message);
    if (candidateMessageId === null || candidateMessageId === errorMessageId) {
      continue;
    }

    const candidateWorkCode = extractWorkCodeFromMessage(message);
    const scoreMeta = buildCandidateScore({
      errorMessageId,
      errorWorkCode,
      candidateMessage: message,
      candidateMessageId,
      candidateWorkCode,
      keyword,
    });

    candidates.push({
      message,
      messageId: candidateMessageId,
      workCode: candidateWorkCode,
      ...scoreMeta,
    });
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.distance - right.distance;
  });
}

async function resolveEntity(telegramClient, chatIdInput) {
  const peerId = normalizePeerEntityInput(chatIdInput);

  try {
    return await telegramClient.getEntity(peerId);
  } catch {
    logger.warn(`本地缓存未找到实体 ${chatIdInput}，正在刷新 dialogs 后重试`);
  }

  await telegramClient.getDialogs({ limit: 100 });
  return telegramClient.getEntity(peerId);
}

async function findFirstZipReply(
  telegramClient,
  entity,
  replyToMessageId,
  replyScanLimit,
) {
  const iterator = telegramClient.iterMessages(entity, {
    replyTo: replyToMessageId,
    limit: replyScanLimit,
  });

  for await (const message of iterator) {
    if (isZipDocumentMessage(message)) {
      return message;
    }
  }

  return null;
}

async function recoverInfoErrors(rawOptions = {}) {
  const config = getConfig();
  const options = normalizeRecoverOptions(rawOptions, config);

  if (!options.groupId) {
    throw new Error("未配置讨论组 ID（请传 groupId 或填写 tg.discussion）");
  }
  if (!options.channelId) {
    throw new Error("未配置频道 ID（请传 channelId 或填写 tg.channel）");
  }

  const telegramClient = await requireConnectedTelegramClient();
  const groupEntity = await resolveEntity(telegramClient, options.groupId);
  const channelEntity = await resolveEntity(telegramClient, options.channelId);

  if (options.downloadZip) {
    await fs.promises.mkdir(options.downloadDir, { recursive: true });
  }

  const records = [];
  const errors = [];

  let processedCount = 0;
  let zipFoundCount = 0;
  let zipDownloadedCount = 0;
  let deletedMessageCount = 0;
  let deleteSkippedCount = 0;

  const iterOptions = { search: options.keyword };
  if (options.scanLimit > 0) {
    iterOptions.limit = options.scanLimit;
  }

  logger.info(
    `[接口日志] 开始执行 info-error 恢复: keyword=${options.keyword}, group=${options.groupId}, channel=${options.channelId}, safetyMode=${options.safetyMode}, scanLimit=${options.scanLimit || "all"}, before=${options.searchBeforeLimit}, after=${options.searchAfterLimit}, probe=${options.candidateProbeLimit}`,
  );

  const iterator = telegramClient.iterMessages(groupEntity, iterOptions);
  for await (const errorMessage of iterator) {
    const errorMessageId = normalizeMessageIdFromPayload(errorMessage);
    if (errorMessageId === null) {
      continue;
    }

    processedCount += 1;
    const errorWorkCode = extractWorkCodeFromMessage(errorMessage);
    const row = {
      errorMessageId,
      errorWorkCode,
      targetMessageId: null,
      targetMessagePreview: "",
      targetWorkCode: "",
      candidateMessageIds: [],
      matchedBy: "",
      matchDistance: null,
      matchScore: null,
      zipReplyMessageId: null,
      zipFileName: "",
      zipDownloaded: false,
      zipDownloadPath: "",
      channelMessageIds: [],
      deleted: false,
      safetyMode: options.safetyMode,
      error: "",
    };

    try {
      const nearbyMessages = await collectNearbyMessages(
        telegramClient,
        groupEntity,
        errorMessageId,
        options.searchBeforeLimit,
        options.searchAfterLimit,
      );
      const candidates = buildTargetCandidates(
        errorMessage,
        nearbyMessages,
        options.keyword,
      );
      row.candidateMessageIds = candidates.map((item) => item.messageId);

      if (candidates.length === 0) {
        row.error = "附近上下消息未找到可匹配候选";
        records.push(row);
        continue;
      }

      const probeLimit = normalizePositiveInt(
        options.candidateProbeLimit,
        DEFAULT_CANDIDATE_PROBE_LIMIT,
      );
      const probeCandidates = candidates.slice(0, probeLimit);

      let selectedCandidate = candidates[0];
      let selectedZipReply = null;

      for (const candidate of probeCandidates) {
        const zipReply = await findFirstZipReply(
          telegramClient,
          groupEntity,
          candidate.messageId,
          options.replyScanLimit,
        );
        if (zipReply) {
          selectedCandidate = candidate;
          selectedZipReply = zipReply;
          break;
        }
      }

      const targetMessage = selectedCandidate.message;
      row.targetMessageId = normalizeMessageIdFromPayload(targetMessage);
      row.targetMessagePreview = buildMessagePreview(targetMessage);
      row.targetWorkCode = selectedCandidate.workCode;
      row.matchDistance = selectedCandidate.distance;
      row.matchScore = selectedCandidate.score;
      row.matchedBy = selectedZipReply
        ? selectedCandidate.workCode &&
          errorWorkCode &&
          selectedCandidate.workCode === errorWorkCode
          ? "nearby-workcode+zip"
          : "nearby-zip"
        : selectedCandidate.workCode &&
            errorWorkCode &&
            selectedCandidate.workCode === errorWorkCode
          ? "nearby-workcode"
          : "nearby-score";
      if (row.targetMessageId === null) {
        row.error = "匹配候选消息 ID 非法，已跳过";
        records.push(row);
        continue;
      }

      const zipReply =
        selectedZipReply ||
        (await findFirstZipReply(
          telegramClient,
          groupEntity,
          row.targetMessageId,
          options.replyScanLimit,
        ));
      if (zipReply) {
        zipFoundCount += 1;
        row.zipReplyMessageId = normalizeMessageIdFromPayload(zipReply);

        const fallbackName = `${DEFAULT_FILE_PREFIX}-${row.targetMessageId || errorMessageId}`;
        const originalFileName = getDocumentFileName(zipReply);
        const safeFileName = ensureZipExtension(
          sanitizeFileName(originalFileName, fallbackName),
        );
        row.zipFileName = safeFileName;

        if (options.downloadZip) {
          const outputPath = buildUniqueFilePath(
            options.downloadDir,
            safeFileName,
          );
          await telegramClient.downloadMedia(zipReply, {
            outputFile: outputPath,
            workers: 1,
          });
          row.zipDownloaded = true;
          row.zipDownloadPath = outputPath;
          zipDownloadedCount += 1;
        }
      }

      const channelMessageIds = collectForwardChannelPostIds(
        errorMessage,
        targetMessage,
      );
      row.channelMessageIds = channelMessageIds;

      if (channelMessageIds.length > 0) {
        if (options.safetyMode) {
          deleteSkippedCount += channelMessageIds.length;
        } else {
          await telegramClient.deleteMessages(
            channelEntity,
            channelMessageIds,
            {
              revoke: true,
            },
          );
          row.deleted = true;
          deletedMessageCount += channelMessageIds.length;
        }
      }
    } catch (error) {
      const message = toErrorMessage(error);
      row.error = message;
      errors.push({
        errorMessageId,
        message,
      });
    }

    records.push(row);
  }

  logger.info(
    `[接口日志] info-error 恢复完成: processed=${processedCount}, zipFound=${zipFoundCount}, downloaded=${zipDownloadedCount}, deleted=${deletedMessageCount}, skippedDelete=${deleteSkippedCount}, errors=${errors.length}`,
  );

  return {
    success: true,
    options,
    summary: {
      processedCount,
      zipFoundCount,
      zipDownloadedCount,
      deletedMessageCount,
      deleteSkippedCount,
      errorCount: errors.length,
    },
    records,
    errors,
  };
}

export function setupTgInfoErrorRecoverIPC() {
  const handlers = ["tg-info-error-recover"];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // ignore
    }
  }

  ipcMain.handle("tg-info-error-recover", async (_event, options = {}) => {
    try {
      return await recoverInfoErrors(options);
    } catch (error) {
      const normalized = normalizeError(error, {
        context: "tg_info_error_recover",
      });
      logger.error(
        `[接口日志] tg-info-error-recover 失败: ${normalized?.error?.message || toErrorMessage(error)}`,
      );
      return {
        success: false,
        error: normalized?.error?.message || toErrorMessage(error),
        details: normalized?.error || null,
      };
    }
  });
}
