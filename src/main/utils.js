import fs from "fs";
import { join, extname } from "path";
import path from "path";

// 从 logger.js 重新导出 createLogSender
export { createLogSender } from "./utils/logger.js";

/**
 * 提取 RJ/VJ 号 (例如: RJ123456)
 */
function extractCodeFromPath(fullPath) {
  const parts = fullPath.split(/[/\\]/);
  for (const part of parts) {
    const match = part.match(/(RJ|VJ|BJ)\d+/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

/**
 * 提取纯数字 ID (例如: 123456)
 */
export function parseWorkId(str) {
  if (!str) return null;
  const s = String(str);
  const match = s.match(/([a-zA-Z]+)?(\d+)/);
  return match ? match[2] : null;
}

/**
 * 递归扫描本地 ID (用于 DeleteTool)
 * 返回格式：[{ code, path, name }, ...]
 */
export function scanForIds(dir, resultList, visited = new Set()) {
  try {
    // 规范化路径并检查是否已访问过（避免重复扫描）
    const normalizedPath = path.resolve(dir);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = join(dir, file);
      const normalizedFilePath = path.resolve(filePath);

      // 检查文件路径是否已处理过
      if (visited.has(normalizedFilePath)) {
        return;
      }

      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanForIds(filePath, resultList, visited);
      } else {
        // 只处理压缩包文件
        const ext = extname(file).toLowerCase();
        if ([".zip", ".rar", ".7z"].includes(ext)) {
          visited.add(normalizedFilePath);
          const code = extractCodeFromPath(file) || ""; // 返回完整的 RJ 号或空字符串
          resultList.push({ code, path: filePath, name: file });
        }
      }
    });
  } catch (e) {
    console.error("扫描文件出错:", e.message);
  }
}

/**
 * 递归扫描压缩包 (用于 UploadTool)
 */
export function scanForArchives(dir, resultList, visited = new Set()) {
  try {
    // 确保 dir 是字符串
    let scanPath = "";

    if (typeof dir === "string") {
      scanPath = dir;
    } else if (dir && typeof dir === "object") {
      scanPath = dir.filePath || String(dir);
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
