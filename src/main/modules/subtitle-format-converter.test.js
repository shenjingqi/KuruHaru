import { describe, expect, it } from "vitest";

import {
  convertLrcToSrtContent,
  convertSrtToLrcContent,
  detectSubtitleFormat,
  parseLrcContent,
  parseSrtContent,
} from "./subtitle-format-converter";

describe("subtitle-format-converter", () => {
  it("detects subtitle format from file extension", () => {
    expect(detectSubtitleFormat("C:\\test\\foo.srt")).toBe("srt");
    expect(detectSubtitleFormat("C:\\test\\foo.lrc")).toBe("lrc");
    expect(detectSubtitleFormat("C:\\test\\foo.txt")).toBe("");
  });

  it("parses srt cues and converts them to lrc", () => {
    const srt = `1
00:00:01,120 --> 00:00:03,450
第一行
第二行

2
00:00:05,000 --> 00:00:06,000
尾行`;

    const cues = parseSrtContent(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(1120);
    expect(cues[0].textLines).toEqual(["第一行", "第二行"]);

    const result = convertSrtToLrcContent(srt);
    expect(result.cueCount).toBe(2);
    expect(result.content).toBe("[00:01.12]第一行 第二行\n[00:05.00]尾行");
  });

  it("parses lrc cues and converts them to srt with inferred end times", () => {
    const lrc = `[00:01.00]第一句
[00:03.50]第二句
[00:07.00]第三句`;

    const cues = parseLrcContent(lrc);
    expect(cues).toHaveLength(3);
    expect(cues[1].startMs).toBe(3500);
    expect(cues[2].textLines).toEqual(["第三句"]);

    const result = convertLrcToSrtContent(lrc);
    expect(result.cueCount).toBe(3);
    expect(result.content).toContain("00:00:01,000 --> 00:00:03,490");
    expect(result.content).toContain("00:00:03,500 --> 00:00:06,990");
    expect(result.content).toContain("00:00:07,000 --> 00:00:10,000");
  });

  it("supports multiple timestamps on one lrc line", () => {
    const lrc = `[00:01.00][00:02.50]重复一句`;

    const cues = parseLrcContent(lrc);
    expect(cues).toHaveLength(2);
    expect(cues[0].textLines).toEqual(["重复一句"]);
    expect(cues[1].startMs).toBe(2500);
  });
});
