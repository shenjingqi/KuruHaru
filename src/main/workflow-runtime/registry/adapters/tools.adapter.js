import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import archiver from "archiver";
import { scanForArchives } from "../../../utils/archive-scanner";
import { getConfig } from "../../../modules/config";
import { getAsmrClient } from "../../../modules/httpClient";
import { triggerCloudDataFetch } from "../../../modules/asmr-login";
import { loadRecentActivity } from "../../../modules/tg-recent-activity";
import { matchWorkIdsByRjCodesCaseInsensitive } from "../../../modules/asmr-core/rj-filter-utils";
import { normalizePeerEntityInput } from "../../../modules/tg-common-core/peer-entity";
import { requireConnectedTelegramClient } from "../../../utils/telegram-login";
import {
  commitPublishedContent,
  markDuplicateRecordsCleaned,
  releasePublishReservation,
  reservePublish,
} from "../../engine/publish-guardian";

const ensureAbort = (signal) => {
  if (signal?.aborted) {
    const error = new Error("任务已取消");
    error.code = "WORKFLOW_CANCELLED";
    throw error;
  }
};

const normalizeDirPath = (rawValue) =>
  typeof rawValue === "string" ? rawValue.trim() : "";

const WHISPER_NODE_TYPE = "whisper.translateSubtitles";
const WHISPER_PACK_NODE_TYPE = "whisper.packSubtitles";
const TG_UPLOAD_NODE_TYPE = "tg.uploadSubtitles";
const ASMR_CLOUD_DELETE_RECENT_NODE_TYPE = "asmr.cloudDeleteRecentUploads";
const FILES_LOCAL_DELETE_SCANNED_NODE_TYPE = "files.localDeleteScanned";
const ALLOWED_SUB_FORMATS = new Set(["lrc", "srt", "vtt"]);
const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z"];
const SUBTITLE_EXTENSIONS = new Set([".srt", ".lrc", ".vtt", ".txt", ".ass"]);
const CLOUD_DELETE_ENDPOINT =
  "https://api.asmr.one/api/playlist/remove-works-from-playlist";
const CLOUD_LIST_PAGE_SIZE = 100;

const collectRjCodesFromText = (rawText) => {
  const matches = String(rawText || "").match(/(RJ|VJ|BJ)\d{6,8}/gi) || [];
  return matches.map((item) => item.toUpperCase());
};

const extractFileNameCore = (fileName) =>
  fileName.replace(/\.(zip|rar|7z|tar|gz|mp4|mkv|avi|mov)$/i, "");

const scanFilesRecursively = async (dirPath, onFile, signal) => {
  ensureAbort(signal);
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    ensureAbort(signal);
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanFilesRecursively(fullPath, onFile, signal);
      continue;
    }
    await onFile(fullPath, entry.name);
  }
};

const buildScanArchiveResult = (results) => {
  const deduplicated = [];
  const seenPath = new Set();

  results.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const normalizedPath = String(item.path || "").toLowerCase();
    if (!normalizedPath || seenPath.has(normalizedPath)) {
      return;
    }

    seenPath.add(normalizedPath);
    deduplicated.push({
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : [],
    });
  });

  return deduplicated;
};

const emitNodeProgress = (emit, progress = {}) => {
  if (typeof emit !== "function") {
    return;
  }

  emit({
    progress: {
      currentRj: "",
      totalWorks: 0,
      completedWorks: 0,
      remainingWorks: 0,
      ...progress,
    },
  });
};

const emitNodeLog = (emit, message, progress) => {
  if (typeof emit !== "function") {
    return;
  }

  const payload = {};
  if (typeof message === "string" && message.trim()) {
    payload.message = message;
  }
  if (progress && typeof progress === "object") {
    payload.progress = progress;
  }
  if (!payload.message && !payload.progress) {
    return;
  }
  emit(payload);
};

const waitWithAbort = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (!ms || ms <= 0) {
      resolve();
      return;
    }

    ensureAbort(signal);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      const error = new Error("任务已取消");
      error.code = "WORKFLOW_CANCELLED";
      reject(error);
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const extractNumberPart = (rawCode = "") => {
  const match = String(rawCode || "").match(/\d+/);
  return match ? match[0] : "";
};

const resolveNodePrimaryInput = (inputValues, inputMap) => {
  if (Array.isArray(inputValues) && inputValues.length > 0) {
    return inputValues[0];
  }

  if (inputMap && typeof inputMap === "object") {
    const firstKey = Object.keys(inputMap)[0];
    if (firstKey) {
      return inputMap[firstKey];
    }
  }

  return undefined;
};

const findPathFromValue = (value, preferredKeys = []) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = findPathFromValue(item, preferredKeys);
      if (resolved) {
        return resolved;
      }
    }
    return "";
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  for (const key of preferredKeys) {
    const candidate =
      typeof value[key] === "string"
        ? value[key].trim()
        : String(value[key] || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  if (typeof value.path === "string" && value.path.trim()) {
    return value.path.trim();
  }

  return "";
};

const resolvePathFromConfigOrInput = ({
  configuredPath,
  inputValues,
  inputMap,
  preferredInputKeys = [],
}) => {
  const fromConfig = normalizeDirPath(configuredPath);
  if (fromConfig) {
    return fromConfig;
  }

  const nodeInput = resolveNodePrimaryInput(inputValues, inputMap);
  return findPathFromValue(nodeInput, preferredInputKeys);
};

const _deduplicateArchivesByPath = (archives = []) => {
  const seen = new Set();
  const deduplicated = [];

  archives.forEach((item) => {
    const normalizedPath = String(item?.path || "").toLowerCase();
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }
    seen.add(normalizedPath);
    deduplicated.push(item);
  });

  return deduplicated;
};

const normalizeSubFormats = (rawFormats) => {
  if (!Array.isArray(rawFormats)) {
    return ["lrc", "srt", "vtt"];
  }

  const normalized = rawFormats
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter((item) => ALLOWED_SUB_FORMATS.has(item));

  if (normalized.length === 0) {
    return ["srt"];
  }

  return [...new Set(normalized)];
};

const validateWhisperNodeConfig = (config = {}) => {
  const errors = [];
  const exePath = normalizeDirPath(config?.exePath);
  const targetPath = normalizeDirPath(config?.targetPath);
  const subFormats = normalizeSubFormats(config?.subFormats);

  if (!exePath) {
    errors.push("请填写引擎路径 exePath");
  } else if (!fs.existsSync(exePath)) {
    errors.push(`引擎路径不存在: ${exePath}`);
  }

  if (!targetPath) {
    errors.push("请填写媒体目录 targetPath");
  } else if (!fs.existsSync(targetPath)) {
    errors.push(`媒体目录不存在: ${targetPath}`);
  }

  if (!subFormats.length) {
    errors.push("请至少选择一种字幕格式");
  }

  return errors;
};

