// 根据 URL 推断当前请求是搜索接口还是列表/详情接口，兼容新旧域名格式。
export const detectAsmrApiMode = (url = "") => {
  let isSearchApi = url.includes("/api/search/");
  const isListApi =
    url.includes("/api/playlist/") || url.includes("/api/works/");

  if (!isSearchApi && !isListApi) {
    // 历史站点上的搜索页面与 API 路径也归并到搜索模式。
    isSearchApi =
      url.includes("asmr-200.com/search") ||
      url.includes("asmr-200.com/api/search");
  }

  return {
    isSearchApi,
    isListApi,
  };
};

// 非搜索 API URL 会被包装到统一的搜索代理接口路径中。
export const buildAsmrSearchApiUrl = (url = "") => {
  if (url.includes("/api/search/")) {
    return url;
  }

  return `https://api.asmr-200.com/api/search/${encodeURIComponent(url)}`;
};

// 按发布日期过滤作品，并记录被排除条目用于日志回显。
export const filterWorksByAfterDate = (works = [], afterDateValue) => {
  const after = new Date(afterDateValue);
  const filteredOut = [];

  const filteredWorks = works.filter((work) => {
    if (!work.date) return true;

    const workDate = new Date(work.date);
    // 日期异常时默认保留，避免因为脏数据误删作品。
    if (isNaN(workDate.getTime())) {
      return true;
    }

    const keep = workDate > after;
    if (!keep) {
      filteredOut.push({ rj: work.rj_code, date: work.date });
    }

    return keep;
  });

  return {
    filteredWorks,
    filteredOut,
  };
};

// 统一映射到 RJ 过滤结果结构，兼容不同字段命名。
export const mapWorksToRjFilterResult = (works = []) => {
  return works.map((work) => ({
    rj_code: work.rj_code || work.id,
    title: work.title,
    date: work.date || work.release,
  }));
};
