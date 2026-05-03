import { describe, expect, it } from "vitest";
import {
  collectRjNumbersFromLines,
  extractRjNumberFromLine,
  getWorkComparableRjNumber,
} from "./rj-filter-utils";

describe("asmr-core/rj-filter-utils", () => {
  it("extracts comparable work codes from RJ, VJ, BJ and numeric lines", () => {
    expect(extractRjNumberFromLine("RJ123456")).toBe("123456");
    expect(extractRjNumberFromLine("已有 VJ7654321 记录")).toBe("VJ7654321");
    expect(extractRjNumberFromLine("bj223344")).toBe("BJ223344");
    expect(extractRjNumberFromLine("998877")).toBe("998877");
  });

  it("collects unique comparable work codes from txt lines", () => {
    expect(
      [...
        collectRjNumbersFromLines([
          "RJ123456",
          "VJ7654321",
          "BJ223344",
          "998877",
          "rj123456",
        ]),
      ],
    ).toEqual(["123456", "VJ7654321", "BJ223344", "998877"]);
  });

  it("normalizes works for TXT comparison", () => {
    expect(
      getWorkComparableRjNumber({
        source_id: "VJ7654321",
        rj_code: "VJ7654321",
      }),
    ).toBe("VJ7654321");

    expect(
      getWorkComparableRjNumber({
        rj_number: "123456",
        rj_code: "RJ123456",
      }),
    ).toBe("123456");

    expect(
      getWorkComparableRjNumber({
        rj_number: "BJ223344",
      }),
    ).toBe("BJ223344");
  });
});
