import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ipcMain } from "electron";
import { getConfig, getDataDir } from "./config";
import { getHttpClient } from "./httpClient";
import { normalizeError } from "../utils/errorHandler";
import { withRetry } from "../utils/retry";
import { createLogSender } from "../utils/logger";
import { toSafeBoolean } from "./tg-search-bot-core/normalizers";
import {
  extractWorkCodes,
  normalizeWorkCode,
} from "./tg-info-bot-core/work-code-parsers";

const logger = createLogSender("tg-info-cache");

const DEFAULT_CACHE_FILE_NAME = "tg-info-cache.json";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_CONCURRENCY = 5;
const DEFAULT_MAX_FILE_SIZE_MB = 50;
const MAX_FETCH_RETRIES = 3;
const CACHE_STATE_TTL_MS = 5000;
const CACHE_ENTRY_TS_FIELD = "__khCacheUpdatedAt";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.dlsite.com/",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Cookie: "adult_checked=1; locale=zh_CN",
};

let cacheState = {
  filePath: "",
  checkedAt: 0,
  mtimeMs: 0,
  fileSize: 0,
  entries: {},
};

let sharedClient = null;
let sharedClientKey = "";

function parsePositiveInt(
  rawValue,
  fallbackValue,
  { min = 1, max = 99999 } = {},
) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }
  return Math.max(min, Math.min(max, value));
}

function pickProxyUrl(config = getConfig()) {
  const tgProxy = config?.tg?.proxyUrl;
  if (typeof tgProxy === "string" && tgProxy.trim()) {
    return tgProxy.trim();
  }

  const systemProxy = config?.system?.proxyUrl;
  if (typeof systemProxy === "string" && systemProxy.trim()) {
    return systemProxy.trim();
  }

  return "";
}

export function getInfoCacheRuntimeConfig(config = getConfig()) {
  const tgConfig = config?.tg || {};

  const configuredCachePath =
    typeof tgConfig.infoCachePath === "string"
      ? tgConfig.infoCachePath.trim()
      : "";

  const cacheFilePath =
    configuredCachePath || path.join(getDataDir(), DEFAULT_CACHE_FILE_NAME);
  const maxFileSizeMB = parsePositiveInt(
    tgConfig.infoCacheMaxFileSizeMB,
    DEFAULT_MAX_FILE_SIZE_MB,
    {
      min: 1,
      max: 4096,
    },
  );

  return {
    cacheFilePath,
    requestTimeoutMs: parsePositiveInt(
      tgConfig.infoRequestTimeoutMs,
      DEFAULT_TIMEOUT_MS,
      {
        min: 5000,
        max: 120000,
      },
    ),
    maxConcurrency: parsePositiveInt(
      tgConfig.infoCacheMaxConcurrency,
      DEFAULT_MAX_CONCURRENCY,
      {
        min: 1,
        max: 12,
      },
    ),
    maxFileSizeMB,
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
    proxyUrl: pickProxyUrl(config),
    persistOnFetch: toSafeBoolean(tgConfig.infoCachePersistOnFetch, true),
  };
}

function createInfoHttpClient(runtimeConfig) {
  const client = getHttpClient({
    timeout: runtimeConfig.requestTimeoutMs,
    proxyUrl: runtimeConfig.proxyUrl || null,
  });

  client.defaults.maxRedirects = 5;
  client.defaults.validateStatus = () => true;
  client.defaults.headers = {
    ...(client.defaults.headers || {}),
    ...REQUEST_HEADERS,
  };

  return client;
}

function getSharedInfoHttpClient(runtimeConfig) {
  const nextKey = `${runtimeConfig.proxyUrl || ""}::${runtimeConfig.requestTimeoutMs}`;

  if (!sharedClient || sharedClientKey !== nextKey) {
    sharedClient = createInfoHttpClient(runtimeConfig);
    sharedClientKey = nextKey;
  }

  return sharedClient;
}

function toCacheTimestamp(rawValue, fallbackValue = Date.now()) {
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  const fallbackParsed = Number.parseInt(fallbackValue, 10);
  if (Number.isFinite(fallbackParsed) && fallbackParsed > 0) {
    return fallbackParsed;
  }

  return Date.now();
}

