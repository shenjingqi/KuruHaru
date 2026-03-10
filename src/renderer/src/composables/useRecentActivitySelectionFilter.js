import { ref, computed } from "vue";
import { openFile } from "../api/dialogApi";
import {
  tgReadRecentActivity,
  tgScanRecentActivity,
  tgReadRjList,
} from "../api/tgApi";

export const useRecentActivitySelectionFilter = ({ message, dialog }) => {
  const lastScanTime = ref(0);
  const SCAN_DEBOUNCE_MS = 3000; // 3秒防抖

  const allFiles = ref([]);
  const selectedFileIds = ref(new Set());
  const skipFiles = ref([]);

  const excludeFilePath = ref("");
  const excludeRJSet = ref(new Set());

  const isScanning = ref(false);

  const currentPage = ref(1);
  const pageSize = 30;

  const paginatedFiles = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    return allFiles.value.slice(start, start + pageSize);
  });

  const totalPages = computed(() =>
    Math.ceil(allFiles.value.length / pageSize),
  );

  const selectedFiles = computed(() => {
    return allFiles.value.filter((f) => selectedFileIds.value.has(f.id));
  });

  const updateSkipFiles = () => {
    // 排除时统一比对 RJ 数字部分，并同步取消对应勾选，避免提交脏数据。
    skipFiles.value = allFiles.value.filter((file) => {
      if (!file.rjCode) return false;
      const rjMatch = file.rjCode.match(/(RJ|VJ|BJ)?(\d+)/i);
      const numOnly = rjMatch ? rjMatch[2] : file.rjCode;
      return excludeRJSet.value.has(numOnly);
    });

    skipFiles.value.forEach((file) => {
      selectedFileIds.value.delete(file.id);
    });
  };

  const loadRecentActivity = async () => {
    try {
      const result = await tgReadRecentActivity();
      if (
        result &&
        result.success &&
        result.data &&
        Array.isArray(result.data.files)
      ) {
        // 只保留可直接处理的小文件，减少后续 UI 和下载流程负担。
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
        const filteredFiles = result.data.files.filter((file) => {
          const fileSize = file.fileSize || file.size || 0;
          return fileSize < MAX_FILE_SIZE;
        });

        // 同一作品可能多次出现，按 RJ/ID 去重并保留最新时间版本。
        const fileMap = new Map();
        filteredFiles.forEach((file) => {
          const id = file.rjCode || file.id;
          const existing = fileMap.get(id);
          if (existing) {
            const existingDate = new Date(existing.date).getTime();
            const newDate = new Date(file.date).getTime();
            if (newDate > existingDate) {
              fileMap.set(id, file);
            }
          } else {
            fileMap.set(id, file);
          }
        });

        allFiles.value = Array.from(fileMap.values()).sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateB - dateA;
        });

        allFiles.value.forEach((file) => {
          if (!file.name) {
            file.name = file.fileName || "unknown";
            console.warn(
              `[loadRecentActivity] File missing 'name', id=${file.id}, using fallback: ${file.name}`,
            );
          }
          if (!file.id) {
            file.id = file.rjCode || Date.now().toString();
            console.warn(
              `[loadRecentActivity] File missing 'id', using fallback: ${file.id}`,
            );
          }
        });

        // 每次加载默认全选，再应用排除规则做二次收敛。
        selectedFileIds.value = new Set(allFiles.value.map((f) => f.id));
        updateSkipFiles();
      }
    } catch (e) {
      console.error("Failed to load files:", e);
    }
  };

  const scanRecentActivity = async () => {
    console.log("🔥 RECENT ACTIVITY BUTTON CLICKED");

    // 双保险：并发锁 + 时间防抖，避免重复触发 Telegram 扫描。
    if (isScanning.value) {
      console.log("正在扫描中");
      message.warning("扫描正在进行中，请稍候...");
      return;
    }

    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime.value;
    if (timeSinceLastScan < SCAN_DEBOUNCE_MS) {
      const remainingSeconds = Math.ceil(
        (SCAN_DEBOUNCE_MS - timeSinceLastScan) / 1000,
      );
      console.log(`防抖触发，剩余 ${remainingSeconds} 秒`);
      message.warning(`请等待 ${remainingSeconds} 秒后再试`);
      return;
    }

    lastScanTime.value = now;
    isScanning.value = true;

    console.log("显示加载提示");
    const loadingMessage = message.loading("正在连接 Telegram 扫描文件...", {
      duration: 0,
    });

    try {
      console.log("🔥 CALLING tgScanRecentActivity FROM RECENT ACTIVITY");
      const result = await tgScanRecentActivity();
      console.log("🔥 RECENT ACTIVITY RESULT:", result);

      loadingMessage.destroy();

      if (result && result.success) {
        await loadRecentActivity();

        const fileCount = allFiles.value.length;
        console.log("显示成功弹窗，文件数:", fileCount);
        dialog.success({
          title: "扫描完成",
          content: `成功获取到 ${fileCount} 个文件`,
          positiveText: "确定",
        });
      } else {
        console.log("显示失败弹窗");
        dialog.error({
          title: "扫描失败",
          content: result?.error || "未知错误，请检查网络连接或配置",
          positiveText: "确定",
        });
      }
    } catch (error) {
      loadingMessage.destroy();

      console.log("显示错误弹窗:", error);
      dialog.error({
        title: "扫描出错",
        content: error?.message || "扫描过程出错，请检查网络或控制台日志",
        positiveText: "确定",
      });
    } finally {
      isScanning.value = false;
    }
  };

  const loadExcludeFile = async () => {
    if (!excludeFilePath.value) return;

    try {
      const result = await tgReadRjList({
        path: excludeFilePath.value,
      });

      if (result.success) {
        // 排除文件允许 RJ 前缀可选，统一转换为数字字符串存入集合。
        excludeRJSet.value = new Set(
          result.data.map((rj) => {
            const match = rj.match(/RJ?(\d+)/i);
            return match ? match[1] : rj;
          }),
        );
        updateSkipFiles();
      }
    } catch (e) {
      console.error("读取排除文件失败:", e);
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
      console.error("选择文件失败:", e);
    }
  };

  const toggleSelect = (fileId) => {
    if (skipFiles.value.some((f) => f.id === fileId)) return;

    if (selectedFileIds.value.has(fileId)) {
      selectedFileIds.value.delete(fileId);
    } else {
      selectedFileIds.value.add(fileId);
    }
  };

  const selectAll = () => {
    allFiles.value.forEach((file) => {
      if (!skipFiles.value.some((f) => f.id === file.id)) {
        selectedFileIds.value.add(file.id);
      }
    });
  };

  const deselectAll = () => {
    selectedFileIds.value.clear();
  };

  const invertSelect = () => {
    allFiles.value.forEach((file) => {
      if (skipFiles.value.some((f) => f.id === file.id)) return;

      if (selectedFileIds.value.has(file.id)) {
        selectedFileIds.value.delete(file.id);
      } else {
        selectedFileIds.value.add(file.id);
      }
    });
  };

  return {
    allFiles,
    selectedFileIds,
    skipFiles,
    excludeFilePath,
    isScanning,
    currentPage,
    paginatedFiles,
    totalPages,
    selectedFiles,
    loadRecentActivity,
    scanRecentActivity,
    browseFile,
    loadExcludeFile,
    updateSkipFiles,
    toggleSelect,
    selectAll,
    deselectAll,
    invertSelect,
  };
};
