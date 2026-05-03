import { describe, expect, it } from "vitest";

import {
  buildSubtitleCompletenessReport,
  formatSubtitleCompletenessMessage,
} from "./whisper-pack-utils";

describe("whisper-pack-utils", () => {
  it("按相对路径文件名匹配音频与字幕", () => {
    const report = buildSubtitleCompletenessReport({
      audioFiles: [
        { relativePath: "RJ123456/track01.mp3" },
        { relativePath: "RJ123456/disc2/track02.flac" },
      ],
      subtitleFiles: [
        { relativePath: "RJ123456/track01.srt" },
        { relativePath: "RJ123456/disc2/track02.lrc" },
      ],
    });

    expect(report.isComplete).toBe(true);
    expect(report.totalAudioCount).toBe(2);
    expect(report.totalSubtitleCount).toBe(2);
    expect(report.missingSubtitleFiles).toEqual([]);
  });

  it("检测缺少对应字幕的音频文件", () => {
    const report = buildSubtitleCompletenessReport({
      audioFiles: [
        { relativePath: "track01.mp3" },
        { relativePath: "track02.wav" },
      ],
      subtitleFiles: [{ relativePath: "track01.srt" }],
    });

    expect(report.isComplete).toBe(false);
    expect(report.missingSubtitleFiles).toEqual(["track02.wav"]);
    expect(formatSubtitleCompletenessMessage(report)).toContain(
      "存在 1 个音频缺少对应字幕",
    );
  });

  it("无音频文件时跳过完整性校验", () => {
    const report = buildSubtitleCompletenessReport({
      audioFiles: [],
      subtitleFiles: [{ relativePath: "only-subtitle.srt" }],
    });

    expect(report.isComplete).toBe(true);
    expect(report.skippedAudioValidation).toBe(true);
    expect(formatSubtitleCompletenessMessage(report)).toBe(
      "未检测到音频文件，跳过音频-字幕完整性校验",
    );
  });
});
