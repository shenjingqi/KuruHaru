const WORK_CODE_REGEX = /(?:RJ|VJ|BJ)\d{6,8}/gi;
const PREFIXED_WORK_CODE_REGEX = /^([RrVvBb][Jj])(\d{6,8})$/;
const DIRECT_WORK_CODE_INPUT_REGEX = /^(?:[RrVvBb][Jj]\d{6,8}|\d{6,8})$/;

function normalizePrefixedWorkCode(rawCode) {
  const matched = String(rawCode || "")
    .trim()
    .match(PREFIXED_WORK_CODE_REGEX);
  if (!matched) {
    return null;
  }

  const prefix = matched[1].toUpperCase();
  const rawNumber = matched[2];
  const number = rawNumber.length === 7 ? `0${rawNumber}` : rawNumber;

  return `${prefix}${number}`;
}

function escapeRegExp(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractRJCode(rawText) {
  if (!rawText) return null;

  const matched = String(rawText).match(/(?:RJ|VJ|BJ)\d{6,8}/i);
  if (!matched?.[0]) {
    return null;
  }

  return normalizePrefixedWorkCode(matched[0]);
}

export function extractRJCodes(rawText) {
  if (!rawText) return [];

  const matches = String(rawText).toUpperCase().match(WORK_CODE_REGEX) || [];
  const normalizedCodes = matches
    .map((code) => normalizePrefixedWorkCode(code))
    .filter(Boolean);

  return [...new Set(normalizedCodes)];
}

export function extractMentionSearchWorkCodeToken(rawText, botUsername) {
  const normalizedUsername = String(botUsername || "")
    .trim()
    .replace(/^@/, "");
  const text = String(rawText || "").trim();
  if (!normalizedUsername || !text) {
    return null;
  }

  const mentionMatcher = new RegExp(
    `^@${escapeRegExp(normalizedUsername)}\\s+([^\\s]+)\\s*$`,
    "i",
  );
  const matched = text.match(mentionMatcher);
  const token = String(matched?.[1] || "").trim();
  if (!token || !DIRECT_WORK_CODE_INPUT_REGEX.test(token)) {
    return null;
  }

  return token;
}
