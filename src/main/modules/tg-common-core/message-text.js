export function getTelegramMessageText(message) {
  return message?.text || message?.caption || "";
}
