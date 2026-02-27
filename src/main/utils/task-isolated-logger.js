/**
 * 任务隔离日志记录器
 *
 * 依赖方向: Types → Config → Utils
 *
 * 为每个任务创建独立的日志文件，支持 JSON 格式和日志查询
 */
import fs from "fs";
import path from "path";
import { app } from "electron";

/**
 * 获取日志目录
 */
async function getLogDirectory() {
  try {
    const { getConfig } = await import("../modules/config");
    const config = getConfig();

    if (config.paths?.logsDir && config.paths.logsDir.trim()) {
      return config.paths.logsDir;
    }

    return path.join(app.getPath("userData"), "logs");
  } catch {
    return path.join(app.getPath("userData"), "logs");
  }
}

/**
 * 任务日志级别
 */
export const TASK_LOG_LEVEL = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
};

/**
 * 创建任务隔离日志记录器
 * @param {string} taskId - 任务 ID
 * @param {string} moduleName - 模块名称
 * @returns {Object} 日志记录函数
 */
export function createTaskLogger(taskId, moduleName) {
  let logStream = null;
  let logFilePath = null;

  /**
   * 初始化日志流
   */
  async function initLogStream() {
    if (logStream) return logFilePath;

    const logDir = path.join(await getLogDirectory(), "tasks");

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 清理旧日志（保留最近 100 个任务日志）
    cleanupOldLogs(logDir);

    logFilePath = path.join(logDir, `${taskId}.log`);
    logStream = fs.createWriteStream(logFilePath, {
      flags: "a",
      encoding: "utf8",
    });

    return logFilePath;
  }

  /**
   * 清理旧日志文件
   */
  function cleanupOldLogs(logDir) {
    try {
      const files = fs
        .readdirSync(logDir)
        .filter((f) => f.startsWith("task-") && f.endsWith(".log"))
        .map((f) => ({
          name: f,
          path: path.join(logDir, f),
          mtime: fs.statSync(path.join(logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // 只保留最近 100 个
      if (files.length > 100) {
        files.slice(100).forEach((f) => {
          try {
            fs.unlinkSync(f.path);
          } catch (_e) {
            // 忽略删除错误
          }
        });
      }
    } catch (_e) {
      // 忽略清理错误
    }
  }

  /**
   * 写入 JSON 格式日志
   */
  async function writeLog(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      taskId,
      module: moduleName,
      level,
      message,
      ...meta,
    };

    const logLine = JSON.stringify(logEntry);

    if (!logStream) {
      await initLogStream();
    }

    logStream.write(logLine + "\n");

    // 同时输出到控制台
    const consoleMsg = `[${taskId}] [${moduleName}] ${level.toUpperCase()}: ${message}`;
    if (level === TASK_LOG_LEVEL.ERROR) {
      console.error(consoleMsg, meta);
    } else if (level === TASK_LOG_LEVEL.WARN) {
      console.warn(consoleMsg, meta);
    } else {
      console.log(consoleMsg, meta);
    }

    return logEntry;
  }

  return {
    /**
     * 获取当前任务日志文件路径
     */
    async getLogPath() {
      if (!logStream) {
        await initLogStream();
      }
      return logFilePath;
    },

    debug(message, meta) {
      return writeLog(TASK_LOG_LEVEL.DEBUG, message, meta);
    },

    info(message, meta) {
      return writeLog(TASK_LOG_LEVEL.INFO, message, meta);
    },

    warn(message, meta) {
      return writeLog(TASK_LOG_LEVEL.WARN, message, meta);
    },

    error(message, meta) {
      return writeLog(TASK_LOG_LEVEL.ERROR, message, meta);
    },

    /**
     * 记录函数执行
     */
    logExecution(fnName, duration, result) {
      return writeLog(TASK_LOG_LEVEL.INFO, `Execution: ${fnName}`, {
        function: fnName,
        durationMs: duration,
        success: result !== undefined,
      });
    },

    /**
     * 记录错误详情
     */
    logError(error, context = {}) {
      return writeLog(TASK_LOG_LEVEL.ERROR, error.message || String(error), {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...context,
      });
    },

    /**
     * 关闭日志流
     */
    close() {
      return new Promise((resolve) => {
        if (logStream) {
          logStream.end(() => {
            logStream = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    },
  };
}

/**
 * 查询任务日志
 * @param {string} logDir - 日志目录
 * @param {Object} query - 查询条件
 * @returns {Array} 匹配的日志条目
 */
export function queryTaskLogs(logDir, query = {}) {
  const { taskId, level, module, keyword, startTime, endTime } = query;

  const tasksDir = path.join(logDir, "tasks");
  const results = [];

  if (!fs.existsSync(tasksDir)) {
    return results;
  }

  const files = taskId
    ? [`${taskId}.log`]
    : fs.readdirSync(tasksDir).filter((f) => f.endsWith(".log"));

  for (const file of files) {
    if (taskId && file !== `${taskId}.log`) continue;

    const filePath = path.join(tasksDir, file);
    const content = fs.readFileSync(filePath, "utf8");

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        // 过滤条件
        if (level && entry.level !== level) continue;
        if (module && entry.module !== module) continue;
        if (keyword && !entry.message.includes(keyword)) continue;
        if (startTime && new Date(entry.timestamp) < new Date(startTime))
          continue;
        if (endTime && new Date(entry.timestamp) > new Date(endTime)) continue;

        results.push(entry);
      } catch (_e) {
        // 忽略解析错误
      }
    }
  }

  // 按时间排序
  results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return results;
}

/**
 * 创建自动任务 ID
 */
export function generateTaskId(prefix = "task") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
