import { describe, expect, it, vi } from "vitest";

const { electronMock } = vi.hoisted(() => ({
  electronMock: {
    app: {
      getPath: vi.fn((key) => `C:\\test-${key}`),
      emit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
    },
    powerMonitor: {
      on: vi.fn(),
    },
  },
}));

vi.mock("electron", () => electronMock);

import { fetchWorkInfoByCode, formatWorkInfoMessage } from "./tg-info-cache";

const TEST_RUNTIME_CONFIG = {
  cacheFilePath: "",
  requestTimeoutMs: 1000,
  maxConcurrency: 1,
  maxFileSizeMB: 50,
  maxFileSizeBytes: 50 * 1024 * 1024,
  proxyUrl: "",
  persistOnFetch: false,
};

const ANNOUNCE_HTML = `
<html lang="zh-CN">
<head>
  <meta property="og:image" content="https://img.dlsite.jp/modpub/images2/ana/doujin/RJ01589000/RJ01588893_ana_img_main.jpg">
</head>
<body>
  <h1 id="work_name">【简体中文版】教教我吧姐姐～清纯系巨乳JK教你怎么使用肉棒～</h1>
  <template data-vue-component="dlchannel-topic" data-product-id="RJ01588893" data-product-name="【简体中文版】教教我吧姐姐～清纯系巨乳JK教你怎么使用肉棒～" data-maker-name="青春×フェティシズム"></template>
  <table cellspacing="0" id="work_outline">
    <tr><th>系列名</th><td><a href="#">教えてお姉さん</a></td></tr>
    <tr><th>作者</th><td><a href="#">Tsu.Ki.O.Ri</a></td></tr>
    <tr><th>剧情</th><td><a href="#">あすきぃきゅーぶ</a></td></tr>
    <tr><th>插画</th><td><a href="#">おポン</a></td></tr>
    <tr><th>声优</th><td><a href="#">大山チロル</a></td></tr>
    <tr><th>音乐</th><td><a href="#">青春×フェティシズム</a></td></tr>
    <tr><th>年龄指定</th><td><div class="work_genre"><span class="icon_ADL">R18</span></div></td></tr>
    <tr><th>作品形式</th><td><div class="work_genre"><span class="icon_SOU">音声・ASMR</span></div></td></tr>
    <tr><th>文件形式</th><td><div class="work_genre"><span class="icon_WAV">WAV</span>&nbsp;/&nbsp;mp3 / mp4同梱</div></td></tr>
    <tr><th>其他</th><td><div class="work_genre"><span class="icon_DOT">DLsite官方翻译</span></div></td></tr>
    <tr><th>分类</th><td><div class="main_genre"><a href="#">ASMR</a><a href="#">双声道立体声/人头麦</a></div></td></tr>
  </table>
</body>
</html>
`;

