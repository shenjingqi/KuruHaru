import path from "path";

const EXACT_WORK_CODE_REGEX = /^(RJ|VJ|BJ)(\d{6,8})$/i;
const EMBEDDED_WORK_CODE_REGEX = /(RJ|VJ|BJ)(\d{6,8})/i;
const NUMERIC_WORK_CODE_REGEX = /^(\d{6,8})$/;
export const DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK = 20;
export const DEFAULT_FILTER_VIDEO_FORMATS = true;

// 真正的非剧情垃圾/外语翻译包/样本试听（这些始终不予下载）
const HARD_EXCLUDE_KEYWORDS =
  /english|chinese|中文|簡体|繁体|過去作|体験版|体験ボイス|お試し|サンプル|ループトラック/i;

const MANUAL_KEYWORDS =
  /英語|中国語|簡体|繁体|個別(?:音声|ルート|視点)|パーツ分け|他作品/i;

// SE/环境音 领域词根（吸收专业 ASMR 细分领域音效与环境音）
const SOUND_KEYWORDS =
  "se|効果音|環境音|水音|心音|エコー|吐息|衣擦れ|咀嚼音|耳かき音|ピストン|ぐちゅ|粘膜|吸引|舐め音|足音|雨音|風音|バイブ|ローター|射精音|絶顶|絶頂|潮吹き|bgm|背景音|ambient";

// 父级混合目录消歧 (如 "効果音ありなし"、"SEあり・なし" 表示其下同时包含两种分支，不作单侧判定)
const SE_BOTH_REGEX =
  /(?:se|効果音|環境音|bgm)[\s_\-・/＋+&＆]*(?:あり[\s_\-・/＋+&＆]*なし|有[\s_\-・/＋+&＆]*無|on[\s_\-・/＋+&＆]*off)/i;

// SE/环境音 正向标记 (SEあり, 効果音あり, 環境音あり, BGMあり)
const SE_PRESENT_REGEX = new RegExp(
  `(?:${SOUND_KEYWORDS})(?:[有あ]り?|有|付き|つき|入|入り|大きめ|強め|ダブル|on|ver\\.?|版)|with[_\\s-]?(?:se|sound|bgm)|\\bse\\+`,
  "i"
);

// SE/环境音 负向标记 (SEなし, 効果音なし, BGMなし, 声のみ等) - 仅在存在完整版时差分剪枝
const SE_ABSENT_REGEX = new RegExp(
  `(?:${SOUND_KEYWORDS})(?:[無な]し?|無|off|cut|抜き|ぬき|less|free|no)|without[_\\s-]?(?:se|sound|bgm)|\\bnose\\b|no[n]?[_\\s-]*(?:se|sound)|(?<!音)声のみ|ボイスのみ|voice[_\\s-]*only|bgmのみ|bgm[_\\s-]*only|台詞なし|台词なし`,
  "i"
);

// 部分SE剥离 (如射精音なし、吐息なし)
const SE_PARTIAL_ABSENT_REGEX = /射精音[無な]し|吐息[無な]し|心音[無な]し/i;

// 声道反转/镜像/入替 领域词根
const REVERSAL_KEYWORDS =
  "左右(?:反転|入替|入れ替え|逆)(?:ver|バージョン|版)?|(?:lr|rl)(?:反転|逆)(?:ver|バージョン|版)?|反転(?:バージョン|版|差分|ver)?|入替(?:版|ver|え)?|配役(?:入替|入れ替え)(?:ver|バージョン|版)?|(?:耳|チャンネル|ステレオ)反転|reverse[d]?|inversion|inverted|元[右左]";

// 声道反转标记 (严格限制在显式反转/入替，绝不将正常 ASMR "左耳/右耳" 耳掏音轨误判为反转)
const CHANNEL_INVERTED_REGEX = new RegExp(REVERSAL_KEYWORDS, "i");

// 特典/本篇识别
const FT_FOLDER =
  /フリートーク|freetalk|アフタートーク|特典|おまけ|ボーナス|bonus|EX(?:音声)?|Extra|視聴後|secret|メッセージ|目覚まし|アラーム|NG集/i;

const MAIN_OVERRIDE = /本編|メイン|main/i;
const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|wma)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mkv|avi|mov|webm|flv|wmv)$/i;

