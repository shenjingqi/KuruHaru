import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useWhisperStore } from "../stores/whisper";
import { selectFile } from "../api/dialogApi";
import { loadConfig, saveConfig } from "../api/configApi";
import {
  startTask,
  countMediaFiles,
  onTaskFinished,
  removeTaskFinishedListener,
} from "../api/whisperApi";

export const useWhisperToolWorkflow = () => {
  const store = useWhisperStore();

  const localExePath = ref("");
  const targetPath = ref("");
  const subFormats = ref(["lrc", "srt", "vtt"]);
  const canStart = computed(() => localExePath.value && targetPath.value);

  const showProgressModal = ref(false);
  const showResultModal = ref(false);
  const resultData = ref({});

  const statusText = computed(() => {
    if (store.isBusy) {
      return "翻译中...";
    }
    return "准备就绪";
  });

  // 打开进度页面
  watch(
    () => store.isBusy,
    (busy) => {
      if (busy) {
        showProgressModal.value = true;
      }
    },
  );

  const getSafePayload = () => {
    const formatsValue = subFormats.value;
    const serializedFormats = (() => {
      try {
        const str = JSON.stringify(formatsValue);
        return JSON.parse(str);
      } catch {
        return ["lrc"];
      }
    })();

    return {
      exePath: localExePath.value,
      targetPath: targetPath.value,
      subFormats: serializedFormats,
    };
  };

  const sanitizePath = (val) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) return val[0] || "";
    if (val.filePath) return val.filePath;
    if (val.filePaths && val.filePaths.length > 0) return val.filePaths[0];
    return "";
  };

  const saveWhisperConfig = async () => {
    const payload = getSafePayload();
    console.log("[WhisperTool] 保存配置:", payload);
    await saveConfig({ whisper: payload });
    console.log("[WhisperTool] 配置保存完成");
  };

  const selectExe = async () => {
    const p = await selectFile("exe");
    if (p) {
      localExePath.value = sanitizePath(p);
      saveWhisperConfig();
    }
  };

  const selectTarget = async () => {
    const p = await selectFile("dir");
    if (p) {
      targetPath.value = sanitizePath(p);
      saveWhisperConfig();
    }
  };

  // 任务完成处理器
  const taskFinishedHandler = () => {
    store.stopTask();
    store.setProgress(100);
    resultData.value = {
      success: true,
      type: "translate",
      title: "翻译任务结束",
    };
    showResultModal.value = true;
  };

  onMounted(async () => {
    console.log("[WhisperTool] 组件挂载，开始加载配置");
    const result = await loadConfig();
    const cfg = result?.data || result;
    console.log("[WhisperTool] 获取到的配置:", cfg?.whisper);
    if (cfg?.whisper) {
      if (cfg.whisper.exePath) {
        localExePath.value = cfg.whisper.exePath;
        console.log("[WhisperTool] 加载 exePath:", cfg.whisper.exePath);
      }
      if (cfg.whisper.targetPath) {
        targetPath.value = cfg.whisper.targetPath;
        console.log("[WhisperTool] 加载 targetPath:", cfg.whisper.targetPath);
      }
      if (cfg.whisper.subFormats && Array.isArray(cfg.whisper.subFormats)) {
        subFormats.value = cfg.whisper.subFormats;
        console.log("[WhisperTool] 加载 subFormats:", cfg.whisper.subFormats);
      }
    } else {
      console.log("[WhisperTool] 未找到 whisper 配置");
    }

    onTaskFinished(taskFinishedHandler);
  });

  // 组件卸载时清理监听器
  onUnmounted(() => {
    removeTaskFinishedListener(taskFinishedHandler);
  });

  const startTranslate = async () => {
    if (!canStart.value) return;
    store.reset(); // 先重置，再启动
    store.startTask();

    try {
      const count = await countMediaFiles(targetPath.value);
      store.totalFiles = count > 0 ? count : 1;
      store.addLog(`扫描到 ${count} 个媒体文件`);
    } catch {
      store.totalFiles = 1;
    }

    const payload = getSafePayload();
    try {
      await saveConfig({ whisper: payload });
      startTask(payload);
    } catch (e) {
      store.addLog(e.message);
      store.stopTask();
    }
  };

  const handleCloseProgress = () => {
    showProgressModal.value = false;
  };

  return {
    store,
    localExePath,
    targetPath,
    subFormats,
    canStart,
    showProgressModal,
    showResultModal,
    resultData,
    statusText,
    selectExe,
    selectTarget,
    startTranslate,
    handleCloseProgress,
  };
};
