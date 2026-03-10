import { ref, computed } from "vue";
import { tgReadRecentActivity } from "../api/tgApi";
import { openDirectory } from "../api/dialogApi";
import {
  asmrWriteChineseList,
  asmrFetchChineseWorks,
  onChineseListProgress,
  removeChineseListProgressListener,
  asmrGetChineseListPath,
  asmrSetChineseListPath,
} from "../api/asmrApi";

export const useChineseListWorkflow = () => {
  const txtRJCount = ref(0);
  const tgRJCount = ref(0);
  const apiRJCount = ref(0);
  const isLoadingTg = ref(false);
  const isScanningApi = ref(false);
  const showHelp = ref(false);
  const isDraggingTxt = ref(false);
  const cacheStatus = ref("");
  const txtFilePath = ref("");

  const txtSet = ref(new Set());
  const tgSet = ref(new Set());
  const apiSet = ref(new Set());
  // 三个来源分开存储，便于统计来源增量；展示总量时再做并集。

  const scanProgress = ref({ page: 0, status: "" });

  const totalUniqueCount = computed(() => {
    const all = new Set([...txtSet.value, ...tgSet.value, ...apiSet.value]);
    return all.size;
  });

  const newCount = computed(() => {
    const total = totalUniqueCount.value;
    const base = txtRJCount.value;
    return total > base ? total - base : 0;
  });

  const extractRJCodes = (text) => {
    const rjPattern = /(RJ|VJ|BJ)\d{6,8}/gi;
    const matches = text.match(rjPattern) || [];
    return [...new Set(matches.map((m) => m.toUpperCase()))];
  };

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, "UTF-8");
    });
  };

  const loadTxtFiles = async (files) => {
    let totalImported = 0;

    for (const file of files) {
      if (!file.name.endsWith(".txt")) continue;

      try {
        const content = await readFileContent(file);
        const rjCodes = extractRJCodes(content);
        const upperCodes = rjCodes.map((r) => r.toUpperCase());

        // 反复导入同一文件时通过 Set 去重，保持计数稳定不膨胀。
        const newSet = new Set([...txtSet.value, ...upperCodes]);
        txtSet.value = newSet;
        txtRJCount.value = newSet.size;

        totalImported += upperCodes.length;
      } catch (e) {
        console.error(`读取 ${file.name} 失败:`, e);
      }
    }

    if (txtSet.value.size > 0) {
      const allRjCodes = [...txtSet.value];
      // TXT 导入后立即落盘，后续 TG/API 扫描都以此作为基准增量。
      await asmrWriteChineseList(allRjCodes);
    }

    console.log(
      `已导入 ${totalImported} 个RJ号（合并后共 ${txtSet.value.size} 个）`,
    );
  };

  const handleTxtDrop = async (e) => {
    isDraggingTxt.value = false;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.endsWith(".txt"),
    );
    if (files.length > 0) {
      await loadTxtFiles(files);
    } else {
      alert("请选择TXT文件");
    }
  };

  const handleTxtFileSelect = async (e) => {
    const files = Array.from(e.target.files).filter((f) =>
      f.name.endsWith(".txt"),
    );
    if (files.length > 0) {
      await loadTxtFiles(files);
    }
  };

  const loadTgData = async () => {
    isLoadingTg.value = true;
    try {
      const result = await tgReadRecentActivity();
      if (
        result &&
        result.success &&
        result.data &&
        Array.isArray(result.data.files)
      ) {
        const rjCodes = result.data.files
          .map((f) => f.rjCode)
          .filter(Boolean)
          .map((rj) => rj.toUpperCase());
        const existing = new Set([
          ...txtSet.value,
          ...tgSet.value,
          ...apiSet.value,
        ]);
        // TG 只累计“当前未出现”的 RJ，避免与 TXT/API 重复计算。
        const newCodes = rjCodes.filter((code) => !existing.has(code));
        tgSet.value = new Set([...tgSet.value, ...newCodes]);
        tgRJCount.value = tgSet.value.size;
      } else {
        alert("读取TG数据失败或无数据");
      }
    } catch (e) {
      console.error("读取TG数据失败:", e);
      alert("读取TG数据失败");
    } finally {
      isLoadingTg.value = false;
    }
  };

  const scanApi = async () => {
    if (isScanningApi.value) return;
    isScanningApi.value = true;
    apiSet.value = new Set();
    apiRJCount.value = 0;

    const progressHandler = (progress) => {
      scanProgress.value = progress;
    };
    onChineseListProgress(progressHandler);

    try {
      const result = await asmrFetchChineseWorks();

      if (result && result.success) {
        if (result.message === "无新增内容") {
          apiSet.value = new Set(result.data.map((rj) => rj.toUpperCase()));
          apiRJCount.value = result.data.length;
          cacheStatus.value = `✓ 已是最新数据，共扫描 ${apiRJCount.value} 个`;
          return;
        }

        const existing = new Set([
          ...txtSet.value,
          ...tgSet.value,
          ...apiSet.value,
        ]);
        const newCodes = result.data.filter(
          (rj) => !existing.has(rj.toUpperCase()),
        );
        apiSet.value = new Set(newCodes.map((rj) => rj.toUpperCase()));
        apiRJCount.value = apiSet.value.size;
        cacheStatus.value = `✓ 扫描完成，新增 ${newCodes.length} 个`;
      } else {
        alert(`API扫描失败: ${result?.error || "未知错误"}`);
        cacheStatus.value = "";
      }
    } catch (e) {
      console.error("API扫描失败:", e);
      alert("API扫描过程出错");
      cacheStatus.value = "";
    } finally {
      isScanningApi.value = false;
      scanProgress.value = {};
      // 进度监听必须在 finally 清理，避免多次扫描后监听器叠加。
      removeChineseListProgressListener(progressHandler);
    }
  };

  const exportList = () => {
    const all = [...txtSet.value, ...tgSet.value, ...apiSet.value];
    const unique = [...new Set(all)].sort();

    const content = unique.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RJ列表_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (confirm("确定要清除所有数据吗？")) {
      txtSet.value = new Set();
      tgSet.value = new Set();
      apiSet.value = new Set();
      txtRJCount.value = 0;
      tgRJCount.value = 0;
      apiRJCount.value = 0;
    }
  };

  const initPathSetting = async () => {
    try {
      const result = await asmrGetChineseListPath();
      if (result) {
        txtFilePath.value = result.isCustom ? result.path : "";
      }
    } catch (e) {
      console.error("获取汉化列表路径失败:", e);
    }
  };

  const selectPath = async () => {
    try {
      const result = await openDirectory();
      if (result && !result.canceled && result.filePath) {
        txtFilePath.value = result.filePath;
        await savePathSetting();
      }
    } catch (e) {
      console.error("选择文件夹失败:", e);
    }
  };

  const savePathSetting = async () => {
    try {
      await asmrSetChineseListPath(txtFilePath.value);
    } catch (e) {
      console.error("保存路径设置失败:", e);
    }
  };

  const clearPathSetting = async () => {
    txtFilePath.value = "";
    await savePathSetting();
  };

  initPathSetting();

  return {
    txtRJCount,
    tgRJCount,
    apiRJCount,
    isLoadingTg,
    isScanningApi,
    showHelp,
    isDraggingTxt,
    cacheStatus,
    txtFilePath,
    scanProgress,
    totalUniqueCount,
    newCount,
    handleTxtDrop,
    handleTxtFileSelect,
    loadTgData,
    scanApi,
    exportList,
    clearAll,
    selectPath,
    savePathSetting,
    clearPathSetting,
  };
};
