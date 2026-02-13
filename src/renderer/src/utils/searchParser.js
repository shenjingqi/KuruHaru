class SearchParser {
  constructor() {
    this.blockList = [];
  }
  parse(searchString) {
    const result = {
      tags: { include: [], exclude: [] },
      duration: { min: null, max: null },
      rate: { min: null, max: null },
      price: { min: null, max: null },
      age: { include: [], exclude: [] },
    };
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
    const durGreater = /\$duration:(\d+)([mh])\$/g;
    while ((match = durGreater.exec(searchString)) !== null) {
      const value = parseInt(match[1]) * (match[2] === "h" ? 60 : 1);
      result.duration.min = result.duration.min
        ? Math.min(result.duration.min, value)
        : value;
    }
    const durLess = /\$-duration:(\d+)([mh])\$/g;
    while ((match = durLess.exec(searchString)) !== null) {
      const value = parseInt(match[1]) * (match[2] === "h" ? 60 : 1);
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
    let searchString = "";
    const includeTags = options.tags?.include || [];
    const excludeTags = options.tags?.exclude || [];
    includeTags.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$tag:" + tag + "$ ";
    });
    excludeTags.forEach((tag) => {
      if (tag && tag.trim()) searchString += "$-tag:" + tag + "$ ";
    });
    if (options.duration?.min !== null && options.duration?.min !== undefined) {
      const minMinutes = options.duration.min;
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