const MEDIA_FILE_EXTENSIONS = new Set([
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

const extractFirstWorkCode = (rawText) =>
  collectRjCodesFromText(rawText)[0] || "";

const resolveWorkFolderFromPath = (fullPath, rootPath, workCode) => {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedFullPath = path.resolve(fullPath);
  const relativePath = path.relative(normalizedRoot, normalizedFullPath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const matchedIndex = segments.findIndex((segment) =>
    segment.toUpperCase().includes(String(workCode || "").toUpperCase()),
  );

  if (matchedIndex >= 0) {
    return path.join(normalizedRoot, ...segments.slice(0, matchedIndex + 1));
  }

  return path.dirname(normalizedFullPath);
};

const collectTranslateWorkStats = async (targetPath, signal) => {
  const pendingDirs = [targetPath];
  const workFileCountMap = new Map();
  const workDirMap = new Map();

  while (pendingDirs.length > 0) {
    ensureAbort(signal);
    const dirPath = pendingDirs.pop();
    if (!dirPath) {
      continue;
    }

    let entries = [];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      ensureAbort(signal);
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!MEDIA_FILE_EXTENSIONS.has(ext)) {
        continue;
      }

      const workCode = extractFirstWorkCode(fullPath);
      if (!workCode) {
        continue;
      }

      workFileCountMap.set(workCode, (workFileCountMap.get(workCode) || 0) + 1);
      if (!workDirMap.has(workCode)) {
        workDirMap.set(
          workCode,
          resolveWorkFolderFromPath(fullPath, targetPath, workCode),
        );
      }
    }
  }

  return {
    workFileCountMap,
    workDirMap,
    totalWorks: workFileCountMap.size,
  };
};

const buildWhisperProgress = ({
  currentRj = "",
  totalWorks = 0,
  completedWorks = 0,
  processedFiles = 0,
  totalFiles = 0,
}) => ({
  currentRj,
  totalWorks,
  completedWorks,
  remainingWorks: Math.max(totalWorks - completedWorks, 0),
  processedFiles,
  totalFiles,
});

const emitWhisperLine = (emit, line, progress) => {
  if (typeof emit !== "function") {
    return;
  }

  const payload = {};
  if (typeof line === "string" && line.trim()) {
    payload.message = line;
  }
  if (progress && typeof progress === "object") {
    payload.progress = progress;
  }
  if (!payload.message && !payload.progress) {
    return;
  }
  emit(payload);
};

const executeWhisperTranslateNode = async ({
  config,
  signal,
  emit,
  emitItem,
}) => {
  const configErrors = validateWhisperNodeConfig(config);
  if (configErrors.length > 0) {
    throw new Error(configErrors.join("；"));
  }

  const exePath = normalizeDirPath(config?.exePath);
  const targetPath = normalizeDirPath(config?.targetPath);
  const subFormats = normalizeSubFormats(config?.subFormats);
  const formats = subFormats.join(",");
  const stats = await collectTranslateWorkStats(targetPath, signal);
  const knownWorkCodes = new Set(stats.workFileCountMap.keys());
  const processedByWorkCode = new Map();
  const completedWorkCodes = new Set();
  let currentRj = "";
  let processedFiles = 0;
  let totalFiles = 0;
  let lastProgressIndex = 0;
  const emittedWorkCodes = new Set();

  const emitProgressLog = (line) => {
    emitWhisperLine(
      emit,
      line,
      buildWhisperProgress({
        currentRj,
        totalWorks: knownWorkCodes.size,
        completedWorks: completedWorkCodes.size,
        processedFiles,
        totalFiles,
      }),
    );
  };

  const whisperArgs = [
    "--audio_suffixes=mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv",
    `--sub_formats=${formats}`,
    "--device=cuda",
    targetPath,
  ];
  emitProgressLog(`Start subtitle translation: ${targetPath}`);
  emitProgressLog(`Subtitle formats: ${formats}`);
  emitProgressLog(`Estimated works: ${knownWorkCodes.size}`);
  emitProgressLog(`Executable: ${exePath}`);

  const startedAt = Date.now();

  await new Promise((resolve, reject) => {
    ensureAbort(signal);
    const child = spawn(exePath, whisperArgs, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;

    const onAbort = () => {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
          windowsHide: true,
        });
      } catch {
        // 忽略终止异常
      }
      const error = new Error("任务已取消");
      error.code = "WORKFLOW_CANCELLED";
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    let stderrBuffer = "";
    let itemDispatchQueue = Promise.resolve();

    const enqueueWorkItem = (workCode) => {
      if (
        typeof emitItem !== "function" ||
        !workCode ||
        emittedWorkCodes.has(workCode)
      ) {
        return;
      }

      emittedWorkCodes.add(workCode);
      const workPath = stats.workDirMap.get(workCode) || targetPath;
      const progress = buildWhisperProgress({
        currentRj: workCode,
        totalWorks: knownWorkCodes.size,
        completedWorks: completedWorkCodes.size,
        processedFiles,
        totalFiles,
      });

      itemDispatchQueue = itemDispatchQueue.then(() =>
        emitItem({
          success: true,
          code: workCode,
          currentRj: workCode,
          targetPath: workPath,
          workPath,
          rootTargetPath: targetPath,
          subFormats,
          progress,
        }),
      );
    };

    const flushLines = (chunk, cacheRef, isError = false) => {
      const next = `${cacheRef.value}${chunk.toString("utf-8")}`;
      const lines = next.split(/\r?\n/);
      cacheRef.value = lines.pop() || "";
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const detectedWorkCode = extractFirstWorkCode(line);
          if (detectedWorkCode) {
            currentRj = detectedWorkCode;
            knownWorkCodes.add(detectedWorkCode);
          }

          const progressMatch = line.match(
            /正在翻译[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/,
          );
          if (progressMatch) {
            const currentIndex = Number.parseInt(progressMatch[1], 10);
            const totalCount = Number.parseInt(progressMatch[2], 10);

            if (Number.isFinite(totalCount) && totalCount > 0) {
              totalFiles = totalCount;
            }

            if (
              Number.isFinite(currentIndex) &&
              currentIndex > 0 &&
              currentIndex > lastProgressIndex
            ) {
              const delta = currentIndex - lastProgressIndex;
              lastProgressIndex = currentIndex;
              processedFiles = currentIndex;

              if (currentRj) {
                const next = (processedByWorkCode.get(currentRj) || 0) + delta;
                processedByWorkCode.set(currentRj, next);
                const totalInWork = stats.workFileCountMap.get(currentRj) || 0;
                if (totalInWork > 0 && next >= totalInWork) {
                  completedWorkCodes.add(currentRj);
                  enqueueWorkItem(currentRj);
                }
              }
            }
          }

          emitProgressLog(line);
          if (isError) {
            stderrBuffer += `${line}\n`;
          }
        });
    };

    const stdoutCache = { value: "" };
    const stderrCache = { value: "" };

    child.stdout?.on("data", (chunk) => flushLines(chunk, stdoutCache));
    child.stderr?.on("data", (chunk) => flushLines(chunk, stderrCache, true));

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      if (code === 0 || code === null) {
        completedWorkCodes.clear();
        knownWorkCodes.forEach((workCode) => {
          completedWorkCodes.add(workCode);
        });
        emitProgressLog("字幕翻译完成");
        resolve();
        return;
      }

      const error = new Error(
        stderrBuffer.trim()
          ? `翻译进程退出异常(code=${code}): ${stderrBuffer.split("\n").slice(0, 4).join(" ")}`
          : `翻译进程退出异常(code=${code})`,
      );
      error.code = "WHISPER_PROCESS_EXIT";
      reject(error);
    });
  });

  return {
    success: true,
    targetPath,
    subFormats,
    totalWorks: knownWorkCodes.size,
    completedWorks: knownWorkCodes.size,
    durationMs: Date.now() - startedAt,
    items: [...knownWorkCodes].map((workCode) => ({
      success: true,
      code: workCode,
      currentRj: workCode,
      targetPath: stats.workDirMap.get(workCode) || targetPath,
      workPath: stats.workDirMap.get(workCode) || targetPath,
      rootTargetPath: targetPath,
      subFormats,
    })),
  };
};

