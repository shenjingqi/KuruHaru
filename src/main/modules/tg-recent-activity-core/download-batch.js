function normalizeMessageId(rawValue) {
  const normalized = Number(rawValue);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function normalizeFileName(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function toDownloadItem(rawItem) {
  const item =
    rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)
      ? rawItem
      : { tgMessageId: rawItem };

  const tgMessageId = normalizeMessageId(
    item.tgMessageId ?? item.messageId ?? item.id,
  );

  if (tgMessageId === null) {
    return null;
  }

  const fileId = item.fileId ?? item.id ?? null;

  return {
    tgMessageId,
    fileName: normalizeFileName(item.fileName ?? item.name),
    fileId,
  };
}

export function normalizeBatchDownloadPayload(payload) {
  const rawPayload = Array.isArray(payload)
    ? { items: payload }
    : payload || {};
  const sourceItems = Array.isArray(rawPayload.items)
    ? rawPayload.items
    : Array.isArray(rawPayload.messageIds)
      ? rawPayload.messageIds
      : [];

  const dedupedItems = [];
  const existedMessageIds = new Set();

  for (const rawItem of sourceItems) {
    const item = toDownloadItem(rawItem);
    if (!item || existedMessageIds.has(item.tgMessageId)) {
      continue;
    }

    existedMessageIds.add(item.tgMessageId);
    dedupedItems.push(item);
  }

  const rawConcurrency = Number(rawPayload.concurrency);
  const concurrency =
    Number.isInteger(rawConcurrency) && rawConcurrency > 0
      ? Math.min(rawConcurrency, 10)
      : 3;

  return {
    items: dedupedItems,
    concurrency,
  };
}

export function summarizeBatchDownloadResults(results) {
  const safeResults = Array.isArray(results) ? results : [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const result of safeResults) {
    if (result?.skipped) {
      skippedCount += 1;
      continue;
    }

    if (result?.success) {
      successCount += 1;
      continue;
    }

    failedCount += 1;
  }

  return {
    totalCount: safeResults.length,
    successCount,
    skippedCount,
    failedCount,
  };
}