// 格式开销评分：数值越大越优先（MP3 > M4A > AAC > OGG > FLAC > WAV > 视频）
const FORMAT_RULES = [
  [/mp3|\.mp3$|軽量|192kbps|128kbps/i, 100],
  [/m4a|aac|\.m4a$|\.aac$/i, 80],
  [/wav|flac|\.wav$|\.flac$|ハイレゾ|高音質|24bit/i, 10],
  [/mp4|m4v|mkv|avi|mov|webm|flv|wmv|\.(mp4|m4v|mkv|avi|mov|webm|flv|wmv)$/i, 5],
];

// 扩展名空间优先级：越轻量越优先 (mp3 > m4a > aac > ogg > flac > wav > wma > video)
const EXTENSION_PRIORITY = new Map([
  [".mp3", 70],
  [".m4a", 60],
  [".aac", 55],
  [".ogg", 50],
  [".flac", 40],
  [".wav", 30],
  [".wma", 25],
  [".mp4", 20],
  [".m4v", 18],
  [".webm", 16],
  [".mkv", 14],
  [".mov", 12],
  [".avi", 10],
  [".flv", 8],
  [".wmv", 6],
]);

// 同一扩展名下的码率标记
const BITRATE_RULES = [
  [/(?:320|256)kbps/i, 15],
  [/(?:192|160)kbps/i, 10],
  [/(?:128|96)kbps/i, 5],
];

// 指纹归一化标记
const MEDIA_FORMAT_TOKENS =
  /mp3|wav|flac|m4a|m4v|aac|ogg|mp4|mkv|avi|mov|webm|flv|wmv|高音質|軽量|(?:320|256|192|160|128|96)kbps|24bit|ハイレゾ/gi;
const VERSION_QUALIFIERS =
  /音声のみ|音声版|音声トラック|映像のみ|映像版|動画版|ビデオ版|映像付き|動画付き/gi;
const SE_MARKER = new RegExp(
  `(?:${SOUND_KEYWORDS})(?:[有あ]り?|有|[無な]し?|無|off|cut|抜き)|without[_\\s-]?(?:se|sound|bgm)|with[_\\s-]?(?:se|sound|bgm)|\\bnose\\b|no[n]?[_\\s-]*(?:se|sound)|${REVERSAL_KEYWORDS}|射精音[無な]し|吐息[無な]し|心音[無な]し`,
  "gi"
);
const DUPLICATE_SUFFIX = /\s*\(\d+\)\s*$/g;
const LEADING_MARKER_REGEX = /^(?:[(【]|\u005B)[^)】\]]*[)】\]]/;
const LEADING_REVERSAL_PREFIX =
  /^(?:反転|左右反転|左右逆|lr反転|lr逆|reverse|配役入替)[_\s-]*/i;
const LEADING_R_ORDINAL_PREFIX = /^[rR](?=\d{1,3}[\s._-])/i;
const LEADING_ORDINAL_REGEX = /^0*(\d{1,3})(?=[\s._-])/;
const TRACK_ORDINAL_REGEX = /^0*(\d{1,3})(?=[\s._-]|$)/;

function replaceIllegalPathChars(value = "") {
  const replacements = {
    "\\": "＼",
    "/": "／",
    ":": "：",
    "*": "＊",
    "?": "？",
    '"': "”",
    "<": "＜",
    ">": "＞",
    "|": "｜",
  };

  return Object.entries(replacements).reduce(
    (currentValue, [target, nextValue]) =>
      currentValue.split(target).join(nextValue),
    String(value || ""),
  );
}

function isAudioFile(fileName = "") {
  return AUDIO_EXT.test(String(fileName || ""));
}

function isVideoFile(fileName = "") {
  return VIDEO_EXT.test(String(fileName || ""));
}

function isSupportedMediaFile(fileName = "") {
  return isAudioFile(fileName) || isVideoFile(fileName);
}

function getExtensionPriority(fileName = "") {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  return EXTENSION_PRIORITY.get(extension) ?? 0;
}

function baseFormatScore(rawText = "") {
  const normalizedText = String(rawText || "").normalize("NFKC");
  const matchedRule = FORMAT_RULES.find(([pattern]) =>
    pattern.test(normalizedText),
  );
  return matchedRule ? matchedRule[1] : 50;
}

