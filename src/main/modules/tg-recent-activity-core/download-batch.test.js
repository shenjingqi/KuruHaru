import { describe, expect, it } from "vitest";
import {
  normalizeBatchDownloadPayload,
  summarizeBatchDownloadResults,
} from "./download-batch";

describe("tg-recent-activity-core/download-batch", () => {
  it("支持直接传 messageIds 并自动去重", () => {
    const result = normalizeBatchDownloadPayload({
      messageIds: [42530, "42527", 42530, "bad", 0],
    });

    expect(result).toEqual({
      items: [
        { tgMessageId: 42530, fileName: "", fileId: null },
        { tgMessageId: 42527, fileName: "", fileId: null },
      ],
      concurrency: 3,
    });
  });

  it("支持对象数组并限制并发上限", () => {
    const result = normalizeBatchDownloadPayload({
      items: [
        {
          tgMessageId: 42470,
          fileName: "RJ01122197.zip",
          fileId: "RJ01122197",
        },
        { messageId: 42466, name: "RJ01122162.zip" },
        { id: 42470, name: "duplicate.zip" },
      ],
      concurrency: 99,
    });

    expect(result).toEqual({
      items: [
        {
          tgMessageId: 42470,
          fileName: "RJ01122197.zip",
          fileId: "RJ01122197",
        },
        { tgMessageId: 42466, fileName: "RJ01122162.zip", fileId: null },
      ],
      concurrency: 10,
    });
  });

  it("汇总成功、跳过和失败数量", () => {
    const result = summarizeBatchDownloadResults([
      { success: true },
      { success: true, skipped: true },
      { success: false, error: "timeout" },
    ]);

    expect(result).toEqual({
      totalCount: 3,
      successCount: 1,
      skippedCount: 1,
      failedCount: 1,
    });
  });
});
