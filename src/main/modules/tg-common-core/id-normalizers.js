// Telegram message_id 在业务里要求是正整数，非法值统一降级为 null。
export function normalizePositiveMessageId(rawValue) {
  const normalized = Number(rawValue);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

// 列表场景下同时做「格式校验 + 去重」，返回稳定可用的 message_id 数组。
export function normalizeMessageIdList(messageIds) {
  if (!Array.isArray(messageIds)) {
    return [];
  }

  return [
    ...new Set(
      messageIds
        .map((messageId) => normalizePositiveMessageId(messageId))
        .filter((messageId) => messageId !== null),
    ),
  ];
}

function pickFirstDefined(values) {
  // payload 可能来自不同入口，优先取第一个非空字段。
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

export function normalizeFlexiblePeerId(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "bigint") {
    return rawValue.toString();
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? String(Math.trunc(rawValue)) : null;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof rawValue === "object") {
    // 兼容多种上游对象形态，递归提取实际 ID 值。
    if ("value" in rawValue) {
      return normalizeFlexiblePeerId(rawValue.value);
    }
    if ("userId" in rawValue) {
      return normalizeFlexiblePeerId(rawValue.userId);
    }
    if ("channelId" in rawValue) {
      return normalizeFlexiblePeerId(rawValue.channelId);
    }
    if ("chatId" in rawValue) {
      return normalizeFlexiblePeerId(rawValue.chatId);
    }
  }

  return null;
}

export function normalizeUsername(rawUsername) {
  if (typeof rawUsername !== "string") {
    return "";
  }

  return rawUsername.trim().toLowerCase();
}

export function normalizeMessageIdFromPayload(payload) {
  if (payload && typeof payload === "object") {
    // 兼容 snake_case / camelCase / 历史字段名。
    const candidate = pickFirstDefined([
      payload.messageId,
      payload.message_id,
      payload.id,
      payload.msgId,
    ]);
    return normalizePositiveMessageId(candidate);
  }

  return normalizePositiveMessageId(payload);
}

export function normalizeSenderIdFromPayload(payload) {
  if (payload && typeof payload === "object") {
    // sender 信息来源不稳定，按优先级依次回退。
    const candidate = pickFirstDefined([
      payload.senderInfo?.senderId,
      payload.senderId,
      payload.fromId,
      payload.from_id,
      payload.rawSenderId,
      payload.rawFromId,
      payload.from?.id,
    ]);
    return normalizeFlexiblePeerId(candidate);
  }

  return normalizeFlexiblePeerId(payload);
}

export function normalizeChatIdFromPayload(payload) {
  if (payload && typeof payload === "object") {
    // 兼容 chat/peer 的不同字段命名。
    const candidate = pickFirstDefined([
      payload.peerId,
      payload.chatId,
      payload.chat_id,
      payload.chat?.id,
    ]);
    return normalizeFlexiblePeerId(candidate);
  }

  return normalizeFlexiblePeerId(payload);
}
