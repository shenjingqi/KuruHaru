const WORK_CODE_REGEX = /(?:RJ|VJ|BJ)\d{6,8}/gi;

export function extractRJCode(rawText) {
  if (!rawText) return null;

  const match = String(rawText)
    .toUpperCase()
    .match(/(?:RJ|VJ|BJ)\d{6,8}/i);

  return match ? match[0].toUpperCase() : null;
}

export function extractRJCodes(rawText) {
  if (!rawText) return [];

  const matches = String(rawText).toUpperCase().match(WORK_CODE_REGEX) || [];
  return [...new Set(matches.map((code) => code.toUpperCase()))];
}
