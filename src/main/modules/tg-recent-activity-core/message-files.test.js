import { describe, expect, it } from "vitest";

import {
  formatFile,
  getFileName,
  getMessageDocument,
  isReferenceFile,
  isValidRJFile,
} from "./message-files";

describe("tg-recent-activity-core/message-files", () => {
  it("从任意带 fileName 的 TG 属性提取文件名", () => {
    const fileName = getFileName({
      attributes: [
        { className: "DocumentAttributeVideo", duration: 1 },
        { fileName: "20260430[13441部]来春屋整合同人音声rc机翻汉化.zip" },
      ],
    });

    expect(fileName).toBe("20260430[13441部]来春屋整合同人音声rc机翻汉化.zip");
  });

  it("把大于 150MB 的 zip 文档识别为整合包", () => {
    const result = isReferenceFile({
      document: {
        size: 268.3 * 1024 * 1024,
        mimeType: "application/octet-stream",
        attributes: [
          { fileName: "20260430[13441部]来春屋整合同人音声rc机翻汉化.zip" },
        ],
      },
    });

    expect(result).toBe(true);
  });

  it("允许通过 mimeType 识别缺少标准文件名属性的大 zip", () => {
    const result = isReferenceFile({
      document: {
        size: 268.3 * 1024 * 1024,
        mimeType: "application/zip",
        attributes: [{ className: "DocumentAttributeAudio" }],
      },
    });

    expect(result).toBe(true);
  });

  it("支持从 media.document 提取文档并识别有效 zip", () => {
    const message = {
      media: {
        document: {
          size: 1024,
          mimeType: "application/zip",
          attributes: [{ fileName: "RJ999999.zip" }],
        },
      },
    };

    expect(getMessageDocument(message)).toEqual(message.media.document);
    expect(isValidRJFile(message)).toBe(true);
  });

  it("将近期文件写入精简缓存记录", () => {
    const formatted = formatFile({
      id: 75563,
      date: 1785566503,
      document: {
        size: 2935,
        mimeType: "application/zip",
        attributes: [{ fileName: "RJ01538025.zip" }],
      },
    });

    expect(formatted).toEqual({
      rjCode: "RJ01538025",
      messageId: 75563,
      date: "2026-08-01T06:41:43.000Z",
      fileName: "RJ01538025.zip",
      fileSize: 2935,
    });
  });

  it("把字符串 size 也识别为有效整合包", () => {
    const result = isReferenceFile({
      document: {
        size: "281018368",
        mimeType: "application/zip",
        attributes: [
          { fileName: "20260430[13441部]来春屋整合同人音声rc机翻汉化.zip" },
        ],
      },
    });

    expect(result).toBe(true);
  });

  it("过滤大于 2MB 的普通 zip 文件", () => {
    const result = isValidRJFile({
      document: {
        size: 21.84 * 1024 * 1024,
        mimeType: "application/zip",
        attributes: [{ fileName: "来春屋增量包[0406-0430].zip" }],
      },
    });

    expect(result).toBe(false);
  });
});
