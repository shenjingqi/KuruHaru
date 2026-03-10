export function normalizePeerEntityInput(chatIdInput, options = {}) {
  if (typeof chatIdInput === "bigint") {
    return chatIdInput;
  }

  if (typeof chatIdInput === "string" || typeof chatIdInput === "number") {
    const cleanId = String(chatIdInput).trim();

    if (cleanId.length === 0) {
      return cleanId;
    }

    if (/^-?\d+$/.test(cleanId)) {
      try {
        return BigInt(cleanId);
      } catch (error) {
        if (typeof options.onBigIntError === "function") {
          options.onBigIntError(error, cleanId);
        }
        return cleanId;
      }
    }

    return cleanId;
  }

  return chatIdInput;
}
