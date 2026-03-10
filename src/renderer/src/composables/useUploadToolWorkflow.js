import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  toRaw,
} from "vue";
import { loadConfig, saveConfig } from "../api/configApi";
import { openFile, selectFile } from "../api/dialogApi";
import { scanLocalArchives } from "../api/localApi";
import {
  tgCheckLogin,
  tgUploadFiles,
  tgCancelUpload,
  tgAuthReply,
  onTgUploadFinished,
  onLogUpdate,
  removeAllListeners,
} from "../api/tgApi";

export const useUploadToolWorkflow = () => {
  const mode = ref("scan");
  const tgConnected = ref(false);
  const uploadChannelId = ref("");
  const scannedFiles = ref([]);
  const selectedFiles = ref([]);
  const manualFiles = ref([]);
  const logs = ref([]);
  const logRef = ref(null);
  const authNeeded = ref(false);
  const authCode = ref("");
  const isUploading = ref(false);

  const filesToUpload = computed(() =>
    // 上传来源按模式切换：扫描模式走勾选列表，手动模式走拖拽/选择列表。
    mode.value === "scan" ? selectedFiles.value : manualFiles.value,
  );

  const isAllSelected = computed({
    get: () =>
      scannedFiles.value.length > 0 &&
      selectedFiles.value.length === scannedFiles.value.length,
    set: (val) => {
      selectedFiles.value = val ? [...scannedFiles.value] : [];
    },
  });

  let connTimer = null;
  let disposeUploadFinishedListener = null;

  const checkTgConnection = async () => {
    const connected = await tgCheckLogin();
    tgConnected.value = connected;
  };

  watch(uploadChannelId, (val) => saveConfig({ upload: { channelId: val } }));

  const getFileName = (p) =>
    typeof p === "string" ? p.split(/[\\/]/).pop() : "";

  const scanArchives = async () => {
    const dir = await selectFile("dir");
    if (dir && dir.filePath) {
      const res = await scanLocalArchives(dir.filePath);
      scannedFiles.value = res;
    }
  };

  const clearScan = () => {
    scannedFiles.value = [];
    selectedFiles.value = [];
  };

  const handleDrop = (e) => {
    const newFiles = Array.from(e.dataTransfer.files).map((f) => ({
      code: "",
      path: f.path,
      name: f.name,
    }));
    manualFiles.value.push(...newFiles);
  };

  const selectZipFiles = async () => {
    const p = await openFile({
      type: "file",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (p && p.filePaths) {
      const newFiles = p.filePaths.map((filePath) => ({
        code: "",
        path: filePath,
        name: filePath.split(/[\\/]/).pop(),
      }));
      manualFiles.value.push(...newFiles);
    }
  };

  const submitAuth = () => {
    tgAuthReply({ code: authCode.value, cancel: false });
    authNeeded.value = false;
  };

  const uploadFiles = async () => {
    const connected = await tgCheckLogin();
    if (!connected) {
      logs.value.push("未连接 Telegram，请先去个人设置登录");
      return;
    }
    // 先去响应式代理再深拷贝，避免 IPC 传输过程中携带 Vue 内部字段。
    const files = JSON.parse(JSON.stringify(toRaw(filesToUpload.value) || []));
    if (files.length === 0) return;

    isUploading.value = true;
    logs.value.push(`开始上传 ${files.length} 个文件...`);

    tgUploadFiles({
      files,
      channelId: uploadChannelId.value,
    });
  };

  const cancelUpload = async () => {
    await tgCancelUpload();
    isUploading.value = false;
    logs.value.push("⚠️ 已发送取消请求，正在停止当前任务...");
  };

  const goToSettings = () => {
    window.dispatchEvent(
      new CustomEvent("change-view", { detail: "settings" }),
    );
  };

  onMounted(async () => {
    const result = await loadConfig();
    const cfg = result?.data || result;
    if (cfg?.upload?.channelId) {
      uploadChannelId.value = cfg.upload.channelId;
    }

    checkTgConnection();
    connTimer = setInterval(checkTgConnection, 30000);

    onLogUpdate((data) => {
      const msg = data?.msg || data || "";
      const type = data?.type || "tg";
      if (type === "tg") {
        logs.value.push(msg);

        // 以后端日志关键字作为兜底结束信号，避免上传状态卡死。
        if (
          msg.includes("全部完成") ||
          msg.includes("任务已中断") ||
          msg.includes("停止后续任务")
        ) {
          isUploading.value = false;
        }

        nextTick(() => {
          if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight;
        });
      }
    });

    disposeUploadFinishedListener = onTgUploadFinished(() => {
      isUploading.value = false;
    });
  });

  onUnmounted(() => {
    if (connTimer) clearInterval(connTimer);
    if (typeof disposeUploadFinishedListener === "function") {
      disposeUploadFinishedListener();
    }
    // 组件卸载时清理全局监听，防止进入页面后日志重复追加。
    removeAllListeners("log-update");
    removeAllListeners("tg-upload-finished");
  });

  return {
    mode,
    tgConnected,
    uploadChannelId,
    scannedFiles,
    selectedFiles,
    manualFiles,
    logs,
    logRef,
    authNeeded,
    authCode,
    isUploading,
    filesToUpload,
    isAllSelected,
    getFileName,
    scanArchives,
    clearScan,
    handleDrop,
    selectZipFiles,
    submitAuth,
    uploadFiles,
    cancelUpload,
    goToSettings,
  };
};
