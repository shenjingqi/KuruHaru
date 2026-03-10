import { getTelegramMessageText } from "../tg-common-core/message-text";
import { normalizeMessageIdFromPayload } from "../tg-common-core/id-normalizers";

const ANCHOR_SIZE_THRESHOLD = 150 * 1024 * 1024;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const SUPPORTED_EXTENSIONS = /\.(zip|rar|7z|tar|gz|tgz|tar\.gz)$/i;

/**
 * 判断是否为基准文件（整合包）
 * 逻辑：只要体积大于 150MB，就认为是新版本的整合包
 */
export function isReferenceFile(msgOrDoc) {
  let size = 0;

  // 处理 document 对象 (GramJS document 结构)
  if (msgOrDoc.size && typeof msgOrDoc.size === "number") {
    size = msgOrDoc.size;
  }
  // 处理 message 对象 (包含 document)
  else if (msgOrDoc.document) {
    size = msgOrDoc.document.size;
  }
  // 处理手动构造的普通对象
  else if (msgOrDoc.fileSize) {
    size = msgOrDoc.fileSize;
  }

  return size >= ANCHOR_SIZE_THRESHOLD;
}

/**
 * 辅助：获取文件名
 */
export function getFileName(fileDocument) {
  if (!fileDocument) return "unknown";

  // 优先从 attributes 中查找文件名
  if (fileDocument.attributes) {
    const nameAttr = fileDocument.attributes.find(
      (a) => a.className === "DocumentAttributeFilename",
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
  const file = msg.document || msg; // 兼容直接传 document 或 message
  const fileName = getFileName(file);

  // 1. 检查文件名后缀 (只保留压缩包)
  if (!SUPPORTED_EXTENSIONS.test(fileName)) {
    return false;
  }

  // 2. 检查文件大小 (只下载小于2MB的文件)
  const fileSize = file.size || 0;
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
  const file = msg.document;
  const fileName = getFileName(file);
  const RJCode = extractRJCode(fileName) || extractRJCodeFromMsg(msg);
  const messageId = normalizeMessageIdFromPayload(msg) ?? msg.id;

  return {
    id: RJCode || fileName, // 优先用 RJ 号做 ID
    messageId, // Telegram 消息 ID
    tgMessageId: messageId, // 兼容字段
    date: new Date(msg.date * 1000).toISOString(),
    timestamp: msg.date * 1000,
    name: fileName, // 文件名（前端期望的字段）
    fileName: fileName, // 兼容字段
    fileSize: file.size,
    rjCode: RJCode,
    source: "telegram",
  };
}

/**
 * 辅助：去除重复文件
 */
export function removeDuplicates(files) {
  const map = new Map();
  for (const file of files) {
    // 使用 tgMessageId 作为唯一键 (最准确)
    const key = file.tgMessageId || file.id;
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
  const fileName = getFileName(msg.document);
  const messageId = normalizeMessageIdFromPayload(msg) ?? msg.id;
  return {
    messageId,
    date: new Date(msg.date * 1000).toISOString(),
    RJCode: extractRJCode(fileName) || "Unknown",
  };
}
