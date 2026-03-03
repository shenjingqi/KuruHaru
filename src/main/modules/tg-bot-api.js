/**
 * Telegram Bot API 模块
 * 使用 node-telegram-bot-api 实现真正的 Bot 功能
 */

import TelegramBot from "node-telegram-bot-api";
import { ipcMain } from "electron";
import { getConfig } from "./config";
import { createLogSender } from "../utils/logger";

const logger = createLogSender("tg-bot-api");

// Bot 实例
let bot = null;
let isRunning = false;

// ==========================================
// Bot 生命周期管理
// ==========================================

/**
 * 启动 Bot
 */
export async function startBot() {
  if (isRunning && bot) {
    logger.info("[tg-bot-api] Bot 已在运行");
    return { success: true, message: "Bot 已在运行" };
  }

  try {
    const config = await getConfig();
    const botToken = config.tg?.botToken;

    if (!botToken) {
      return {
        success: false,
        error: "未配置 Bot Token，请在设置中添加 botToken",
      };
    }

    // 创建 Bot 实例，使用轮询模式
    bot = new TelegramBot(botToken, {
      polling: {
        interval: 300,
        autoStart: true,
        params: {
          timeout: 10,
        },
      },
    });

    // 注册消息处理器
    setupMessageHandlers(bot, config);

    isRunning = true;

    // 获取 Bot 信息
    const botInfo = await bot.getMe();
    logger.info(`[tg-bot-api] Bot 启动成功: @${botInfo.username}`);

    return {
      success: true,
      message: "Bot 启动成功",
      botInfo: {
        id: botInfo.id,
        username: botInfo.username,
        firstName: botInfo.first_name,
      },
    };
  } catch (error) {
    logger.error("[tg-bot-api] Bot 启动失败:", error.message);

    // 清理失败的实例
    if (bot) {
      try {
        await bot.stopPolling();
      } catch (e) {
        // 忽略
      }
      bot = null;
    }
    isRunning = false;

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 停止 Bot
 */
export async function stopBot() {
  if (!isRunning || !bot) {
    logger.info("[tg-bot-api] Bot 已经停止");
    return { success: true, message: "Bot 已经停止" };
  }

  try {
    // 停止轮询
    await bot.stopPolling();

    bot = null;
    isRunning = false;

    logger.info("[tg-bot-api] Bot 已停止");

    return { success: true, message: "Bot 已停止" };
  } catch (error) {
    logger.error("[tg-bot-api] 停止 Bot 失败:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取 Bot 状态
 */
export function getBotStatus() {
  return {
    running: isRunning,
    connected: isRunning && bot !== null,
    botInfo: bot ? bot.botInfo : null,
  };
}

// ==========================================
// 消息处理器
// ==========================================

/**
 * 设置消息处理器
 */
function setupMessageHandlers(bot, config) {
  // 处理 /start 命令
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;

    logger.info(`[tg-bot-api] 收到 /start 命令 from ${username}`);

    // 检查权限
    if (!checkPermission(msg, config)) {
      await bot.sendMessage(chatId, "❌ 您没有权限使用此 Bot。");
      return;
    }

    await bot.sendMessage(
      chatId,
      `👋 你好，${username}！\n\n` +
        `我是 KuruHaru Bot，可以帮助你搜索 RJ 号。\n\n` +
        `可用命令：\n` +
        `/search <RJ号> - 搜索 RJ 号\n` +
        `/help - 显示帮助信息`,
    );
  });

  // 处理 /search 命令
  bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    const rjCode = match[1].trim().toUpperCase();

    logger.info(`[tg-bot-api] 收到 /search 命令 from ${username}: ${rjCode}`);

    // 检查权限
    if (!checkPermission(msg, config)) {
      await bot.sendMessage(chatId, "❌ 您没有权限使用此 Bot。");
      return;
    }

    // 验证 RJ 号格式
    if (!/^RJ\d{6,8}$/i.test(rjCode)) {
      await bot.sendMessage(
        chatId,
        "❌ 无效的 RJ 号格式。请使用格式如：RJ189111",
      );
      return;
    }

    // 发送搜索中消息
    const searchingMsg = await bot.sendMessage(
      chatId,
      `🔍 正在搜索 ${rjCode}...`,
    );

    try {
      // 调用搜索功能（这里需要实现实际的搜索逻辑）
      // 暂时返回模拟结果
      await bot.editMessageText(
        `✅ 找到结果：${rjCode}\n\n` +
          `标题：[作品标题]\n` +
          `社团：[社团名称]\n` +
          `价格：[价格]\n\n` +
          `链接：https://www.dlsite.com/maniax/work/=/product_id/${rjCode}.html`,
        {
          chat_id: chatId,
          message_id: searchingMsg.message_id,
        },
      );
    } catch (error) {
      logger.error("[tg-bot-api] 搜索失败:", error.message);
      await bot.editMessageText(`❌ 搜索失败: ${error.message}`, {
        chat_id: chatId,
        message_id: searchingMsg.message_id,
      });
    }
  });

  // 处理 /help 命令
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      `📖 帮助信息\n\n` +
        `可用命令：\n` +
        `/start - 启动 Bot\n` +
        `/search <RJ号> - 搜索 RJ 号（例如：/search RJ189111）\n` +
        `/help - 显示此帮助信息\n\n` +
        `注意事项：\n` +
        `• RJ 号格式为 RJ 开头，后跟 6-8 位数字\n` +
        `• 搜索可能需要几秒钟时间`,
    );
  });

  // 处理普通消息
  bot.on("message", async (msg) => {
    // 忽略命令消息
    if (msg.text && msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const text = msg.text || "";

    // 检查是否是 RJ 号
    const rjMatch = text.match(/(RJ\d{6,8})/i);
    if (rjMatch) {
      // 自动回复，提示使用 /search 命令
      await bot.sendMessage(
        chatId,
        `检测到 RJ 号：${rjMatch[1].toUpperCase()}\n\n` +
          `请使用 /search 命令进行搜索，例如：\n` +
          `/search ${rjMatch[1].toUpperCase()}`,
      );
    }
  });
}

/**
 * 检查用户权限
 */
function checkPermission(msg, config) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // 如果配置了允许的用户列表，检查是否在列表中
  const allowedUsers = config.tg?.bot?.allowedUsers || [];
  if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
    return false;
  }

  // 如果配置了允许的群组列表，检查是否在列表中
  const allowedGroups = config.tg?.bot?.allowedGroups || [];
  if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
    return false;
  }

  return true;
}

// ==========================================
// IPC 通信注册
// ==========================================

export function setupTgBotApiIPC() {
  logger.info("[tg-bot-api] 正在初始化 IPC 处理器...");

  const handlers = ["tg-bot-start", "tg-bot-stop", "tg-bot-status"];

  for (const handler of handlers) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略错误
    }
  }

  // 启动 Bot
  ipcMain.handle("tg-bot-start", async () => {
    logger.info("IPC: tg-bot-start");
    return await startBot();
  });

  // 停止 Bot
  ipcMain.handle("tg-bot-stop", async () => {
    logger.info("IPC: tg-bot-stop");
    return await stopBot();
  });

  // 获取 Bot 状态
  ipcMain.handle("tg-bot-status", async () => {
    return getBotStatus();
  });

  logger.info("[tg-bot-api] 所有 IPC 处理器注册完成!");
}
