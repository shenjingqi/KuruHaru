import { computed, onMounted, ref } from 'vue';
import { loadConfig, saveConfig } from '../api/configApi';
import { openDirectory, openFile } from '../api/dialogApi';
import { asmrRunAudioDownloader } from '../api/asmrApi';
import { readFile } from '../api/localApi';

const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';
const DEFAULT_MAX_AUTO_TASKS_PER_WORK = 20;

function buildInputStats(rawText = '') {
  const rawLines = String(rawText || '').split(/\r?\n/);
  const nonEmptyLines = rawLines.map((line) => line.trim()).filter(Boolean);
  const uniqueCodes = new Set();
  let recognizedCount = 0;
  let invalidLineCount = 0;

  nonEmptyLines.forEach((line) => {
    const prefixedMatches = [...line.matchAll(/(RJ|VJ|BJ)\d{6,8}/gi)].map(
      (match) => match[0].toUpperCase(),
    );
    const numericMatches = prefixedMatches.length
      ? []
      : [...line.matchAll(/\b\d{6,8}\b/g)].map((match) => `RJ${match[0]}`);
    const candidates = prefixedMatches.length > 0 ? prefixedMatches : numericMatches;

    if (candidates.length === 0) {
      invalidLineCount += 1;
      return;
    }

    recognizedCount += candidates.length;
    candidates.forEach((candidate) => uniqueCodes.add(candidate));
  });

  return {
    lineCount: nonEmptyLines.length,
    recognizedCount,
    uniqueCount: uniqueCodes.size,
    invalidLineCount,
  };
}

function formatSummary(result) {
  const summary = result?.summary || {};
  const lines = [
    `✅ ${result?.message || '音声下载任务处理完成'}`,
    `- 输入行数：${summary.inputCount ?? 0}`,
    `- 有效编号：${summary.validCount ?? 0}`,
    `- 人工复核：${summary.manualCount ?? 0}`,
    `- 生成任务：${summary.taskCount ?? 0}`,
    `- 推送到 Aria2：${summary.pushedCount ?? 0}`,
    `- 推送失败：${summary.pushErrorCount ?? 0}`,
    `- 运行模式：${summary.testMode ? '测试模式（仅生成清单）' : summary.useAria2 ? '生成并推送到 Aria2' : '仅生成清单'}`,
    `- 下载目录：${summary.downloadDir || '未设置'}`,
    `- 单作品自动处理上限：${summary.maxAutoTasksPerWork ?? DEFAULT_MAX_AUTO_TASKS_PER_WORK}`,
  ];

  if (summary.aria2InputPath) {
    lines.push(`- 任务清单：${summary.aria2InputPath}`);
  }

  if (summary.manualReviewPath) {
    lines.push(`- 人工复核：${summary.manualReviewPath}`);
  }

  return lines.join('\n');
}