function isFormatMarkerText(value = "") {
  const stripped = String(value || "")
    .normalize("NFKC")
    .replace(MEDIA_FORMAT_TOKENS, "")
    .replace(VERSION_QUALIFIERS, "")
    .replace(SE_MARKER, "")
    .replace(/効果音|音声/g, "")
    .replace(/[\s_\-・,、/]/g, "");

  return stripped === "";
}

function stripLeadingFormatMarkers(value = "") {
  let remaining = String(value || "");

  for (let index = 0; index < 4; index += 1) {
    remaining = remaining
      .replace(LEADING_REVERSAL_PREFIX, "")
      .replace(LEADING_R_ORDINAL_PREFIX, "")
      .trimStart();

    const matched = remaining.match(LEADING_MARKER_REGEX);
    if (!matched) {
      break;
    }

    if (!isFormatMarkerText(matched[0].slice(1, -1))) {
      break;
    }

    remaining = remaining.slice(matched[0].length).trimStart();
  }

  return remaining;
}

export function extractTrackOrdinal(fileName = "") {
  const baseName = String(fileName || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(DUPLICATE_SUFFIX, "");
  let withoutMarkers = stripLeadingFormatMarkers(baseName);
  withoutMarkers = withoutMarkers
    .replace(LEADING_REVERSAL_PREFIX, "")
    .replace(LEADING_R_ORDINAL_PREFIX, "");
  const matched = withoutMarkers.match(TRACK_ORDINAL_REGEX);

  return matched ? matched[1] : "";
}

export function generateFingerprint(fileName = "") {
  const normalizedName = String(fileName || "")
    .normalize("NFKC")
    .toLowerCase();
  let baseName = normalizedName.replace(/\.[^.]+$/, "");

  baseName = baseName.replace(DUPLICATE_SUFFIX, "");
  baseName = stripLeadingFormatMarkers(baseName);
  baseName = baseName.replace(LEADING_REVERSAL_PREFIX, "");
  baseName = baseName.replace(LEADING_R_ORDINAL_PREFIX, "");
  baseName = baseName.replace(LEADING_ORDINAL_REGEX, "");
  baseName = baseName.replace(MEDIA_FORMAT_TOKENS, "");
  baseName = baseName.replace(VERSION_QUALIFIERS, "");
  baseName = baseName.replace(SE_MARKER, "");

  const hasTrackNumber = /[_-]\d{2}$/.test(baseName);
  if (!hasTrackNumber) {
    baseName = baseName.replace(/_(?:0\d|00\d)$/g, "");
  }
  baseName = baseName.replace(/版|トラック|track|tr|part|パート/gi, "");
  baseName = baseName.replace(/(?<!_)0+(\d+)/g, (_, digits) => digits);
  baseName = baseName.replace(/_/g, "");

  const cleanedName = baseName.replace(
    /[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/gu,
    "",
  );
  if (cleanedName) {
    return cleanedName;
  }

  const fallbackSource = normalizedName
    .replace(/\.[^.]+$/, "")
    .replace(DUPLICATE_SUFFIX, "");
  const fallbackName = fallbackSource.replace(
    /[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/gu,
    "",
  );
  if (fallbackName) {
    return `__fallback__${fallbackName}`;
  }

  return `__fallback__${
    normalizedName.replace(
      /[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/gu,
      "",
    ) || "unknown"
  }`;
}

export function normalizeWorkCodeForDownload(rawValue = "") {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return null;
  }

  const exactMatch = trimmedValue.match(EXACT_WORK_CODE_REGEX);
  if (exactMatch) {
    const prefix = exactMatch[1].toUpperCase();
    const apiId = exactMatch[2];
    return {
      displayCode: `${prefix}${apiId}`,
      apiId,
      prefix,
      rawInput: trimmedValue,
    };
  }

  const embeddedMatch = trimmedValue.match(EMBEDDED_WORK_CODE_REGEX);
  if (embeddedMatch) {
    const prefix = embeddedMatch[1].toUpperCase();
    const apiId = embeddedMatch[2];
    return {
      displayCode: `${prefix}${apiId}`,
      apiId,
      prefix,
      rawInput: trimmedValue,
    };
  }

  const numericMatch = trimmedValue.match(NUMERIC_WORK_CODE_REGEX);
  if (numericMatch) {
    const apiId = numericMatch[1];
    return {
      displayCode: `RJ${apiId}`,
      apiId,
      prefix: "RJ",
      rawInput: trimmedValue,
    };
  }

  return null;
}

export function parseBatchDownloadInput(rawText = "") {
  const uniqueItems = [];
  const invalidItems = [];
  const seenCodes = new Set();
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const prefixedMatches = [...line.matchAll(/(RJ|VJ|BJ)\d{6,8}/gi)].map(
      (match) => match[0],
    );
    const numericMatches = prefixedMatches.length
      ? []
      : [...line.matchAll(/\b\d{6,8}\b/g)].map((match) => match[0]);
    const candidates =
      prefixedMatches.length > 0 ? prefixedMatches : numericMatches;

    if (candidates.length === 0) {
      invalidItems.push({
        input: line,
        reason: "未识别为 RJ/VJ/BJ 编号，或数字位数不在 6-8 位范围内",
      });
      return;
    }

    candidates.forEach((candidate) => {
      const normalizedItem = normalizeWorkCodeForDownload(candidate);
      if (!normalizedItem || seenCodes.has(normalizedItem.displayCode)) {
        return;
      }

      seenCodes.add(normalizedItem.displayCode);
      uniqueItems.push({
        ...normalizedItem,
        rawInput: line,
      });
    });
  });

  return {
    workItems: uniqueItems,
    invalidItems,
  };
}

