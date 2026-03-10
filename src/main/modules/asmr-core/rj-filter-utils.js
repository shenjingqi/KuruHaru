// 从单行文本提取 RJ 编号，兼容 "RJ123" 与纯数字输入。
export function extractRjNumberFromLine(line = "") {
  const match = line.match(/RJ?(\d+)/i);
  if (match) {
    return match[1];
  }

  const trimmed = line.trim();
  // 某些来源只给数字，不带 RJ 前缀时保留为可匹配编号。
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// 批量提取并去重 RJ 编号，返回 Set 供后续匹配流程复用。
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

// 不同接口字段不统一，按优先级折叠成一个可比较的 RJ 值。
export function getWorkComparableRjNumber(work = {}) {
  return (
    work.rj_number || work.rj_code || work.id?.replace("RJ", "") || work.id
  );
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
