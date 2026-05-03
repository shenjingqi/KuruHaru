import { describe, expect, it } from "vitest";
import { extractRJCode, extractRJCodes } from "./rj-parsers";

describe("tg-search-bot-core/rj-parsers", () => {
  it("normalizes 7-digit prefixed work codes", () => {
    expect(extractRJCode("RJ1200722")).toBe("RJ01200722");
    expect(extractRJCode("vj1234567")).toBe("VJ01234567");
    expect(extractRJCode("BJ123456")).toBe("BJ123456");
  });

  it("returns null when prefixed work code is missing", () => {
    expect(extractRJCode("1200722")).toBe(null);
    expect(extractRJCode("hello world")).toBe(null);
  });

  it("extracts unique normalized codes in original order", () => {
    const message = "RJ1200722 RJ01200722 vj7654321 BJ223344 RJ1200722";

    expect(extractRJCodes(message)).toEqual([
      "RJ01200722",
      "VJ07654321",
      "BJ223344",
    ]);
  });
});
