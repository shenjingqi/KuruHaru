import { getTelegramMessageText } from "../tg-common-core/message-text";
import { normalizeMessageIdFromPayload } from "../tg-common-core/id-normalizers";

const ANCHOR_SIZE_THRESHOLD = 150 * 1024 * 1024;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = /\.(zip|rar|7z|tar|gz|tgz|tar\.gz)$/i;

export function getMessageDocument(msgOrDoc) {
  if (!msgOrDoc || typeof msgOrDoc !== "object") {
    return null;
  }

  if (msgOrDoc.document && typeof msgOrDoc.document === "object") {
    return msgOrDoc.document;
  }

  if (msgOrDoc.media?.document && typeof msgOrDoc.media.document === "object") {
    return msgOrDoc.media.document;
  }

  if (
    Array.isArray(msgOrDoc.attributes) ||
    msgOrDoc.mimeType ||
    msgOrDoc.size
  ) {
    return msgOrDoc;
  }

  return null;
}

function toNumericSize(rawSize) {
  const size = Number(rawSize);
  return Number.isFinite(size) ? size : 0;
}

function isZipLikeFile(fileDocument) {
  const fileName = getFileName(fileDocument).trim().toLowerCase();
  if (fileName.endsWith(".zip")) {
    return true;
  }

  const mimeType = String(fileDocument?.mimeType || "").toLowerCase();
  return mimeType.includes("zip");
}

/**
 * 判断是否为基准文件（整合包）
 * 逻辑：必须是大于 150MB 的 zip 文件，才认为是新版本整合包
 */
export function isReferenceFile(msgOrDoc) {
  const file = getMessageDocument(msgOrDoc);
  const isZipAnchor = isZipLikeFile(file);
  const size = toNumericSize(file?.size ?? msgOrDoc?.fileSize);

  return isZipAnchor && size >= ANCHOR_SIZE_THRESHOLD;
}

/**
 * 辅助：获取文件名
 */
export function getFileName(fileDocument) {
  if (!fileDocument) return "unknown";

  // 优先从 attributes 中查找文件名
  if (Array.isArray(fileDocument.attributes)) {
    const nameAttr = fileDocument.attributes.find(
      (attr) =>
        typeof attr?.fileName === "string" && attr.fileName.trim().length > 0,
    );
    if (nameAttr && nameAttr.fileName) {
      return nameAttr.fileName;
    }
  }
  if (fileDocument.name) return fileDocument.name;
  return "unknown.dat";
}

/**
 * 辅助：从文件名/文本提取 RJ 号
 */
export function extractRJCode(str) {
  if (!str) return null;
  // 提取 RJ/VJ/BJ + 数字 (6-8位)
  const match = str.match(/(RJ|VJ|BJ)\d{6,8}/i);
  return match ? match[0].toUpperCase() : null;
}

export function extractRJCodeFromMsg(msg) {
  const text = getTelegramMessageText(msg);
  return extractRJCode(text);
}

/**
 * 辅助：判断是否是有效的资源文件
 */
export function isValidRJFile(msg) {
  const file = getMessageDocument(msg); // 兼容多种 Telegram 消息结构
  const fileName = getFileName(file);

  // 1. 检查文件名后缀 (只保留压缩包)
  if (!SUPPORTED_EXTENSIONS.test(fileName)) {
    return false;
  }

  // 2. 检查文件大小（普通待处理文件只保留小于 2MB 的 zip）
  const fileSize = toNumericSize(file.size);
  if (fileSize >= MAX_FILE_SIZE) {
    return false;
  }

  // 3. (可选) 如果你只想看 RJ 号文件，取消下面注释
  // if (!extractRJCode(fileName) && !extractRJCodeFromMsg(msg)) return false;

  return true;
}

/**
 * 辅助：格式化文件信息为统一结构
 */
export function formatFile(msg) {
  const file = getMessageDocument(msg);
  const fileName = getFileName(file);
  const RJCode = extractRJCode(fileName) || extractRJCodeFromMsg(msg);
  const messageId = normalizeMessageIdFromPayload(msg) ?? msg.id;

  return {
    rjCode: RJCode,
    messageId,
    date: new Date(msg.date * 1000).toISOString(),
    fileName,
    fileSize: toNumericSize(file.size),
  };
}

/**
 * 辅助：去除重复文件
 */
export function removeDuplicates(files) {
  const map = new Map();
  for (const file of files) {
    const key = file.messageId || file.tgMessageId || file.rjCode || file.id;
    if (!map.has(key)) {
      map.set(key, file);
    }
  }
  return Array.from(map.values());
}

/**
 * 辅助：从消息中构建整合包锚点
 */
export function createAnchorFromMessage(msg) {
  const file = getMessageDocument(msg);
  const fileName = getFileName(file);
  const messageId = normalizeMessageIdFromPayload(msg) ?? msg.id;
  return {
    messageId,
    date: new Date(msg.date * 1000).toISOString(),
    RJCode: extractRJCode(fileName) || "Unknown",
  };
}
