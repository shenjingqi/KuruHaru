import fs from "fs";
import path from "path";
import { normalizeError } from "../utils/errorHandler";

const SUPPORTED_SUBTITLE_FORMATS = new Set(["srt", "lrc"]);
const LAST_LRC_CUE_DURATION_MS = 3000;
const SRT_GAP_MS = 10;
const MIN_SRT_DURATION_MS = 500;

const normalizeText = (value) =>
  String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");

const clampMs = (value) => Math.max(0, Number(value) || 0);

const padNumber = (value, length = 2) => String(value).padStart(length, "0");

function parseFractionToMilliseconds(rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (!digits) {
    return 0;
  }

  if (digits.length === 1) {
    return Number(digits) * 100;
  }

  if (digits.length === 2) {
    return Number(digits) * 10;
  }

  return Number(digits.slice(0, 3));
}

function parseSrtTimestamp(rawValue) {
  const match = String(rawValue || "")
    .trim()
    .match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);

  if (!match) {
    return Number.NaN;
  }

  const [, hours, minutes, seconds, fraction] = match;
  return (
    Number(hours) * 3600000 +
    Number(minutes) * 60000 +
    Number(seconds) * 1000 +
    parseFractionToMilliseconds(fraction)
  );
}

function formatSrtTimestamp(rawMs) {
  const totalMs = clampMs(rawMs);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor(totalMs / 60000) % 60;
  const seconds = Math.floor(totalMs / 1000) % 60;
  const milliseconds = totalMs % 1000;

  return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)},${padNumber(milliseconds, 3)}`;
}

function parseLrcTimestamp(minutesRaw, secondsRaw, fractionRaw = "") {
  return (
    Number(minutesRaw) * 60000 +
    Number(secondsRaw) * 1000 +
    parseFractionToMilliseconds(fractionRaw)
  );
}

function formatLrcTimestamp(rawMs) {
  const totalCentiseconds = Math.round(clampMs(rawMs) / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor(totalCentiseconds / 100) % 60;
  const centiseconds = totalCentiseconds % 100;

  return `[${padNumber(minutes)}:${padNumber(seconds)}.${padNumber(centiseconds)}]`;
}

function buildLrcText(textLines = []) {
  return textLines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join(" ");
}

function buildSrtText(textLines = []) {
  return textLines
    .map((line) => String(line || "").trim())
    .join("\n")
    .trim();
}

export function detectSubtitleFormat(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".srt") {
    return "srt";
  }

  if (ext === ".lrc") {
    return "lrc";
  }

  return "";
}

export function parseSrtContent(rawContent) {
  const normalized = normalizeText(rawContent).trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trimEnd());
      if (!lines.length) {
        return null;
      }

      let cursor = 0;
      if (/^\d+$/.test(String(lines[0] || "").trim())) {
        cursor = 1;
      }

      const timeLine = String(lines[cursor] || "").trim();
      const timeMatch = timeLine.match(
        /^(\d{2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{1,3})/,
      );

      if (!timeMatch) {
        return null;
      }

      const startMs = parseSrtTimestamp(timeMatch[1]);
      const endMs = parseSrtTimestamp(timeMatch[2]);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return null;
      }

      return {
        startMs,
        endMs,
        textLines: lines.slice(cursor + 1),
      };
    })
    .filter(Boolean);
}

export function parseLrcContent(rawContent) {
  const normalized = normalizeText(rawContent);
  const lines = normalized.split("\n");
  const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  let offsetMs = 0;

  const cues = [];

  lines.forEach((line, lineIndex) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return;
    }

    const offsetMatch = trimmed.match(/^\[offset:([+-]?\d+)\]$/i);
    if (offsetMatch) {
      offsetMs = Number(offsetMatch[1]) || 0;
      return;
    }

    const timestamps = [...trimmed.matchAll(timestampPattern)];
    if (!timestamps.length) {
      return;
    }

    const text = trimmed.replace(timestampPattern, "").trim();

    timestamps.forEach((match) => {
      const startMs =
        parseLrcTimestamp(match[1], match[2], match[3]) + offsetMs;

      cues.push({
        startMs: clampMs(startMs),
        textLines: text ? [text] : [],
        lineIndex,
      });
    });
  });

  return cues.sort((left, right) => {
    if (left.startMs === right.startMs) {
      return left.lineIndex - right.lineIndex;
    }

    return left.startMs - right.startMs;
  });
}

export function convertSrtToLrcContent(rawContent) {
  const cues = parseSrtContent(rawContent);
  const lines = cues.map((cue) => {
    const text = buildLrcText(cue.textLines);
    return `${formatLrcTimestamp(cue.startMs)}${text}`;
  });

  return {
    cueCount: cues.length,
    content: lines.join("\n"),
  };
}

export function convertLrcToSrtContent(rawContent) {
  const cues = parseLrcContent(rawContent);
  const blocks = cues.map((cue, index) => {
    const nextCue = cues[index + 1];
    let endMs = cue.startMs + LAST_LRC_CUE_DURATION_MS;

    if (nextCue && nextCue.startMs > cue.startMs) {
      endMs = nextCue.startMs - SRT_GAP_MS;
    }

    if (endMs <= cue.startMs) {
      endMs = cue.startMs + MIN_SRT_DURATION_MS;
    }

    const text = buildSrtText(cue.textLines);
    return `${index + 1}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(endMs)}\n${text}`;
  });

  return {
    cueCount: cues.length,
    content: blocks.join("\n\n"),
  };
}

function buildSiblingOutputFile(sourceFilePath, targetFormat) {
  const parsedPath = path.parse(sourceFilePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.${targetFormat}`);
}

