import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useWhisperStore } from "../stores/whisper";
import { selectFile } from "../api/dialogApi";
import { loadConfig, saveConfig } from "../api/configApi";
import {
  startTask,
  countMediaFiles,
  onLogUpdate,
  onTaskFinished,
} from "../api/whisperApi";
import {
  cloneWhisperTaskPayload,
  classifyWhisperTaskResult,
  formatWhisperAutoRestartAbortLog,
  formatWhisperAutoRestartLog,
  WHISPER_AUTO_RESTART_DELAY_MS,
  WHISPER_MAX_AUTO_RESTARTS,
  WHISPER_MAX_STALLED_RESTARTS,
} from "../utils/whisperTaskRecovery";

export const useWhisperToolWorkflow = () => {
  const store = useWhisperStore();

  const localExePath = ref("");
  const targetPath = ref("");
  const subFormats = ref(["lrc", "srt", "vtt"]);
  const canStart = computed(() => localExePath.value && targetPath.value);

  const showProgressModal = ref(false);
  const showResultModal = ref(false);
  const resultData = ref({});
  const isAutoRestartPending = ref(false);
  const isStartLocked = computed(
    () => store.isBusy || isAutoRestartPending.value,
  );

  const autoRestartCount = ref(0);
  const stalledRestartCount = ref(0);
  const runProgressObserved = ref(false);

  let restartTimer = null;
  let unsubscribeLogUpdate = null;
  let unsubscribeTaskFinished = null;
  let lastTaskPayload = null;

  const statusText = computed(() => {
    if (isAutoRestartPending.value) {
      return "自动恢复中...";
    }
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

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    isAutoRestartPending.value = false;
  };

  const resetRecoveryState = () => {
    clearRestartTimer();
    autoRestartCount.value = 0;
    stalledRestartCount.value = 0;
    runProgressObserved.value = false;
    lastTaskPayload = null;
  };

  const resetProgressState = ({ preserveLogs = false } = {}) => {
    if (preserveLogs) {
      store.setProgress(0);
      store.currentFile = "";
      store.processedCount = 0;
      store.totalFiles = 0;
    } else {
      store.reset();
    }
  };

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

  const applyWhisperLogUpdate = (data) => {
    const msg = typeof data === "string" ? data : data?.msg || "";
    const type = typeof data === "object" ? data?.type : "whisper";

    if (type === "whisper-progress") {
      const nextProgress = Number.parseInt(data?.progress, 10);
      const currentIndex = Number.parseInt(data?.currentIndex, 10);
      const total = Number.parseInt(data?.totalFiles, 10);
      const fileName = data?.file || data?.currentFile || "";

      if (Number.isFinite(nextProgress)) {
        store.setProgress(nextProgress);
      }
      if (Number.isFinite(currentIndex) && Number.isFinite(total)) {
        store.setFileInfo(fileName, currentIndex, total);
      }
      if (
        (Number.isFinite(currentIndex) && currentIndex > 0) ||
        nextProgress > 0
      ) {
        runProgressObserved.value = true;
      }
      return;
    }

    if (type !== "whisper") {
      return;
    }

    store.addLog(msg);

    const translateMatch = msg.match(/正在翻译[（(](\d+)\/(\d+)[）)]/);
    if (translateMatch) {
      store.processedCount = Number.parseInt(translateMatch[1], 10);
      store.totalFiles = Number.parseInt(translateMatch[2], 10);
      runProgressObserved.value = true;
    }

    const fileMatch = msg.match(/Processing[:\s]+(.+)/i);
    if (fileMatch) {
      store.currentFile = fileMatch[1].trim().split(/[/\\]/).pop();
    }
  };

  const refreshMediaCount = async (pathValue) => {
    try {
      const count = await countMediaFiles(pathValue);
      store.totalFiles = count > 0 ? count : 1;
      store.addLog(`扫描到 ${count} 个媒体文件`);
    } catch {
      store.totalFiles = 1;
    }
  };

  const runWhisperTask = async ({
    payload,
    preserveLogs = false,
    isAutoRestart = false,
  }) => {
    if (!payload) {
      return;
    }

    const safePayload = cloneWhisperTaskPayload(payload);
    if (!safePayload) {
      store.addLog("[系统] 无法创建可重试的任务参数，已取消自动恢复。");
      store.stopTask();
      clearRestartTimer();
      return;
    }

    clearRestartTimer();
    runProgressObserved.value = false;
    lastTaskPayload = safePayload;
    resetProgressState({ preserveLogs });
    store.startTask();

    if (isAutoRestart) {
      store.addLog("[系统] 已重新触发“开始翻译”");
    }

    await refreshMediaCount(safePayload.targetPath);

    try {
      await saveConfig({ whisper: safePayload });
      startTask(safePayload);
    } catch (e) {
      store.addLog(e.message);
      store.stopTask();
      clearRestartTimer();
    }
  };

  const handleTaskFailure = (taskState) => {
    const nextAutoRestartCount = autoRestartCount.value + 1;
    const nextStalledRestartCount = runProgressObserved.value
      ? 0
      : stalledRestartCount.value + 1;

    const canAutoRestart =
      taskState.isRecoverable &&
      Boolean(lastTaskPayload) &&
      nextAutoRestartCount <= WHISPER_MAX_AUTO_RESTARTS &&
      nextStalledRestartCount <= WHISPER_MAX_STALLED_RESTARTS;

    autoRestartCount.value = nextAutoRestartCount;
    stalledRestartCount.value = nextStalledRestartCount;

    if (canAutoRestart) {
      isAutoRestartPending.value = true;
      store.addLog(
        formatWhisperAutoRestartLog({
          attempt: nextAutoRestartCount,
          delayMs: WHISPER_AUTO_RESTART_DELAY_MS,
          exitCode: taskState.exitCode,
          stalledAttempt: nextStalledRestartCount,
        }),
      );
      restartTimer = setTimeout(() => {
        restartTimer = null;
        runWhisperTask({
          payload: lastTaskPayload,
          preserveLogs: true,
          isAutoRestart: true,
        });
      }, WHISPER_AUTO_RESTART_DELAY_MS);
      return true;
    }

    if (taskState.isRecoverable) {
      store.addLog(
        formatWhisperAutoRestartAbortLog({
          attempt: nextAutoRestartCount,
          stalledAttempt: nextStalledRestartCount,
        }),
      );
    }

    return false;
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
  const taskFinishedHandler = (_event, taskResult = {}) => {
    store.stopTask();

    const taskState = classifyWhisperTaskResult(taskResult);
    const recoveredCount = autoRestartCount.value;

    if (taskState.isUserStop) {
      store.addLog("[系统] 翻译任务已停止");
      resetRecoveryState();
      return;
    }

    if (taskState.isError) {
      store.addLog(`[系统] 翻译任务异常结束：${taskState.errorText}`);

      if (handleTaskFailure(taskState)) {
        return;
      }

      resetRecoveryState();
      resultData.value = {
        success: false,
        type: "translate",
        title: "翻译任务失败",
        message: taskState.errorText,
      };
      showResultModal.value = true;
      return;
    }

    if (store.totalFiles > 0) {
      store.processedCount = store.totalFiles;
    }
    store.setProgress(100);
    store.addLog("[系统] 翻译任务完成");
    resultData.value = {
      success: true,
      type: "translate",
      title: "翻译任务结束",
      message: recoveredCount > 0 ? `期间自动恢复 ${recoveredCount} 次。` : "",
    };
    resetRecoveryState();
    showResultModal.value = true;
  };

  onMounted(async () => {
    unsubscribeLogUpdate = onLogUpdate?.(applyWhisperLogUpdate) || null;
    unsubscribeTaskFinished = onTaskFinished?.(taskFinishedHandler) || null;

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
  });

  // 组件卸载时清理监听器
  onUnmounted(() => {
    clearRestartTimer();
    if (typeof unsubscribeLogUpdate === "function") {
      unsubscribeLogUpdate();
      unsubscribeLogUpdate = null;
    }
    if (typeof unsubscribeTaskFinished === "function") {
      unsubscribeTaskFinished();
      unsubscribeTaskFinished = null;
    }
  });

  const startTranslate = async () => {
    if (!canStart.value || isStartLocked.value) return;
    showResultModal.value = false;
    resultData.value = {};
    resetRecoveryState();
    const payload = getSafePayload();
    await runWhisperTask({ payload });
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
    isStartLocked,
    selectExe,
    selectTarget,
    startTranslate,
    handleCloseProgress,
  };
};
