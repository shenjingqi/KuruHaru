import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useWhisperStore } from "../stores/whisper";
import { stopTask as stopWhisperTask } from "../api/whisperApi";

export const useWhisperProgressWorkflow = () => {
  const store = useWhisperStore();
  const logRef = ref(null);

  const overallProgress = computed(() => {
    if (store.totalFiles > 0) {
      return Math.max(
        store.progressValue,
        Math.round((store.processedCount / store.totalFiles) * 100),
      );
    }
    return store.progressValue;
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

  onMounted(() => {
    scrollToBottom();
  });

  watch(
    () => store.logs.length,
    () => {
      scrollToBottom();
    },
  );

  watch(
    () => store.currentFile,
    () => {
      scrollToBottom();
    },
  );

  watch(
    () => store.isBusy,
    (busy) => {
      if (!busy) {
        scrollToBottom();
      }
    },
  );

  return {
    store,
    logRef,
    overallProgress,
    statusText,
    formatTime,
    stopTask,
  };
};
