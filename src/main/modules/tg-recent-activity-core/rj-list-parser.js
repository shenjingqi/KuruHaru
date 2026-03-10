/**
 * 将 RJ 列表文本内容解析为数组。
 * 保持原有处理逻辑：
 * - 支持 RJ123456 / rj123456 / 123456
 * - 逐行过滤空白
 */
export function parseRjListFromContent(content) {
  const lines = content.split("\n").filter((l) => l.trim());
  const rjList = [];

  lines.forEach((line) => {
    // 提取RJ号（可能格式: RJ123456, rj123456, 123456）
    const match = line.match(/RJ?(\d+)/i);
    if (match) {
      rjList.push(match[1]);
    } else if (/^\d+$/.test(line.trim())) {
      rjList.push(line.trim());
    }
  });

  return rjList;
}