const resolveArchiveRecordPath = (item) => {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  const candidateKeys = [
    "path",
    "outputPath",
    "fullPath",
    "filePath",
    "archivePath",
  ];
  for (const key of candidateKeys) {
    if (typeof item[key] === "string" && item[key].trim()) {
      return item[key].trim();
    }
  }

  return "";
};

const normalizeArchiveRecords = (records = []) => {
  const deduplicated = [];
  const seen = new Set();

  records.forEach((item) => {
    const archivePath = resolveArchiveRecordPath(item);
    if (!archivePath) {
      return;
    }

    const normalizedPath = archivePath.toLowerCase();
    if (seen.has(normalizedPath) || !fs.existsSync(archivePath)) {
      return;
    }

    const ext = path.extname(archivePath).toLowerCase();
    if (!ARCHIVE_EXTENSIONS.includes(ext)) {
      return;
    }

    seen.add(normalizedPath);
    deduplicated.push({
      code:
        typeof item?.code === "string" && item.code.trim()
          ? item.code.trim().toUpperCase()
          : extractFirstWorkCode(archivePath),
      path: archivePath,
      name: path.basename(archivePath),
    });
  });

  return deduplicated;
};

const collectArchiveRecordsFromInput = (rawInput) => {
  const candidates = [];

  const visit = (value, depth = 0) => {
    if (depth > 4 || value === null || value === undefined) {
      return;
    }

    if (typeof value === "string") {
      candidates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    candidates.push(value);

    const arrayKeys = [
      "files",
      "archives",
      "results",
      "outputPaths",
      "uploadedFiles",
      "createdArchives",
    ];

    arrayKeys.forEach((key) => {
      if (Array.isArray(value[key])) {
        value[key].forEach((item) => visit(item, depth + 1));
      }
    });

    if (typeof value.outputPath === "string") {
      candidates.push(value.outputPath);
    }
  };

  visit(rawInput, 0);
  return normalizeArchiveRecords(candidates);
};

const collectSubtitleFilesInDirectory = async ({
  folderPath,
  basePath,
  signal,
}) => {
  const subtitleFiles = [];
  let latestMtimeMs = 0;

  await scanFilesRecursively(
    folderPath,
    async (fullPath, fileName) => {
      ensureAbort(signal);
      const ext = path.extname(fileName).toLowerCase();
      if (!SUBTITLE_EXTENSIONS.has(ext)) {
        return;
      }

      let stat;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        return;
      }

      latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs || 0);
      subtitleFiles.push({
        fullPath,
        relativePath: path.relative(basePath, fullPath),
      });
    },
    signal,
  );

  return {
    subtitleFiles,
    latestMtimeMs,
  };
};

const createCancelledError = () => {
  const error = new Error("Task cancelled");
  error.code = "WORKFLOW_CANCELLED";
  return error;
};

