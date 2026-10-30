import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_VIDEO_FORMATS,
  DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK,
  buildDownloadPlanForWork,
  generateFingerprint,
  parseBatchDownloadInput,
  shouldManualReviewByTaskCount,
} from "./audio-download-utils";

function buildFiles(folderPath, fileNames) {
  return fileNames.map((fileName) => ({
    folderPath,
    fileName,
    downloadUrl: `https://example.com/${encodeURIComponent(fileName)}`,
  }));
}

describe("asmr-core/audio-download-utils", () => {
  it("parses RJ/VJ/BJ codes, numeric ids, urls and multiple codes per line", () => {
    const result = parseBatchDownloadInput(`
RJ123456
https://asmr.one/work/VJ7654321/demo
BJ223344 RJ1234567
1234567
invalid-line
RJ123456
`);

    expect(result.workItems.map((item) => item.displayCode)).toEqual([
      "RJ123456",
      "VJ7654321",
      "BJ223344",
      "RJ1234567",
    ]);
    expect(result.invalidItems).toEqual([
      {
        input: "invalid-line",
        reason: "未识别为 RJ/VJ/BJ 编号，或数字位数不在 6-8 位范围内",
      },
    ]);
  });

  it("keeps prefixed work code when building filtered tasks", () => {
    const { tasks, overflowPaths } = buildDownloadPlanForWork({
      workCode: "VJ7654321",
      downloadDir: "C:/Downloads",
      filesData: [
        {
          folderPath: "本編",
          fileName: "track01.mp3",
          downloadUrl: "https://example.com/track01.mp3",
        },
        {
          folderPath: "本編",
          fileName: "track01.wav",
          downloadUrl: "https://example.com/track01.wav",
        },
      ],
    });

    expect(overflowPaths).toEqual([]);
    expect(tasks).toEqual([
      {
        downloadUrl: "https://example.com/track01.mp3",
        outPath: "VJ7654321/本編/track01.mp3",
      },
    ]);
  });

  it("keeps video-only tracks even when video filtering is enabled", () => {
    const filesData = [
      {
        folderPath: "本編",
        fileName: "bonus-video.mp4",
        downloadUrl: "https://example.com/bonus-video.mp4",
      },
    ];

    expect(DEFAULT_FILTER_VIDEO_FORMATS).toBe(true);
    expect(
      buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
      }).tasks,
    ).toEqual([
      {
        downloadUrl: "https://example.com/bonus-video.mp4",
        outPath: "RJ123456/本編/bonus-video.mp4",
      },
    ]);

    expect(
      buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
        filterVideoFormats: false,
      }).tasks,
    ).toEqual([
      {
        downloadUrl: "https://example.com/bonus-video.mp4",
        outPath: "RJ123456/本編/bonus-video.mp4",
      },
    ]);
  });

  it("prefers the audio track over a paired video version regardless of video filtering", () => {
    const folderPath = "ROOT/B分岐2チーしてチーワン切り/2裏面";
    const filesData = [
      {
        folderPath,
        fileName: "トラック12 分岐2 悠美とマイクと涼子の３Ｐ (1).mp4",
        downloadUrl: "https://example.com/track12.mp4",
      },
      {
        folderPath,
        fileName: "トラック12 分岐2 悠美とマイクと涼子の３Ｐ （音声のみ）.wav",
        downloadUrl: "https://example.com/track12.wav",
      },
    ];

    const expectedTasks = [
      {
        downloadUrl: "https://example.com/track12.wav",
        outPath: `${folderPath.replace("ROOT/", "RJ123456/ROOT/")}/トラック12 分岐2 悠美とマイクと涼子の３Ｐ （音声のみ）.wav`,
      },
    ];

    expect(
      buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
      }).tasks,
    ).toEqual(expectedTasks);

    expect(
      buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
        filterVideoFormats: false,
      }).tasks,
    ).toEqual(expectedTasks);
  });

  it("keeps unmatched video tracks as a fallback", () => {
    const filesData = [
      {
        folderPath: "本編",
        fileName: "track01.mp4",
        downloadUrl: "https://example.com/track01.mp4",
      },
      {
        folderPath: "本編",
        fileName: "track02.wav",
        downloadUrl: "https://example.com/track02.wav",
      },
    ];

    expect(
      buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
      }).tasks,
    ).toEqual([
      {
        downloadUrl: "https://example.com/track01.mp4",
        outPath: "RJ123456/本編/track01.mp4",
      },
      {
        downloadUrl: "https://example.com/track02.wav",
        outPath: "RJ123456/本編/track02.wav",
      },
    ]);
  });

  it("falls back to manual review when one work produces more than 20 tasks", () => {
    expect(
      shouldManualReviewByTaskCount(
        Array.from(
          { length: DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK + 1 },
          (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` }),
        ),
      ),
    ).toBe(true);

    expect(
      shouldManualReviewByTaskCount(
        Array.from(
          { length: DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK },
          (_value, index) => ({ outPath: `RJ123456/file-${index}.mp3` }),
        ),
      ),
    ).toBe(false);
  });

  it("supports a custom per-work threshold", () => {
    expect(
      shouldManualReviewByTaskCount(
        Array.from({ length: 4 }, (_value, index) => ({
          outPath: `RJ123456/file-${index}.mp3`,
        })),
        3,
      ),
    ).toBe(true);

    expect(
      shouldManualReviewByTaskCount(
        Array.from({ length: 3 }, (_value, index) => ({
          outPath: `RJ123456/file-${index}.mp3`,
        })),
        3,
      ),
    ).toBe(false);
  });

  it("never returns an empty fingerprint", () => {
    const fileNames = [
      "（効果音ありmp3）01_プロローグ『ちょっと……どういうこと！？』.mp3",
      "（効果音ありmp3）02_からかい耳舐め手コキ.mp3",
      "（mp3）柚木つばめ様フリートーク.mp3",
      "効果音あり.mp3",
      "（SEあり）.wav",
    ];

    for (const fileName of fileNames) {
      const fingerprint = generateFingerprint(fileName);
      expect(fingerprint.length).toBeGreaterThan(0);
    }
    expect(new Set(fileNames.map((fileName) => generateFingerprint(fileName))).size).toBe(
      fileNames.length,
    );
  });

  it("keeps every track in a folder that uses a shared SE/format name prefix", () => {
    // 旧实现会把「（効果音ありmp3）…」整段删成空指纹，15 条音轨只剩 1 条。
    const fileNames = [
      "01_プロローグ『ちょっと……どういうこと！？』",
      "02_からかい耳舐め手コキでズボン越しおもらし暴発ぴゅっぴゅ♡",
      "03_心情代弁煽りで耳舐め♡莉緒のデカ乳パイズリフェラ♡",
      "04_電車通学でおっぱい押し付けられてガチ勃起♡",
      "05_生イキギャルJKの処女で童貞卒業っ♡",
      "06_本能のままイキまくりっ♡",
      "07_たっぷり耳舐め＆キスハメ♡",
      "08_危険日で外出し懇願♡",
      "09_エピローグ『あんたのちんぽハメれればそれでオッケーだし…♡』",
      "10_甘やかし授乳手コキ＆強制種付けでわがままセックス♡ ",
      "11_エピローグ『おちんちんだけは一人前なんだから……♡』",
      "12_妊娠確定っ♡本気の危険日中出し交尾♡",
      "13_エピローグ『責任取りなさいよねっ』",
      "14_全員ボクのお嫁さんっ♡",
      "15_エピローグ『この子達のこと…ちゃ～んと可愛がっててね、パ～パっ♡』",
    ].map((name) => `（効果音ありmp3）${name}.mp3`);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ01668482",
      downloadDir: "F:/downloads",
      filesData: buildFiles("妊活推進制度/3_効果音ありmp3", fileNames),
    });

    expect(tasks).toHaveLength(15);
    expect(tasks.map((task) => task.outPath)).toEqual(
      fileNames.map(
        (fileName) => `RJ01668482/妊活推進制度/3_効果音ありmp3/${fileName}`,
      ),
    );
  });

  it("keeps mp3 and drops the wav counterpart of the same numbered variant", () => {
    const filesData = [
      ...buildFiles("【10日間限定特典】妊活推進制度/2_柚木つばめ様フリートーク", [
        "1_（wav）柚木つばめ様フリートーク.wav",
        "2_（mp3）柚木つばめ様フリートーク.mp3",
      ]),
      ...buildFiles("【10日間限定特典】妊活推進制度/3_涼花みなせ様フリートーク", [
        "1_（wav)涼花みなせ様フリートーク.wav",
        "2_（mp3)涼花みなせ様フリートーク.mp3",
      ]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ01668482",
      downloadDir: "F:/downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ01668482/【10日間限定特典】妊活推進制度/2_柚木つばめ様フリートーク/2_（mp3）柚木つばめ様フリートーク.mp3",
      "RJ01668482/【10日間限定特典】妊活推進制度/3_涼花みなせ様フリートーク/2_（mp3)涼花みなせ様フリートーク.mp3",
    ]);
  });

  it("dedupes mp3 and wav stored in separate format-only folders", () => {
    const filesData = [
      ...buildFiles("本編/mp3", ["01_あ.mp3"]),
      ...buildFiles("本編/wav", ["01_あ.wav"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].outPath).toBe("RJ123456/本編/mp3/01_あ.mp3");
    expect(tasks[0].downloadUrl).toContain("01_");
  });

  it("dedupes the same track globally even when it sits in different folders", () => {
    // 目录不参与身份判定：同一首曲子即使是 `disc1/`、`disc2/` 各一份，也只下一次。
    const filesData = [
      ...buildFiles("disc1", ["01_あ.mp3"]),
      ...buildFiles("disc2", ["01_あ.mp3"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual(["RJ123456/disc1/01_あ.mp3"]);
  });

  it("keeps short-fingerprint bonus tracks from colliding with the main folder", () => {
    // 极短指纹（01/02…）在原算法里靠 本篇/特典 标记防误杀，这里保持不变。
    const filesData = [
      ...buildFiles("本編", ["01.mp3", "02.mp3"]),
      ...buildFiles("特典", ["01.mp3", "02.mp3"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/01.mp3",
      "RJ123456/本編/02.mp3",
      "RJ123456/特典/01.mp3",
      "RJ123456/特典/02.mp3",
    ]);
  });

  it("dedupes repeated downloads that only differ by the (1) suffix", () => {
    const filesData = buildFiles("本編", ["01_あ.mp3", "01_あ (1).mp3"]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual(["RJ123456/本編/01_あ.mp3"]);
  });

  it("dedupes pure-numeric track names with a (1) suffix", () => {
    const filesData = buildFiles("本編", ["01.mp3", "01 (1).mp3"]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual(["RJ123456/本編/01.mp3"]);
  });

  it("reproduces the expected RJ01668482 plan end to end", () => {
    // 15 条本篇 + 1 条购入特典 + 3 条限定特典 mp3 = 19 条，且不包含任何 wav。
    const mainTracks = Array.from(
      { length: 15 },
      (_value, index) =>
        `（効果音ありmp3）${String(index + 1).padStart(2, "0")}_トラック${String(index + 1)}.mp3`,
    );
    const bonusPath =
      "妊活推進制度/5_購入特典/2_オナバレ後オナニー強要言葉責めオナサポトラック♡/3_効果音ありmp3";
    const specialPath = "【10日間限定特典】妊活推進制度";

    const filesData = [
      ...buildFiles("妊活推進制度/3_効果音ありmp3", mainTracks),
      ...buildFiles(bonusPath, [
        "（効果音ありmp3）オナバレ後オナニー強要言葉責めオナサポトラック♡.mp3",
      ]),
      ...buildFiles(`${specialPath}/2_柚木つばめ様フリートーク`, [
        "1_（wav）柚木つばめ様フリートーク.wav",
        "2_（mp3）柚木つばめ様フリートーク.mp3",
      ]),
      ...buildFiles(`${specialPath}/3_涼花みなせ様フリートーク`, [
        "1_（wav)涼花みなせ様フリートーク.wav",
        "2_（mp3)涼花みなせ様フリートーク.mp3",
      ]),
      ...buildFiles(`${specialPath}/4_秋野かえで様フリートーク`, [
        "1_（wav）秋野かえで様フリートーク.wav",
        "2_（mp3）秋野かえで様フリートーク.mp3",
      ]),
    ];

    const { tasks, overflowPaths } = buildDownloadPlanForWork({
      workCode: "RJ01668482",
      downloadDir: "F:/downloads",
      filesData,
    });

    expect(overflowPaths).toEqual([]);
    expect(tasks).toHaveLength(19);
    expect(tasks.every((task) => task.outPath.endsWith(".mp3"))).toBe(true);
    expect(new Set(tasks.map((task) => task.outPath)).size).toBe(19);
    expect(tasks.some((task) => task.outPath.includes("1_（wav"))).toBe(false);
  });

  it("keeps the highest bitrate when a track ships multiple mp3 variants", () => {
    const filesData = buildFiles("本編", [
      "01_あ 128kbps.mp3",
      "01_あ 320kbps.mp3",
    ]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/01_あ 320kbps.mp3",
    ]);
  });

  it("does not treat a real title bracket as a format marker", () => {
    const filesData = buildFiles("本編", [
      "（初回限定）01_あ.mp3",
      "（初回限定）01_あ.wav",
    ]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/（初回限定）01_あ.mp3",
    ]);
  });

  it("drops the SE-less variant folder but keeps the SE version", () => {
    const filesData = [
      ...buildFiles("3_効果音ありmp3", ["（効果音ありmp3）01_あ.mp3"]),
      ...buildFiles("4_効果音なしmp3", ["（効果音なしmp3）01_あ.mp3"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/3_効果音ありmp3/（効果音ありmp3）01_あ.mp3",
    ]);
  });

  it("dedupes a format-version folder (mp3版) against root by fingerprint only", () => {
    // 复现 RJ01721275：根目录放 wav，`mp3版/` 放同名 mp3，按指纹判定为同一轨道。
    const trackNames = [
      "01_目が覚めると",
      "02_密着囁き手コキ実況で大興奮♪",
      "03_お射精我慢状態で焦らし舐め口撃♪",
      "04_両耳超密着マンズリおまんこ誘惑",
      "05_おまんこ見せつけお掃除フェラ",
      "06_両方のおまんこハメ比べ♪",
      "07_シェアすればいいじゃない",
      "08_由里の残業を労うおちんぽマッサージ",
      "09_里穂のおまんこでイライラ発散♪",
      "おまけ01_反省会フリートーク",
    ];
    const filesData = [
      ...buildFiles("", trackNames.map((name) => `${name}.wav`)),
      ...buildFiles("mp3版", trackNames.map((name) => `${name}.mp3`)),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ01721275",
      downloadDir: "F:/downloads",
      filesData,
    });

    expect(tasks).toHaveLength(trackNames.length);
    expect(tasks.every((task) => task.outPath.endsWith(".mp3"))).toBe(true);
    expect(tasks.map((task) => task.outPath)).toEqual(
      trackNames.map((name) => `RJ01721275/mp3版/${name}.mp3`),
    );
  });

  it("dedupes across arbitrary unlisted folders by fingerprint only", () => {
    // 目录名完全未收录也不影响：同一指纹只保留最高优先级格式。
    const filesData = [
      ...buildFiles("", ["01_あ.wav"]),
      ...buildFiles("音声mp3", ["01_あ.mp3"]),
      ...buildFiles("動画", ["01_あ.mp4"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/音声mp3/01_あ.mp3",
    ]);
  });

  it("handles folder names that are not in any whitelist", () => {
    const filesData = [
      ...buildFiles("", ["01_あ.wav", "02_い.wav"]),
      ...buildFiles("謎ディレクトリΩ/深い階層", ["01_あ.mp3", "02_い.flac"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/謎ディレクトリΩ/深い階層/01_あ.mp3",
      "RJ123456/謎ディレクトリΩ/深い階層/02_い.flac",
    ]);
  });

  it("preserves work completeness by retaining SE-less track when no SE version exists", () => {
    const filesData = buildFiles("SEなし", ["01_プロローグ.mp3", "02_本編.mp3"]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/SEなし/01_プロローグ.mp3",
      "RJ123456/SEなし/02_本編.mp3",
    ]);
  });

  it("drops channel-inverted (左右反転) version when normal stereo is available", () => {
    const filesData = [
      ...buildFiles("本編", ["01_プロローグ.mp3"]),
      ...buildFiles("左右反転", ["01_プロローグ 左右反転.mp3"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/01_プロローグ.mp3",
    ]);
  });

  it("retains channel-inverted version when it is the only version available", () => {
    const filesData = buildFiles("左右反転", ["01_プロローグ 左右反転.mp3"]);

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/左右反転/01_プロローグ 左右反転.mp3",
    ]);
  });

  it("preserves bonus track when it only exists in WAV while main tracks are MP3", () => {
    const filesData = [
      ...buildFiles("本編/mp3", ["01_プロローグ.mp3"]),
      ...buildFiles("本編/wav", ["01_プロローグ.wav"]),
      ...buildFiles("おまけ", ["フリートーク.wav"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/mp3/01_プロローグ.mp3",
      "RJ123456/おまけ/フリートーク.wav",
    ]);
  });

  it("retains all numbered tracks when multiple tracks share a common fingerprint and wav counterpart exists", () => {
    const filesData = [
      ...buildFiles("本編", ["01_あ.mp3", "02_あ.mp3", "01_あ.wav"]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/01_あ.mp3",
      "RJ123456/本編/02_あ.mp3",
    ]);
  });

  it("prefers BGM/environment sound version when both with-BGM and without-BGM exist", () => {
    const filesData = [
      ...buildFiles("本編", [
        "トラック1-すがすがしい朝.mp3",
        "トラック1-すがすがしい朝(BGMなし).mp3",
      ]),
    ];

    const { tasks } = buildDownloadPlanForWork({
      workCode: "RJ123456",
      downloadDir: "C:/Downloads",
      filesData,
    });

    expect(tasks.map((task) => task.outPath)).toEqual([
      "RJ123456/本編/トラック1-すがすがしい朝.mp3",
    ]);
  });

  describe("reversal regression test cases", () => {
    it("drops reversed track when author assigns a different ordinal in the same folder", () => {
      // 解决类似 RJ01012064: 正篇 02 轨，反转版被编为 05 轨，不能因不同序号分裂赛道
      const filesData = [
        ...buildFiles("mp3", [
          "01. お礼に癒しをプレゼント.mp3",
          "02. あきらの耳かき、そして梵天.mp3",
          "03. 想いが通じ合う、二人のハッピータイム.mp3",
          "04. 潤いボディのシャンプーヒーリング.mp3",
          "05. あきらの耳かき、そして梵天(左右反転).mp3",
          "06. 潤いボディのシャンプーヒーリング(左右反転).mp3",
        ]),
      ];

      const { tasks } = buildDownloadPlanForWork({
        workCode: "RJ01012064",
        downloadDir: "C:/Downloads",
        filesData,
      });

      expect(tasks.map((task) => task.outPath)).toEqual([
        "RJ01012064/mp3/01. お礼に癒しをプレゼント.mp3",
        "RJ01012064/mp3/02. あきらの耳かき、そして梵天.mp3",
        "RJ01012064/mp3/03. 想いが通じ合う、二人のハッピータイム.mp3",
        "RJ01012064/mp3/04. 潤いボディのシャンプーヒーリング.mp3",
      ]);
    });

    it("drops reversed track with leading reversal prefix such as 反転01_ or R1_", () => {
      // 解决类似 RJ01028420 & RJ01006185: 反转前缀阻断了序号剥离导致指纹与原版错位
      const filesData = [
        ...buildFiles("mp3版", [
          "01_エクササイズ配信.mp3",
          "反転01_エクササイズ配信.mp3",
        ]),
        ...buildFiles("wav", [
          "1_ごあいさつ.wav",
          "R1_ごあいさつ.wav",
        ]),
      ];

      const { tasks } = buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
      });

      expect(tasks.map((task) => task.outPath)).toEqual([
        "RJ123456/mp3版/01_エクササイズ配信.mp3",
        "RJ123456/wav/1_ごあいさつ.wav",
      ]);
    });

    it("recognizes and drops 反転バージョン and 左右逆/LR逆", () => {
      // 解决类似 RJ01281591 & RJ01135052: 负向前瞻和漏判词根导致的泄露
      const filesData = [
        ...buildFiles("本編", [
          "01_日常会話.mp3",
          "01_日常会話 反転バージョン.mp3",
          "02_耳かき編.mp3",
          "02_耳かき編 左右逆.mp3",
        ]),
        ...buildFiles("おまけ", [
          "おまけ音声-01.mp3",
          "おまけ音声(LR逆ver)-01.mp3",
        ]),
      ];

      const { tasks } = buildDownloadPlanForWork({
        workCode: "RJ123456",
        downloadDir: "C:/Downloads",
        filesData,
      });

      expect(tasks.map((task) => task.outPath)).toEqual([
        "RJ123456/本編/01_日常会話.mp3",
        "RJ123456/本編/02_耳かき编.mp3".replace("编", "編"),
        "RJ123456/おまけ/おまけ音声-01.mp3",
      ]);
    });
  });
});
