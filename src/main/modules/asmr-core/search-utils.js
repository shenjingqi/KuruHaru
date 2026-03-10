export function extractSearchQueryParam(url) {
  let queryParam = "";

  if (url.includes("/api/search/")) {
    queryParam = url.split("/api/search/")[1] || "";
    const queryIndex = queryParam.indexOf("?");
    if (queryIndex > -1) {
      queryParam = queryParam.substring(0, queryIndex);
    }
    try {
      queryParam = decodeURIComponent(queryParam);
    } catch {
      // 忽略解码错误
    }
    return queryParam;
  }

  try {
    const urlObj = new URL(url);
    queryParam =
      urlObj.searchParams.get("keyword") || urlObj.searchParams.get("q") || url;
  } catch {
    queryParam = url;
  }

  return queryParam;
}

export function buildAsmrSearchBaseUrl(
  queryParam,
  pageSize = 100,
  searchApiPrefix = "https://api.asmr-200.com/api/search/",
) {
  return `${searchApiPrefix}${encodeURIComponent(queryParam)}?order=create_date&sort=desc&pageSize=${pageSize}`;
}

export function buildAsmrSearchPageUrl(baseUrl, page = 1) {
  return `${baseUrl}&page=${page}`;
}

export function getAsmrSearchBrowserHeaders({
  includeCompression = true,
} = {}) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://asmr-200.com/",
    Origin: "https://asmr-200.com",
  };

  if (includeCompression) {
    headers["Accept-Encoding"] = "gzip, deflate, br";
    headers.Connection = "keep-alive";
  }

  return headers;
}

export function extractAsmrSearchTotalCount(data, fallbackCount = 0) {
  let totalCount = 0;

  if (data?.pagination?.totalCount) {
    totalCount = data.pagination.totalCount;
  } else if (data?.total) {
    totalCount = data.total;
  } else if (data?.total_count) {
    totalCount = data.total_count;
  }

  return totalCount === 0 ? fallbackCount : totalCount;
}

export function computeAsmrSearchTotalPages(totalCount, pageSize = 100) {
  return Math.ceil(totalCount / pageSize);
}

export function extractWorksArrayBasic(data) {
  if (Array.isArray(data)) return data;
  if (data?.works && Array.isArray(data.works)) return data.works;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.items && Array.isArray(data.items)) return data.items;
  if (data?.list && Array.isArray(data.list)) return data.list;
  return [];
}

export function extractWorksArrayLite(data) {
  if (Array.isArray(data)) return data;
  if (data?.works && Array.isArray(data.works)) return data.works;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

export function extractWorksArrayExtended(data) {
  const basicItems = extractWorksArrayBasic(data);
  if (basicItems.length > 0) return basicItems;
  if (data?.pagination?.works && Array.isArray(data.pagination.works)) {
    return data.pagination.works;
  }
  return [];
}

export function formatAsmrWorkData(item) {
  const rjCode =
    item.source_id || item.rj_code || item.id || item.work_id || item.rj || "";
  const title = item.title || item.work_title || item.name || "未知标题";
  const date =
    item.date ||
    item.release_date ||
    item.release ||
    item.created_at ||
    item.publish_date ||
    "";

  let rjNum = "";
  if (typeof rjCode === "string") {
    rjNum = rjCode.replace(/^RJ?/i, "");
  } else if (rjCode) {
    rjNum = String(rjCode).replace(/^RJ?/i, "");
  }

  return {
    rj_code: typeof rjCode === "string" ? rjCode : rjCode ? String(rjCode) : "",
    rj_number: rjNum,
    title: typeof title === "string" ? title : "未知标题",
    date: typeof date === "string" ? date : "",
  };
}

export function formatPlaylistWork(item = {}) {
  return {
    id: String(item.id),
    source_id: item.source_id,
    title: item.title,
    tags: item.tags || [],
  };
}

export function formatPlaylistWorks(items = []) {
  return items.map((item) => formatPlaylistWork(item));
}

export function collectSourceIdsFromWorks(works = []) {
  const rjCodes = [];

  for (let i = 0; i < works.length; i++) {
    const work = works[i];
    const otherLanguageEditions = work?.other_language_editions_in_db;
    const sourceId =
      work?.source_id || `RJ${String(work?.id ?? "").padStart(8, "0")}`;

    rjCodes.push(sourceId);

    if (
      otherLanguageEditions &&
      Array.isArray(otherLanguageEditions) &&
      otherLanguageEditions.length > 0
    ) {
      for (let j = 0; j < otherLanguageEditions.length; j++) {
        if (otherLanguageEditions[j]?.source_id) {
          rjCodes.push(otherLanguageEditions[j].source_id);
        }
      }
    }
  }

  return rjCodes;
}