const packSubtitleFolderToZip = async ({
  folderPath,
  rjCode,
  outputDir,
  signal,
  emit,
}) => {
  ensureAbort(signal);

  const outputFileName = `${rjCode}.zip`;
  const outputPath = path.join(outputDir, outputFileName);
  const { subtitleFiles, latestMtimeMs } =
    await collectSubtitleFilesInDirectory({
      folderPath,
      basePath: folderPath,
      signal,
    });

  if (!subtitleFiles.length) {
    return {
      success: false,
      skipped: false,
      reason: "no-subtitles",
      rjCode,
      outputPath,
      fileCount: 0,
      msg: "No subtitle files",
    };
  }

  await fs.promises.mkdir(outputDir, { recursive: true });

  try {
    const zipStat = await fs.promises.stat(outputPath);
    if (latestMtimeMs > 0 && zipStat.mtimeMs >= latestMtimeMs) {
      return {
        success: true,
        skipped: true,
        rjCode,
        outputPath,
        fileCount: subtitleFiles.length,
        msg: "Skipped (already up-to-date)",
      };
    }

    await fs.promises.unlink(outputPath);
  } catch {
    // Continue when previous zip does not exist or cannot be read.
  }

  emitNodeLog(emit, `Start packing ${rjCode}, files ${subtitleFiles.length}`);

  return await new Promise((resolve, reject) => {
    let settled = false;
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    const settleResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onAbort = () => {
      try {
        archive.abort();
      } catch {
        // Ignore abort error.
      }
      try {
        output.destroy();
      } catch {
        // Ignore stream destroy error.
      }
      settleReject(createCancelledError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    output.on("close", () => {
      settleResolve({
        success: true,
        skipped: false,
        rjCode,
        outputPath,
        fileCount: subtitleFiles.length,
        msg: `Packed ${subtitleFiles.length} subtitle files`,
      });
    });

    output.on("error", (error) => {
      settleReject(error);
    });

    archive.on("warning", (error) => {
      if (error?.code !== "ENOENT") {
        emitNodeLog(emit, `Pack warning(${rjCode}): ${error.message || error}`);
      }
    });

    archive.on("error", (error) => {
      settleReject(error);
    });

    archive.pipe(output);
    subtitleFiles.forEach((item) => {
      archive.file(item.fullPath, { name: item.relativePath });
    });
    archive.finalize();
  });
};

const executeWhisperPackSubtitlesNode = async ({
  config,
  inputValues,
  inputMap,
  signal,
  emit,
}) => {
  const targetPath = resolvePathFromConfigOrInput({
    configuredPath: config?.targetPath || config?.path,
    inputValues,
    inputMap,
    preferredInputKeys: ["targetPath", "path", "scanPath"],
  });

  if (!targetPath) {
    throw new Error("whisper.packSubtitles missing targetPath");
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Source directory not found: ${targetPath}`);
  }

  const outputDir = normalizeDirPath(config?.outputDir) || targetPath;
  const pathMatch = targetPath.match(/(RJ|VJ|BJ)\d{6,8}/i);
  const results = [];
  let totalPacked = 0;
  let totalSkipped = 0;

  emitNodeLog(emit, `Scanning pack target: ${targetPath}`);

  if (pathMatch) {
    const rjCode = pathMatch[0].toUpperCase();
    const singleResult = await packSubtitleFolderToZip({
      folderPath: targetPath,
      rjCode,
      outputDir,
      signal,
      emit,
    });

    results.push(singleResult);
    if (singleResult.success && singleResult.skipped) {
      totalSkipped += 1;
    } else if (singleResult.success) {
      totalPacked += 1;
    }
  } else {
    const entries = await fs.promises.readdir(targetPath, {
      withFileTypes: true,
    });
    const folders = entries.filter((entry) => entry.isDirectory());
    for (const folder of folders) {
      ensureAbort(signal);
      const folderMatch = folder.name.match(/(RJ|VJ|BJ)\d{6,8}/i);
      if (!folderMatch) {
        continue;
      }

      const folderPath = path.join(targetPath, folder.name);
      const rjCode = folderMatch[0].toUpperCase();
      const result = await packSubtitleFolderToZip({
        folderPath,
        rjCode,
        outputDir,
        signal,
        emit,
      });

      results.push(result);
      if (result.success && result.skipped) {
        totalSkipped += 1;
      } else if (result.success) {
        totalPacked += 1;
      }

      emitNodeProgress(emit, {
        totalWorks: folders.length,
        completedWorks: totalPacked + totalSkipped,
        remainingWorks: Math.max(
          folders.length - totalPacked - totalSkipped,
          0,
        ),
        currentRj: rjCode,
      });
    }
  }

  const successfulCount = results.filter((item) => item.success).length;
  if (!results.length || successfulCount === 0) {
    throw new Error("No packable subtitle folders found");
  }

  const summary = `Pack finished: success ${totalPacked}, skipped ${totalSkipped}`;
  emitNodeLog(emit, summary);

  return {
    success: true,
    msg: summary,
    targetPath,
    outputDir,
    totalPacked,
    totalSkipped,
    results,
    outputPaths: results
      .filter((item) => item.success)
      .map((item) => item.outputPath)
      .filter(Boolean),
  };
};

const buildUploadIdempotencyKey = async ({
  channelId,
  archivePath,
  archiveCode,
}) => {
  const normalizedChannel = String(channelId || "").trim();
  const normalizedPath = String(archivePath || "").trim();
  const normalizedCode = String(archiveCode || "")
    .trim()
    .toUpperCase();

  if (!normalizedChannel || !normalizedPath) {
    return "";
  }

  let stat = null;
  try {
    stat = await fs.promises.stat(normalizedPath);
  } catch {
    // ???????????????????????
  }

  const hash = crypto.createHash("sha1");
  hash.update(normalizedChannel.toLowerCase());
  hash.update("|");
  hash.update(path.basename(normalizedPath).toLowerCase());
  hash.update("|");
  hash.update(normalizedCode);
  hash.update("|");
  hash.update(String(stat?.size || 0));
  hash.update("|");
  hash.update(String(Math.round(stat?.mtimeMs || 0)));

  return `tg-upload:${hash.digest("hex")}`;
};

const extractTelegramMessageId = (rawMessage) => {
  if (typeof rawMessage === "number" && Number.isFinite(rawMessage)) {
    return rawMessage;
  }

  if (rawMessage && typeof rawMessage === "object") {
    if (typeof rawMessage.id === "number" && Number.isFinite(rawMessage.id)) {
      return rawMessage.id;
    }

    if (Array.isArray(rawMessage) && rawMessage.length > 0) {
      return extractTelegramMessageId(rawMessage[0]);
    }

    if (rawMessage.message && typeof rawMessage.message === "object") {
      return extractTelegramMessageId(rawMessage.message);
    }
  }

  return null;
};

const cleanupDuplicateUploadRecords = async ({
  duplicates,
  telegramClient,
  peerEntity,
  emit,
}) => {
  if (!Array.isArray(duplicates) || duplicates.length === 0) {
    return {
      deletedMessages: 0,
      cleanedRecords: 0,
      failedDeletes: 0,
    };
  }

  const cleanedRecordIds = [];
  let deletedMessages = 0;
  let failedDeletes = 0;

  for (const duplicate of duplicates) {
    const messageRef = duplicate?.messageRef || {};
    const candidateIds = [
      Number.parseInt(messageRef.fileMessageId, 10),
      Number.parseInt(messageRef.titleMessageId, 10),
    ].filter((id) => Number.isFinite(id) && id > 0);

    if (!candidateIds.length) {
      cleanedRecordIds.push(duplicate.recordId);
      continue;
    }

    for (const messageId of candidateIds) {
      try {
        await telegramClient.deleteMessages(peerEntity, [messageId], {
          revoke: true,
        });
        deletedMessages += 1;
      } catch (error) {
        failedDeletes += 1;
        emitNodeLog(
          emit,
          `Duplicate cleanup delete failed message=${messageId}: ${error?.message || error}`,
        );
      }
    }

    cleanedRecordIds.push(duplicate.recordId);
  }

  if (cleanedRecordIds.length > 0) {
    await markDuplicateRecordsCleaned({
      recordIds: cleanedRecordIds,
      reason: "telegram-duplicate-cleanup",
    });
  }

  return {
    deletedMessages,
    cleanedRecords: cleanedRecordIds.length,
    failedDeletes,
  };
};

const normalizeInteger = (
  value,
  fallback,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const executeTgUploadSubtitlesNode = async ({
  config,
  inputValues,
  inputMap,
  signal,
  emit,
  context = {},
}) => {
  const nodeInput = resolveNodePrimaryInput(inputValues, inputMap);
  let archives = collectArchiveRecordsFromInput(nodeInput);

  const scanPath = resolvePathFromConfigOrInput({
    configuredPath: config?.scanPath || config?.path,
    inputValues,
    inputMap,
    preferredInputKeys: ["scanPath", "path", "targetPath"],
  });

  if (!archives.length) {
    if (!scanPath) {
      throw new Error(
        "tg.uploadSubtitles missing scanPath and no upstream files",
      );
    }

    if (!fs.existsSync(scanPath)) {
      throw new Error(`Scan directory not found: ${scanPath}`);
    }

    emitNodeLog(emit, `Upload node scanning archives: ${scanPath}`);
    const scanResults = [];
    scanForArchives(scanPath, scanResults);
    ensureAbort(signal);
    archives = normalizeArchiveRecords(buildScanArchiveResult(scanResults));
  }

  const failOnEmpty = config?.failOnEmpty !== false;
  if (!archives.length) {
    const emptyMessage = "No archives found for upload";
    if (failOnEmpty) {
      throw new Error(emptyMessage);
    }

    emitNodeLog(emit, emptyMessage);
    return {
      success: true,
      scannedCount: 0,
      uploadedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      uploadedFiles: [],
      skippedFiles: [],
      failedFiles: [],
      channelId: "",
      duplicateCleanup: [],
    };
  }

  const appConfig = getConfig();
  const fallbackChannelId =
    typeof appConfig?.upload?.channelId === "string"
      ? appConfig.upload.channelId.trim()
      : "";
  const channelId =
    typeof config?.channelId === "string" && config.channelId.trim()
      ? config.channelId.trim()
      : fallbackChannelId;

  if (!channelId) {
    throw new Error(
      "tg.uploadSubtitles missing channelId and no default channel",
    );
  }

  const titleDelayMs = normalizeInteger(config?.titleDelayMs, 3500, 0, 120000);
  const betweenDelayMs = normalizeInteger(
    config?.betweenDelayMs,
    1000,
    0,
    120000,
  );
  const failFast = config?.failFast === true;
  const guardianEnabled = config?.guardianEnabled !== false;
  const autoCleanupDuplicates = config?.autoCleanupDuplicates !== false;
  const guardianTtlMs = normalizeInteger(
    config?.guardianTtlMs,
    20 * 60 * 1000,
    30 * 1000,
    24 * 60 * 60 * 1000,
  );

  const peerEntity = normalizePeerEntityInput(channelId);
  const telegramClient = await requireConnectedTelegramClient();

  emitNodeLog(
    emit,
    `Start uploading ${archives.length} files to channel ${channelId}`,
  );
  if (guardianEnabled) {
    emitNodeLog(emit, "Publish guardian enabled (dedupe + duplicate cleanup)");
  }

  const uploadedFiles = [];
  const skippedFiles = [];
  const failedFiles = [];
  const duplicateCleanup = [];

  for (let index = 0; index < archives.length; index += 1) {
    ensureAbort(signal);

    const archive = archives[index];
    const fileName = path.basename(archive.path);
    const title = extractFileNameCore(fileName);

    emitNodeProgress(emit, {
      totalWorks: archives.length,
      completedWorks:
        uploadedFiles.length + skippedFiles.length + failedFiles.length,
      remainingWorks: Math.max(
        archives.length -
          uploadedFiles.length -
          skippedFiles.length -
          failedFiles.length,
        0,
      ),
      currentRj: archive.code || extractFirstWorkCode(fileName),
    });

    let reservationId = "";
    let idempotencyKey = "";

    if (guardianEnabled) {
      idempotencyKey = await buildUploadIdempotencyKey({
        channelId,
        archivePath: archive.path,
        archiveCode: archive.code,
      });

      if (idempotencyKey) {
        const reserveResult = await reservePublish({
          idempotencyKey,
          workflowId: context?.workflowId,
          runId: context?.runId,
          nodeId: context?.nodeId,
          ttlMs: guardianTtlMs,
          metadata: {
            channelId,
            fileName,
            archivePath: archive.path,
            archiveCode: archive.code || "",
          },
        });

        if (!reserveResult?.accepted) {
          const reserveReason = reserveResult?.reason || "UNKNOWN";
          if (reserveReason === "DUPLICATE" || reserveReason === "RESERVED") {
            skippedFiles.push({
              code: archive.code || extractFirstWorkCode(fileName),
              path: archive.path,
              name: fileName,
              reason: reserveReason.toLowerCase(),
              idempotencyKey,
            });
            emitNodeLog(
              emit,
              `Skip duplicate publish: ${fileName} (reason=${reserveReason.toLowerCase()})`,
            );
            continue;
          }

          emitNodeLog(
            emit,
            `Guardian reserve fallback for ${fileName}, reason=${reserveReason}`,
          );
        } else {
          reservationId = reserveResult.reservationId || "";
        }
      }
    }

    try {
      emitNodeLog(emit, `Send title message: ${title}`);
      const titleMessage = await telegramClient.sendMessage(peerEntity, {
        message: title,
      });

      await waitWithAbort(titleDelayMs, signal);

      let lastPercent = -1;
      emitNodeLog(
        emit,
        `Uploading file (${index + 1}/${archives.length}): ${fileName}`,
      );

      const uploadedMessage = await telegramClient.sendFile(peerEntity, {
        file: archive.path,
        forceDocument: true,
        commentTo: titleMessage?.id,
        progressCallback: (progress) => {
          if (signal?.aborted) {
            throw createCancelledError();
          }

          const percent = Math.round(Number(progress || 0) * 100);
          if (percent >= 100 || percent - lastPercent >= 25) {
            lastPercent = percent;
            emitNodeLog(emit, `${fileName}: ${percent}%`);
          }
        },
      });

      const titleMessageId = extractTelegramMessageId(titleMessage);
      const fileMessageId = extractTelegramMessageId(uploadedMessage);

      uploadedFiles.push({
        code: archive.code || extractFirstWorkCode(fileName),
        path: archive.path,
        name: fileName,
        idempotencyKey,
        titleMessageId,
        fileMessageId,
      });

      if (guardianEnabled && reservationId && idempotencyKey) {
        const commitResult = await commitPublishedContent({
          reservationId,
          idempotencyKey,
          workflowId: context?.workflowId,
          runId: context?.runId,
          nodeId: context?.nodeId,
          messageRef: {
            channelId,
            titleMessageId,
            fileMessageId,
          },
          metadata: {
            channelId,
            fileName,
            archivePath: archive.path,
            archiveCode: archive.code || "",
          },
        });

        if (autoCleanupDuplicates && Array.isArray(commitResult?.duplicates)) {
          const duplicates = commitResult.duplicates;
          if (duplicates.length > 0) {
            const cleanupResult = await cleanupDuplicateUploadRecords({
              duplicates,
              telegramClient,
              peerEntity,
              emit,
            });
            duplicateCleanup.push({
              idempotencyKey,
              duplicateCount: duplicates.length,
              ...cleanupResult,
            });
            emitNodeLog(
              emit,
              `Guardian cleanup: key=${idempotencyKey}, duplicate=${duplicates.length}, deleted=${cleanupResult.deletedMessages}, failed=${cleanupResult.failedDeletes}`,
            );
          }
        }
      }

      emitNodeLog(emit, `Upload success: ${fileName}`);
    } catch (error) {
      if (error?.code === "WORKFLOW_CANCELLED") {
        throw error;
      }

      if (guardianEnabled && reservationId) {
        await releasePublishReservation({ reservationId });
      }

      const normalizedError =
        error?.message || String(error || "Upload failed");
      failedFiles.push({
        code: archive.code || extractFirstWorkCode(fileName),
        path: archive.path,
        name: fileName,
        error: normalizedError,
      });

      emitNodeLog(emit, `Upload failed: ${fileName} - ${normalizedError}`);

      if (failFast) {
        throw new Error(`Upload aborted: ${fileName} - ${normalizedError}`);
      }
    }

    if (index < archives.length - 1) {
      await waitWithAbort(betweenDelayMs, signal);
    }
  }

  emitNodeLog(
    emit,
    `Upload finished: success ${uploadedFiles.length}, skipped ${skippedFiles.length}, failed ${failedFiles.length}`,
  );

  return {
    success: failedFiles.length === 0,
    channelId,
    scannedCount: archives.length,
    uploadedCount: uploadedFiles.length,
    skippedCount: skippedFiles.length,
    failedCount: failedFiles.length,
    uploadedFiles,
    skippedFiles,
    failedFiles,
    duplicateCleanup,
  };
};

const collectRjCodesFromUnknownValue = (rawValue, maxCount = 5000) => {
  const resultSet = new Set();

  const visit = (value, depth = 0) => {
    if (depth > 5 || resultSet.size >= maxCount) {
      return;
    }

    if (typeof value === "string") {
      collectRjCodesFromText(value).forEach((code) => {
        if (resultSet.size < maxCount) {
          resultSet.add(code);
        }
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    Object.values(value).forEach((item) => visit(item, depth + 1));
  };

  visit(rawValue, 0);
  return [...resultSet];
};

const collectRecentActivityRjCodes = (recentLimit) => {
  const cfg = getConfig();
  const recentResult = loadRecentActivity(cfg?.paths?.uploadHistoryDir);
  if (!recentResult?.success || !Array.isArray(recentResult?.data?.files)) {
    return [];
  }

  const files = recentResult.data.files;
  const sliced =
    recentLimit > 0 && files.length > recentLimit
      ? files.slice(-recentLimit)
      : files;

  const codes = [];
  sliced.forEach((fileItem) => {
    [
      fileItem?.rjCode,
      fileItem?.id,
      fileItem?.name,
      fileItem?.fileName,
      fileItem?.path,
    ].forEach((candidate) => {
      codes.push(...collectRjCodesFromText(candidate));
    });
  });

  return [...new Set(codes)];
};

const extractCloudWorksFromPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.works)) {
    return payload.works;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.list)) {
    return payload.list;
  }

  return [];
};

const fetchCloudWorksByPlaylist = async ({
  asmrClient,
  playlistId,
  headers,
  signal,
  emit,
  pageSize = CLOUD_LIST_PAGE_SIZE,
}) => {
  const allWorks = [];
  let page = 1;

  while (page <= 500) {
    ensureAbort(signal);

    const url =
      `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}` +
      `&page=${page}&pageSize=${pageSize}`;

    const response = await asmrClient.get(url, {
      headers,
      timeout: 30000,
    });

    const works = extractCloudWorksFromPayload(response?.data);
    emitNodeLog(emit, `Cloud list page ${page}: ${works.length} items`);

    if (works.length === 0) {
      break;
    }

    allWorks.push(...works);

    if (works.length < pageSize) {
      break;
    }

    page += 1;
  }

  return allWorks;
};

const resolveMatchedWorkIds = (allWorks = [], rjCodes = []) => {
  const baseMatch = matchWorkIdsByRjCodesCaseInsensitive(allWorks, rjCodes);
  const matchedWorkIds = new Set(
    Array.isArray(baseMatch?.matchedWorkIds)
      ? baseMatch.matchedWorkIds.map(String)
      : [],
  );

  const numberMap = new Map();
  allWorks.forEach((work) => {
    const workId = String(work?.id || "");
    if (!workId) {
      return;
    }

    const numberPart = extractNumberPart(work?.source_id || work?.id);
    if (numberPart && !numberMap.has(numberPart)) {
      numberMap.set(numberPart, workId);
    }
  });

  const notFound = [];
  rjCodes.forEach((code) => {
    const numericPart = extractNumberPart(code);
    const matchedByNumber = numericPart ? numberMap.get(numericPart) : "";
    if (matchedByNumber) {
      matchedWorkIds.add(matchedByNumber);
      return;
    }

    const foundByExact = allWorks.some((work) => {
      const sourceId = String(work?.source_id || "").toUpperCase();
      return sourceId === String(code).toUpperCase();
    });
    if (!foundByExact) {
      notFound.push(code);
    }
  });

  return {
    matchedWorkIds: [...matchedWorkIds],
    notFound,
  };
};

const executeCloudDeleteRecentUploadsNode = async ({
  config,
  inputValues,
  inputMap,
  signal,
  emit,
}) => {
  const appConfig = getConfig();
  const token = appConfig?.asmr?.token;
  const playlistId = appConfig?.asmr?.playlistId;

  if (!token || !playlistId) {
    throw new Error("ASMR login or playlist is missing");
  }

  const refreshCloudFirst = config?.refreshCloudFirst !== false;
  if (refreshCloudFirst) {
    try {
      emitNodeLog(emit, "Refreshing cloud cache...");
      await triggerCloudDataFetch();
      emitNodeLog(emit, "Cloud cache refreshed");
    } catch (error) {
      emitNodeLog(
        emit,
        `Cloud cache refresh failed, continue: ${error?.message || error}`,
      );
    }
  }

  const recentLimit = normalizeInteger(config?.recentLimit, 30, 1, 5000);
  const batchSize = normalizeInteger(config?.batchSize, 50, 1, 100);
  const requestDelayMs = normalizeInteger(
    config?.requestDelayMs,
    1000,
    0,
    10000,
  );
  const failOnNoMatch = config?.failOnNoMatch === true;

  const upstreamCodes = collectRjCodesFromUnknownValue(
    resolveNodePrimaryInput(inputValues, inputMap),
  );
  const recentCodes = collectRecentActivityRjCodes(recentLimit);
  let rjCodes = upstreamCodes.length > 0 ? upstreamCodes : recentCodes;

  if (recentLimit > 0 && rjCodes.length > recentLimit) {
    rjCodes = rjCodes.slice(-recentLimit);
  }

  rjCodes = [
    ...new Set(
      rjCodes.map((code) => String(code || "").toUpperCase()).filter(Boolean),
    ),
  ];

  if (!rjCodes.length) {
    const message = "No recent RJ codes found for cloud delete";
    if (failOnNoMatch) {
      throw new Error(message);
    }

    emitNodeLog(emit, message);
    return {
      success: true,
      deletedCount: 0,
      failedCount: 0,
      matchedCount: 0,
      requestedCodes: [],
      notFound: [],
    };
  }

  emitNodeLog(emit, `Prepare cloud delete for ${rjCodes.length} codes`);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const asmrClient = getAsmrClient();
  const cloudWorks = await fetchCloudWorksByPlaylist({
    asmrClient,
    playlistId,
    headers,
    signal,
    emit,
  });

  if (!cloudWorks.length) {
    throw new Error("Cloud works list is empty, cannot delete");
  }

  const { matchedWorkIds, notFound } = resolveMatchedWorkIds(
    cloudWorks,
    rjCodes,
  );

  if (!matchedWorkIds.length) {
    const noMatchMessage = "No matched cloud works for recent upload codes";
    if (failOnNoMatch) {
      throw new Error(noMatchMessage);
    }

    emitNodeLog(emit, noMatchMessage);
    return {
      success: true,
      deletedCount: 0,
      failedCount: 0,
      matchedCount: 0,
      requestedCodes: rjCodes,
      notFound,
    };
  }

  let deletedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < matchedWorkIds.length; index += batchSize) {
    ensureAbort(signal);

    const batch = matchedWorkIds.slice(index, index + batchSize);
    const batchIndex = Math.floor(index / batchSize) + 1;
    const totalBatches = Math.ceil(matchedWorkIds.length / batchSize);

    emitNodeLog(
      emit,
      `Cloud delete batch ${batchIndex}/${totalBatches}, size ${batch.length}`,
    );

    try {
      const response = await asmrClient.post(
        CLOUD_DELETE_ENDPOINT,
        { id: playlistId, works: batch },
        { headers, timeout: 30000 },
      );

      if (response?.status === 200) {
        deletedCount += batch.length;
      } else {
        failedCount += batch.length;
      }
    } catch (error) {
      failedCount += batch.length;
      emitNodeLog(
        emit,
        `Batch ${batchIndex} delete error: ${error?.message || error}`,
      );
    }

    emitNodeProgress(emit, {
      totalWorks: matchedWorkIds.length,
      completedWorks: deletedCount + failedCount,
      remainingWorks: Math.max(
        matchedWorkIds.length - deletedCount - failedCount,
        0,
      ),
    });

    if (index + batchSize < matchedWorkIds.length) {
      await waitWithAbort(requestDelayMs, signal);
    }
  }

  emitNodeLog(
    emit,
    `Cloud delete finished: success ${deletedCount}, failed ${failedCount}, notFound ${notFound.length}`,
  );

  return {
    success: failedCount === 0,
    deletedCount,
    failedCount,
    matchedCount: matchedWorkIds.length,
    requestedCodes: rjCodes,
    matchedWorkIds,
    notFound,
  };
};

const normalizeArchiveExtensions = (rawValue) => {
  const rawList = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(",")
      : [];

  const normalized = rawList
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));

  if (!normalized.length) {
    return [...ARCHIVE_EXTENSIONS];
  }

  return [...new Set(normalized)];
};

const executeLocalDeleteScannedNode = async ({
  config,
  inputValues,
  inputMap,
  signal,
  emit,
}) => {
  const scanPath = resolvePathFromConfigOrInput({
    configuredPath: config?.scanPath || config?.path,
    inputValues,
    inputMap,
    preferredInputKeys: ["scanPath", "path", "targetPath"],
  });

  if (!scanPath) {
    throw new Error("files.localDeleteScanned missing scanPath");
  }
  if (!fs.existsSync(scanPath)) {
    throw new Error(`Scan directory not found: ${scanPath}`);
  }

  const deleteFiles = config?.deleteFiles !== false;
  const failOnEmpty = config?.failOnEmpty === true;
  const allowedExtensions = normalizeArchiveExtensions(config?.extensions);

  emitNodeLog(emit, `Scanning local folder: ${scanPath}`);

  const scanResults = [];
  scanForArchives(scanPath, scanResults);
  ensureAbort(signal);

  const archives = normalizeArchiveRecords(
    buildScanArchiveResult(scanResults),
  ).filter((item) =>
    allowedExtensions.includes(path.extname(item.path).toLowerCase()),
  );

  if (!archives.length) {
    const message = "No files found to delete";
    if (failOnEmpty) {
      throw new Error(message);
    }

    emitNodeLog(emit, message);
    return {
      success: true,
      scannedCount: 0,
      deletedCount: 0,
      failedCount: 0,
      deleteFiles,
      files: [],
      failedFiles: [],
    };
  }

  let deletedCount = 0;
  let failedCount = 0;
  const deletedFiles = [];
  const failedFiles = [];

  for (let index = 0; index < archives.length; index += 1) {
    ensureAbort(signal);

    const archive = archives[index];
    emitNodeProgress(emit, {
      totalWorks: archives.length,
      completedWorks: deletedCount + failedCount,
      remainingWorks: Math.max(archives.length - deletedCount - failedCount, 0),
      currentRj: archive.code || "",
    });

    if (!deleteFiles) {
      continue;
    }

    try {
      await fs.promises.unlink(archive.path);
      deletedCount += 1;
      deletedFiles.push(archive.path);
      emitNodeLog(emit, `Deleted: ${archive.path}`);
    } catch (error) {
      failedCount += 1;
      failedFiles.push({
        path: archive.path,
        error: error?.message || String(error),
      });
      emitNodeLog(
        emit,
        `Delete failed: ${archive.path} - ${error?.message || error}`,
      );
    }
  }

  emitNodeLog(
    emit,
    deleteFiles
      ? `Local delete finished: deleted ${deletedCount}, failed ${failedCount}`
      : `Scan finished: ${archives.length} files (preview mode)`,
  );

  return {
    success: failedCount === 0,
    scanPath,
    deleteFiles,
    scannedCount: archives.length,
    deletedCount: deleteFiles ? deletedCount : 0,
    failedCount,
    files: archives,
    deletedFiles,
    failedFiles,
  };
};

const executeExtractFileNames = async ({ config, signal }) => {
  const sourceDir = normalizeDirPath(config?.sourceDir);
  if (!sourceDir) {
    throw new Error("tools.extractFileNames 缺少 sourceDir");
  }
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`源目录不存在: ${sourceDir}`);
  }

  const outputDir = normalizeDirPath(config?.outputDir) || sourceDir;
  const outputFileName =
    typeof config?.fileName === "string" && config.fileName.trim()
      ? config.fileName.trim()
      : "filelist.txt";

  const entries = [];

  await scanFilesRecursively(
    sourceDir,
    (_fullPath, fileName) => {
      if (/^(RJ|VJ|BJ)\d+/i.test(fileName)) {
        entries.push(extractFileNameCore(fileName));
      }
    },
    signal,
  );

  const uniqueEntries = [...new Set(entries)].sort();
  const outputPath = path.join(outputDir, outputFileName);

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, uniqueEntries.join("\n"), "utf-8");

  return {
    success: true,
    fileCount: uniqueEntries.length,
    outputPath,
    entries: uniqueEntries,
  };
};

const executeCleanData = async ({ config, signal }) => {
  const mainFile = normalizeDirPath(config?.mainFile);
  const compareDir = normalizeDirPath(config?.compareDir);
  const deleteFiles = config?.deleteFiles === true;

  if (!mainFile || !compareDir) {
    throw new Error("tools.cleanData 缺少 mainFile 或 compareDir");
  }
  if (!fs.existsSync(mainFile)) {
    throw new Error(`主文件不存在: ${mainFile}`);
  }
  if (!fs.existsSync(compareDir)) {
    throw new Error(`比对目录不存在: ${compareDir}`);
  }

  ensureAbort(signal);
  const mainContent = await fs.promises.readFile(mainFile, "utf-8");
  const mainCodes = collectRjCodesFromText(mainContent);
  const mainSet = new Set(mainCodes);

  const allEntries = await fs.promises.readdir(compareDir, {
    withFileTypes: true,
  });
  const zipFiles = allEntries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"),
    )
    .map((entry) => entry.name);

  const filesToDelete = [];
  const filesToKeep = new Set();
  const deletedCodes = [];

  for (const zipFile of zipFiles) {
    ensureAbort(signal);

    const fileMatches = collectRjCodesFromText(zipFile);
    const allInMain =
      fileMatches.length > 0 && fileMatches.every((code) => mainSet.has(code));

    if (allInMain) {
      filesToDelete.push(zipFile);
      deletedCodes.push(...fileMatches);

      if (deleteFiles) {
        const targetPath = path.join(compareDir, zipFile);
        try {
          await fs.promises.unlink(targetPath);
        } catch {
          // 忽略删除失败，保留统计口径。
        }
      }
      continue;
    }

    filesToKeep.add(zipFile);
  }

  return {
    success: true,
    zipFileCount: zipFiles.length,
    deletedCount: filesToDelete.length,
    cleanedCount: filesToKeep.size,
    deletedCodes: [...new Set(deletedCodes)].sort(),
    filesToDelete,
    filesToKeep: [...filesToKeep],
    actuallyDeleted: deleteFiles,
  };
};

export const TOOL_NODE_DEFINITIONS = [
  {
    type: WHISPER_NODE_TYPE,
    label: "翻译字幕",
    category: "whisper",
    description: "复用现有 Whisper 翻译引擎执行字幕翻译",
    defaultConfig: {
      exePath: "",
      targetPath: "",
      subFormats: ["lrc", "srt", "vtt"],
    },
    validateConfig: validateWhisperNodeConfig,
    execute: executeWhisperTranslateNode,
  },
  {
    type: WHISPER_PACK_NODE_TYPE,
    label: "\u6253\u5305\u5b57\u5e55",
    category: "whisper",
    description:
      "\u626b\u63cf\u5b57\u5e55\u76ee\u5f55\u5e76\u6309 RJ/VJ/BJ \u6253\u5305 zip",
    defaultConfig: {
      targetPath: "",
      outputDir: "",
    },
    execute: executeWhisperPackSubtitlesNode,
  },
  {
    type: TG_UPLOAD_NODE_TYPE,
    label: "\u4e0a\u4f20\u5b57\u5e55",
    category: "tg",
    description:
      "\u667a\u80fd\u626b\u63cf\u538b\u7f29\u5305\u5e76\u4e0a\u4f20\u5230 Telegram \u9891\u9053",
    defaultConfig: {
      scanPath: "",
      channelId: "",
      titleDelayMs: 3500,
      betweenDelayMs: 1000,
      failOnEmpty: true,
      failFast: false,
      guardianEnabled: true,
      autoCleanupDuplicates: true,
      guardianTtlMs: 1200000,
    },
    execute: executeTgUploadSubtitlesNode,
  },
  {
    type: ASMR_CLOUD_DELETE_RECENT_NODE_TYPE,
    label: "\u4e91\u7aef\u6e05\u7406(\u6700\u8fd1\u4e0a\u4f20)",
    category: "clean",
    description:
      "\u6839\u636e\u6700\u8fd1\u4e0a\u4f20\u7f16\u53f7\u5339\u914d\u5e76\u5220\u9664\u4e91\u7aef\u4f5c\u54c1",
    defaultConfig: {
      recentLimit: 30,
      batchSize: 50,
      requestDelayMs: 1000,
      refreshCloudFirst: true,
      failOnNoMatch: false,
    },
    execute: executeCloudDeleteRecentUploadsNode,
  },
  {
    type: FILES_LOCAL_DELETE_SCANNED_NODE_TYPE,
    label: "\u672c\u5730\u5220\u9664(\u626b\u63cf\u540e\u5220\u9664)",
    category: "clean",
    description:
      "\u626b\u63cf\u76ee\u5f55\u4e2d\u7684\u538b\u7f29\u5305\u5e76\u6267\u884c\u672c\u5730\u5220\u9664",
    defaultConfig: {
      scanPath: "",
      extensions: [...ARCHIVE_EXTENSIONS],
      deleteFiles: true,
      failOnEmpty: false,
    },
    execute: executeLocalDeleteScannedNode,
  },
  {
    type: "files.scanArchives",
    label: "扫描压缩包",
    category: "files",
    description: "扫描目录中的压缩包并输出归档列表",
    defaultConfig: {
      path: "",
    },
    execute: ({ config, signal }) => {
      ensureAbort(signal);

      const targetPath = normalizeDirPath(config?.path);
      if (!targetPath) {
        throw new Error("files.scanArchives 缺少 path");
      }

      const scanResults = [];
      scanForArchives(targetPath, scanResults);
      return buildScanArchiveResult(scanResults);
    },
  },
  {
    type: "tools.extractFileNames",
    label: "提取文件名",
    category: "tools",
    description: "复用工具箱提取逻辑，生成 txt 文件列表",
    defaultConfig: {
      sourceDir: "",
      outputDir: "",
      fileName: "filelist.txt",
    },
    execute: executeExtractFileNames,
  },
  {
    type: "tools.cleanData",
    label: "数据清洗",
    category: "tools",
    description: "按主文件过滤 zip 文件并可选删除",
    defaultConfig: {
      mainFile: "",
      compareDir: "",
      deleteFiles: false,
    },
    execute: executeCleanData,
  },
];
