const PREFIXED_WORK_CODE_REGEX = /(RJ|VJ|BJ)(\d+)/i;
const EXACT_PREFIXED_WORK_CODE_REGEX = /^(RJ|VJ|BJ)(\d+)$/i;

function normalizeComparableWorkCode(rawCode = "") {
  const trimmed = String(rawCode || "").trim();
  if (!trimmed) {
    return null;
  }

  const prefixedMatch = trimmed.match(EXACT_PREFIXED_WORK_CODE_REGEX);
  if (prefixedMatch) {
    const prefix = prefixedMatch[1].toUpperCase();
    const number = prefixedMatch[2];

    return prefix === "RJ" ? number : `${prefix}${number}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// 从单行文本提取可比较的作品编号，支持 RJ/VJ/BJ；RJ 仍兼容纯数字输入。
export function extractRjNumberFromLine(line = "") {
  const prefixedMatch = String(line || "").match(PREFIXED_WORK_CODE_REGEX);
  if (prefixedMatch) {
    return normalizeComparableWorkCode(
      `${prefixedMatch[1].toUpperCase()}${prefixedMatch[2]}`,
    );
  }

  return normalizeComparableWorkCode(line);
}

// 批量提取并去重可比较的作品编号，返回 Set 供后续匹配流程复用。
export function collectRjNumbersFromLines(lines = []) {
  const rjNumbers = new Set();

  lines.forEach((line) => {
    const rjNumber = extractRjNumberFromLine(line);
    if (rjNumber) {
      rjNumbers.add(rjNumber);
    }
  });

  return rjNumbers;
}

// 不同接口字段不统一，按优先级折叠成一个可比较的作品编号值。
export function getWorkComparableRjNumber(work = {}) {
  const candidates = [work.source_id, work.rj_number, work.rj_code, work.id];

  for (const candidate of candidates) {
    const normalizedCode = normalizeComparableWorkCode(candidate);
    if (normalizedCode) {
      return normalizedCode;
    }
  }

  return null;
}

// 精确匹配：保持 rjCodes 输入顺序，同时收集未命中的编号。
export function matchWorkIdsByRjCodesExact(allWorks = [], rjCodes = []) {
  const matchedWorkIds = [];
  const notFoundRJ = [];

  for (const rjCode of rjCodes) {
    const matched = allWorks.find(
      (work) => work.source_id === rjCode || String(work.id) === rjCode,
    );

    if (matched) {
      matchedWorkIds.push(String(matched.id));
    } else {
      notFoundRJ.push(rjCode);
    }
  }

  return {
    matchedWorkIds,
    notFoundRJ,
  };
}

export function matchWorkIdsByRjCodesCaseInsensitive(
  allWorks = [],
  rjCodes = [],
) {
  // 先将输入标准化到统一大小写，降低后续比较开销。
  const normalizedCodes = rjCodes.map((code) => String(code));
  const rjCodeSet = new Set(normalizedCodes.map((code) => code.toUpperCase()));
  const matchedWorkIds = [];

  for (const work of allWorks) {
    const workRJ = work.source_id || String(work.id);
    if (rjCodeSet.has(String(workRJ).toUpperCase())) {
      matchedWorkIds.push(String(work.id));
    }
  }

  const notFoundRJ = [];
  // 二次遍历用于精确得出未命中列表，避免仅靠 Set 丢失原始输入信息。
  for (const rj of normalizedCodes) {
    const found = allWorks.some(
      (work) =>
        (work.source_id && work.source_id.toUpperCase() === rj.toUpperCase()) ||
        String(work.id) === rj,
    );
    if (!found) {
      notFoundRJ.push(rj);
    }
  }

  return {
    matchedWorkIds,
    notFoundRJ,
  };
}
