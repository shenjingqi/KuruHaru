import { describe, expect, it, vi } from "vitest";

vi.mock("./tg-recent-activity", () => ({
  loadRecentActivity: vi.fn(),
}));

import {
  buildRecentUploadCleanupIndex,
  buildRecentUploadLocalCleanupPlan,
  collectWorkCodes,
} from "./recent-upload-local-cleaner";

describe("recent-upload-local-cleaner", () => {
  it("提取并去重 RJ/VJ/BJ 编号", () => {
    expect(
      collectWorkCodes("RJ123456 和 rj123456, 再来一个 VJ7654321"),
    ).toEqual(["RJ123456", "VJ7654321"]);
  });

  it("从最近上传缓存构建匹配索引", () => {
    const index = buildRecentUploadCleanupIndex({
      files: [
        { name: "RJ123456.zip", rjCode: "RJ123456" },
        { fileName: "VJ7654321 字幕包.zip", rjCode: "VJ7654321" },
      ],
    });

    expect([...index.codes]).toEqual(["RJ123456", "VJ7654321"]);
    expect([...index.archiveNames]).toContain("rj123456.zip");
    expect([...index.folderHints]).toContain("rj123456");
    expect([...index.folderHints]).toContain("vj7654321 字幕包");
  });

  it("同时匹配最近上传的压缩包和对应文件夹", () => {
    const result = buildRecentUploadLocalCleanupPlan({
      recentActivityData: {
        files: [
          { name: "RJ123456.zip", rjCode: "RJ123456" },
          { fileName: "VJ7654321.zip", rjCode: "VJ7654321" },
        ],
      },
      archiveFiles: [
        { name: "RJ123456.zip", path: "C:/zip/RJ123456.zip" },
        { name: "VJ7654321 修正版.zip", path: "C:/zip/VJ7654321 修正版.zip" },
        { name: "OTHER000001.zip", path: "C:/zip/OTHER000001.zip" },
      ],
      subtitleFolders: [
        { name: "RJ123456 文本", path: "C:/subs/RJ123456 文本" },
        { name: "VJ7654321", path: "C:/subs/VJ7654321" },
        { name: "无关目录", path: "C:/subs/无关目录" },
      ],
    });

    expect(result.matchedArchiveCount).toBe(2);
    expect(result.matchedFolderCount).toBe(2);
    expect(result.matchedCodes).toEqual(["RJ123456", "VJ7654321"]);
    expect(result.archiveMatches.map((item) => item.path)).toEqual([
      "C:/zip/RJ123456.zip",
      "C:/zip/VJ7654321 修正版.zip",
    ]);
    expect(result.folderMatches.map((item) => item.path)).toEqual([
      "C:/subs/RJ123456 文本",
      "C:/subs/VJ7654321",
    ]);
  });
});
