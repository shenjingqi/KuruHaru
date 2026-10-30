import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { electronMock, configState, fsMock, asmrClientMock, loggerMock } =
  vi.hoisted(() => {
    const fsMock = {
      mkdir: vi.fn(async () => {}),
      readFile: vi.fn(async () => {
        const error = new Error("ENOENT");
        error.code = "ENOENT";
        throw error;
      }),
      writeFile: vi.fn(async () => {}),
      stat: vi.fn(async () => {
        const error = new Error("ENOENT");
        error.code = "ENOENT";
        throw error;
      }),
    };

    return {
      electronMock: {
        app: {
          getPath: vi.fn((key) => `C:\\test-${key}`),
        },
        ipcMain: {
          handle: vi.fn(),
          removeHandler: vi.fn(),
        },
      },
      configState: {
        current: {
          tg: {
            searchChannelId: "",
            prePackagePath: "C:\\missing\\preset.txt",
            prePackageLink: "",
            botHistoryPath: "C:\\test-data\\tg-bot-history.json",
          },
          asmr: {
            token: "token-123",
            translationQueuePlaylistId: "playlist-1",
          },
          paths: {
            tgDownloadDir: "C:\\test-downloads",
          },
        },
      },
      fsMock,
      asmrClientMock: {
        get: vi.fn(),
        post: vi.fn(),
      },
      loggerMock: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
  });

vi.mock("electron", () => electronMock);
vi.mock("fs/promises", () => ({
  default: fsMock,
}));
vi.mock("node-telegram-bot-api", () => ({
  default: class TelegramBotMock {},
}));
vi.mock("telegram", () => ({
  TelegramClient: class TelegramClientMock {},
}));
vi.mock("telegram/sessions", () => ({
  StringSession: class StringSessionMock {},
}));
vi.mock("../utils/gramjs-logger", () => ({
  createSilentGramJsLogger: () => ({}),
}));
vi.mock("../utils/logger", () => ({
  createLogSender: () => loggerMock,
}));
vi.mock("./config", () => ({
  getConfig: () => configState.current,
  getDataDir: () => "C:\\test-data",
}));
vi.mock("./httpClient", () => ({
  getAsmrClient: () => asmrClientMock,
}));
vi.mock("./tg-info-cache", () => ({
  fetchWorkInfoByCode: vi.fn(),
  formatWorkInfoMessage: vi.fn(),
  getInfoCacheRuntimeConfig: vi.fn(() => ({})),
}));

import {
  formatTranslationAutomationStatus,
  handleSearchRequest,
} from "./tg-search-bot";

describe("tg-search-bot status message", () => {
  it("shows the current RJ code while translating", () => {
    expect(
      formatTranslationAutomationStatus({
        running: true,
        runtimeStatus: {
          step: "translate",
          currentCode: "RJ123456",
          translationProgress: {
            queuedDownloadCodes: ["RJ111111"],
            downloadingCodes: ["RJ222222"],
            readyTranslateCodes: ["RJ123456", "RJ333333", "RJ444444"],
            completedCodes: ["RJ555555"],
            failedCodes: [],
          },
        },
      }),
    ).toBe(
      "🤖 自动翻译：翻译中（RJ123456，后续待翻译 2 个）\n下载排队 1 · 下载中 1 · 待翻译 2 · 完成 1 · 失败 0",
    );
  });

  it("shows the next scan time while waiting for the run window", () => {
    expect(
      formatTranslationAutomationStatus({
        runtimeStatus: {
          step: "waiting-window",
          nextProbeAt: "2026-08-03T21:30:00",
        },
      }),
    ).toBe(
      "🤖 自动翻译：等待运行时段（下次扫描：2026-08-03 21:30）\n下载排队 0 · 下载中 0 · 待翻译 0 · 完成 0 · 失败 0",
    );
  });

  it("shows the cached queue size while idle", () => {
    expect(
      formatTranslationAutomationStatus(
        {
          runtimeStatus: {
            step: "idle",
          },
        },
        { queueCount: 6 },
      ),
    ).toBe(
      "🤖 自动翻译：待机（待翻译队列 6 个）\n下载排队 0 · 下载中 0 · 待翻译 0 · 完成 0 · 失败 0",
    );
  });
});

describe("tg-search-bot queue fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fsMock.readFile.mockImplementation(async () => {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    });

    configState.current = {
      tg: {
        searchChannelId: "",
        prePackagePath: "C:\\missing\\preset.txt",
        prePackageLink: "",
        botHistoryPath: "C:\\test-data\\tg-bot-history.json",
      },
      asmr: {
        token: "token-123",
        translationQueuePlaylistId: "playlist-1",
      },
      paths: {
        tgDownloadDir: "C:\\test-downloads",
      },
    };

    asmrClientMock.get.mockImplementation(async (url) => {
      if (String(url).includes("/api/search/")) {
        return {
          status: 200,
          data: {
            works: [
              {
                id: "90001",
                source_id: "RJ01560861",
                other_language_editions_in_db: [],
                tags: [],
                has_subtitle: false,
              },
            ],
          },
        };
      }

      if (String(url).includes("get-playlist-works")) {
        return {
          status: 200,
          data: {
            works: [],
            pagination: {
              totalCount: 0,
            },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    asmrClientMock.post.mockResolvedValue({
      status: 200,
      data: "ok",
    });
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("returns queue success without synchronously scanning the playlist", async () => {
    const result = await handleSearchRequest("RJ01560861", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe("one_queue");
    expect(result.message).toContain("已转入待翻译队列");
    expect(result.url).toBe("https://asmr.one/playlist?id=playlist-1");

    expect(asmrClientMock.post).toHaveBeenCalledTimes(1);
    expect(asmrClientMock.post).toHaveBeenCalledWith(
      "https://api.asmr-200.com/api/playlist/add-works-to-playlist",
      {
        id: "playlist-1",
        works: ["90001"],
      },
      expect.objectContaining({
        timeout: 30000,
      }),
    );

    const playlistReadsBeforeBackground = asmrClientMock.get.mock.calls.filter(
      ([url]) => String(url).includes("get-playlist-works"),
    );
    expect(playlistReadsBeforeBackground).toHaveLength(0);

    const pipelineLogs = loggerMock.info.mock.calls
      .map(([message]) => String(message || ""))
      .filter((message) =>
        message.includes("/search pipeline code=RJ01560861"),
      );

    expect(pipelineLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stage=历史索引 status=start"),
        expect.stringContaining("stage=历史索引 status=miss"),
        expect.stringContaining("stage=前置包 status=miss"),
        expect.stringContaining("stage=频道 status=skip"),
        expect.stringContaining("stage=One status=hit_no_subtitle"),
        expect.stringContaining("stage=入队 status=queued"),
      ]),
    );
  });

  it("pretends queue success for blocked tags without calling add queue api", async () => {
    asmrClientMock.get.mockImplementation(async (url) => {
      if (String(url).includes("/api/search/")) {
        return {
          status: 200,
          data: {
            works: [
              {
                id: "90002",
                source_id: "RJ01560862",
                other_language_editions_in_db: [],
                tags: [{ name: "BL/男同性恋" }, { name: "剧情" }],
                has_subtitle: false,
              },
            ],
          },
        };
      }

      if (String(url).includes("get-playlist-works")) {
        return {
          status: 200,
          data: {
            works: [],
            pagination: {
              totalCount: 0,
            },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    const result = await handleSearchRequest("RJ01560862", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe("one_queue_masked");
    expect(result.message).toContain("已转入待翻译队列");
    expect(result.url).toBe("https://asmr.one/playlist?id=playlist-1");

    expect(asmrClientMock.post).not.toHaveBeenCalled();

    const pipelineLogs = loggerMock.info.mock.calls
      .map(([message]) => String(message || ""))
      .filter((message) =>
        message.includes("/search pipeline code=RJ01560862"),
      );

    expect(pipelineLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stage=One status=hit_no_subtitle"),
        expect.stringContaining("stage=入队 status=masked_success"),
      ]),
    );

    expect(
      loggerMock.info.mock.calls.some(([message]) =>
        String(message || "").includes("跳过真实入队 code=RJ01560862"),
      ),
    ).toBe(true);
  });

  it("pretends queue success when blocked tag only exists in low-wish/history aliases", async () => {
    asmrClientMock.get.mockImplementation(async (url) => {
      if (String(url).includes("/api/search/")) {
        return {
          status: 200,
          data: {
            works: [
              {
                id: "90003",
                source_id: "RJ01560863",
                other_language_editions_in_db: [],
                tags: [
                  {
                    name: "安全标签",
                    voteStatus: 1,
                  },
                  {
                    name: "普通名字",
                    voteStatus: 0,
                    i18n: {
                      "zh-cn": {
                        name: "普通名字",
                        history: [{ name: "百合" }],
                      },
                    },
                  },
                ],
                has_subtitle: false,
              },
            ],
          },
        };
      }

      if (String(url).includes("get-playlist-works")) {
        return {
          status: 200,
          data: {
            works: [],
            pagination: {
              totalCount: 0,
            },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    const result = await handleSearchRequest("RJ01560863", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe("one_queue_masked");
    expect(result.message).toContain("已转入待翻译队列");
    expect(asmrClientMock.post).not.toHaveBeenCalled();

    const pipelineLogs = loggerMock.info.mock.calls
      .map(([message]) => String(message || ""))
      .filter((message) =>
        message.includes("/search pipeline code=RJ01560863"),
      );

    expect(pipelineLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stage=入队 status=masked_success"),
      ]),
    );
  });

  it("uses the local translation queue cache and skips duplicate enqueue", async () => {
    configState.current.tg.translationQueueCachePath =
      "C:\\test-data\\tg-translation-queue-cache-local-hit.json";

    fsMock.readFile.mockImplementation(async (filePath) => {
      if (
        String(filePath).includes("tg-translation-queue-cache-local-hit.json")
      ) {
        return JSON.stringify({
          updatedAt: "2026-07-31T00:00:00.000Z",
          playlistId: "playlist-1",
          works: [
            {
              id: "90004",
              source_id: "RJ01560864",
            },
          ],
        });
      }

      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    });

    asmrClientMock.get.mockImplementation(async (url) => {
      if (String(url).includes("/api/search/")) {
        return {
          status: 200,
          data: {
            works: [
              {
                id: "90004",
                source_id: "RJ01560864",
                other_language_editions_in_db: [],
                tags: [],
                has_subtitle: false,
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    const result = await handleSearchRequest("RJ01560864", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe("one_queue_cache");
    expect(result.message).toContain("已在待翻译队列，无需重复入队");
    expect(asmrClientMock.post).not.toHaveBeenCalled();

    const pipelineLogs = loggerMock.info.mock.calls
      .map(([message]) => String(message || ""))
      .filter((message) =>
        message.includes("/search pipeline code=RJ01560864"),
      );

    expect(pipelineLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stage=入队 status=cached_already_queued"),
      ]),
    );
  });

  it("marks temporary One network failures as retryable", async () => {
    asmrClientMock.get.mockRejectedValue(new Error("network unavailable"));

    const result = await handleSearchRequest("RJ01560865", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("One站检索暂时失败");
  });

  it("does not mark an empty One search result as retryable", async () => {
    asmrClientMock.get.mockResolvedValue({
      status: 200,
      data: { works: [] },
    });

    const result = await handleSearchRequest("RJ00154351", {
      enableOneQueue: true,
    });

    expect(result.success).toBe(false);
    expect(result.retryable).not.toBe(true);
    expect(result.message).toContain("One站未找到 RJ00154351");
  });
});
