import {
  normalizeChatIdFromPayload,
  normalizeSenderIdFromPayload,
} from "../tg-common-core/id-normalizers";
import { getTelegramMessageText } from "../tg-common-core/message-text";

// 对敏感字段做最小可识别脱敏，保证日志可排障但不直接泄露原文。
export function maskField(rawValue) {
  const text = String(rawValue || "");
  if (!text) return "-";
  if (text.length <= 4) return `${text[0]}***`;
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

// 调试模式输出截断后的原始内容；非调试模式仅输出长度信息。
export function normalizeRequestContent(rawValue, debugEnabled) {
  const normalized = String(rawValue || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  if (debugEnabled) {
    return normalized.length > 280
      ? `${normalized.slice(0, 280)}...`
      : normalized;
  }

  return `[redacted length=${normalized.length}]`;
}

// 统一构建命令日志上下文，按 debug 开关决定是否脱敏用户与会话信息。
export function buildRequestLogContext(msg, commandName, options = {}) {
  const debugEnabled = options.debugEnabled === true;
  const from = msg?.from || {};
  const chat = msg?.chat || {};
  const senderId = normalizeSenderIdFromPayload(msg) || "";
  const senderUsername = from.username || "";
  const senderName = [from.first_name, from.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const chatId = normalizeChatIdFromPayload(msg) || "";
  const chatType = String(chat.type || "unknown");
  const chatTitle = chat.title || chat.username || "";
  const content = normalizeRequestContent(
    getTelegramMessageText(msg),
    debugEnabled,
  );

  return {
    commandName,
    senderId: debugEnabled ? senderId : maskField(senderId),
    senderUsername: debugEnabled
      ? senderUsername || "-"
      : maskField(senderUsername),
    senderName: debugEnabled ? senderName || "-" : maskField(senderName),
    chatId: debugEnabled ? chatId : maskField(chatId),
    chatType,
    chatTitle: debugEnabled ? chatTitle || "-" : maskField(chatTitle),
    content,
  };
}
