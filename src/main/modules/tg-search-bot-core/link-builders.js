import { normalizeChannelId, normalizeNumericChannelId } from "./normalizers";

function normalizeMessageId(rawMessageId) {
  const messageId = Number(rawMessageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return "";
  }
  return String(messageId);
}

function normalizeUsername(rawValue) {
  const normalized = normalizeChannelId(rawValue).replace(/^@/, "");
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function toInternalChannelId(rawValue) {
  const normalizedNumeric = normalizeNumericChannelId(rawValue);
  if (/^-100\d+$/.test(normalizedNumeric)) {
    return normalizedNumeric.slice(1);
  }

  const normalizedRaw = normalizeChannelId(rawValue);
  if (/^\d+$/.test(normalizedRaw)) {
    return normalizedRaw;
  }

  if (/^-\d+$/.test(normalizedRaw)) {
    return normalizedRaw.slice(1);
  }

  return "";
}

function dedupeLinks(urls) {
  const unique = [];
  const existed = new Set();

  for (const url of urls) {
    if (!url || existed.has(url)) continue;
    existed.add(url);
    unique.push(url);
  }

  return unique;
}

function createLinkResult(urls) {
  const deduped = dedupeLinks(urls);
  return {
    primaryUrl: deduped[0] || null,
    alternateUrls: deduped.slice(1),
    urls: deduped,
  };
}

function buildCandidateLinks({
  username = "",
  internalChannelId = "",
  messageId = "",
}) {
  const candidates = [];

  if (internalChannelId) {
    candidates.push(`https://t.me/c/${internalChannelId}/${messageId}`);
    // tg:// 在 Telegram 客户端里通常更稳，保留为备用深链。
    candidates.push(
      `tg://privatepost?channel=${internalChannelId}&post=${messageId}`,
    );
  }

  if (username) {
    candidates.push(`https://t.me/${username}/${messageId}`);
    candidates.push(`tg://resolve?domain=${username}&post=${messageId}`);
  }

  return createLinkResult(candidates);
}

// 基于 Telegram chat 对象构造消息链接集合：优先内部 ID（更稳定）再回退 username。
export function buildMessageLinksByChat(chat, rawMessageId) {
  if (!chat) return createLinkResult([]);

  const messageId = normalizeMessageId(rawMessageId);
  if (!messageId) return createLinkResult([]);

  return buildCandidateLinks({
    username: normalizeUsername(chat.username),
    internalChannelId: toInternalChannelId(chat.id),
    messageId,
  });
}

// 基于 Telegram chat 对象构造消息链接：优先 username，其次私有频道数字 ID。
export function buildMessageLinkByChat(chat, messageId) {
  return buildMessageLinksByChat(chat, messageId).primaryUrl;
}

// 从 entity + 回退频道配置构造完整链接集合，兼容 username 与数字频道两种形态。
export function buildMessageLinksByEntity(
  entity,
  fallbackChannelId,
  rawMessageId,
) {
  const messageId = normalizeMessageId(rawMessageId);
  if (!messageId) return createLinkResult([]);

  const fallbackNormalized = normalizeChannelId(fallbackChannelId);

  return buildCandidateLinks({
    username:
      normalizeUsername(entity?.username) ||
      normalizeUsername(fallbackNormalized),
    internalChannelId:
      toInternalChannelId(entity?.id) ||
      toInternalChannelId(fallbackNormalized),
    messageId,
  });
}

// 从 entity + 回退频道配置构造链接，兼容 username 与 -100 数字频道两种形态。
export function buildMessageLinkByEntity(entity, fallbackChannelId, messageId) {
  return buildMessageLinksByEntity(entity, fallbackChannelId, messageId)
    .primaryUrl;
}

// 判断消息是否来自目标频道：支持配置用户名或数字频道 ID。
export function isSameChannel(chat, configuredChannelId) {
  if (!chat) return false;

  const normalizedChannelId = normalizeChannelId(configuredChannelId);
  // 未配置频道时等价于不过滤频道。
  if (!normalizedChannelId) return true;

  const chatId = normalizeNumericChannelId(chat.id);
  const targetNumericId = normalizeNumericChannelId(normalizedChannelId);

  if (/^-100\d+$/.test(targetNumericId) && chatId === targetNumericId) {
    return true;
  }

  const channelUsername = normalizedChannelId.replace(/^@/, "").toLowerCase();
  if (chat.username && chat.username.toLowerCase() === channelUsername) {
    return true;
  }

  return false;
}