function withCacheTimestamp(entry, fallbackTimestamp = Date.now()) {
  if (!entry || typeof entry !== "object") {
    return {
      [CACHE_ENTRY_TS_FIELD]: toCacheTimestamp(fallbackTimestamp, Date.now()),
    };
  }

  return {
    ...entry,
    [CACHE_ENTRY_TS_FIELD]: toCacheTimestamp(
      entry[CACHE_ENTRY_TS_FIELD],
      fallbackTimestamp,
    ),
  };
}

function serializeComparableCacheEntry(entry) {
  const normalized = { ...(entry || {}) };
  delete normalized[CACHE_ENTRY_TS_FIELD];
  return JSON.stringify(normalized);
}

function hasListenOnlineHint(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const explicitCandidates = [
    entry["在线试听"],
    entry["在线听"],
    entry["ListenOnline"],
    entry["ListenOnlineUrl"],
    entry.listenOnlineUrl,
    entry.listenUrl,
  ];

  const hasExplicitUrl = explicitCandidates.some((candidate) =>
    /^https?:\/\//i.test(String(candidate || "").trim()),
  );
  if (hasExplicitUrl) {
    return true;
  }

  const sourceText = String(entry["来源"] || entry.source || "").toUpperCase();
  return sourceText.includes("ASMR.ONE");
}

function decodeHtmlEntities(rawText) {
  if (!rawText) return "";

  const entityMap = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };

  return String(rawText)
    .replace(/&#(\d+);/g, (_match, num) => String.fromCharCode(Number(num)))
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (match) => entityMap[match] || match,
    );
}

function stripHtml(rawText) {
  return decodeHtmlEntities(String(rawText || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnchorTexts(rawHtml) {
  if (!rawHtml) return [];

  const anchorRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  const results = [];
  let match = anchorRegex.exec(rawHtml);

  while (match) {
    const text = stripHtml(match[1]);
    if (text) {
      results.push(text);
    }
    match = anchorRegex.exec(rawHtml);
  }

  return [...new Set(results)];
}

function parseDlsiteHtml(rawHtml) {
  try {
    const content = String(rawHtml || "");
    const result = {};

    const makerMatch = content.match(
      /<span[^>]*class=["'][^"']*maker_name[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (makerMatch?.[1]) {
      result["社团"] = stripHtml(makerMatch[1]);
    }

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch = rowRegex.exec(content);

    while (rowMatch) {
      const rowHtml = rowMatch[1];
      const headerMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
      const dataMatch = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);

      if (!headerMatch?.[1] || !dataMatch?.[1]) {
        rowMatch = rowRegex.exec(content);
        continue;
      }

      const headerText = stripHtml(headerMatch[1]);
      if (headerText === "插画") {
        result["插画"] = extractAnchorTexts(dataMatch[1]);
      } else if (headerText === "声优") {
        result["声优"] = extractAnchorTexts(dataMatch[1]);
      } else if (headerText === "分类") {
        result["分类"] = extractAnchorTexts(dataMatch[1]);
      }

      rowMatch = rowRegex.exec(content);
    }

    const normalized = Object.fromEntries(
      Object.entries(result).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return Boolean(value);
      }),
    );

    return Object.keys(normalized).length ? normalized : null;
  } catch {
    return null;
  }
}

function parseDlwatcher(jsonData) {
  try {
    const creators = Array.isArray(jsonData?.creators) ? jsonData.creators : [];
    const data = {
      社团: jsonData?.makerName || "",
      插画: creators
        .filter((item) => item?.role === "イラスト")
        .map((item) => item?.name)
        .filter(Boolean),
      声优: creators
        .filter((item) => item?.role === "声优")
        .map((item) => item?.name)
        .filter(Boolean),
      分类: (jsonData?.genres || []).map((item) => item?.name).filter(Boolean),
    };

    return Object.values(data).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    )
      ? data
      : null;
  } catch {
    return null;
  }
}

function parseAsmrOne(jsonData) {
  try {
    const work = Array.isArray(jsonData?.works) ? jsonData.works[0] : null;
    if (!work || typeof work !== "object") {
      return null;
    }

    const data = {
      社团: work?.name || "",
      声优: (work?.vas || []).map((item) => item?.name).filter(Boolean),
      分类: (work?.tags || [])
        .filter((item) => item?.voteStatus === 1)
        .map((item) => item?.name)
        .filter(Boolean),
    };

    return Object.values(data).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    )
      ? data
      : null;
  } catch {
    return null;
  }
}

