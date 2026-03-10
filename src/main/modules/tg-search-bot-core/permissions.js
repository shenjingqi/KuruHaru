import {
  normalizeChatIdFromPayload,
  normalizeSenderIdFromPayload,
} from "../tg-common-core/id-normalizers";

export function evaluatePermission(msg, runtimeConfig) {
  const userId = normalizeSenderIdFromPayload(msg) || "";
  const chatId = normalizeChatIdFromPayload(msg) || "";
  const { allowedUsers, allowedChats } = runtimeConfig;

  const matchedUser = allowedUsers.includes(userId);
  const matchedChat = allowedChats.includes(chatId);
  const hasWhitelist = allowedUsers.length > 0 || allowedChats.length > 0;

  return {
    allowed: !hasWhitelist || matchedUser || matchedChat,
    userId,
    chatId,
    matchedUser,
    matchedChat,
    hasWhitelist,
  };
}
