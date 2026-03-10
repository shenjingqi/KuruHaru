import fs from "fs";
import pathModule from "path";

export function readLineSetFromFile(filePath, logger) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      return new Set(lines);
    }
  } catch (error) {
    logger?.error?.(`读取文件失败: ${error.message}`);
  }

  return new Set();
}

export function writeUniqueLinesToFile(filePath, lines = [], logger) {
  try {
    if (!lines || lines.length === 0) {
      return { success: true, count: 0 };
    }

    const dataDir = pathModule.dirname(filePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const uniqueCodes = [...new Set(lines)].sort();
    fs.writeFileSync(filePath, uniqueCodes.join("\n"), "utf-8");
    return { success: true, count: uniqueCodes.length };
  } catch (error) {
    logger?.error?.(`写入文件失败: ${error.message}`);
    logger?.error?.(`Error name: ${error.name}, code: ${error.code}`);
    logger?.error?.(`Stack: ${error.stack}`);
    return { success: false, count: 0 };
  }
}
