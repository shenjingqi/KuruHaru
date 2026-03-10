export function createEmptyPresetIndexStats() {
  return {
    presetScannedLines: 0,
    presetMatchedLines: 0,
    presetIndexedCodes: 0,
    presetSkippedNoUrl: 0,
  };
}

export function getHistoryEntryUrl(historyEntry) {
  if (!historyEntry) return "";
  if (typeof historyEntry === "string") return historyEntry;
  if (typeof historyEntry.url === "string") return historyEntry.url;
  return "";
}

export function getHistoryEntryAlternateUrls(historyEntry) {
  if (!historyEntry || typeof historyEntry !== "object") return [];
  if (!Array.isArray(historyEntry.alternateUrls)) return [];

  return historyEntry.alternateUrls
    .map((url) => String(url || "").trim())
    .filter(Boolean);
}