export function sanitizeFilename(fileName = "") {
  let sanitizedName = replaceIllegalPathChars(
    String(fileName || "").replace(/[.\s]+$/g, ""),
  );
  sanitizedName = sanitizedName.trim();
  return sanitizedName || "未命名";
}

export function parseAudioNodes(nodes = [], currentPath = "") {
  const filesData = [];

  nodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "folder") {
      const safeTitle = sanitizeFilename(node.title);
      const nextPath = currentPath ? `${currentPath}/${safeTitle}` : safeTitle;
      filesData.push(...parseAudioNodes(node.children || [], nextPath));
      return;
    }

    const downloadUrl = node.mediaDownloadUrl || node.downloadUrl || null;
    const rawTitle = typeof node.title === "string" ? node.title : "";

    if (downloadUrl && rawTitle.trim()) {
      filesData.push({
        folderPath: currentPath,
        fileName: sanitizeFilename(rawTitle),
        downloadUrl,
      });
    }
  });

  return filesData;
}

export function buildFolderMaps(filesData = []) {
  const folderMap = new Map();
  const urlMap = new Map();

  filesData.forEach(
    ({ folderPath = "", fileName = "", downloadUrl = null }) => {
      const folderKey = folderPath || "root";
      const existingFiles = folderMap.get(folderKey) || [];
      existingFiles.push(fileName);
      folderMap.set(folderKey, existingFiles);

      if (downloadUrl) {
        urlMap.set(`${folderKey}/${fileName}`, downloadUrl);
      }
    },
  );

  return {
    folderMap,
    urlMap,
  };
}

/**
 * 组内最优候选选取决策函数：
 * 1. 优先满足环境音与SE完整性 (SEあり > 默认版 > SEなし/声のみ)
 * 2. 优先正常立体声 (正常 > 左右反转)
 * 3. 极小化存储与码率开销 (MP3/AAC/M4A > FLAC > WAV > 视频)
 * 4. 同格式下保留高码率 (320kbps > 128kbps)
 */