function normalizeCoverUrl(rawUrl) {
  if (!rawUrl) return "";

  const value = String(rawUrl).trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return `https://${value.replace(/^\/+/, "")}`;
}

function mapAgeCategory(baseData) {
  const ageMap = {
    1: "全年龄",
    2: "R-15",
    3: "R-18",
  };

  const rawAge = baseData?.age_category;
  return (
    ageMap[rawAge] || baseData?.age_category_string || String(rawAge || "")
  );
}

async function fetchDataWithRetry(client, url, options = {}) {
  const responseType = options.responseType || "json";

  try {
    return await withRetry(
      async () => {
        const response = await client.get(url, { responseType });

        if (response.status === 404) {
          return null;
        }

        if (response.status >= 200 && response.status < 300) {
          return response.data;
        }

        if (response.status >= 400 && response.status < 500) {
          return null;
        }

        const error = new Error(`HTTP ${response.status}`);
        error.response = response;
        throw error;
      },
      {
        maxRetries: MAX_FETCH_RETRIES,
        backoff: 600,
        onRetry: (attempt, error) => {
          logger.warn(
            `[tg-info-cache] 请求重试(${attempt}/${MAX_FETCH_RETRIES}) ${url} ${error?.message || error}`,
          );
        },
      },
    );
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.warn(
      `[tg-info-cache] 请求失败 ${url}`,
      normalizedError.error?.message || normalizedError.message,
    );
    return null;
  }
}

async function fetchWorkInfoFromRemote(client, workCode) {
  const code = normalizeWorkCode(workCode);
  if (!code) {
    return null;
  }

  const baseUrl = `https://www.dlsite.com/maniax-touch/product/info/ajax?product_id=${code}`;
  const baseResponse = await fetchDataWithRetry(client, baseUrl, {
    responseType: "json",
  });

  const baseData =
    baseResponse?.[code] ||
    (baseResponse && typeof baseResponse === "object"
      ? baseResponse[Object.keys(baseResponse)[0]]
      : null);

  if (!baseData || typeof baseData !== "object") {
    return null;
  }

  const rawDate = baseData?.regist_date || "";

  const info = {
    RJ: code,
    标题: baseData?.work_name || "",
    社团: baseData?.maker_name || "",
    系列: baseData?.title_name || "",
    封面图: normalizeCoverUrl(baseData?.work_image),
    年龄指定: mapAgeCategory(baseData),
    价格: baseData?.price,
    销量: baseData?.dl_count,
    评分: baseData?.rate_average_2dp,
    收藏数: baseData?.wishlist_count,
    发售日: rawDate ? String(rawDate).split(" ")[0] : null,
    来源: "DLSite",
  };

  const isSale = ["true", "1"].includes(
    String(baseData?.is_sale || "").toLowerCase(),
  );

  let extraData = null;
  let asmrSearchData = null;

  if (isSale) {
    const htmlUrl = `https://www.dlsite.com/maniax/work/=/product_id/${code}.html/?locale=zh_CN`;
    const htmlContent = await fetchDataWithRetry(client, htmlUrl, {
      responseType: "text",
    });

    if (htmlContent) {
      extraData = parseDlsiteHtml(htmlContent);
    }
  }

  if (!extraData) {
    const dlwUrl = `https://dlwatcher.com/product/${code}`;
    const dlwData = await fetchDataWithRetry(client, dlwUrl, {
      responseType: "json",
    });

    if (dlwData) {
      extraData = parseDlwatcher(dlwData);
      if (extraData) {
        info["来源"] = `${info["来源"]}/DLWatcher`;
      }
    }
  }

  if (!extraData) {
    const asmrUrl = `https://api.asmr.one/api/search/${code}`;
    asmrSearchData = await fetchDataWithRetry(client, asmrUrl, {
      responseType: "json",
    });

    if (asmrSearchData) {
      extraData = parseAsmrOne(asmrSearchData);
      if (extraData) {
        info["来源"] = `${info["来源"]}/ASMR.ONE`;
      }
    }
  }

  // 即使基础字段来自 DLSite / DLWatcher，也补一次 ASMR 可用性探测，
  // 仅在确认存在时写入在线试听链接，避免“盲目给 link 导致 404”。
  if (!info["在线试听"]) {
    if (!asmrSearchData) {
      const asmrUrl = `https://api.asmr.one/api/search/${code}`;
      asmrSearchData = await fetchDataWithRetry(client, asmrUrl, {
        responseType: "json",
      });
    }
    const hasAsmrWork =
      Array.isArray(asmrSearchData?.works) &&
      asmrSearchData.works.some((work) =>
        Boolean(work && typeof work === "object"),
      );
    if (hasAsmrWork) {
      info["在线试听"] = `https://www.asmr.one/work/${code}`;
    }
  }

  if (extraData) {
    Object.entries(extraData).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length === 0) {
        return;
      }

      if (value !== null && value !== undefined && value !== "") {
        info[key] = value;
      }
    });
  }

  return withCacheTimestamp(info);
}

