const SEARCH_BASE_URL = "https://api.asmr-200.com/api/search/";

const isDefined = (value) => value !== null && value !== undefined;

const appendBiFilterItems = (
  items,
  filter,
  includeType,
  includePrefix,
  excludeType,
  excludePrefix,
  normalize = (value) => value,
) => {
  // include/exclude 采用同一追加器，确保双向语法结构完全对称。
  if (filter?.include?.length) {
    filter.include.forEach((value) => {
      items.push({
        type: includeType,
        text: `${includePrefix}${normalize(value)}$`,
      });
    });
  }

  if (filter?.exclude?.length) {
    filter.exclude.forEach((value) => {
      items.push({
        type: excludeType,
        text: `${excludePrefix}${normalize(value)}$`,
      });
    });
  }
};

export const buildSearchSyntaxItems = (searchParams = {}) => {
  const items = [];

  appendBiFilterItems(
    items,
    searchParams.tags,
    "tag-include",
    "$tag:",
    "tag-exclude",
    "$-tag:",
  );

  appendBiFilterItems(
    items,
    searchParams.tagw,
    "tagw-include",
    "$tagw:",
    "tagw-exclude",
    "$-tagw:",
  );

  appendBiFilterItems(
    items,
    searchParams.lang,
    "lang-include",
    "$lang:",
    "lang-exclude",
    "$-lang:",
    (value) => String(value).toUpperCase(),
  );

  if (isDefined(searchParams.duration?.value)) {
    // mode=less 映射到 DSL 里的负向前缀（如 $-duration:30m$）。
    const suffix = searchParams.duration.unit === "h" ? "h" : "m";
    const prefix = searchParams.duration.mode === "less" ? "-" : "";
    items.push({
      type: "duration",
      text: `$${prefix}duration:${searchParams.duration.value}${suffix}$`,
    });
  }

  if (isDefined(searchParams.rating?.value)) {
    const prefix = searchParams.rating.mode === "less" ? "-" : "";
    items.push({
      type: "rating",
      text: `$${prefix}rate:${searchParams.rating.value}$`,
    });
  }

  if (isDefined(searchParams.price?.value)) {
    const prefix = searchParams.price.mode === "less" ? "-" : "";
    items.push({
      type: "price",
      text: `$${prefix}price:${searchParams.price.value}$`,
    });
  }

  if (searchParams.age === "general") {
    items.push({ type: "age", text: "$age:general$" });
  } else if (searchParams.age === "r15") {
    items.push({ type: "age", text: "$age:r15$" });
  } else if (searchParams.age === "excludeAdult") {
    // 兼容 UI 的 excludeAdult 选项，转换为 DSL 排除成年标签语法。
    items.push({ type: "age-exclude", text: "$-age:adult$" });
  }

  return items;
};

export const buildSearchQuery = (searchParams = {}) => {
  const items = buildSearchSyntaxItems(searchParams);
  return items.map((item) => item.text).join(" ");
};

export const buildSearchUrl = (searchParams = {}) => {
  const query = buildSearchQuery(searchParams);
  if (!query) {
    // 空查询返回空串，调用方可据此避免触发无效导航。
    return "";
  }

  return `${SEARCH_BASE_URL}${encodeURIComponent(query)}`;
};