function ensureOutputFilePath(sourceFilePath, outputPath, targetFormat) {
  const normalizedOutputPath = String(outputPath || "").trim();
  if (!normalizedOutputPath) {
    return buildSiblingOutputFile(sourceFilePath, targetFormat);
  }

  if (
    fs.existsSync(normalizedOutputPath) &&
    fs.statSync(normalizedOutputPath).isDirectory()
  ) {
    return path.join(
      normalizedOutputPath,
      `${path.parse(sourceFilePath).name}.${targetFormat}`,
    );
  }

  const parsedPath = path.parse(normalizedOutputPath);
  return path.join(parsedPath.dir, `${parsedPath.name}.${targetFormat}`);
}

async function collectSubtitleFilesRecursively(rootPath, sourceFormat) {
  const matchedFiles = [];
  const expectedExtension = `.${sourceFormat}`;

  async function walk(currentPath) {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (path.extname(entry.name).toLowerCase() === expectedExtension) {
        matchedFiles.push(fullPath);
      }
    }
  }

  await walk(rootPath);
  return matchedFiles.sort((left, right) => left.localeCompare(right));
}

function transformSubtitleContent(rawContent, sourceFormat, targetFormat) {
  if (sourceFormat === "srt" && targetFormat === "lrc") {
    return convertSrtToLrcContent(rawContent);
  }

  if (sourceFormat === "lrc" && targetFormat === "srt") {
    return convertLrcToSrtContent(rawContent);
  }

  throw new Error(`不支持从 ${sourceFormat} 转换为 ${targetFormat}`);
}

async function convertSingleSubtitleFile({
  sourcePath,
  outputPath,
  sourceFormat,
  targetFormat,
}) {
  const rawContent = await fs.promises.readFile(sourcePath, "utf-8");
  const { cueCount, content } = transformSubtitleContent(
    rawContent,
    sourceFormat,
    targetFormat,
  );

  if (cueCount <= 0) {
    throw new Error("未解析到有效的字幕条目");
  }

  const finalOutputPath = ensureOutputFilePath(
    sourcePath,
    outputPath,
    targetFormat,
  );
  await fs.promises.mkdir(path.dirname(finalOutputPath), { recursive: true });
  await fs.promises.writeFile(finalOutputPath, content, "utf-8");

  return {
    cueCount,
    outputPath: finalOutputPath,
  };
}

