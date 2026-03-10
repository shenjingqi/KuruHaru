import { ref } from "vue";
import { openDirectory, openFile } from "../api/dialogApi";
import { scanLocalArchives, readFile } from "../api/localApi";
import { asmrDeleteByRJ } from "../api/asmrApi";

export const useLocalCleaner = () => {
  const localItems = ref([]);
  const selectedPaths = ref([]);
  const isBusy = ref(false);
  const txtRJCodes = ref([]);

  const scanFolder = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      isBusy.value = true;
      try {
        const scanRes = await scanLocalArchives(res.filePath);
        localItems.value = scanRes || [];
        selectedPaths.value = [];
      } catch (e) {
        alert("扫描出错: " + e.message);
      }
      isBusy.value = false;
    }
  };

  const loadFromTxt = async () => {
    const res = await openFile({
      type: "file",
      filters: [{ name: "TXT", extensions: ["txt"] }],
    });
    if (res && res.filePath) {
      try {
        const content = await readFile(res.filePath);
        if (content) {
          // 支持 RJ/VJ/BJ 号
          const codes = content.match(/(RJ|VJ|BJ)\d+/gi);
          txtRJCodes.value = codes
            ? [...new Set(codes.map((c) => c.toUpperCase()))]
            : [];
          alert(`导入 ${txtRJCodes.value.length} 个RJ/VJ/BJ号`);
        }
      } catch (e) {
        alert("读取文件失败: " + e.message);
      }
    }
  };

  const clearTxt = () => {
    txtRJCodes.value = [];
  };

  const copyRJCodes = () => {
    const text = txtRJCodes.value.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      alert("已复制到剪贴板");
    });
  };

  const selectAll = () => {
    selectedPaths.value = localItems.value.map((item) => item.path);
  };

  const clearSelection = () => {
    selectedPaths.value = [];
  };

  const toggleSelect = (path) => {
    const idx = selectedPaths.value.indexOf(path);
    if (idx > -1) selectedPaths.value.splice(idx, 1);
    else selectedPaths.value.push(path);
  };

  const formatSize = (bytes) => {
    if (!bytes) return "-";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)}GB`;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)}MB`;
    return `${(bytes / 1024).toFixed(0)}KB`;
  };

  // 扫描文件夹后的云端删除
  const executeDelete = async () => {
    if (!confirm(`确认云端删除 ${selectedPaths.value.length} 个？`)) return;

    isBusy.value = true;
    try {
      const selectedItems = localItems.value.filter((i) =>
        selectedPaths.value.includes(i.path),
      );
      const rjCodes = selectedItems.map((i) => i.code).filter(Boolean);

      if (rjCodes.length > 0) {
        const cloudRes = await asmrDeleteByRJ(rjCodes);
        if (cloudRes.success) {
          alert(`云端删除 ${cloudRes.deletedCount || 0} 个作品`);
        } else {
          alert("删除失败: " + (cloudRes.error || "未知错误"));
        }
      }

      localItems.value = localItems.value.filter(
        (i) => !selectedPaths.value.includes(i.path),
      );
      selectedPaths.value = [];
    } finally {
      isBusy.value = false;
    }
  };

  // TXT导入后的云端删除
  const executeCloudDelete = async () => {
    if (!confirm(`确认删除云端 ${txtRJCodes.value.length} 个作品？`)) return;

    isBusy.value = true;
    try {
      const rjList = JSON.parse(JSON.stringify(txtRJCodes.value));
      const result = await asmrDeleteByRJ(rjList);
      if (result.success) {
        alert(`云端删除 ${result.deletedCount} 个作品`);
        txtRJCodes.value = [];
      }
    } finally {
      isBusy.value = false;
    }
  };

  return {
    localItems,
    selectedPaths,
    isBusy,
    txtRJCodes,
    scanFolder,
    loadFromTxt,
    clearTxt,
    copyRJCodes,
    selectAll,
    clearSelection,
    toggleSelect,
    formatSize,
    executeDelete,
    executeCloudDelete,
  };
};
