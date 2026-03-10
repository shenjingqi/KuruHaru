// 支持数组和文本两种输入（换行/逗号/空白分隔），统一转成非空 ID 列表。
export function normalizeIdList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[\n,，\s]+/)
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeChannelId(rawValue) {
  if (!rawValue) return "";
  return String(rawValue).trim();
}

// Telegram 私有频道常见格式是 -100 前缀，这里做规范化以便后续比较/拼链。
export function normalizeNumericChannelId(rawValue) {
  const normalized = normalizeChannelId(rawValue);
  if (!/^-?\d+$/.test(normalized)) return normalized;

  if (normalized.startsWith("-100")) return normalized;
  if (normalized.startsWith("-")) return normalized;
  return `-100${normalized}`;
}

export function parseSearchLimit(rawValue, fallbackValue = 3000) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return fallbackValue;
  }

  const normalized = String(rawValue)
    .trim()
    .toLowerCase()
    .replace(/[，,\s]+/g, "");

  if (!normalized) {
    return fallbackValue;
  }

  // 兼容 3k / 1.2w / 万 等用户输入写法；非法或非正数时回退默认值。
  const suffixMatch = normalized.match(/^(\d+(?:\.\d+)?)(w|万|k)?$/i);

  let parsedLimit = Number.NaN;
  if (suffixMatch) {
    const baseValue = Number(suffixMatch[1]);
    if (Number.isFinite(baseValue) && baseValue > 0) {
      const suffix = suffixMatch[2];
      const multiplier =
        suffix === "w" || suffix === "万" ? 10000 : suffix === "k" ? 1000 : 1;
      parsedLimit = baseValue * multiplier;
    }
  } else {
    const directValue = Number(normalized);
    if (Number.isFinite(directValue) && directValue > 0) {
      parsedLimit = directValue;
    }
  }

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsedLimit);
}

export function toSafeBoolean(rawValue, fallbackValue = false) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    return rawValue !== 0;
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  // 对未知字符串保留 fallback，避免隐式真值判断带来配置误判。
  return fallbackValue;
}

// 保证历史数据结构稳定，旧文件或损坏数据都回落到安全默认形态。
export function ensureHistoryShape(parsedData) {
  if (!parsedData || typeof parsedData !== "object") {
    return {
      updatedAt: new Date().toISOString(),
      history: {},
    };
  }

  if (!parsedData.history || typeof parsedData.history !== "object") {
    return {
      updatedAt: new Date().toISOString(),
      history: {},
    };
  }

  return {
    updatedAt: parsedData.updatedAt || new Date().toISOString(),
    history: parsedData.history,
  };
}
