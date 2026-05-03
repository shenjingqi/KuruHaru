import { describe, it, expect } from "vitest";
import {
  buildMessageLinkByEntity,
  buildMessageLinksByChat,
  buildMessageLinksByEntity,
} from "./link-builders";

describe("tg-search-bot-core/link-builders", () => {
  it("chat 同时有 id 和 username 时，优先输出频道名链接", () => {
    const result = buildMessageLinksByChat(
      {
        id: -1001234567890,
        username: "my_channel",
      },
      9527,
    );

    expect(result.primaryUrl).toBe("https://t.me/my_channel/9527");
    expect(result.alternateUrls).toEqual([
      "tg://resolve?domain=my_channel&post=9527",
      "https://t.me/c/1001234567890/9527",
      "tg://privatepost?channel=1001234567890&post=9527",
    ]);
  });

  it("entity.id 为 -100 形态时，c 链接应保留 100 前缀", () => {
    const result = buildMessageLinksByEntity(
      {
        id: "-100987654321",
      },
      "",
      100,
    );

    expect(result.primaryUrl).toBe("https://t.me/c/100987654321/100");
  });

  it("entity 缺失时可从 fallbackChannelId 构造 username 链接", () => {
    const result = buildMessageLinksByEntity(null, "@abcde_bot", 66);

    expect(result.primaryUrl).toBe("https://t.me/abcde_bot/66");
    expect(result.alternateUrls).toEqual([
      "tg://resolve?domain=abcde_bot&post=66",
    ]);
  });

  it("fallbackChannelId 为用户名时，优先使用该频道名生成主链接", () => {
    const result = buildMessageLinksByEntity(
      {
        id: -1001234567890,
        username: "other_channel",
      },
      "@kuruHaruga",
      17809,
    );

    expect(result.primaryUrl).toBe("https://t.me/kuruHaruga/17809");
  });
  it("旧接口 buildMessageLinkByEntity 仍返回主链接", () => {
    const url = buildMessageLinkByEntity(
      {
        id: 123456789,
        username: "stablechan",
      },
      "",
      12,
    );

    expect(url).toBe("https://t.me/stablechan/12");
  });
});
