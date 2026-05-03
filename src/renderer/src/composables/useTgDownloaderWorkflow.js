import { ref, computed, onMounted } from "vue";
import { openFile } from "../api/dialogApi";
import {
  tgGetRecentActivity,
  tgReadRjList,
  tgScanRecentActivity,
  tgDownloadFiles,
} from "../api/tgApi";
import { loadConfig } from "../api/configApi";
import { clearCache } from "../api/systemApi";

export const useTgDownloaderWorkflow = () => {
  const allFiles = ref([]);
  const selectedFiles = ref([]);
  const skippedFileIds = ref(new Set());
  // 下载候选由“手动勾选”和“排除规则”共同决定，后续统计都基于两者交集计算。

  const excludeFilePath = ref("");
  const excludeFileRJCount = ref(0);
  const useFilter = ref(true);

  const currentPage = ref(1);
  const pageSize = 50;

  const isDownloading = ref(false);
  const downloadedCount = ref(0);
  const progressPercent = ref(0);
  const downloadTotalCount = ref(0);
  const currentFile = ref("");
  const concurrentCount = ref(3);
  const activeSessionId = ref(0);

  const logs = ref([]);

  const createSession = () => {
    activeSessionId.value += 1;
    return activeSessionId.value;
  };

  const isSessionActive = (sessionId) => activeSessionId.value === sessionId;

  const addLog = (msg, type = "info") => {
    logs.value.push({ msg, type });
    if (logs.value.length > 200) logs.value.shift();
  };

  const loadFiles = async () => {
    try {
      addLog("读取 recent_activity.json...", "info");
      const result = await tgGetRecentActivity();

      if (result.success && result.files) {
        allFiles.value = result.files.map((file) => {
          if (!file.name && file.fileName) {
            file.name = file.fileName;
            console.warn(
              `[loadFiles] File missing 'name', using fileName: ${file.fileName}`,
            );
          }
          if (!file.id && file.rjCode) {
            file.id = file.rjCode;
            console.warn(
              `[loadFiles] File missing 'id', using rjCode: ${file.rjCode}`,
            );
          }
          return file;
        });
        selectedFiles.value = allFiles.value.map((f) => f.id);
        addLog(`加载 ${allFiles.value.length} 个文件`, "success");
      } else {
        addLog("读取失败: " + (result.error || "未知错误"), "error");
      }
    } catch (e) {
      addLog("读取失败: " + e.message, "error");
    }
  };

  const browseFile = async () => {
    try {
      const res = await openFile({
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });
      if (res && res.filePath) {
        excludeFilePath.value = res.filePath;
        await loadExcludeFile();
      }
    } catch (e) {
      addLog("选择文件失败: " + e.message, "error");
    }
  };

  const loadExcludeFile = async () => {
    if (!excludeFilePath.value) return;

    try {
      addLog("读取排除列表...", "info");
      const result = await tgReadRjList({
        path: excludeFilePath.value,
      });

      if (result.success) {
        excludeFileRJCount.value = result.count;
        addLog(`已加载 ${result.count} 个RJ号`, "success");
        updateSkippedFiles();
      } else {
        addLog("读取失败: " + result.error, "error");
      }
    } catch (e) {
      addLog("读取失败: " + e.message, "error");
    }
  };

  const updateSkippedFiles = () => {
    if (!useFilter.value) {
      skippedFileIds.value = new Set();
      return;
    }

    const skipped = new Set();
    const excludeRjs = new Set();

    if (excludeFilePath.value) {
      try {
        // 排除列表允许 RJ/VJ/BJ 前缀混写，统一提取数字部分后再匹配。
        const content = require("fs").readFileSync(
          excludeFilePath.value,
          "utf-8",
        );
        const lines = content.split("\n").filter((l) => l.trim());
        lines.forEach((line) => {
          const match = line.match(/(RJ|VJ|BJ)?(\d+)/i);
          if (match) {
            excludeRjs.add(match[2]);
          } else if (/^\d+$/.test(line.trim())) {
            excludeRjs.add(line.trim());
          }
        });
      } catch (e) {
        console.error("读取排除文件失败:", e);
      }
    }

    allFiles.value.forEach((file) => {
      if (!file.rjCode) return;
      const rjMatch = file.rjCode.match(/(RJ|VJ|BJ)?(\d+)/i);
      const numOnly = rjMatch ? rjMatch[2] : file.rjCode;
      if (excludeRjs.has(numOnly)) {
        skipped.add(file.id);
        // 被过滤文件必须同步取消选中，避免 UI 显示“已选中但实际不会下载”。
        const idx = selectedFiles.value.indexOf(file.id);
        if (idx > -1) {
          selectedFiles.value.splice(idx, 1);
        }
      }
    });

    skippedFileIds.value = skipped;
    addLog(`将跳过 ${skipped.size} 个文件`, "info");
  };

  const displayedFiles = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    return allFiles.value.slice(start, start + pageSize);
  });

  const totalPages = computed(() =>
    Math.ceil(allFiles.value.length / pageSize),
  );

  const skipFiles = computed(() => {
    return allFiles.value.filter((f) => skippedFileIds.value.has(f.id));
  });

  const downloadFiles = computed(() => {
    return allFiles.value.filter(
      (f) =>
        selectedFiles.value.includes(f.id) && !skippedFileIds.value.has(f.id),
    );
  });

  const toggleSelect = (fileId) => {
    if (skippedFileIds.value.has(fileId)) return;

    const idx = selectedFiles.value.indexOf(fileId);
    if (idx > -1) {
      selectedFiles.value.splice(idx, 1);
    } else {
      selectedFiles.value.push(fileId);
    }
  };

  const selectAll = () => {
    selectedFiles.value = allFiles.value
      .map((file) => file.id)
      .filter((id) => !skippedFileIds.value.has(id));
  };

  const deselectAll = () => {
    selectedFiles.value = [];
  };

  const reloadAndScan = async () => {
    try {
      addLog("清除缓存并重新扫描...", "info");
      const clearResult = await clearCache("recent_activity.json");

      if (clearResult.success) {
        addLog("缓存已清除", "success");
      } else {
        addLog("清除缓存失败: " + (clearResult.error || "未知错误"), "warn");
      }

      // 强制“清缓存 -> 扫描 -> 重新读取”串联，确保拿到本次扫描落盘后的最新数据。
      addLog("开始重新扫描 TG 讨论组...", "info");
      const scanResult = await tgScanRecentActivity();

      if (scanResult && scanResult.success) {
        addLog(
          `扫描完成！文件数: ${scanResult.data?.filesCount || "未知"}, 动作: ${scanResult.data?.action || "未知"}`,
          "success",
        );
        await loadFiles();
      } else {
        addLog("扫描失败: " + (scanResult?.error || "未知错误"), "error");
      }
    } catch (e) {
      addLog("操作失败: " + e.message, "error");
    }
  };

  const startDownload = async () => {
    if (selectedFiles.value.length === 0) return;

    const sessionId = createSession();

    isDownloading.value = true;
    downloadedCount.value = 0;
    progressPercent.value = 0;

    const filesToDownload = allFiles.value.filter(
      (f) =>
        selectedFiles.value.includes(f.id) && !skippedFileIds.value.has(f.id),
    );
    downloadTotalCount.value = filesToDownload.length;
    const maxConcurrent = Math.min(
      Math.max(Number(concurrentCount.value) || 1, 1),
      10,
    );
    const totalBatches = Math.ceil(filesToDownload.length / maxConcurrent);

    addLog(
      `开始下载 ${filesToDownload.length} 个文件（并发 ${maxConcurrent}，共 ${totalBatches} 批）...`,
      "info",
    );

    try {
      // 按用户指定并发数切块；每一批全部完成后再进入下一批。
      for (let i = 0; i < filesToDownload.length; i += maxConcurrent) {
        const batch = filesToDownload.slice(i, i + maxConcurrent);
        const batchIndex = Math.floor(i / maxConcurrent) + 1;

        if (!isDownloading.value || !isSessionActive(sessionId)) {
          break;
        }

        currentFile.value = `第 ${batchIndex}/${totalBatches} 批`;
        addLog(
          `开始第 ${batchIndex}/${totalBatches} 批（${batch.length} 个）`,
          "info",
        );

        const invalidFiles = batch
          .filter((file) => !file.name || !file.tgMessageId)
          .map((file) => ({
            success: false,
            file,
            error: !file.name ? "文件缺少名称" : "文件缺少 tgMessageId",
          }));

        const validItems = batch
          .filter((file) => file.name && file.tgMessageId)
          .map((file) => ({
            fileId: file.id,
            fileName: file.name,
            tgMessageId: file.tgMessageId,
          }));

        const batchResult =
          validItems.length > 0
            ? await tgDownloadFiles({
                batchIndex,
                totalBatches,
                items: validItems,
                concurrency: maxConcurrent,
              })
            : { results: [] };

        if (!isSessionActive(sessionId)) {
          return;
        }

        const normalizedResults = (batchResult.results || []).map((result) => ({
          success: result.success,
          skipped: result.skipped,
          file: batch.find(
            (item) =>
              item.tgMessageId === result.tgMessageId &&
              item.id === result.fileId,
          ) ||
            batch.find((item) => item.tgMessageId === result.tgMessageId) || {
              id: result.fileId,
              name: result.fileName,
            },
          error: result.error || result.msg,
        }));

        const results = [...normalizedResults, ...invalidFiles];

        for (const result of results) {
          const displayName = result.file.name || result.file.id;

          if (result.success) {
            if (result.skipped) {
              addLog(`文件已存在，跳过: ${displayName}`, "warn");
            } else {
              addLog(`下载成功: ${displayName}`, "success");
            }
          } else {
            addLog(`下载失败: ${displayName} - ${result.error}`, "error");
          }
        }

        downloadedCount.value += results.length;
        progressPercent.value = Math.round(
          (downloadedCount.value / filesToDownload.length) * 100,
        );
      }

      if (!isSessionActive(sessionId)) {
        return;
      }

      try {
        const config = await loadConfig();
        const downloadDir = config.paths?.tgDownloadDir || "未知位置";
        addLog(`下载完成！成功 ${filesToDownload.length} 个`, "success");
        addLog(`文件保存位置: ${downloadDir}`, "info");
      } catch (e) {
        addLog(`下载完成！成功 ${filesToDownload.length} 个`, "success");
        addLog(`无法获取下载路径: ${e.message}`, "warn");
      }
    } catch (e) {
      if (isSessionActive(sessionId)) {
        addLog(`下载失败: ${e.message}`, "error");
      }
    } finally {
      if (isSessionActive(sessionId)) {
        isDownloading.value = false;
        currentFile.value = "";
      }
    }
  };

  // 取消当前会话：进行中的 IPC 可能仍会自然结束，但旧结果不会再回写当前 UI。
  const cancelDownload = () => {
    createSession();
    isDownloading.value = false;
    currentFile.value = "";
    addLog("下载已取消", "warn");
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatSize = (size) => {
    if (!size) return "-";
    const num = parseInt(size);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / 1024 / 1024).toFixed(1)} MB`;
  };

  onMounted(() => {
    loadFiles();
  });

  return {
    allFiles,
    selectedFiles,
    skippedFileIds,
    excludeFilePath,
    excludeFileRJCount,
    useFilter,
    currentPage,
    isDownloading,
    downloadedCount,
    progressPercent,
    downloadTotalCount,
    currentFile,
    concurrentCount,
    logs,
    displayedFiles,
    totalPages,
    skipFiles,
    downloadFiles,
    browseFile,
    toggleSelect,
    selectAll,
    deselectAll,
    reloadAndScan,
    startDownload,
    cancelDownload,
    formatDate,
    formatSize,
  };
};