export const useAsmrDownloaderPage = () => {
  const configSnapshot = ref({ asmr: {}, paths: {} });
  const inputText = ref('');
  const downloadDir = ref('');
  const rpcUrl = ref(DEFAULT_RPC_URL);
  const rpcSecret = ref('');
  const useAria2 = ref(true);
  const testMode = ref(false);
  const maxAutoTasksPerWork = ref(DEFAULT_MAX_AUTO_TASKS_PER_WORK);
  const isSubmitting = ref(false);
  const summaryText = ref('');
  const errorText = ref('');
  const importText = ref('');
  const taskPreview = ref([]);
  const manualItems = ref([]);
  const pushErrors = ref([]);

  const inputStats = computed(() => buildInputStats(inputText.value));

  const canSubmit = computed(
    () => Boolean(inputText.value.trim() && downloadDir.value.trim()) && !isSubmitting.value,
  );

  const hasResult = computed(
    () =>
      Boolean(summaryText.value) ||
      Boolean(errorText.value) ||
      manualItems.value.length > 0 ||
      taskPreview.value.length > 0 ||
      pushErrors.value.length > 0,
  );

  onMounted(async () => {
    const result = await loadConfig();
    const config = result?.data || result || {};
    configSnapshot.value = config;

    if (config?.paths?.asmrDownloadDir) {
      downloadDir.value = config.paths.asmrDownloadDir;
    } else if (config?.paths?.toolOutputDir) {
      downloadDir.value = config.paths.toolOutputDir;
    }

    if (config?.asmr?.downloadRpcUrl) {
      rpcUrl.value = config.asmr.downloadRpcUrl;
    }

    if (typeof config?.asmr?.downloadRpcSecret === 'string') {
      rpcSecret.value = config.asmr.downloadRpcSecret;
    }

    if (typeof config?.asmr?.downloadUseAria2 === 'boolean') {
      useAria2.value = config.asmr.downloadUseAria2;
    }

    if (typeof config?.asmr?.downloadTestMode === 'boolean') {
      testMode.value = config.asmr.downloadTestMode;
    }

    if (Number.isFinite(Number(config?.asmr?.downloadMaxAutoTasksPerWork))) {
      maxAutoTasksPerWork.value = Math.max(
        1,
        Number.parseInt(config.asmr.downloadMaxAutoTasksPerWork, 10) || DEFAULT_MAX_AUTO_TASKS_PER_WORK,
      );
    }
  });

  const selectDownloadDir = async () => {
    const result = await openDirectory();
    if (result?.filePath) {
      downloadDir.value = result.filePath;
    }
  };

  const importFromTxt = async () => {
    try {
      const result = await openFile({
        type: 'file',
        filters: [{ name: 'TXT', extensions: ['txt'] }],
      });

      if (!result?.filePath) {
        return;
      }

      const content = await readFile(result.filePath);
      if (typeof content !== 'string') {
        errorText.value = '❌ 读取 txt 失败：文件内容为空';
        return;
      }

      inputText.value = content.trim();
      importText.value = `已从 ${result.filePath} 导入 ${content.split(/\r?\n/).filter(Boolean).length} 行内容`;
      errorText.value = '';
    } catch (error) {
      errorText.value = `❌ 导入 txt 失败：${error?.message || '未知错误'}`;
    }
  };

  const persistSettings = async () => {
    const nextConfig = {
      asmr: {
        ...(configSnapshot.value?.asmr || {}),
        downloadRpcUrl: rpcUrl.value.trim() || DEFAULT_RPC_URL,
        downloadRpcSecret: rpcSecret.value,
        downloadUseAria2: useAria2.value,
        downloadTestMode: testMode.value,
        downloadMaxAutoTasksPerWork: Math.max(
          1,
          Number.parseInt(String(maxAutoTasksPerWork.value || DEFAULT_MAX_AUTO_TASKS_PER_WORK), 10) || DEFAULT_MAX_AUTO_TASKS_PER_WORK,
        ),
      },
      paths: {
        ...(configSnapshot.value?.paths || {}),
        asmrDownloadDir: downloadDir.value.trim(),
      },
    };

    const saveResult = await saveConfig(nextConfig);
    if (saveResult?.success === false || saveResult === false) {
      return;
    }

    configSnapshot.value = {
      ...configSnapshot.value,
      ...nextConfig,
    };
  };

  const runDownloader = async () => {
    if (!canSubmit.value) {
      return;
    }

    isSubmitting.value = true;
    summaryText.value = '';
    errorText.value = '';
    importText.value = '';
    taskPreview.value = [];
    manualItems.value = [];
    pushErrors.value = [];

    try {
      const result = await asmrRunAudioDownloader({
        inputText: inputText.value,
        downloadDir: downloadDir.value,
        rpcUrl: rpcUrl.value,
        rpcSecret: rpcSecret.value,
        useAria2: useAria2.value,
        testMode: testMode.value,
        maxAutoTasksPerWork: Math.max(
          1,
          Number.parseInt(String(maxAutoTasksPerWork.value || DEFAULT_MAX_AUTO_TASKS_PER_WORK), 10) || DEFAULT_MAX_AUTO_TASKS_PER_WORK,
        ),
      });

      if (!result?.success) {
        errorText.value = `❌ ${result?.message || '音声下载任务处理失败'}`;
        return;
      }

      summaryText.value = formatSummary(result);
      taskPreview.value = Array.isArray(result.taskPreview) ? result.taskPreview : [];
      manualItems.value = Array.isArray(result.manualItems) ? result.manualItems : [];
      pushErrors.value = Array.isArray(result.pushErrors) ? result.pushErrors : [];
      await persistSettings();
    } catch (error) {
      errorText.value = `❌ ${error?.message || '音声下载任务处理失败'}`;
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    inputText,
    downloadDir,
    rpcUrl,
    rpcSecret,
    useAria2,
    testMode,
    maxAutoTasksPerWork,
    isSubmitting,
    summaryText,
    errorText,
    importText,
    taskPreview,
    manualItems,
    pushErrors,
    inputStats,
    canSubmit,
    hasResult,
    selectDownloadDir,
    importFromTxt,
    runDownloader,
  };
};
