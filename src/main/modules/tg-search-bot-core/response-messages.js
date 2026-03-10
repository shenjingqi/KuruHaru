export function buildNotFoundMessage(rjCode) {
  return `暂未找到 ${rjCode}\n请在 one 站查看是否拥有，或在频道提出。`;
}

export function buildPresetFoundMessage(rjCode, presetResult) {
  if (presetResult.url) {
    return `找到 ${rjCode}（前置包缓存）\n${presetResult.url}`;
  }

  return `找到 ${rjCode}（前置包缓存）\n文件：${presetResult.filePath}`;
}