async function loadCacheEntries(runtimeConfig, options = {}) {
  const now = Date.now();
  const filePath = runtimeConfig.cacheFilePath;
  const forceReload = options.forceReload === true;

  if (!filePath) {
    return {};
  }

  if (
    !forceReload &&
    cacheState.filePath === filePath &&
    now - cacheState.checkedAt < CACHE_STATE_TTL_MS
  ) {
    return cacheState.entries;
  }

  let fileStats = null;

  try {
    fileStats = await fsp.stat(filePath);
  } catch {
    cacheState = {
      filePath,
      checkedAt: now,
      mtimeMs: 0,
      fileSize: 0,
      entries: {},
    };
    return {};
  }

  if (
    !forceReload &&
    cacheState.filePath === filePath &&
    cacheState.mtimeMs === fileStats.mtimeMs &&
    cacheState.fileSize === fileStats.size
  ) {
    cacheState.checkedAt = now;
    return cacheState.entries;
  }

  try {
    const rawContent = await fsp.readFile(filePath, "utf-8");
    const parsed = JSON.parse(rawContent);
    const list = Array.isArray(parsed) ? parsed : [];

    const entries = {};

    list.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const normalizedCode = normalizeWorkCode(
        item.RJ || item.code || item["编号"],
      );
      if (!normalizedCode) {
        return;
      }

      entries[normalizedCode] = withCacheTimestamp(
        {
          ...item,
          RJ: normalizedCode,
        },
        fileStats?.mtimeMs || now,
      );
    });

    cacheState = {
      filePath,
      checkedAt: now,
      mtimeMs: fileStats.mtimeMs,
      fileSize: fileStats.size,
      entries,
    };

    return entries;
  } catch (error) {
    const normalizedError = normalizeError(error);
    logger.warn(
      "[tg-info-cache] 缓存读取失败，回退空缓存",
      normalizedError.error?.message || normalizedError.message,
    );

    cacheState = {
      filePath,
      checkedAt: now,
      mtimeMs: fileStats?.mtimeMs || 0,
      fileSize: fileStats?.size || 0,
      entries: {},
    };

    return {};
  }
}

function toSortedCacheList(entries) {
  return Object.values(entries).sort((left, right) => {
    return String(left?.RJ || "").localeCompare(String(right?.RJ || ""));
  });
}

function buildCachePayload(entries) {
  const nextList = toSortedCacheList(entries);
  const jsonContent = JSON.stringify(nextList, null, 2);
  const fileSize = Buffer.byteLength(jsonContent, "utf-8");

  return {
    list: nextList,
    jsonContent,
    fileSize,
  };
}

function buildEvictionOrder(entries) {
  return Object.entries(entries)
    .sort((left, right) => {
      const leftCode = left[0];
      const rightCode = right[0];
      const leftEntry = left[1];
      const rightEntry = right[1];

      const leftTs = toCacheTimestamp(leftEntry?.[CACHE_ENTRY_TS_FIELD], 0);
      const rightTs = toCacheTimestamp(rightEntry?.[CACHE_ENTRY_TS_FIELD], 0);

      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }

      return String(leftCode).localeCompare(String(rightCode));
    })
    .map(([code]) => code);
}

