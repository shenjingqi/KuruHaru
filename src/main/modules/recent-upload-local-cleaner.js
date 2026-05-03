import fs from "fs";
import path from "path";
import { loadRecentActivity } from "./tg-recent-activity";

const ARCHIVE_SUFFIXES = [
  ".tar.gz",
  ".tgz",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
];
const WORK_CODE_PATTERN = /(RJ|VJ|BJ)\d{6,8}/gi;

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const stripArchiveExtension = (fileName) => {
  const rawName = String(fileName || "").trim();
  const loweredName = rawName.toLowerCase();
  const matchedSuffix = ARCHIVE_SUFFIXES.find((suffix) =>
    loweredName.endsWith(suffix),
  );

  if (!matchedSuffix) {
    return rawName;
  }

  return rawName.slice(0, rawName.length - matchedSuffix.length);
};

export const collectWorkCodes = (rawText) => {
  const matches = String(rawText || "").match(WORK_CODE_PATTERN) || [];
  return [...new Set(matches.map((code) => code.toUpperCase()))];
};

const normalizeEntry = (entry) => {
  if (typeof entry === "string") {
    return {
      name: path.basename(entry),
      path: entry,
    };
  }

  const entryPath = String(entry?.path || "").trim();
  const entryName = String(entry?.name || path.basename(entryPath)).trim();

  return {
    name: entryName,
    path: entryPath,
  };
};

const dedupeMatchesByPath = (items) => {
  const seen = new Set();
  const deduped = [];

  items.forEach((item) => {
    const normalizedPath = normalizeName(item?.path);
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }

    seen.add(normalizedPath);
    deduped.push(item);
  });

  return deduped;
};

export function buildRecentUploadCleanupIndex(recentActivityData = {}) {
  const files = Array.isArray(recentActivityData?.files)
    ? recentActivityData.files
    : [];
  const codes = new Set();
  const archiveNames = new Set();
  const folderHints = new Set();

  files.forEach((file) => {
    [file?.rjCode, file?.id, file?.name, file?.fileName, file?.path].forEach(
      (candidate) => {
        collectWorkCodes(candidate).forEach((code) => codes.add(code));
      },
    );

    [file?.name, file?.fileName].forEach((candidate) => {
      const normalizedFileName = normalizeName(candidate);
      if (normalizedFileName) {
        archiveNames.add(normalizedFileName);
      }

      const normalizedFolderHint = normalizeName(
        stripArchiveExtension(candidate),
      );
      if (normalizedFolderHint) {
        folderHints.add(normalizedFolderHint);
      }
    });
  });

  return {
    totalFiles: files.length,
    codes,
    archiveNames,
    folderHints,
  };
}

export function buildRecentUploadLocalCleanupPlan({
  recentActivityData = {},
  archiveFiles = [],
  subtitleFolders = [],
} = {}) {
  const index = buildRecentUploadCleanupIndex(recentActivityData);

  const archiveMatches = dedupeMatchesByPath(
    archiveFiles
      .map(normalizeEntry)
      .map((entry) => {
        const matchedCodes = collectWorkCodes(entry.name).filter((code) =>
          index.codes.has(code),
        );
        const normalizedEntryName = normalizeName(entry.name);
        const matchedByName =
          normalizedEntryName && index.archiveNames.has(normalizedEntryName);

        if (!matchedByName && matchedCodes.length === 0) {
          return null;
        }

        return {
          ...entry,
          matchedCodes,
          matchSource: matchedByName ? "name" : "code",
        };
      })
      .filter(Boolean),
  );

  const folderMatches = dedupeMatchesByPath(
    subtitleFolders
      .map(normalizeEntry)
      .map((entry) => {
        const matchedCodes = collectWorkCodes(entry.name).filter((code) =>
          index.codes.has(code),
        );
        const normalizedEntryName = normalizeName(entry.name);
        const matchedByName =
          normalizedEntryName && index.folderHints.has(normalizedEntryName);

        if (!matchedByName && matchedCodes.length === 0) {
          return null;
        }

        return {
          ...entry,
          matchedCodes,
          matchSource: matchedByName ? "name" : "code",
        };
      })
      .filter(Boolean),
  );

  const matchedCodes = [
    ...new Set(
      [...archiveMatches, ...folderMatches].flatMap(
        (entry) => entry.matchedCodes || [],
      ),
    ),
  ].sort();

  return {
    recentFileCount: index.totalFiles,
    recentCodes: [...index.codes].sort(),
    archiveMatches,
    folderMatches,
    matchedArchiveCount: archiveMatches.length,
    matchedFolderCount: folderMatches.length,
    matchedCodes,
  };
}

async function readTopLevelArchiveFiles(archiveDir) {
  const entries = await fs.promises.readdir(archiveDir, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => {
      const loweredName = entry.name.toLowerCase();
      return ARCHIVE_SUFFIXES.some((suffix) => loweredName.endsWith(suffix));
    })
    .map((entry) => ({
      name: entry.name,
      path: path.join(archiveDir, entry.name),
    }));
}

async function readTopLevelFolders(subtitleDir) {
  const entries = await fs.promises.readdir(subtitleDir, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(subtitleDir, entry.name),
    }));
}

export async function cleanupRecentUploadedSubtitles({
  recentActivityDir,
  archiveDir,
  subtitleDir,
  deleteFiles = false,
} = {}) {
  if (!archiveDir || !String(archiveDir).trim()) {
    return { success: false, msg: "字幕压缩包目录不能为空" };
  }

  if (!subtitleDir || !String(subtitleDir).trim()) {
    return { success: false, msg: "字幕文件夹根目录不能为空" };
  }

  if (!fs.existsSync(archiveDir)) {
    return { success: false, msg: "字幕压缩包目录不存在" };
  }

  if (!fs.existsSync(subtitleDir)) {
    return { success: false, msg: "字幕文件夹根目录不存在" };
  }

  const recentActivityResult = loadRecentActivity(recentActivityDir);
  if (!recentActivityResult?.success || !recentActivityResult.data) {
    return {
      success: false,
      msg: "未找到最近上传缓存，请先在“最近上传”页面扫描缓存",
    };
  }

  const archiveFiles = await readTopLevelArchiveFiles(archiveDir);
  const subtitleFolders = await readTopLevelFolders(subtitleDir);
  const plan = buildRecentUploadLocalCleanupPlan({
    recentActivityData: recentActivityResult.data,
    archiveFiles,
    subtitleFolders,
  });

  const result = {
    success: true,
    actuallyDeleted: deleteFiles === true,
    archiveDir,
    subtitleDir,
    scannedArchiveCount: archiveFiles.length,
    scannedFolderCount: subtitleFolders.length,
    deletedArchiveCount: 0,
    deletedFolderCount: 0,
    failedEntries: [],
    ...plan,
  };

  if (deleteFiles !== true) {
    return result;
  }

  for (const archive of plan.archiveMatches) {
    try {
      await fs.promises.unlink(archive.path);
      result.deletedArchiveCount += 1;
    } catch (error) {
      result.failedEntries.push({
        type: "archive",
        path: archive.path,
        error: error?.message || String(error),
      });
    }
  }

  for (const folder of plan.folderMatches) {
    try {
      await fs.promises.rm(folder.path, { recursive: true, force: false });
      result.deletedFolderCount += 1;
    } catch (error) {
      result.failedEntries.push({
        type: "folder",
        path: folder.path,
        error: error?.message || String(error),
      });
    }
  }

  result.success = result.failedEntries.length === 0;
  return result;
}
