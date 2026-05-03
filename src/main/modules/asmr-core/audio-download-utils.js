import path from 'path';

const EXACT_WORK_CODE_REGEX = /^(RJ|VJ|BJ)(\d{6,8})$/i;
const EMBEDDED_WORK_CODE_REGEX = /(RJ|VJ|BJ)(\d{6,8})/i;
const NUMERIC_WORK_CODE_REGEX = /^(\d{6,8})$/;
export const DEFAULT_MAX_AUTO_DOWNLOAD_TASKS_PER_WORK = 20;

const MANUAL_KEYWORDS =
  /英語|中国語|簡体|繁体|個別(?:音声|ルート|視点)|パーツ分け|差分|他作品/i;

const BLACKLIST =
  /se[無な]し|se[\s_-]*off|no[n]?[\s_-]*se|se[\s_-]*cut|se音\s*[無な]し|効果音[無な]し|左右反転|反転(?!\s*バージョン)|声のみ|ボイスのみ|voice[\s_-]*only|bgmのみ|bgm[\s_-]*only|台詞なし|english|chinese|中文|過去作|体験版|体験ボイス|お試し|サンプル|射精音[無な]し|\d+分間.*?耳舐|オンリー|ループトラック/i;

const SE_PRESENT =
  /se[有あ]り|se音\s*[有あ]り|\(se[有あ]り\)|【se(?:音)?[有あ]り】|効果音[有あ]り/i;

const FT_FOLDER =
  /フリートーク|freetalk|アフタートーク|特典|おまけ|ボーナス|bonus|EX(?:音声)?|Extra|視聴後|secret|メッセージ|目覚まし|アラーム|NG集/i;

const MAIN_OVERRIDE = /本編|メイン|main/i;
const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|mp4)$/i;
const FORMAT_RULES = [
  [/mp3|\.mp3$|軽量|192kbps|128kbps/i, 100],
  [/m4a|aac|\.m4a$|\.aac$/i, 80],
  [/wav|flac|\.wav$|\.flac$|ハイレゾ|高音質|24bit/i, 10],
];

function replaceIllegalPathChars(value = '') {
  const replacements = {
    '\\': '＼',
    '/': '／',
    ':': '：',
    '*': '＊',
    '?': '？',
    '"': '”',
    '<': '＜',
    '>': '＞',
    '|': '｜',
  };

  return Object.entries(replacements).reduce(
    (currentValue, [target, nextValue]) => currentValue.split(target).join(nextValue),
    String(value || ''),
  );
}

function isAudioFile(fileName = '') {
  return AUDIO_EXT.test(String(fileName || ''));
}

function baseFormatScore(rawText = '') {
  const normalizedText = String(rawText || '').normalize('NFKC');
  const matchedRule = FORMAT_RULES.find(([pattern]) => pattern.test(normalizedText));
  return matchedRule ? matchedRule[1] : 50;
}

export function normalizeWorkCodeForDownload(rawValue = '') {
  const trimmedValue = String(rawValue || '').trim();
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
      prefix: 'RJ',
      rawInput: trimmedValue,
    };
  }

  return null;
}

export function parseBatchDownloadInput(rawText = '') {
  const uniqueItems = [];
  const invalidItems = [];
  const seenCodes = new Set();
  const lines = String(rawText || '')
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
    const candidates = prefixedMatches.length > 0 ? prefixedMatches : numericMatches;

    if (candidates.length === 0) {
      invalidItems.push({
        input: line,
        reason: '未识别为 RJ/VJ/BJ 编号，或数字位数不在 6-8 位范围内',
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

export function sanitizeFilename(fileName = '') {
  let sanitizedName = replaceIllegalPathChars(String(fileName || '').replace(/[.\s]+$/g, ''));
  sanitizedName = sanitizedName.trim();
  return sanitizedName || '未命名';
}

export function parseAudioNodes(nodes = [], currentPath = '') {
  const filesData = [];

  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.type === 'folder') {
      const safeTitle = sanitizeFilename(node.title);
      const nextPath = currentPath ? `${currentPath}/${safeTitle}` : safeTitle;
      filesData.push(...parseAudioNodes(node.children || [], nextPath));
      return;
    }

    if (node.type === 'audio') {
      filesData.push({
        folderPath: currentPath,
        fileName: sanitizeFilename(node.title),
        downloadUrl: node.mediaDownloadUrl || null,
      });
    }
  });

  return filesData;
}

export function buildFolderMaps(filesData = []) {
  const folderMap = new Map();
  const urlMap = new Map();

  filesData.forEach(({ folderPath = '', fileName = '', downloadUrl = null }) => {
    const folderKey = folderPath || 'root';
    const existingFiles = folderMap.get(folderKey) || [];
    existingFiles.push(fileName);
    folderMap.set(folderKey, existingFiles);

    if (downloadUrl) {
      urlMap.set(`${folderKey}/${fileName}`, downloadUrl);
    }
  });

  return {
    folderMap,
    urlMap,
  };
}

export function generateFingerprint(fileName = '') {
  let baseName = String(fileName || '').normalize('NFKC').toLowerCase();
  baseName = baseName.replace(/\.[^.]+$/, '');
  baseName = baseName.replace(/_\d+$/g, '');
  baseName = baseName.replace(
    /mp3|wav|flac|m4a|aac|ogg|高音質|軽量|192kbps|128kbps|24bit|ハイレゾ/gi,
    '',
  );
  baseName = baseName.replace(/se[有あ]り|seなし|効果音.*/gi, '');
  baseName = baseName.replace(/版|トラック|track|tr|part|パート/gi, '');
  baseName = baseName.replace(/\d+/g, (match) => `n${Number.parseInt(match, 10)}`);
  baseName = baseName.replace(/_/g, '');
  return baseName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/gu, '');
}

