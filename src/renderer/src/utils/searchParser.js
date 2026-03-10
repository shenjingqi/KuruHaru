class SearchParser {
  constructor() {
    this.blockList = [];
  }
  parse(searchString) {
    const result = {
      tags: { include: [], exclude: [] },
      tagw: { include: [], exclude: [] },
      lang: { include: [], exclude: [] },
      duration: { min: null, max: null },
      rate: { min: null, max: null },
      price: { min: null, max: null },
      age: { include: [], exclude: [] },
    };
    // 各语法片段独立扫描，允许同一字符串里自由组合条件并自动去重。
    let match;
    const tagInclude = /\$tag:([^$]+)\$/g;
    while ((match = tagInclude.exec(searchString)) !== null) {
      const tagValue = match[1].trim();
      if (tagValue && !result.tags.include.includes(tagValue))
        result.tags.include.push(tagValue);
    }
    const tagExclude = /\$-tag:([^$]+)\$/g;
    while ((match = tagExclude.exec(searchString)) !== null) {
      const tagValue = match[1].trim();
      if (tagValue && !result.tags.exclude.includes(tagValue))
        result.tags.exclude.push(tagValue);
    }
    const tagwInclude = /\$tagw:([^$]+)\$/g;
    while ((match = tagwInclude.exec(searchString)) !== null) {
      const tagValue = match[1].trim();
      if (tagValue && !result.tagw.include.includes(tagValue))
        result.tagw.include.push(tagValue);
    }
    const tagwExclude = /\$-tagw:([^$]+)\$/g;
    while ((match = tagwExclude.exec(searchString)) !== null) {
      const tagValue = match[1].trim();
      if (tagValue && !result.tagw.exclude.includes(tagValue))
        result.tagw.exclude.push(tagValue);
    }
    const langInclude = /\$lang:([A-Z_]+)\$/gi;
    while ((match = langInclude.exec(searchString)) !== null) {
      const langCode = String(match[1]).toUpperCase();
      if (langCode && !result.lang.include.includes(langCode))
        result.lang.include.push(langCode);
    }
    const langExclude = /\$-lang:([A-Z_]+)\$/gi;
    while ((match = langExclude.exec(searchString)) !== null) {
      const langCode = String(match[1]).toUpperCase();
      if (langCode && !result.lang.exclude.includes(langCode))
        result.lang.exclude.push(langCode);
    }
    const durGreater = /\$duration:(\d+)([mh])\$/g;
    while ((match = durGreater.exec(searchString)) !== null) {
      const value = parseInt(match[1]) * (match[2] === "h" ? 60 : 1);
      // 重复下限时取更小值，避免多次输入把范围意外收窄。
      result.duration.min = result.duration.min
        ? Math.min(result.duration.min, value)
        : value;
    }
    const durLess = /\$-duration:(\d+)([mh])\$/g;
    while ((match = durLess.exec(searchString)) !== null) {
      const value = parseInt(match[1]) * (match[2] === "h" ? 60 : 1);
      // 重复上限时取更大值，保持筛选边界尽量宽松。
      result.duration.max = result.duration.max
        ? Math.max(result.duration.max, value)
        : value;
    }
    const rateGreater = /\$rate:(\d+\.?\d*)\$/g;
    while ((match = rateGreater.exec(searchString)) !== null) {
      const value = parseFloat(match[1]);
      if (!isNaN(value))
        result.rate.min = result.rate.min
          ? Math.min(result.rate.min, value)
          : value;
    }
    const rateLess = /\$-rate:(\d+\.?\d*)\$/g;
    while ((match = rateLess.exec(searchString)) !== null) {
      const value = parseFloat(match[1]);
      if (!isNaN(value))
        result.rate.max = result.rate.max
          ? Math.max(result.rate.max, value)
          : value;
    }
    const priceGreater = /\$price:(\d+)\$/g;
    while ((match = priceGreater.exec(searchString)) !== null) {
      const value = parseInt(match[1]);
      if (!isNaN(value))
        result.price.min = result.price.min
          ? Math.min(result.price.min, value)
          : value;
    }
    const priceLess = /\$-price:(\d+)\$/g;
    while ((match = priceLess.exec(searchString)) !== null) {
      const value = parseInt(match[1]);
      if (!isNaN(value))
        result.price.max = result.price.max
          ? Math.max(result.price.max, value)
          : value;
    }
    // 兼容 15/18 这类旧输入，统一归一到固定年龄标签。
    const ageMap = {
      general: "general",
      r15: "r15",
      15: "r15",
      adult: "adult",
      18: "adult",
    };
    const ageInclude = /\$age:(general|r15|15|adult|18)\$/gi;
    while ((match = ageInclude.exec(searchString)) !== null) {
      const normalizedAge = ageMap[match[1].toLowerCase()];
      if (normalizedAge && !result.age.include.includes(normalizedAge))
        result.age.include.push(normalizedAge);
    }
    const ageExclude = /\$-age:(general|r15|15|adult|18)\$/gi;
    while ((match = ageExclude.exec(searchString)) !== null) {
      const normalizedAge = ageMap[match[1].toLowerCase()];
      if (normalizedAge && !result.age.exclude.includes(normalizedAge))
        result.age.exclude.push(normalizedAge);
    }
    return result;
  }
  generate(options) {
    // 输出标准 DSL 字符串，保证 UI 状态和文本查询可双向转换。
    let searchString = "";
    const includeTags = options.tags?.include || [];
    const excludeTags = options.tags?.exclude || [];
    const includeTagw = options.tagw?.include || [];
    const excludeTagw = options.tagw?.exclude || [];
    const includeLangs = options.lang?.include || [];
    const excludeLangs = options.lang?.exclude || [];
    includeTags.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$tag:" + tag + "$ ";
    });
    excludeTags.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$-tag:" + tag + "$ ";
    });
    includeTagw.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$tagw:" + tag + "$ ";
    });
    excludeTagw.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$-tagw:" + tag + "$ ";
    });
    includeLangs.forEach((lang) => {
      const normalized = String(lang || "")
        .trim()
        .toUpperCase();
      if (normalized) searchString += "$lang:" + normalized + "$ ";
    });
    excludeLangs.forEach((lang) => {
      const normalized = String(lang || "")
        .trim()
        .toUpperCase();
      if (normalized) searchString += "$-lang:" + normalized + "$ ";
    });
    if (options.duration?.min !== null && options.duration?.min !== undefined) {
      const minMinutes = options.duration.min;
      // 分钟值达到 60 时输出小时语法，与 parse 侧单位保持一致。
      searchString +=
        "$duration:" +
        (minMinutes >= 60
          ? Math.floor(minMinutes / 60) + "h"
          : minMinutes + "m") +
        "$ ";
    }
    if (options.duration?.max !== null && options.duration?.max !== undefined) {
      const maxMinutes = options.duration.max;
      searchString +=
        "$-duration:" +
        (maxMinutes >= 60
          ? Math.floor(maxMinutes / 60) + "h"
          : maxMinutes + "m") +
        "$ ";
    }
    if (options.rate?.min !== null && options.rate?.min !== undefined) {
      searchString += "$rate:" + options.rate.min + "$ ";
    }
    if (options.rate?.max !== null && options.rate?.max !== undefined) {
      searchString += "$-rate:" + options.rate.max + "$ ";
    }
    if (options.price?.min !== null && options.price?.min !== undefined) {
      searchString += "$price:" + options.price.min + "$ ";
    }
    if (options.price?.max !== null && options.price?.max !== undefined) {
      searchString += "$-price:" + options.price.max + "$ ";
    }
    const ageInclude = options.age?.include || [];
    const ageExclude = options.age?.exclude || [];
    const validAges = ["general", "r15", "adult"];
    ageInclude.forEach((age) => {
      if (validAges.includes(age)) searchString += "$age:" + age + "$ ";
    });
    ageExclude.forEach((age) => {
      if (validAges.includes(age)) searchString += "$-age:" + age + "$ ";
    });
    return searchString.trim();
  }
  setBlockList(blockList) {
    this.blockList = blockList || [];
  }
}
export default new SearchParser();
