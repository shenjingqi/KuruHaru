/**
 * 统一的日志发送工具
 * 支持控制台输出和文件日志（不同模块使用不同日志文件）
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/**
 * 获取日志目录
 * 使用动态导入避免循环依赖
 */
async function getLogDirectory() {
  try {
    const { getConfig } = await import('../modules/config')
    const config = getConfig()

    // 优先使用配置中的 logsDir
    if (config.paths?.logsDir && config.paths.logsDir.trim()) {
      return config.paths.logsDir
    }

    // 默认目录
    return path.join(app.getPath('userData'), 'logs')
  } catch {
    return path.join(app.getPath('userData'), 'logs')
  }
}

/**
 * 日志级别枚举
 */
const LOG_LEVEL = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
}

/**
 * 日志级别权重，用于过滤
 */
const LOG_LEVEL_WEIGHT = {
  [LOG_LEVEL.ERROR]: 4,
  [LOG_LEVEL.WARN]: 3,
  [LOG_LEVEL.INFO]: 2,
  [LOG_LEVEL.DEBUG]: 1
}

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG = {
  level: 'info',
  enableFileLog: true
}

/**
 * 获取日志配置
 * 使用动态导入避免循环依赖
 */
async function getLoggingConfig() {
  try {
    const { getConfig } = await import('../modules/config')
    const fullConfig = getConfig()
    return { ...DEFAULT_CONFIG, ...fullConfig.logging }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 获取当前日志级别权重
 */
async function getCurrentLevelWeight() {
  const config = await getLoggingConfig()
  const level = config.level || 'info'
  return LOG_LEVEL_WEIGHT[level.toUpperCase()] || LOG_LEVEL_WEIGHT[LOG_LEVEL.INFO]
}

/**
 * 是否应该输出此级别的日志
 */
async function shouldLog(level) {
  const currentWeight = await getCurrentLevelWeight()
  const messageWeight = LOG_LEVEL_WEIGHT[level.toUpperCase()] || LOG_LEVEL_WEIGHT[LOG_LEVEL.INFO]
  return messageWeight <= currentWeight
}

/**
 * 格式化日志消息（带时间戳）
 */
function formatLogMessage(moduleName, level, message) {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level.toUpperCase()}] [${moduleName}] ${message}`
}

/**
 * 写入文件日志 (异步)
 */
async function writeToFile(message, type) {
  const config = await getLoggingConfig()
  if (!config.enableFileLog) return

  try {
    const logDir = await getLogDirectory()
    const logFilePath = path.join(logDir, 'app.log')

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    // 使用异步写入，不阻塞主线程
    await fs.promises.appendFile(logFilePath, message + '\n', 'utf-8')
  } catch (e) {
    console.error(`[Logger] Failed to write to log file (${type}):`, e)
  }
}

/**
 * 创建日志发送器
 * @param {string} type - 模块类型
 * @returns {Object} 日志发送函数对象
 */
export function createLogSender(type) {
  const logWithFile = async (level, msg) => {
    const formattedMessage = formatLogMessage(type, level, msg)

    switch (level) {
      case LOG_LEVEL.ERROR:
        console.error(formattedMessage)
        break
      case LOG_LEVEL.WARN:
        console.warn(formattedMessage)
        break
      case LOG_LEVEL.DEBUG:
        console.debug(formattedMessage)
        break
      default:
        console.log(formattedMessage)
    }

    if (await shouldLog(level)) {
      await writeToFile(formattedMessage, type)
    }
  }

  return {
    toRenderer: (sender, msg) => {
      if (sender && !sender.isDestroyed()) {
        sender.send('log-update', { type, msg })
      }
    },
    error: (msg) => logWithFile(LOG_LEVEL.ERROR, msg),
    warn: (msg) => logWithFile(LOG_LEVEL.WARN, msg),
    info: (msg) => logWithFile(LOG_LEVEL.INFO, msg),
    debug: (msg) => logWithFile(LOG_LEVEL.DEBUG, msg)
  }
}
