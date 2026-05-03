import {
  aggregateCloudTagCounts,
  getCloudTagNames,
  getCloudTagSearchTerms,
} from "./cloudTagUtils";

describe("cloudTagUtils", () => {
  const nestedTags = JSON.stringify([
    {
      id: 493,
      name: "ABO",
      i18n: {
        "en-us": { name: "Omegaverse" },
        "ja-jp": { name: "オメガバース" },
        "zh-cn": {
          name: "ABO世界观",
          history: [{ name: "ABO旧称" }],
        },
      },
    },
    {
      id: 777,
      i18n: {
        "zh-cn": { name: "耳搔き" },
      },
    },
  ]);

  it("从嵌套 tag 内容提取可展示名称", () => {
    expect(getCloudTagNames(nestedTags)).toEqual(["ABO", "耳搔き"]);
  });

  it("收集 tag 的全部文本内容用于搜索", () => {
    expect(getCloudTagSearchTerms(nestedTags)).toEqual(
      expect.arrayContaining([
        "ABO",
        "Omegaverse",
        "オメガバース",
        "ABO世界观",
        "ABO旧称",
        "耳搔き",
      ]),
    );
  });

  it("统计所有作品里的完整标签集合", () => {
    const counts = aggregateCloudTagCounts([
      { tags: nestedTags },
      { tags: [{ name: "ABO" }] },
      { tags: [{ i18n: { "zh-cn": { name: "耳搔き" } } }] },
    ]);

    expect(counts.find((tag) => tag.name === "ABO")).toEqual({
      name: "ABO",
      count: 2,
    });
    expect(counts.find((tag) => tag.name === "耳搔き")).toEqual({
      name: "耳搔き",
      count: 2,
    });
  });
});
