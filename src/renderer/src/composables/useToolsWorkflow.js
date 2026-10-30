import { ref, onMounted } from "vue";
import { loadConfig, saveCustomPaths } from "../api/configApi";
import { openDirectory, openFile } from "../api/dialogApi";
import {
  extractFileNames as runExtractFileNames,
  cleanData as runCleanData,
  cleanRecentUploadedSubtitles as runCleanRecentUploadedSubtitles,
  convertSubtitleFormat as runConvertSubtitleFormat,
  zipSubtitles,
} from "../api/toolsApi";

export const useToolsWorkflow = () => {
  const getDirectoryPath = (rawPath) => {
    const normalizedPath = String(rawPath || "").trim();
    if (!normalizedPath) {
      return "";
    }

    const lastSlashIndex = Math.max(
      normalizedPath.lastIndexOf("\\"),
      normalizedPath.lastIndexOf("/"),
    );

    if (lastSlashIndex < 0) {
      return normalizedPath;
    }

    if (lastSlashIndex <= 2 && /^[A-Za-z]:[\\/]/.test(normalizedPath)) {
      return normalizedPath.slice(0, lastSlashIndex + 1);
    }

    if (lastSlashIndex === 0) {
      return normalizedPath.slice(0, 1);
    }

    return normalizedPath.slice(0, lastSlashIndex);
  };

  // 提取文件名功能
  const sourceDir = ref("");
  const outputPath = ref("");
  const outputFileName = ref("filelist.txt");
  const isProcessing = ref(false);
  const extractResult = ref("");

  // 数据清洗功能
  const mainFile = ref("");
  const compareDir = ref("");
  const isCleaning = ref(false);
  const cleanResult = ref("");
  const deletedCodes = ref([]);
  const shouldDeleteFiles = ref(false); // 是否实际删除文件

  // 最近上传本地清理
  const recentUploadArchiveDir = ref("");
  const recentUploadSubtitleDir = ref("");
  const shouldDeleteRecentUploadedFiles = ref(false);
  const isCleaningRecentUploaded = ref(false);
  const recentUploadCleanupResult = ref("");
  const recentUploadCleanupDetails = ref("");

  // 字幕格式互转
  const subtitleConvertSourcePath = ref("");
  const subtitleConvertOutputPath = ref("");
  const subtitleConvertTargetFormat = ref("srt");
  const isConvertingSubtitle = ref(false);
  const subtitleConvertResult = ref("");
  const subtitleConvertDetails = ref("");

  // 打包字幕功能
  const zipMediaPath = ref("");
  const zipOutputPath = ref("");
  const isZipping = ref(false);
  const zipResult = ref("");

  onMounted(async () => {
    const result = await loadConfig();
    const cfg = result?.data || result;
    if (cfg?.paths?.toolOutputDir) {
      outputPath.value = cfg.paths.toolOutputDir;
      zipOutputPath.value = cfg.paths.toolOutputDir;
      recentUploadArchiveDir.value = cfg.paths.toolOutputDir;
      subtitleConvertOutputPath.value = cfg.paths.toolOutputDir;
    }
    if (cfg?.whisper?.targetPath) {
      zipMediaPath.value = cfg.whisper.targetPath;
      recentUploadSubtitleDir.value = cfg.whisper.targetPath;
    }
  });

  // 提取文件名相关
  const selectSourceDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      sourceDir.value = res.filePath;
      if (!outputPath.value) {
        outputPath.value = res.filePath;
      }
    }
  };

  const selectOutputPath = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      outputPath.value = res.filePath;
    }
  };

  const extractFileNames = async () => {
    if (!sourceDir.value) return;

    isProcessing.value = true;
    extractResult.value = "";

    try {
      const res = await runExtractFileNames({
        sourceDir: sourceDir.value,
        outputDir: outputPath.value || sourceDir.value,
        fileName: outputFileName.value || "filelist.txt",
      });

      if (res.success) {
        extractResult.value = `✅ 完成！${res.fileCount} 个文件名已写入 ${res.outputPath}`;
        // 保存源目录和输出路径到配置文件夹下的 config.json
        await saveCustomPaths({
          sourceDir: sourceDir.value,
          toolOutputDir: outputPath.value || sourceDir.value,
        });
      } else {
        extractResult.value = `❌ 失败: ${res.msg}`;
      }
    } catch (e) {
      extractResult.value = `❌ 错误: ${e.message}`;
    } finally {
      isProcessing.value = false;
    }
  };

  // 数据清洗相关
  const selectMainFile = async () => {
    const res = await openFile({
      type: "file",
      filters: [{ name: "TXT", extensions: ["txt"] }],
    });
    if (res && res.filePath) {
      mainFile.value = res.filePath;
    }
  };

  const selectCompareDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      compareDir.value = res.filePath;
    }
  };

  const cleanData = async () => {
    if (!mainFile.value || !compareDir.value) return;

    isCleaning.value = true;
    cleanResult.value = "";
    deletedCodes.value = [];

    try {
      console.log("[cleanData] 发送请求:", {
        mainFile: mainFile.value,
        compareDir: compareDir.value,
        deleteFiles: shouldDeleteFiles.value,
        shouldDeleteFilesType: typeof shouldDeleteFiles.value,
      });

      const res = await runCleanData({
        mainFile: mainFile.value,
        compareDir: compareDir.value,
        deleteFiles: shouldDeleteFiles.value === true, // 确保是布尔值
      });

      console.log("[cleanData] 收到响应:", res);

      if (res.success) {
        const actionText = res.actuallyDeleted ? "已删除" : "预览";
        cleanResult.value = `✅ ${actionText}完成！扫描 ${res.zipFileCount} 个zip文件，发现 ${res.deletedCount} 个重复文件，保留 ${res.cleanedCount} 个`;
        deletedCodes.value = res.deletedCodes || [];
      } else {
        cleanResult.value = `❌ 失败: ${res.msg}`;
      }
    } catch (e) {
      cleanResult.value = `❌ 错误: ${e.message}`;
    } finally {
      isCleaning.value = false;
    }
  };

  // 打包字幕相关
  const selectZipMediaPath = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      zipMediaPath.value = res.filePath;
    }
  };

  const selectZipOutputPath = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      zipOutputPath.value = res.filePath;
    }
  };

  const startZipSubtitles = async () => {
    if (!zipMediaPath.value) return;

    isZipping.value = true;
    zipResult.value = "";

    try {
      const res = await zipSubtitles({
        targetPath: zipMediaPath.value,
        outputDir: zipOutputPath.value || zipMediaPath.value,
      });

      const buildZipDetails = (result, prefix) => {
        let summary = `${prefix} ${result.msg || "未知结果"}`;
        if (result.results && result.results.length > 0) {
          summary += "\n\n详细结果:\n";
          result.results.forEach((item, index) => {
            summary += `${index + 1}. ${item}\n`;
          });
        }
        return summary;
      };

      if (res.success) {
        zipResult.value = buildZipDetails(res, "✅");
        // 保存路径到配置
        await saveCustomPaths({
          whisperTargetPath: zipMediaPath.value,
          toolOutputDir: zipOutputPath.value || zipMediaPath.value,
        });
      } else {
        zipResult.value = buildZipDetails(res, "❌");
      }
    } catch (e) {
      zipResult.value = `❌ 错误: ${e.message}`;
    } finally {
      isZipping.value = false;
    }
  };

  const selectRecentUploadArchiveDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      recentUploadArchiveDir.value = res.filePath;
    }
  };

  const selectRecentUploadSubtitleDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      recentUploadSubtitleDir.value = res.filePath;
    }
  };

  const cleanRecentUploadedSubtitles = async () => {
    if (!recentUploadArchiveDir.value || !recentUploadSubtitleDir.value) return;

    isCleaningRecentUploaded.value = true;
    recentUploadCleanupResult.value = "";
    recentUploadCleanupDetails.value = "";

    try {
      const res = await runCleanRecentUploadedSubtitles({
        archiveDir: recentUploadArchiveDir.value,
        subtitleDir: recentUploadSubtitleDir.value,
        deleteFiles: shouldDeleteRecentUploadedFiles.value === true,
      });

      if (res.success) {
        const actionText = res.actuallyDeleted ? "已删除" : "预览";
        recentUploadCleanupResult.value =
          `✅ ${actionText}完成！最近上传 ${res.recentFileCount} 条，` +
          `匹配压缩包 ${res.matchedArchiveCount} 个，匹配文件夹 ${res.matchedFolderCount} 个`;

        const details = [];
        details.push(`扫描压缩包目录文件数: ${res.scannedArchiveCount}`);
        details.push(`扫描字幕根目录文件夹数: ${res.scannedFolderCount}`);
        if (res.actuallyDeleted) {
          details.push(`已删除压缩包: ${res.deletedArchiveCount}`);
          details.push(`已删除文件夹: ${res.deletedFolderCount}`);
        }
        details.push("");
        details.push("匹配到的压缩包:");
        if (res.archiveMatches?.length > 0) {
          res.archiveMatches.forEach((item) => details.push(`- ${item.path}`));
        } else {
          details.push("- (无)");
        }
        details.push("");
        details.push("匹配到的文件夹:");
        if (res.folderMatches?.length > 0) {
          res.folderMatches.forEach((item) => details.push(`- ${item.path}`));
        } else {
          details.push("- (无)");
        }

        if (res.failedEntries?.length > 0) {
          details.push("");
          details.push("删除失败:");
          res.failedEntries.forEach((item) =>
            details.push(`- [${item.type}] ${item.path} :: ${item.error}`),
          );
        }

        recentUploadCleanupDetails.value = details.join("\n");

        await saveCustomPaths({
          toolOutputDir: recentUploadArchiveDir.value,
          whisperTargetPath: recentUploadSubtitleDir.value,
        });
      } else {
        recentUploadCleanupResult.value = `❌ 失败: ${res.msg || "未知错误"}`;
      }
    } catch (e) {
      recentUploadCleanupResult.value = `❌ 错误: ${e.message}`;
    } finally {
      isCleaningRecentUploaded.value = false;
    }
  };

  const selectSubtitleConvertSourcePath = async () => {
    const res = await openFile({
      type: "file",
    });
    if (res && res.filePath) {
      subtitleConvertSourcePath.value = res.filePath;
      if (/\.srt$/i.test(res.filePath)) {
        subtitleConvertTargetFormat.value = "lrc";
      } else if (/\.lrc$/i.test(res.filePath)) {
        subtitleConvertTargetFormat.value = "srt";
      }
      if (!subtitleConvertOutputPath.value) {
        subtitleConvertOutputPath.value = getDirectoryPath(res.filePath);
      }
    }
  };

  const selectSubtitleConvertSourceDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      subtitleConvertSourcePath.value = res.filePath;
      if (!subtitleConvertOutputPath.value) {
        subtitleConvertOutputPath.value = res.filePath;
      }
    }
  };

  const selectSubtitleConvertOutputPath = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      subtitleConvertOutputPath.value = res.filePath;
    }
  };

  const convertSubtitleFormat = async () => {
    if (!subtitleConvertSourcePath.value) return;

    isConvertingSubtitle.value = true;
    subtitleConvertResult.value = "";
    subtitleConvertDetails.value = "";

    try {
      const res = await runConvertSubtitleFormat({
        sourcePath: subtitleConvertSourcePath.value,
        outputPath: subtitleConvertOutputPath.value,
        targetFormat: subtitleConvertTargetFormat.value,
      });

      if (res.success) {
        const convertedCount = Number(res.convertedCount || 0);
        const targetLabel = String(res.targetFormat || "").toUpperCase();
        subtitleConvertResult.value =
          convertedCount > 1
            ? `✅ 已批量转换 ${convertedCount} 个文件为 ${targetLabel}`
            : `✅ 已转换为 ${targetLabel}：${res.outputPath}`;

        const details = [];
        if (res.mode === "directory") {
          details.push(`输出目录: ${res.outputPath}`);
          details.push(`成功数量: ${convertedCount}`);
          details.push(`失败数量: ${res.failedCount || 0}`);
        } else {
          details.push(`输出文件: ${res.outputPath}`);
          details.push(`字幕条数: ${res.cueCount || 0}`);
        }

        if (Array.isArray(res.failedFiles) && res.failedFiles.length > 0) {
          details.push("");
          details.push("失败文件:");
          res.failedFiles.forEach((item) => {
            details.push(`- ${item.sourcePath} :: ${item.error}`);
          });
        }

        subtitleConvertDetails.value = details.join("\n");

        await saveCustomPaths({
          toolOutputDir:
            res.mode === "file"
              ? getDirectoryPath(res.outputPath)
              : subtitleConvertOutputPath.value || res.outputPath,
        });
      } else {
        subtitleConvertResult.value = `❌ 失败: ${res.msg || res.message || "未知错误"}`;
      }
    } catch (e) {
      subtitleConvertResult.value = `❌ 错误: ${e.message}`;
    } finally {
      isConvertingSubtitle.value = false;
    }
  };

  return {
    sourceDir,
    outputPath,
    outputFileName,
    isProcessing,
    extractResult,
    mainFile,
    compareDir,
    isCleaning,
    cleanResult,
    deletedCodes,
    shouldDeleteFiles,
    recentUploadArchiveDir,
    recentUploadSubtitleDir,
    shouldDeleteRecentUploadedFiles,
    isCleaningRecentUploaded,
    recentUploadCleanupResult,
    recentUploadCleanupDetails,
    subtitleConvertSourcePath,
    subtitleConvertOutputPath,
    subtitleConvertTargetFormat,
    isConvertingSubtitle,
    subtitleConvertResult,
    subtitleConvertDetails,
    zipMediaPath,
    zipOutputPath,
    isZipping,
    zipResult,
    selectSourceDir,
    selectOutputPath,
    extractFileNames,
    selectMainFile,
    selectCompareDir,
    cleanData,
    selectRecentUploadArchiveDir,
    selectRecentUploadSubtitleDir,
    cleanRecentUploadedSubtitles,
    selectSubtitleConvertSourcePath,
    selectSubtitleConvertSourceDir,
    selectSubtitleConvertOutputPath,
    convertSubtitleFormat,
    selectZipMediaPath,
    selectZipOutputPath,
    startZipSubtitles,
  };
};