function applyCacheFileSizeLimit(entries, runtimeConfig) {
  const maxBytes = Number(runtimeConfig?.maxFileSizeBytes || 0);
  const nextEntries = { ...(entries || {}) };
  let payload = buildCachePayload(nextEntries);

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return {
      entries: nextEntries,
      payload,
      evictedCodes: [],
      maxBytes: 0,
      overLimit: false,
    };
  }

  if (payload.fileSize <= maxBytes) {
    return {
      entries: nextEntries,
      payload,
      evictedCodes: [],
      maxBytes,
      overLimit: false,
    };
  }

  const evictionOrder = buildEvictionOrder(nextEntries);
  const evictedCodes = [];

  while (payload.fileSize > maxBytes && evictionOrder.length > 0) {
    const code = evictionOrder.shift();
    if (!code || !nextEntries[code]) {
      continue;
    }

    delete nextEntries[code];
    evictedCodes.push(code);
    payload = buildCachePayload(nextEntries);
  }

  return {
    entries: nextEntries,
    payload,
    evictedCodes,
    maxBytes,
    overLimit: payload.fileSize > maxBytes,
  };
}

async function persistCacheEntries(runtimeConfig, entries) {
  const filePath = runtimeConfig.cacheFilePath;
  if (!filePath) {
    return {
      evictedCodes: [],
      fileSize: 0,
      total: 0,
    };
  }

  const trimmed = applyCacheFileSizeLimit(entries, runtimeConfig);
  const finalEntries = trimmed.entries;
  const { payload } = trimmed;

  if (trimmed.evictedCodes.length > 0) {
    logger.warn(
      `[tg-info-cache] 触发缓存淘汰 evicted=${trimmed.evictedCodes.length} currentSize=${payload.fileSize} limit=${trimmed.maxBytes}`,
    );
  }

  if (trimmed.overLimit) {
    logger.warn(
      `[tg-info-cache] 缓存文件仍超上限 currentSize=${payload.fileSize} limit=${trimmed.maxBytes}`,
    );
  }

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, payload.jsonContent, "utf-8");

  cacheState = {
    filePath,
    checkedAt: Date.now(),
    mtimeMs: 0,
    fileSize: payload.fileSize,
    entries: finalEntries,
  };

  return {
    evictedCodes: trimmed.evictedCodes,
    fileSize: payload.fileSize,
    total: Object.keys(finalEntries).length,
  };
}

export async function getWorkInfoFromCache(rawCode, options = {}) {
  const code = normalizeWorkCode(rawCode);
  if (!code) {
    return null;
  }

  const runtimeConfig =
    options.runtimeConfig || getInfoCacheRuntimeConfig(getConfig());
  const entries = await loadCacheEntries(runtimeConfig, options);

  return entries[code] || null;
}