describe("tg-info-cache announce fallback", () => {
  it("uses DLSite announce page to enrich pre-release work info", async () => {
    const code = "RJ01588893";
    const mockClient = {
      get: vi.fn(async (url) => {
        if (url.includes("maniax-touch/product/info/ajax")) {
          return {
            status: 200,
            data: {
              [code]: {
                work_name:
                  "【简体中文版】教教我吧姐姐～清纯系巨乳JK教你怎么使用肉棒～",
                maker_name: "青春×フェティシズム",
                title_name: "教えてお姉さん",
                work_image: "//www.dlsite.com/images/web/home/no_img_main.gif",
                age_category: 3,
                price: 1650,
                dl_count: 0,
                wishlist_count: 123,
                regist_date: "2026-03-28 00:00:00",
                is_sale: false,
              },
            },
          };
        }

        if (url.includes("/announce/=/product_id/")) {
          return {
            status: 200,
            data: ANNOUNCE_HTML,
          };
        }

        if (url.includes("api.asmr.one/api/search")) {
          return {
            status: 200,
            data: { works: [] },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    };

    const result = await fetchWorkInfoByCode(code, {
      client: mockClient,
      runtimeConfig: TEST_RUNTIME_CONFIG,
      preferCache: false,
      persistResult: false,
    });

    expect(result.success).toBe(true);
    expect(result.data["封面图"]).toBe(
      "https://img.dlsite.jp/modpub/images2/ana/doujin/RJ01589000/RJ01588893_ana_img_main.jpg",
    );
    expect(result.data["作者"]).toEqual(["Tsu.Ki.O.Ri"]);
    expect(result.data["剧情"]).toEqual(["あすきぃきゅーぶ"]);
    expect(result.data["插画"]).toEqual(["おポン"]);
    expect(result.data["声优"]).toEqual(["大山チロル"]);
    expect(result.data["音乐"]).toEqual(["青春×フェティシズム"]);
    expect(result.data["作品形式"]).toBe("音声・ASMR");
    expect(result.data["文件形式"]).toContain("WAV");
    expect(result.data["分类"]).toEqual(["ASMR", "双声道立体声/人头麦"]);
    expect(result.data["DLSite链接"]).toBe(
      "https://www.dlsite.com/maniax/announce/=/product_id/RJ01588893",
    );
    expect(result.data["DLSite页面类型"]).toBe("announce");
    expect(result.data["来源"]).toBe("DLSite/Announce");
  });

  it("uses announce link when ajax says sale but work page is unavailable", async () => {
    const code = "RJ01553954";
    const mockClient = {
      get: vi.fn(async (url) => {
        if (url.includes("maniax-touch/product/info/ajax")) {
          return {
            status: 200,
            data: {
              [code]: {
                work_name: "独り占め",
                maker_name: "mellow voice",
                title_name: "独り占め",
                work_image:
                  "https://img.dlsite.jp/modpub/images2/work/doujin/RJ01554000/RJ01553954_img_main.jpg",
                age_category: 3,
                price: 1760,
                dl_count: 1398,
                wishlist_count: 456,
                regist_date: "2026-03-27 00:00:00",
                is_sale: true,
              },
            },
          };
        }

        if (url.includes("/work/=/product_id/")) {
          return null;
        }

        if (url.includes("/announce/=/product_id/")) {
          return {
            status: 200,
            data: ANNOUNCE_HTML.replaceAll("RJ01588893", code),
          };
        }

        if (url.includes("api.asmr.one/api/search")) {
          return {
            status: 200,
            data: { works: [] },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      }),
    };

    const result = await fetchWorkInfoByCode(code, {
      client: mockClient,
      runtimeConfig: TEST_RUNTIME_CONFIG,
      preferCache: false,
      persistResult: false,
    });

    expect(result.success).toBe(true);
    expect(result.data["DLSite链接"]).toBe(
      "https://www.dlsite.com/maniax/announce/=/product_id/RJ01553954",
    );
    expect(result.data["DLSite页面类型"]).toBe("announce");
    expect(result.data["来源"]).toBe("DLSite/Announce");
  });

  it("renders enriched announce fields in the Telegram caption", () => {
    const payload = formatWorkInfoMessage(
      {
        RJ: "RJ01588893",
        标题: "【简体中文版】教教我吧姐姐～清纯系巨乳JK教你怎么使用肉棒～",
        社团: "青春×フェティシズム",
        系列: "教えてお姉さん",
        作者: ["Tsu.Ki.O.Ri"],
        剧情: ["あすきぃきゅーぶ"],
        音乐: ["青春×フェティシズム"],
        作品形式: "音声・ASMR",
        文件形式: "WAV / mp3 / mp4同梱",
        分类: ["ASMR", "双声道立体声/人头麦"],
        封面图:
          "https://img.dlsite.jp/modpub/images2/ana/doujin/RJ01589000/RJ01588893_ana_img_main.jpg",
        DLSite链接:
          "https://www.dlsite.com/maniax/announce/=/product_id/RJ01588893",
        DLSite页面类型: "announce",
        来源: "DLSite/Announce",
      },
      "RJ01588893",
    );

    expect(payload.imageUrl).toBe(
      "https://img.dlsite.jp/modpub/images2/ana/doujin/RJ01589000/RJ01588893_ana_img_main.jpg",
    );
    expect(payload.caption).toContain("<b>作者：</b>Tsu.Ki.O.Ri");
    expect(payload.caption).toContain("<b>剧情：</b>あすきぃきゅーぶ");
    expect(payload.caption).toContain("<b>音乐：</b>青春×フェティシズム");
    expect(payload.caption).toContain("<b>作品形式：</b>音声・ASMR");
    expect(payload.caption).toContain("<b>文件形式：</b>WAV / mp3 / mp4同梱");
    expect(payload.caption).toContain("<b>来源：</b>DLSite/Announce");
    expect(payload.replyMarkup).toEqual({
      inline_keyboard: [
        [
          {
            text: "View on DLSite",
            url: "https://www.dlsite.com/maniax/announce/=/product_id/RJ01588893",
          },
        ],
      ],
    });
  });

  it("falls back to announce link for legacy cached announce entries", () => {
    const payload = formatWorkInfoMessage(
      {
        RJ: "RJ01588893",
        标题: "【简体中文版】教教我吧姐姐～清纯系巨乳JK教你怎么使用肉棒～",
        DLSite链接:
          "https://www.dlsite.com/maniax/work/=/product_id/RJ01588893",
        封面图:
          "https://img.dlsite.jp/modpub/images2/ana/doujin/RJ01589000/RJ01588893_ana_img_main.jpg",
        销量: 1398,
        评分: 4.92,
        来源: "DLSite/Announce",
      },
      "RJ01588893",
    );

    expect(payload.replyMarkup).toEqual({
      inline_keyboard: [
        [
          {
            text: "View on DLSite",
            url: "https://www.dlsite.com/maniax/announce/=/product_id/RJ01588893",
          },
        ],
      ],
    });
  });

  it("normalizes legacy and ASMR.ONE age labels to 全年龄/R15/R18", () => {
    const adultPayload = formatWorkInfoMessage(
      {
        RJ: "RJ01588893",
        标题: "age-normalization",
        年龄指定: "adult",
      },
      "RJ01588893",
    );
    const teenPayload = formatWorkInfoMessage(
      {
        RJ: "RJ01588894",
        标题: "age-normalization",
        年龄指定: "R-15",
      },
      "RJ01588894",
    );
    const allAgePayload = formatWorkInfoMessage(
      {
        RJ: "RJ01588895",
        标题: "age-normalization",
        年龄指定: "general",
      },
      "RJ01588895",
    );

    expect(adultPayload.caption).toContain("<b>年龄指定：</b>R18");
    expect(teenPayload.caption).toContain("<b>年龄指定：</b>R15");
    expect(allAgePayload.caption).toContain("<b>年龄指定：</b>全年龄");
  });
});
