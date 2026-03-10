import { describe, expect, it } from "vitest";
import {
  extractSingleWorkCode,
  extractWorkCodes,
  normalizeWorkCode,
} from "./work-code-parsers";

describe("tg-info-bot-core/work-code-parsers", () => {
  it("normalizes prefixed and number-only codes", () => {
    expect(normalizeWorkCode("rj123456")).toBe("RJ123456");
    expect(normalizeWorkCode("VJ1234567")).toBe("VJ01234567");
    expect(normalizeWorkCode("1234567")).toBe("RJ01234567");
  });

  it("extracts one code from command text", () => {
    expect(extractSingleWorkCode("/info RJ123456")).toBe("RJ123456");
    expect(extractSingleWorkCode("请查 1234567")).toBe("RJ01234567");
    expect(extractSingleWorkCode("hello world")).toBe(null);
  });

  it("extracts at most three unique codes in order", () => {
    const message = "RJ123456 1234567 vj7654321 RJ123456 BJ223344 334455";
    expect(extractWorkCodes(message)).toEqual([
      "RJ123456",
      "RJ01234567",
      "VJ07654321",
    ]);
  });
});
