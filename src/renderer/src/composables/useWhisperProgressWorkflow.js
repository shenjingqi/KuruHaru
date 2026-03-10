import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useWhisperStore } from "../stores/whisper";
import {
  stopTask as stopWhisperTask,
  onLogUpdate,
  onTaskFinished,
  removeLogUpdateListener,
  removeTaskFinishedListener,
} from "../api/whisperApi";

export const useWhisperProgressWorkflow = () => {
  const store = useWhisperStore();
  const logRef = ref(null);

  const overallProgress = computed(() => {
    if (store.totalFiles > 0) {
      return Math.round((store.processedCount / store.totalFiles) * 100);
    }
    return 0;
  });

  const statusText = computed(() => {
    if (store.totalFiles > 0) {
      return `正在翻译 (${store.processedCount}/${store.totalFiles})`;
    }
    return "正在翻译...";
  });

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h
      .toString()
      .padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:${(s % 60)
      .toString()
      .padStart(2, "0")}`;
  };

  const stopTask = () => {
    stopWhisperTask();
    store.stopTask();
    store.addLog("[系统] 用户请求停止翻译");
  };

  const scrollToBottom = () => {
    nextTick(() => {
      if (logRef.value) {
        logRef.value.scrollTop = logRef.value.scrollHeight;
      }
    });
  };

  // 保存监听器引用
  let logHandler = null;
  let taskHandler = null;

  onMounted(() => {
    logHandler = (data) => {
      const msg = typeof data === "string" ? data : data?.msg || "";
      const type = typeof data === "object" ? data?.type : "whisper";

      if (type === "whisper-progress") {
        if (data.progress !== undefined) store.setProgress(data.progress);
        if (data.currentFile !== undefined && data.totalFiles !== undefined) {
          store.setFileInfo(data.file || "", data.currentFile, data.totalFiles);
        }
        return;
      }

      if (type === "whisper") {
        store.addLog(msg);
        const translateMatch = msg.match(/正在翻译[（(](\d+)\/(\d+)[）)]/);
        if (translateMatch) {
          store.processedCount = parseInt(translateMatch[1]);
          store.totalFiles = parseInt(translateMatch[2]);
        }
        const fileMatch = msg.match(/Processing[:\s]+(.+)/i);
        if (fileMatch) {
          store.currentFile = fileMatch[1].trim().split(/[/\\]/).pop();
          if (store.processedCount < store.totalFiles) store.processedCount++;
        }
        scrollToBottom();
      }
    };

    taskHandler = () => {
      store.stopTask();
      store.processedCount = store.totalFiles;
      store.addLog("[系统] 翻译任务完成");
      store.addLog(`[系统] 总耗时: ${formatTime(store.elapsedTime)}`);
      scrollToBottom();
    };

    onLogUpdate(logHandler);
    onTaskFinished(taskHandler);
  });

  onUnmounted(() => {
    // 清除所有监听器
    if (logHandler) {
      removeLogUpdateListener(logHandler);
      logHandler = null;
    }
    if (taskHandler) {
      removeTaskFinishedListener(taskHandler);
      taskHandler = null;
    }
  });

  return {
    store,
    logRef,
    overallProgress,
    statusText,
    formatTime,
    stopTask,
  };
};
