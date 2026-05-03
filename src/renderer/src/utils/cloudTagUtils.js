const NAME_LIKE_KEY_PATTERN = /(^|[-_])(name|title|label)([-_]|$)/i;

const normalizeText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const addText = (collection, value) => {
  const normalized = normalizeText(value);
  if (normalized) {
    collection.add(normalized);
  }
};

const walkTagNameCandidates = (value, collection, seenObjects) => {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    addText(collection, value);
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seenObjects.has(value)) {
    return;
  }

  seenObjects.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) =>
      walkTagNameCandidates(item, collection, seenObjects),
    );
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (typeof nestedValue === "string" && NAME_LIKE_KEY_PATTERN.test(key)) {
      addText(collection, nestedValue);
      return;
    }

    if (typeof nestedValue === "string") {
      return;
    }

    walkTagNameCandidates(nestedValue, collection, seenObjects);
  });
};

const walkTagTextTerms = (value, collection, seenObjects) => {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    addText(collection, value);
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seenObjects.has(value)) {
    return;
  }

  seenObjects.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => walkTagTextTerms(item, collection, seenObjects));
    return;
  }

  Object.values(value).forEach((nestedValue) => {
    walkTagTextTerms(nestedValue, collection, seenObjects);
  });
};

export function parseCloudTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags;
  }

  if (typeof rawTags === "string") {
    const normalized = rawTags.trim();
    if (!normalized) {
      return [];
    }

    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed) {
        return [parsed];
      }
    } catch {
      return [normalized];
    }
  }

  if (!rawTags) {
    return [];
  }

  return [rawTags];
}

export function collectCloudTagNameCandidates(tag) {
  const values = new Set();
  walkTagNameCandidates(tag, values, new WeakSet());
  return Array.from(values);
}

export function collectCloudTagTextTerms(tag) {
  const values = new Set();
  walkTagTextTerms(tag, values, new WeakSet());
  return Array.from(values);
}

export function resolveCloudTagDisplayName(tag) {
  if (typeof tag === "string") {
    return normalizeText(tag);
  }

  if (!tag || typeof tag !== "object") {
    return "";
  }

  const preferredNames = [
    tag.name,
    tag.label,
    tag.title,
    tag.i18n?.["zh-cn"]?.name,
    tag.i18n?.["ja-jp"]?.name,
    tag.i18n?.["en-us"]?.name,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (preferredNames.length > 0) {
    return preferredNames[0];
  }

  const aliases = collectCloudTagNameCandidates(tag);
  if (aliases.length > 0) {
    return aliases[0];
  }

  const searchTerms = collectCloudTagTextTerms(tag);
  return searchTerms[0] || "";
}

export function extractCloudTagEntries(rawTags) {
  const mergedEntries = new Map();

  parseCloudTags(rawTags).forEach((tag) => {
    const name = resolveCloudTagDisplayName(tag);
    const aliases = new Set(collectCloudTagNameCandidates(tag));
    const searchTerms = new Set(collectCloudTagTextTerms(tag));

    if (name) {
      aliases.add(name);
      searchTerms.add(name);
    }

    aliases.forEach((alias) => searchTerms.add(alias));

    const entryKey = name || Array.from(searchTerms)[0] || "";
    if (!entryKey) {
      return;
    }

    if (!mergedEntries.has(entryKey)) {
      mergedEntries.set(entryKey, {
        name: entryKey,
        aliases: new Set(),
        searchTerms: new Set(),
      });
    }

    const entry = mergedEntries.get(entryKey);
    aliases.forEach((alias) => entry.aliases.add(alias));
    searchTerms.forEach((term) => entry.searchTerms.add(term));
  });

  return Array.from(mergedEntries.values()).map((entry) => ({
    name: entry.name,
    aliases: Array.from(entry.aliases),
    searchTerms: Array.from(entry.searchTerms),
  }));
}

export function getCloudTagNames(rawTags) {
  return extractCloudTagEntries(rawTags).map((entry) => entry.name);
}

export function getCloudTagSearchTerms(rawTags) {
  const values = new Set();

  extractCloudTagEntries(rawTags).forEach((entry) => {
    entry.searchTerms.forEach((term) => values.add(term));
  });

  return Array.from(values);
}

export function aggregateCloudTagCounts(items) {
  const tagCount = {};

  items.forEach((item) => {
    getCloudTagNames(item?.tags).forEach((tagName) => {
      tagCount[tagName] = (tagCount[tagName] || 0) + 1;
    });
  });

  return Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort(
      (leftTag, rightTag) =>
        rightTag.count - leftTag.count ||
        leftTag.name.localeCompare(rightTag.name, "zh-CN"),
    );
}