export async function fetchWorkInfoByCode(rawCode, options = {}) {
  const code = normalizeWorkCode(rawCode);
  if (!code) {
    return {
      success: false,
      error: "无效的编号格式，请使用 RJ/VJ/BJ + 数字",
    };
  }

  const runtimeConfig =
    options.runtimeConfig || getInfoCacheRuntimeConfig(getConfig());
  const preferCache = options.preferCache !== false;
  const persistResult =
    typeof options.persistResult === "boolean"
      ? options.persistResult
      : runtimeConfig.persistOnFetch;

  if (preferCache) {
    const cacheHit = await getWorkInfoFromCache(code, {
      runtimeConfig,
    });

    if (cacheHit) {
      if (persistResult && !hasListenOnlineHint(cacheHit)) {
        const client = options.client || getSharedInfoHttpClient(runtimeConfig);
        const refreshedData = await fetchWorkInfoFromRemote(client, code);

        if (refreshedData) {
          let cachePersisted = true;

          try {
            const entries = await loadCacheEntries(runtimeConfig);
            entries[code] = withCacheTimestamp(refreshedData);
            await persistCacheEntries(runtimeConfig, entries);
          } catch (error) {
            cachePersisted = false;
            const normalizedError = normalizeError(error);
            logger.warn(
              `[tg-info-cache] 缓存补齐在线试听字段失败 ${code}`,
              normalizedError.error?.message || normalizedError.message,
            );
          }

          return {
            success: true,
            source: "remote",
            data: refreshedData,
            cachePersisted,
          };
        }
      }

      return {
        success: true,
        source: "cache",
        data: cacheHit,
      };
    }
  }

  const client = options.client || getSharedInfoHttpClient(runtimeConfig);
  const remoteData = await fetchWorkInfoFromRemote(client, code);

  if (!remoteData) {
    return {
      success: false,
      error: `未找到 ${code}`,
    };
  }

  let cachePersisted = true;

  if (persistResult) {
    try {
      const entries = await loadCacheEntries(runtimeConfig);
      entries[code] = withCacheTimestamp(remoteData);
      await persistCacheEntries(runtimeConfig, entries);
    } catch (error) {
      cachePersisted = false;
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-info-cache] 缓存写入失败但将继续返回实时数据 ${code}`,
        normalizedError.error?.message || normalizedError.message,
      );
    }
  }

  return {
    success: true,
    source: "remote",
    data: remoteData,
    cachePersisted,
  };
}

function escapeHtml(rawValue) {
  return String(rawValue || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(rawValue, maxLength = 320) {
  const value = String(rawValue || "").trim();
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatListField(rawValue) {
  if (!Array.isArray(rawValue) || !rawValue.length) {
    return "";
  }

  const deduped = [
    ...new Set(rawValue.map((item) => String(item).trim()).filter(Boolean)),
  ];
  return truncateText(deduped.join(", "), 380);
}

function formatPixivLinks(rawValue) {
  if (!Array.isArray(rawValue) || !rawValue.length) {
    return "";
  }

  const deduped = [
    ...new Set(rawValue.map((item) => String(item).trim()).filter(Boolean)),
  ];

  return deduped
    .slice(0, 8)
    .map((name) => {
      const encodedName = encodeURIComponent(name);
      const safeName = escapeHtml(name);
      return `<a href="https://www.pixiv.net/search/users?nick=${encodedName}">${safeName}</a>`;
    })
    .join(", ");
}

function normalizeOptionalHttpUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return "";
}

function resolveListenOnlineUrl(data, workCode) {
  const explicitCandidates = [
    data?.["在线试听"],
    data?.["在线听"],
    data?.["ListenOnline"],
    data?.["ListenOnlineUrl"],
    data?.listenOnlineUrl,
    data?.listenUrl,
  ];

  for (const candidate of explicitCandidates) {
    const normalized = normalizeOptionalHttpUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const sourceText = String(data?.["来源"] || data?.source || "").toUpperCase();
  if (workCode && sourceText.includes("ASMR.ONE")) {
    return `https://www.asmr.one/work/${workCode}`;
  }

  return "";
}

function normalizeWorkCodeList(rawCodes, maxCodes = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(rawCodes) || rawCodes.length === 0) {
    return [];
  }

  const seen = new Set();
  const normalizedList = [];

  for (const item of rawCodes) {
    const normalizedCode = normalizeWorkCode(item);
    if (!normalizedCode || seen.has(normalizedCode)) {
      continue;
    }

    seen.add(normalizedCode);
    normalizedList.push(normalizedCode);

    if (normalizedList.length >= maxCodes) {
      break;
    }
  }

  return normalizedList;
}

