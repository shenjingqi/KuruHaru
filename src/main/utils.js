import fs from "fs";
import { join, extname } from "path";
import path from "path";

/**
 * 日志级别枚举
 */
const LOG_LEVEL = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
};

/**
 * 日志级别权重，用于过滤
 */
const LOG_LEVEL_WEIGHT = {
  [LOG_LEVEL.ERROR]: 4,
  [LOG_LEVEL.WARN]: 3,
  [LOG_LEVEL.INFO]: 2,
  [LOG_LEVEL.DEBUG]: 1,
};

/**
 * 配置对象（避免循环依赖）
 */
let currentConfig = null;

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG = {
  level: "info",
  enableFileLog: true,
  logFilePath: null,
};

/**
 * 获取日志配置
 */
function getLoggingConfig() {
  if (!currentConfig) {
    currentConfig = { ...DEFAULT_CONFIG };
  }
  return currentConfig;
}

/**
 * 设置日志配置（供外部调用）
 */
export function setLoggingConfig(config) {
  currentConfig = { ...config };
}

/**
 * 获取当前日志级别权重
 */
function getCurrentLevelWeight() {
  const config = getLoggingConfig();
  const level = config.level || "info";
  return (
    LOG_LEVEL_WEIGHT[level.toUpperCase()] || LOG_LEVEL_WEIGHT[LOG_LEVEL.INFO]
  );
}

/**
 * 是否应该输出此级别的日志
 */
function shouldLog(level) {
  const currentWeight = getCurrentLevelWeight();
  const messageWeight =
    LOG_LEVEL_WEIGHT[level.toUpperCase()] || LOG_LEVEL_WEIGHT[LOG_LEVEL.INFO];
  return messageWeight <= currentWeight;
}

/**
 * 格式化日志消息（带时间戳）
 */
function formatLogMessage(module2, level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${module2}] ${message}`;
}

/**
 * 写入文件日志
 */
function writeToFile(message) {
  const config = getLoggingConfig();
  if (!config.enableFileLog || !config.logFilePath) return;

  try {
    const logDir = path.dirname(config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(config.logFilePath, message + "\n", "utf-8");
  } catch (e) {
    console.error("[Logger] Failed to write to log file:", e);
  }
}


// 从 logger.js 重新导出 createLogSender
export { createLogSender } from './logger.js';

    } else if (Array.isArray(dir)) {
      scanPath = dir.length > 0 ? String(dir[0]) : "";
    } else {
      scanPath = String(dir || "");
    }

    // 如果路径包含方括号，移除方括号及其内容
    if (scanPath.includes("[")) {
      scanPath = scanPath.replace(/\[[^\]]*\]/g, "").trim();
    }

    // 规范化路径并检查是否已访问过（避免重复扫描）
    const normalizedPath = path.resolve(scanPath);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    // 递归扫描目录
    const files = fs.readdirSync(scanPath);
    for (const file of files) {
      const filePath = path.join(scanPath, file);
      const normalizedFilePath = path.resolve(filePath);

      // 检查文件路径是否已处理过
      if (visited.has(normalizedFilePath)) {
        return;
      }
      visited.add(normalizedFilePath);

      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // 递归扫描子目录
        scanForArchives(filePath, resultList, visited);
      } else if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if ([".zip", ".rar", ".7z"].includes(ext)) {
          const code = extractCodeFromPath(file);
          resultList.push({ code: code || "", path: filePath, name: file });
        }
      }
    }
  } catch (e) {
    console.error("扫描压缩包出错:", e.message);
  }
}
