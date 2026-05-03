import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  electronMock,
  configState,
  fsMock,
  asmrClientMock,
  loggerMock,
} = vi.hoisted(() => {
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

import { handleSearchRequest } from "./tg-search-bot";

describe("tg-search-bot queue fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

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
      .filter((message) => message.includes("/search pipeline code=RJ01560861"));

    expect(pipelineLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stage=历史索引 status=start"),
        expect.stringContaining("stage=历史索引 status=miss"),
        expect.stringContaining("stage=前置包 status=miss"),
        expect.stringContaining("stage=频道 status=miss"),
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
      .filter((message) => message.includes("/search pipeline code=RJ01560862"));

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
});
