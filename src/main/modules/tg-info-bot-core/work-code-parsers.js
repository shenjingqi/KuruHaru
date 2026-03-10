const CODE_PATTERN =
  /(?:[RrVvBb][Jj]\d{6,8})|(?:01\d{6}|1\d{6}|(?:[0-3]\d|4[0-4])\d{4})/g;

function normalizePrefix(rawPrefix) {
  const prefix = String(rawPrefix || "")
    .trim()
    .toUpperCase();

  if (prefix === "RJ" || prefix === "VJ" || prefix === "BJ") {
    return prefix;
  }

  return "RJ";
}

function normalizeNumber(rawNumber) {
  const digits = String(rawNumber || "").trim();
  if (!/^\d{6,8}$/.test(digits)) {
    return "";
  }

  if (digits.length === 7) {
    return `0${digits}`;
  }

  return digits;
}

export function normalizeWorkCode(rawCode) {
  if (!rawCode) {
    return null;
  }

  const normalizedRaw = String(rawCode).trim();
  const prefixedMatch = normalizedRaw.match(/^([RrVvBb][Jj])(\d{6,8})$/);

  if (prefixedMatch) {
    const prefix = normalizePrefix(prefixedMatch[1]);
    const number = normalizeNumber(prefixedMatch[2]);
    return number ? `${prefix}${number}` : null;
  }

  const numberOnlyMatch = normalizedRaw.match(/^(\d{6,8})$/);
  if (numberOnlyMatch) {
    const number = normalizeNumber(numberOnlyMatch[1]);
    return number ? `RJ${number}` : null;
  }

  return null;
}

export function extractSingleWorkCode(rawText) {
  if (!rawText) {
    return null;
  }

  const text = String(rawText);
  const firstMatch = text.match(CODE_PATTERN);

  if (!firstMatch?.[0]) {
    return null;
  }

  const token = firstMatch[0];
  if (/^[RrVvBb][Jj]/.test(token)) {
    return normalizeWorkCode(token);
  }

  return normalizeWorkCode(`RJ${token}`);
}

export function extractWorkCodes(message, maxCount = 3) {
  if (!message) {
    return [];
  }

  const messageText = String(message);
  const seen = new Set();
  const results = [];
  const regex = new RegExp(CODE_PATTERN.source, "g");

  let match = regex.exec(messageText);
  while (match) {
    const rawToken = match[0];

    const normalizedCode = /^[RrVvBb][Jj]/.test(rawToken)
      ? normalizeWorkCode(rawToken)
      : normalizeWorkCode(`RJ${rawToken}`);

    if (normalizedCode && !seen.has(normalizedCode)) {
      seen.add(normalizedCode);
      results.push(normalizedCode);

      if (results.length >= maxCount) {
        break;
      }
    }

    match = regex.exec(messageText);
  }

  return results;
}