export function formatWorkInfoMessage(rawData, rawCode) {
  const workCode =
    normalizeWorkCode(rawCode) || normalizeWorkCode(rawData?.RJ) || "";
  const data = rawData || {};

  const priceValue = data["价格"];
  const priceText =
    Number.isFinite(Number(priceValue)) && String(priceValue).trim() !== ""
      ? `${Number(priceValue)} JPY`
      : priceValue;

  const fields = [
    ["编号", escapeHtml(workCode)],
    ["标题", escapeHtml(truncateText(data["标题"], 260))],
    ["社团", escapeHtml(truncateText(data["社团"], 120))],
    ["系列", escapeHtml(truncateText(data["系列"], 120))],
    ["插画", formatPixivLinks(data["插画"])],
    ["声优", escapeHtml(formatListField(data["声优"]))],
    ["年龄指定", escapeHtml(data["年龄指定"])],
    ["分类", escapeHtml(formatListField(data["分类"]))],
    ["价格", escapeHtml(priceText)],
    ["销量", escapeHtml(data["销量"])],
    ["评分", escapeHtml(data["评分"])],
    ["收藏数", escapeHtml(data["收藏数"])],
    ["发售日", escapeHtml(data["发售日"])],
    ["来源", escapeHtml(data["来源"])],
  ];

  const caption = fields
    .filter(([, value]) => Boolean(String(value || "").trim()))
    .map(([label, value]) => `<b>${label}：</b>${value}`)
    .join("\n");

  const imageUrl = normalizeCoverUrl(data["封面图"]);
  const fallbackImageUrl = workCode
    ? `https://api.asmr.one/api/cover/${workCode}.jpg?type=main`
    : "";
  const listenOnlineUrl = resolveListenOnlineUrl(data, workCode);
  const linkButtons = [];

  if (listenOnlineUrl) {
    linkButtons.push({
      text: "Listen Online",
      url: listenOnlineUrl,
    });
  }

  linkButtons.push({
    text: "View on DLSite",
    url: workCode
      ? `https://www.dlsite.com/maniax/work/=/product_id/${workCode}`
      : "https://www.dlsite.com/",
  });

  const replyMarkup = {
    inline_keyboard: [linkButtons],
  };

  return {
    imageUrl,
    fallbackImageUrl,
    caption,
    replyMarkup,
  };
}