export function optimizeAndDedupAudioTasks({
  workCode,
  folderMap = new Map(),
  urlMap = new Map(),
}) {
  const validFiles = [];

  folderMap.forEach((files = [], folder = 'root') => {
    const normalizedFolder = String(folder || '').normalize('NFKC');

    if (BLACKLIST.test(normalizedFolder) && !MAIN_OVERRIDE.test(normalizedFolder)) {
      return;
    }
    if (MANUAL_KEYWORDS.test(normalizedFolder)) {
      return;
    }

    let folderScore = baseFormatScore(folder);
    if (SE_PRESENT.test(normalizedFolder)) {
      folderScore += 20;
    }

    const folderIsFt = FT_FOLDER.test(normalizedFolder) && !MAIN_OVERRIDE.test(normalizedFolder);

    files.forEach((fileName) => {
      const normalizedFileName = String(fileName || '').normalize('NFKC');

      if (!isAudioFile(normalizedFileName)) {
        return;
      }
      if (BLACKLIST.test(normalizedFileName)) {
        return;
      }

      const fileScore = baseFormatScore(normalizedFileName);
      const seBonus = SE_PRESENT.test(normalizedFileName) ? 20 : 0;
      const penalty =
        BLACKLIST.test(normalizedFolder) || BLACKLIST.test(normalizedFileName)
          ? -50
          : 0;

      const fileIsFt = FT_FOLDER.test(normalizedFileName) && !MAIN_OVERRIDE.test(normalizedFileName);
      const isFt = folderIsFt || fileIsFt;

      let totalScore = fileScore * 10 + folderScore + seBonus + penalty;
      if (isFt) {
        totalScore += 5;
      }

      validFiles.push({
        folder,
        fileName,
        fingerprint: generateFingerprint(fileName),
        score: totalScore,
        isFt,
      });
    });
  });

  const bestFilesMap = {};
  validFiles.forEach((item) => {
    const fingerprint = item.fingerprint;
    if (!bestFilesMap[fingerprint] || item.score > bestFilesMap[fingerprint].score) {
      bestFilesMap[fingerprint] = item;
    }
  });

  const collisionFixes = [];
  Object.entries(bestFilesMap).forEach(([fingerprint, existingItem]) => {
    if (fingerprint.length > 3) {
      return;
    }

    const conflictingItem = validFiles.find(
      (candidate) =>
        candidate !== existingItem &&
        candidate.fingerprint === fingerprint &&
        candidate.isFt !== existingItem.isFt,
    );

    if (!conflictingItem) {
      return;
    }

    collisionFixes.push([
      fingerprint,
      `${existingItem.isFt ? 'ft' : 'main'}_${fingerprint}`,
      existingItem,
    ]);
    collisionFixes.push([
      null,
      `${conflictingItem.isFt ? 'ft' : 'main'}_${fingerprint}`,
      conflictingItem,
    ]);
  });

  collisionFixes.forEach(([oldKey, newKey, item]) => {
    if (oldKey && Object.prototype.hasOwnProperty.call(bestFilesMap, oldKey)) {
      delete bestFilesMap[oldKey];
    }
    if (!Object.prototype.hasOwnProperty.call(bestFilesMap, newKey)) {
      bestFilesMap[newKey] = item;
    }
  });

  return Object.values(bestFilesMap)
    .map((item) => {
      const folder = item.folder || 'root';
      const downloadUrl = urlMap.get(`${folder}/${item.fileName}`);
      if (!downloadUrl) {
        return null;
      }

      return {
        downloadUrl,
        outPath:
          folder === 'root'
            ? `${workCode}/${item.fileName}`
            : `${workCode}/${folder}/${item.fileName}`,
      };
    })
    .filter(Boolean);
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
}) {
  const { folderMap, urlMap } = buildFolderMaps(filesData);
  const tasks = optimizeAndDedupAudioTasks({
    workCode,
    folderMap,
    urlMap,
  });

  const overflowPaths = tasks
    .map((task) => path.join(downloadDir, ...task.outPath.split('/')))
    .filter((fullPath) => fullPath.length > maxPathLimit);

  return {
    tasks,
    overflowPaths,
  };
}
