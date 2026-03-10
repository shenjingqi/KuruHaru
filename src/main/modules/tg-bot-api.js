/**
 * Telegram Bot API 兼容入口
 *
 * 说明：
 * - 旧模块名保留，避免历史引用失效
 * - 实际实现统一复用 tg-search-bot（Bot API 主线）
 */

import {
  startBot,
  stopBot,
  getBotStatus,
  handleSearchRequest,
  handleInfoRequest,
  setupTgSearchBotIPC,
} from "./tg-search-bot";

export {
  startBot,
  stopBot,
  getBotStatus,
  handleSearchRequest,
  handleInfoRequest,
};

export function setupTgBotApiIPC() {
  return setupTgSearchBotIPC();
}