function pickBestCandidate(candidates = []) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 1. SE/环境音过滤：若存在 >= 0 的版本，剔除 < 0 的差分版本
  const maxSe = Math.max(...candidates.map((c) => c.seScore));
  let pool = candidates;
  if (maxSe >= 0) {
    const nonNegative = pool.filter((c) => c.seScore >= 0);
    // 若有显式 SEあり，优先保留
    const explicitPos = nonNegative.filter((c) => c.seScore === 1.0);
    pool = explicitPos.length > 0 ? explicitPos : nonNegative;
  } else {
    // 全是负向版本时，保留最高者（如 -0.5 优于 -1.0），绝不误杀孤本
    pool = pool.filter((c) => c.seScore === maxSe);
  }

  // 2. 声道过滤：若存在正常声道 (0)，剔除反转声道 (-1)
  const maxChan = Math.max(...pool.map((c) => c.channelScore));
  pool = pool.filter((c) => c.channelScore === maxChan);

  // 3. 格式与音质选择：首先比对 extensionPriority（数值大者优先，即 MP3 > FLAC > WAV）
  // 其次比对综合评分 score
  return pool.reduce((bestItem, candidate) => {
    if (!bestItem) {
      return candidate;
    }

    if (candidate.extensionPriority !== bestItem.extensionPriority) {
      return candidate.extensionPriority > bestItem.extensionPriority
        ? candidate
        : bestItem;
    }

    return candidate.score > bestItem.score ? candidate : bestItem;
  }, null);
}

