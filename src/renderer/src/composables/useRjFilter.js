import { ref } from "vue";
import { openFile, saveFile } from "../api/dialogApi";
import { writeFile } from "../api/localApi";
import { filterRjFromUrl } from "../api/asmrApi";

export const useRjFilter = () => {
  const inputUrl = ref("");
  const dateMode = ref("all");
  const beforeDate = ref("");
  const compareFilePath = ref("");
  const excludeExisting = ref(true);

  const isProcessing = ref(false);
  const progressPercent = ref(0);
  const progressText = ref("");
  const currentRJ = ref("");

  const resultList = ref([]);
  const logs = ref([]);

  // 添加日志
  const addLog = (msg, type = "info") => {
    logs.value.push({ msg, type });
    if (logs.value.length > 100) logs.value.shift();
  };

  // 浏览文件
  const browseFile = async () => {
    try {
      const res = await openFile({
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });
      if (res && res.filePath) {
        compareFilePath.value = res.filePath;
      }
    } catch (e) {
      addLog("选择文件失败: " + e.message, "error");
    }
  };

  // 开始筛选
  const startFilter = async () => {
    if (!inputUrl.value) {
      addLog("请输入链接地址", "error");
      return;
    }

    isProcessing.value = true;
    progressPercent.value = 0;
    logs.value = [];
    resultList.value = [];

    try {
      addLog("开始处理...", "info");
      addLog("输入链接: " + inputUrl.value, "info");

      // 调用主进程处理
      const result = await filterRjFromUrl({
        url: inputUrl.value,
        dateMode: dateMode.value,
        beforeDate: dateMode.value === "after" ? beforeDate.value : null,
        compareFilePath: excludeExisting.value ? compareFilePath.value : null,
      });

      if (result.success) {
        resultList.value = result.data.map((item) => ({
          rjCode: item.rj_code,
          title: item.title,
          date: item.date,
          isNew: true,
        }));

        addLog(`处理完成！共获取 ${result.total} 个RJ号`, "success");
        addLog(`筛选后: ${resultList.value.length} 个`, "success");
      } else {
        addLog("处理失败: " + result.msg, "error");
      }
    } catch (e) {
      addLog("处理出错: " + e.message, "error");
    } finally {
      isProcessing.value = false;
      progressPercent.value = 100;
    }
  };

  // 导出结果
  const exportResult = async () => {
    if (!resultList.value.length) return;

    try {
      const res = await saveFile({
        defaultPath: `rj_filter_result_${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      });

      if (res && res.filePath) {
        const content = resultList.value.map((item) => item.rjCode).join("\n");
        await writeFile({ path: res.filePath, content });
        addLog("导出成功: " + res.filePath, "success");
      }
    } catch (e) {
      addLog("导出失败: " + e.message, "error");
    }
  };

  // 清空结果
  const clearResult = () => {
    resultList.value = [];
    logs.value = [];
  };

  return {
    inputUrl,
    dateMode,
    beforeDate,
    compareFilePath,
    excludeExisting,
    isProcessing,
    progressPercent,
    progressText,
    currentRJ,
    resultList,
    logs,
    browseFile,
    startFilter,
    exportResult,
    clearResult,
  };
};
