export function toMessageId(rawValue) {
  // 删除消息等下游流程依赖整数 messageId，统一在入口过滤无效值。
  const normalized = Number(rawValue);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

export function toPeerId(rawValue) {
  // Telegram SDK/缓存层的 sender 标识形态不稳定，统一折叠为可比较的字符串 ID。
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? String(Math.trunc(rawValue)) : null;
  }

  if (typeof rawValue === "bigint") {
    return rawValue.toString();
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof rawValue === "object") {
    // 递归拆箱常见包装字段，兼容 value/userId/channelId/chatId 等多种结构。
    if ("value" in rawValue) {
      return toPeerId(rawValue.value);
    }
    if ("userId" in rawValue) {
      return toPeerId(rawValue.userId);
    }
    if ("channelId" in rawValue) {
      return toPeerId(rawValue.channelId);
    }
    if ("chatId" in rawValue) {
      return toPeerId(rawValue.chatId);
    }
  }

  return null;
}

export function getMessageId(messageData) {
  if (!messageData) {
    return null;
  }
  return toMessageId(messageData.messageId ?? messageData.id);
}

export function getMessageIdText(messageData) {
  const messageId = getMessageId(messageData);
  return messageId === null ? "未知" : String(messageId);
}

export function getSenderId(messageData) {
  if (!messageData) {
    return null;
  }

  // 优先读取新结构 senderInfo.senderId，再回退历史字段，保持数据向后兼容。
  return toPeerId(
    messageData.senderInfo?.senderId ??
      messageData.senderId ??
      messageData.fromId,
  );
}

export function getSenderIdText(messageData) {
  const senderId = getSenderId(messageData);
  return senderId === null ? "未知" : senderId;
}

export function getSenderName(messageData) {
  if (!messageData) {
    return null;
  }

  const senderName =
    messageData.senderInfo?.name ||
    messageData.senderInfo?.username ||
    messageData.postAuthor;

  if (typeof senderName !== "string") {
    return null;
  }

  const normalized = senderName.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getSenderNameText(messageData) {
  return getSenderName(messageData) || "未知";
}

export function getMessageTimestamp(messageData) {
  if (!messageData?.date) {
    return 0;
  }

  const timestamp = new Date(messageData.date).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getRowKey(row) {
  // 表格 key 先用稳定 messageId；缺失时才拼接业务字段，降低渲染抖动与 key 冲突概率。
  const userMessageId = getMessageId(row.userMessage);
  if (userMessageId !== null) {
    return userMessageId;
  }

  const botMessageId = getMessageId(row.botMessage);
  if (botMessageId !== null) {
    return `bot-${botMessageId}`;
  }

  return `${row.rjCode || "unknown"}-${row.associationMethod || "none"}-${new Date(
    row.userMessage?.date || 0,
  ).getTime()}`;
}

export function collectMessageIds(rows) {
  // 批量删除前扁平化 user/bot 消息 ID，过滤空值并去重，避免重复请求同一消息。
  const messageIds = rows
    .map((row) => [getMessageId(row.userMessage), getMessageId(row.botMessage)])
    .flat()
    .filter((messageId) => messageId !== null);

  return [...new Set(messageIds)];
}
