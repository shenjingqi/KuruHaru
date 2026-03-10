import { ref, computed, onMounted } from "vue";
import { openFile } from "../api/dialogApi";
import {
  tgGetRecentActivity,
  tgReadRjList,
  tgScanRecentActivity,
  tgDownloadFile,
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
  const currentFile = ref("");

  const logs = ref([]);

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

    isDownloading.value = true;
    downloadedCount.value = 0;
    progressPercent.value = 0;

    const filesToDownload = allFiles.value.filter(
      (f) =>
        selectedFiles.value.includes(f.id) && !skippedFileIds.value.has(f.id),
    );

    addLog(`开始下载 ${filesToDownload.length} 个文件...`, "info");

    try {
      // 串行下载可保持日志顺序、进度计算和后端请求节奏一致。
      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];

        if (!file.name) {
          addLog(`文件 ${file.id} 缺少名称，跳过`, "error");
          continue;
        }

        currentFile.value = file.name;
        addLog(
          `下载中 ${i + 1}/${filesToDownload.length}: ${file.name}`,
          "info",
        );

        const result = await tgDownloadFile({
          fileId: file.id,
          fileName: file.name,
          tgMessageId: file.tgMessageId,
        });

        if (result.success) {
          if (result.skipped) {
            addLog(`文件已存在，跳过: ${file.name}`, "warn");
          } else if (result.path) {
            addLog(`下载成功: ${file.name}`, "success");
          }
        } else {
          addLog(`下载失败: ${file.name} - ${result.error}`, "error");
        }

        downloadedCount.value++;
        progressPercent.value = Math.round(
          (downloadedCount.value / filesToDownload.length) * 100,
        );
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
      addLog(`下载失败: ${e.message}`, "error");
    } finally {
      isDownloading.value = false;
      currentFile.value = "";
    }
  };

  // 当前仅重置前端状态；进行中的单个下载请求会在本次 await 后自然结束。
  const cancelDownload = () => {
    isDownloading.value = false;
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
    currentFile,
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