export async function buildInfoCacheFromWorkCodes(rawCodes, options = {}) {
  const maxCodes = parsePositiveInt(
    options?.maxCodes,
    Number.MAX_SAFE_INTEGER,
    { min: 1, max: Number.MAX_SAFE_INTEGER },
  );
  const codes = normalizeWorkCodeList(rawCodes, maxCodes);
  if (!codes.length) {
    return {
      success: false,
      error: "未发现 RJ/VJ/BJ 编号",
    };
  }

  const config = getConfig();
  const runtimeConfig = {
    ...getInfoCacheRuntimeConfig(config),
  };

  const jobMaxConcurrency = parsePositiveInt(
    options?.maxConcurrency,
    runtimeConfig.maxConcurrency,
    {
      min: 1,
      max: 20,
    },
  );
  const refreshExisting = toSafeBoolean(options?.refreshExisting, true);

  if (
    typeof options.outputFilePath === "string" &&
    options.outputFilePath.trim()
  ) {
    runtimeConfig.cacheFilePath = options.outputFilePath.trim();
  }

  try {
    const outputEntries = await loadCacheEntries(runtimeConfig);
    const client = getSharedInfoHttpClient(runtimeConfig);

    let scanned = 0;
    let fetched = 0;
    let failed = 0;
    let added = 0;
    let updated = 0;
    let skippedExisting = 0;

    const tasks = [...codes];
    const workerCount = Math.min(jobMaxConcurrency, tasks.length);

    const runWorker = async () => {
      while (tasks.length > 0) {
        const code = tasks.shift();
        if (!code) {
          continue;
        }

        scanned += 1;

        if (!refreshExisting && outputEntries[code]) {
          skippedExisting += 1;
          continue;
        }

        const data = await fetchWorkInfoFromRemote(client, code);

        if (!data) {
          failed += 1;
          continue;
        }

        fetched += 1;
        const stampedData = withCacheTimestamp(data);

        if (!outputEntries[code]) {
          added += 1;
          outputEntries[code] = stampedData;
          continue;
        }

        const existingSerialized = serializeComparableCacheEntry(
          outputEntries[code],
        );
        const nextSerialized = serializeComparableCacheEntry(stampedData);

        if (existingSerialized !== nextSerialized) {
          updated += 1;
          outputEntries[code] = stampedData;
          continue;
        }

        outputEntries[code] = withCacheTimestamp(
          outputEntries[code],
          stampedData[CACHE_ENTRY_TS_FIELD],
        );
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    const persistResult = await persistCacheEntries(
      runtimeConfig,
      outputEntries,
    );

    logger.info(
      `[tg-info-cache] 编号缓存构建完成 scanned=${scanned} fetched=${fetched} failed=${failed} added=${added} updated=${updated} skipped=${skippedExisting}`,
    );

    return {
      success: true,
      message:
        persistResult.evictedCodes.length > 0
          ? `缓存构建完成：新增 ${added}，更新 ${updated}，命中 ${skippedExisting}，失败 ${failed}，淘汰 ${persistResult.evictedCodes.length}`
          : `缓存构建完成：新增 ${added}，更新 ${updated}，命中 ${skippedExisting}，失败 ${failed}`,
      stats: {
        scanned,
        fetched,
        failed,
        added,
        updated,
        skippedExisting,
        evicted: persistResult.evictedCodes.length,
        maxConcurrency: workerCount,
        inputCodes: codes.length,
        total: persistResult.total,
        fileSize: persistResult.fileSize,
        maxFileSizeBytes: runtimeConfig.maxFileSizeBytes,
        maxFileSizeMB: runtimeConfig.maxFileSizeMB,
      },
      outputFilePath: runtimeConfig.cacheFilePath,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    return {
      success: false,
      error: normalizedError.error?.message || normalizedError.message,
      outputFilePath: runtimeConfig.cacheFilePath,
    };
  }
}

export async function buildInfoCacheFromTextFile(inputFilePath, options = {}) {
  const normalizedPath = String(inputFilePath || "").trim();
  if (!normalizedPath) {
    return {
      success: false,
      error: "请提供 TXT 文件路径",
    };
  }

  if (!fs.existsSync(normalizedPath)) {
    return {
      success: false,
      error: `文件不存在: ${normalizedPath}`,
    };
  }

  const maxCodes = Number.MAX_SAFE_INTEGER;

  try {
    const rawContent = await fsp.readFile(normalizedPath, "utf-8");
    const codes = extractWorkCodes(rawContent, maxCodes);

    if (!codes.length) {
      return {
        success: false,
        error: "TXT 中未发现 RJ/VJ/BJ 编号",
      };
    }

    const buildResult = await buildInfoCacheFromWorkCodes(codes, {
      ...options,
      refreshExisting:
        typeof options?.refreshExisting === "boolean"
          ? options.refreshExisting
          : true,
      maxCodes,
    });

    return {
      ...buildResult,
      inputFilePath: normalizedPath,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    const runtimeConfig = getInfoCacheRuntimeConfig(getConfig());
    return {
      success: false,
      error: normalizedError.error?.message || normalizedError.message,
      inputFilePath: normalizedPath,
      outputFilePath: runtimeConfig.cacheFilePath,
    };
  }
}

export async function getInfoCacheStatus(options = {}) {
  const runtimeConfig = getInfoCacheRuntimeConfig(getConfig());
  const outputPath =
    typeof options.outputFilePath === "string" && options.outputFilePath.trim()
      ? options.outputFilePath.trim()
      : runtimeConfig.cacheFilePath;

  const nextRuntimeConfig = {
    ...runtimeConfig,
    cacheFilePath: outputPath,
  };

  const entries = await loadCacheEntries(nextRuntimeConfig, {
    forceReload: true,
  });

  let fileSize = 0;
  let exists = false;

  try {
    const stats = await fsp.stat(outputPath);
    fileSize = stats.size;
    exists = true;
  } catch {
    exists = false;
  }

  return {
    success: true,
    cacheFilePath: outputPath,
    exists,
    fileSize,
    records: Object.keys(entries).length,
    maxFileSizeMB: nextRuntimeConfig.maxFileSizeMB,
    maxFileSizeBytes: nextRuntimeConfig.maxFileSizeBytes,
  };
}

export function setupTgInfoCacheIPC() {
  logger.debug("[tg-info-cache] 正在初始化 IPC 处理器...");

  const handlers = ["tg-info-cache-build", "tg-info-cache-status"];

  handlers.forEach((handler) => {
    try {
      ipcMain.removeHandler(handler);
    } catch (error) {
      const normalizedError = normalizeError(error);
      logger.warn(
        `[tg-info-cache] removeHandler(${handler}) 失败`,
        normalizedError.error?.message || normalizedError.message,
      );
    }
  });

  ipcMain.handle("tg-info-cache-build", async (_event, payload = {}) => {
    const inputFilePath = payload?.inputFilePath || payload?.filePath || "";
    return await buildInfoCacheFromTextFile(inputFilePath, payload);
  });

  ipcMain.handle("tg-info-cache-status", async (_event, payload = {}) => {
    return await getInfoCacheStatus(payload);
  });

  logger.debug("[tg-info-cache] IPC 处理器注册完成");
}
