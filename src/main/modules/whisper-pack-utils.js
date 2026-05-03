import fs from "fs";
import path from "path";

export const SUBTITLE_EXTENSIONS = new Set([
  ".srt",
  ".lrc",
  ".vtt",
  ".txt",
  ".ass",
]);

export const MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".wma",
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".flv",
  ".wmv",
]);

const normalizeRelativeStem = (relativePath) =>
  String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();

const getDisplayRelativePath = (item) =>
  String(
    item?.relativePath || item?.rel || item?.path || item?.fullPath || item?.full || "",
  ).replace(/\\/g, "/");

export async function collectPackFilesInDirectory({
  folderPath,
  basePath = folderPath,
  signal,
  ensureAbort,
} = {}) {
  const subtitleFiles = [];
  const audioFiles = [];
  let latestSubtitleMtimeMs = 0;

  const visit = async (currentPath) => {
    ensureAbort?.(signal);

    let entries = [];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      ensureAbort?.(signal);

      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const isSubtitle = SUBTITLE_EXTENSIONS.has(ext);
      const isAudio = MEDIA_EXTENSIONS.has(ext);
      if (!isSubtitle && !isAudio) {
        continue;
      }

      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }

      const record = {
        fullPath,
        relativePath: path.relative(basePath, fullPath),
      };

      if (isSubtitle) {
        latestSubtitleMtimeMs = Math.max(latestSubtitleMtimeMs, stat.mtimeMs || 0);
        subtitleFiles.push(record);
      }
      if (isAudio) {
        audioFiles.push(record);
      }
    }
  };

  await visit(folderPath);

  return {
    subtitleFiles,
    audioFiles,
    latestSubtitleMtimeMs,
  };
}

export function buildSubtitleCompletenessReport({
  audioFiles = [],
  subtitleFiles = [],
} = {}) {
  const audioStemSet = new Set(
    audioFiles.map((item) => normalizeRelativeStem(getDisplayRelativePath(item))),
  );
  const subtitleStemSet = new Set(
    subtitleFiles.map((item) => normalizeRelativeStem(getDisplayRelativePath(item))),
  );

  const missingSubtitleFiles = audioFiles
    .filter(
      (item) =>
        !subtitleStemSet.has(normalizeRelativeStem(getDisplayRelativePath(item))),
    )
    .map((item) => getDisplayRelativePath(item));

  const unmatchedSubtitleFiles = subtitleFiles
    .filter(
      (item) => !audioStemSet.has(normalizeRelativeStem(getDisplayRelativePath(item))),
    )
    .map((item) => getDisplayRelativePath(item));

  return {
    totalAudioCount: audioFiles.length,
    totalSubtitleCount: subtitleFiles.length,
    matchedAudioCount: audioFiles.length - missingSubtitleFiles.length,
    missingSubtitleFiles,
    unmatchedSubtitleFiles,
    isComplete: missingSubtitleFiles.length === 0,
    skippedAudioValidation: audioFiles.length === 0,
  };
}

export function formatSubtitleCompletenessMessage(report = {}) {
  const totalAudioCount = Number(report.totalAudioCount || 0);
  const missingSubtitleFiles = Array.isArray(report.missingSubtitleFiles)
    ? report.missingSubtitleFiles
    : [];

  if (totalAudioCount === 0) {
    return "未检测到音频文件，跳过音频-字幕完整性校验";
  }

  if (missingSubtitleFiles.length === 0) {
    return `音频与字幕已完整匹配，共 ${totalAudioCount} 个音频文件`;
  }

  const preview = missingSubtitleFiles.slice(0, 5).join("、");
  const suffix =
    missingSubtitleFiles.length > 5
      ? ` 等 ${missingSubtitleFiles.length} 个文件`
      : '';

  return `存在 ${missingSubtitleFiles.length} 个音频缺少对应字幕，已跳过打包: ${preview}${suffix}`;
}