export function optimizeAndDedupAudioTasks({
  workCode,
  folderMap = new Map(),
  urlMap = new Map(),
  filterVideoFormats = DEFAULT_FILTER_VIDEO_FORMATS,
}) {
  const candidates = [];

  folderMap.forEach((files = [], folder = "root") => {
    const normalizedFolder = String(folder || "").normalize("NFKC");

    // 强排除项拦截（外语翻译包、独立样本试听）
    if (
      HARD_EXCLUDE_KEYWORDS.test(normalizedFolder) &&
      !MAIN_OVERRIDE.test(normalizedFolder)
    ) {
      return;
    }
    if (MANUAL_KEYWORDS.test(normalizedFolder)) {
      return;
    }

    // 目录基础格式与SE评分
    let folderScore = baseFormatScore(folder);
    if (SE_PRESENT_REGEX.test(normalizedFolder)) {
      folderScore += 20;
    }

    const folderIsFt =
      FT_FOLDER.test(normalizedFolder) && !MAIN_OVERRIDE.test(normalizedFolder);

    files.forEach((fileName) => {
      const normalizedFileName = String(fileName || "").normalize("NFKC");

      if (!isSupportedMediaFile(normalizedFileName)) {
        return;
      }
      if (HARD_EXCLUDE_KEYWORDS.test(normalizedFileName)) {
        return;
      }

      const fullPathStr = `${normalizedFolder}/${normalizedFileName}`;
      const testPathStr = SE_BOTH_REGEX.test(normalizedFolder)
        ? normalizedFileName
        : fullPathStr;

      // 特征 1: SE评分 (+1: 显式含SE, 0: 默认标准, -0.5: 部分SE剥离, -1: 显式剥离SE/BGM)
      let seScore = 0.0;
      if (SE_PRESENT_REGEX.test(testPathStr)) {
        seScore = 1.0;
      } else if (SE_ABSENT_REGEX.test(testPathStr)) {
        seScore = -1.0;
      } else if (SE_PARTIAL_ABSENT_REGEX.test(testPathStr)) {
        seScore = -0.5;
      }

      // 特征 2: 声道评分 (0: 正常, -1: 左右反转)
      const channelScore = CHANNEL_INVERTED_REGEX.test(fullPathStr) ? -1.0 : 0.0;

      // 特征 3: 格式开销与码率评分
      const fileScore = baseFormatScore(normalizedFileName);
      const seBonus = seScore > 0 ? 20 : (seScore < 0 ? -100 : 0);
      const bitrateBonus =
        BITRATE_RULES.find(([pattern]) =>
          pattern.test(normalizedFileName),
        )?.[1] ?? 0;
      const fileIsFt =
        FT_FOLDER.test(normalizedFileName) &&
        !MAIN_OVERRIDE.test(normalizedFileName);

      candidates.push({
        folder,
        fileName,
        fingerprint: generateFingerprint(fileName),
        ordinal: extractTrackOrdinal(fileName),
        isFt: folderIsFt || fileIsFt,
        isVideo: isVideoFile(normalizedFileName),
        seScore,
        channelScore,
        extensionPriority: getExtensionPriority(normalizedFileName),
        score: fileScore * 10 + folderScore + seBonus + bitrateBonus,
      });
    });
  });

  // 视频过滤按轨道兜底：同一指纹已有音频版本才丢弃视频；
  // 只有视频版本的轨道保留视频，避免开启过滤后整条音轨缺失。
  const audioFingerprints = new Set(
    candidates.filter((item) => !item.isVideo).map((item) => item.fingerprint),
  );
  const usableCandidates = filterVideoFormats
    ? candidates.filter(
        (item) => !item.isVideo || !audioFingerprints.has(item.fingerprint),
      )
    : candidates;

  // 分组策略：
  // 极短指纹（<=3字符）在 本篇/特典 之间加前缀隔离，防止特典误伤
  const groups = new Map();
  usableCandidates.forEach((item) => {
    const ftPrefix = item.fingerprint.length <= 3 && item.isFt ? "ft:" : "";
    const groupKey = `${ftPrefix}${item.fingerprint}`;
    const group = groups.get(groupKey) || [];
    group.push(item);
    groups.set(groupKey, group);
  });

  const selectedItems = [];
  groups.forEach((group) => {
    // 关键：若组内存在正常声道版本 (channelScore >= 0)，反转声道 (channelScore < 0) 绝不应逃逸或参与多轨道分流
    const hasNormalChannel = group.some((item) => item.channelScore >= 0);
    const candidatePool = hasNormalChannel
      ? group.filter((item) => item.channelScore >= 0)
      : group;

    // 检查组内是否存在多轨道（例如同扩展名下出现多个不同的非空 ordinal）
    // 仅基于有效候选池 candidatePool 判定
    const ordinalsByExt = new Map();
    candidatePool.forEach((item) => {
      const ords = ordinalsByExt.get(item.extensionPriority) || new Set();
      if (item.ordinal) {
        ords.add(item.ordinal);
      }
      ordinalsByExt.set(item.extensionPriority, ords);
    });

    const hasMultiTracksInSameExt = Array.from(ordinalsByExt.values()).some(
      (ords) => ords.size > 1,
    );

    if (hasMultiTracksInSameExt) {
      // 组内包含多首不同序号的真实曲目，按 ordinal 细分赛道逐轨选优
      const byOrdinal = new Map();
      candidatePool.forEach((item) => {
        const ordKey = item.ordinal || item.fileName;
        const ordList = byOrdinal.get(ordKey) || [];
        ordList.push(item);
        byOrdinal.set(ordKey, ordList);
      });

      byOrdinal.forEach((ordCandidates) => {
        const best = pickBestCandidate(ordCandidates);
        if (best) {
          selectedItems.push(best);
        }
      });
      return;
    }

    // 格式或版本分支竞争单首音轨（含仅有 1 轨但在不同格式或SE文件夹）
    const best = pickBestCandidate(candidatePool);
    if (best) {
      selectedItems.push(best);
    }
  });

  const tasks = [];
  const seenOutPaths = new Set();

  selectedItems.forEach((item) => {
    const folder = item.folder || "root";
    const downloadUrl = urlMap.get(`${folder}/${item.fileName}`);
    if (!downloadUrl) {
      return;
    }

    const outPath =
      folder === "root"
        ? `${workCode}/${item.fileName}`
        : `${workCode}/${folder}/${item.fileName}`;
    const outPathKey = outPath.toLowerCase();
    if (seenOutPaths.has(outPathKey)) {
      return;
    }

    seenOutPaths.add(outPathKey);
    tasks.push({ downloadUrl, outPath });
  });

  return tasks;
}

export function shouldManualReviewByTaskCount(
  tasks = [],
  maxAutoTasksPerWork = DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK,
) {
  return Array.isArray(tasks) && tasks.length > maxAutoTasksPerWork;
}

export function buildDownloadPlanForWork({
  workCode,
  filesData = [],
  downloadDir,
  maxPathLimit = 250,
  filterVideoFormats = DEFAULT_FILTER_VIDEO_FORMATS,
}) {
  const { folderMap, urlMap } = buildFolderMaps(filesData);
  const tasks = optimizeAndDedupAudioTasks({
    workCode,
    folderMap,
    urlMap,
    filterVideoFormats,
  });

  const overflowPaths = tasks
    .map((task) => path.join(downloadDir, ...task.outPath.split("/")))
    .filter((fullPath) => fullPath.length > maxPathLimit);

  return {
    tasks,
    overflowPaths,
  };
}