async function convertDirectorySubtitles({
  sourcePath,
  outputPath,
  targetFormat,
}) {
  const sourceFormat = targetFormat === "srt" ? "lrc" : "srt";
  const finalOutputDir = String(outputPath || "").trim() || sourcePath;
  const sourceFiles = await collectSubtitleFilesRecursively(
    sourcePath,
    sourceFormat,
  );

  if (!sourceFiles.length) {
    return {
      success: false,
      msg: `目录中未找到可转换的 .${sourceFormat} 字幕文件`,
    };
  }

  const convertedFiles = [];
  const failedFiles = [];

  for (const sourceFile of sourceFiles) {
    const relativeFilePath = path.relative(sourcePath, sourceFile);
    const outputFilePath = path.join(
      finalOutputDir,
      path.dirname(relativeFilePath),
      `${path.parse(relativeFilePath).name}.${targetFormat}`,
    );

    try {
      await convertSingleSubtitleFile({
        sourcePath: sourceFile,
        outputPath: outputFilePath,
        sourceFormat,
        targetFormat,
      });

      convertedFiles.push(outputFilePath);
    } catch (error) {
      failedFiles.push({
        sourcePath: sourceFile,
        error: error?.message || String(error),
      });
    }
  }

  const convertedCount = convertedFiles.length;
  const failedCount = failedFiles.length;

  return {
    success: convertedCount > 0,
    mode: "directory",
    sourceFormat,
    targetFormat,
    outputPath: finalOutputDir,
    convertedCount,
    failedCount,
    convertedFiles,
    failedFiles,
    msg:
      failedCount > 0
        ? `已转换 ${convertedCount} 个字幕文件，失败 ${failedCount} 个`
        : `已转换 ${convertedCount} 个字幕文件`,
  };
}

export async function convertSubtitleFormatTask({
  sourcePath,
  outputPath,
  targetFormat,
} = {}) {
  const normalizedSourcePath = String(sourcePath || "").trim();
  const normalizedTargetFormat = String(targetFormat || "")
    .trim()
    .toLowerCase();

  if (!normalizedSourcePath) {
    return { success: false, msg: "源路径不能为空" };
  }

  if (!SUPPORTED_SUBTITLE_FORMATS.has(normalizedTargetFormat)) {
    return { success: false, msg: "目标格式仅支持 srt 或 lrc" };
  }

  if (!fs.existsSync(normalizedSourcePath)) {
    return { success: false, msg: "源路径不存在" };
  }

  try {
    const sourceStat = await fs.promises.stat(normalizedSourcePath);

    if (sourceStat.isDirectory()) {
      return convertDirectorySubtitles({
        sourcePath: normalizedSourcePath,
        outputPath,
        targetFormat: normalizedTargetFormat,
      });
    }

    if (!sourceStat.isFile()) {
      return { success: false, msg: "源路径必须是文件或目录" };
    }

    const sourceFormat = detectSubtitleFormat(normalizedSourcePath);
    if (!SUPPORTED_SUBTITLE_FORMATS.has(sourceFormat)) {
      return { success: false, msg: "仅支持 .srt 和 .lrc 字幕文件" };
    }

    if (sourceFormat === normalizedTargetFormat) {
      return { success: false, msg: "源文件已经是目标格式，无需转换" };
    }

    const result = await convertSingleSubtitleFile({
      sourcePath: normalizedSourcePath,
      outputPath,
      sourceFormat,
      targetFormat: normalizedTargetFormat,
    });

    return {
      success: true,
      mode: "file",
      sourceFormat,
      targetFormat: normalizedTargetFormat,
      outputPath: result.outputPath,
      convertedCount: 1,
      cueCount: result.cueCount,
      convertedFiles: [result.outputPath],
      msg: `已转换 1 个字幕文件，共 ${result.cueCount} 条字幕`,
    };
  } catch (error) {
    const normalized = normalizeError(error, {
      context: "字幕格式转换失败",
    });

    return {
      ...normalized,
      msg: normalized.message,
    };
  }
}
