import { ref } from "vue";
import { tgDownloadFiles } from "../api/tgApi";

export const useRecentActivityDownload = ({ selectedFiles }) => {
  const isDownloading = ref(false);
  const isCancelled = ref(false);
  const downloadedCount = ref(0);
  const skippedCount = ref(0);
  const downloadProgress = ref(0);
  const downloadTotalCount = ref(0);
  const currentFile = ref("");
  const failedFiles = ref([]);
  const concurrentCount = ref(3);
  const activeSessionId = ref(0);

  const createSession = () => {
    activeSessionId.value += 1;
    return activeSessionId.value;
  };

  const isSessionActive = (sessionId) => activeSessionId.value === sessionId;

  const startDownload = async () => {
    if (selectedFiles.value.length === 0 || isDownloading.value) return;

    const sessionId = createSession();

    isDownloading.value = true;
    downloadedCount.value = 0;
    skippedCount.value = 0;
    downloadProgress.value = 0;
    failedFiles.value = [];
    currentFile.value = "";
    isCancelled.value = false;

    const filesToDownload = [...selectedFiles.value];
    const total = filesToDownload.length;
    const maxConcurrent = Math.min(
      Math.max(Number(concurrentCount.value) || 1, 1),
      10,
    );
    downloadTotalCount.value = total;
    const totalBatches = Math.ceil(total / maxConcurrent);
    // 按批次并发下载：每批固定并发数，批间串行推进便于统计进度。

    try {
      for (let i = 0; i < total; i += maxConcurrent) {
        // 取消只在批次边界生效，避免中途打断已发出的请求 Promise。
        if (isCancelled.value || !isSessionActive(sessionId)) break;

        const batch = filesToDownload.slice(i, i + maxConcurrent);
        const batchIndex = Math.floor(i / maxConcurrent) + 1;
        const invalidFiles = batch
          .filter((file) => !file.name || !file.tgMessageId)
          .map((file) => ({
            success: false,
            file,
            error: !file.name ? "文件缺少名称" : "文件缺少 tgMessageId",
          }));

        const validItems = batch
          .filter((file) => file.name && file.tgMessageId)
          .map((file) => ({
            fileId: file.id,
            fileName: file.name,
            tgMessageId: file.tgMessageId,
          }));

        const batchResult =
          validItems.length > 0
            ? await tgDownloadFiles({
                batchIndex,
                totalBatches,
                items: validItems,
                concurrency: maxConcurrent,
              })
            : { results: [] };

        if (!isSessionActive(sessionId)) {
          return;
        }

        const normalizedResults = (batchResult.results || []).map((result) => ({
          success: result.success,
          skipped: result.skipped,
          file: batch.find(
            (item) =>
              item.tgMessageId === result.tgMessageId &&
              item.id === result.fileId,
          ) ||
            batch.find((item) => item.tgMessageId === result.tgMessageId) || {
              id: result.fileId,
              name: result.fileName,
            },
          error: result.error || result.msg,
        }));

        const results = [...normalizedResults, ...invalidFiles];

        for (const result of results) {
          if (result.skipped) {
            skippedCount.value++;
          } else if (result.success) {
            downloadedCount.value++;
          } else {
            failedFiles.value.push({
              name: result.file.name,
              error: result.error || "下载失败",
            });
          }
        }

        const processed =
          downloadedCount.value + skippedCount.value + failedFiles.value.length;
        // 进度按“成功+跳过+失败”累计，保证最终一定收敛到 100%。
        downloadProgress.value = Math.round((processed / total) * 100);
      }

      if (!isSessionActive(sessionId)) {
        return;
      }

      const successCount = downloadedCount.value;
      const skipCount = skippedCount.value;
      const failCount = failedFiles.value.length;

      let message = `下载完成！`;
      if (successCount > 0) message += `新下载 ${successCount} 个`;
      if (skipCount > 0) message += `，已存在跳过 ${skipCount} 个`;
      if (failCount > 0) message += `，失败 ${failCount} 个`;

      if (failCount > 0) {
        const failMsg = failedFiles.value
          .map((f) => `${f.name}: ${f.error}`)
          .join("\n");
        alert(`${message}\n\n${failMsg}`);
      } else {
        alert(message);
      }
    } catch (e) {
      if (isSessionActive(sessionId)) {
        alert(`下载失败: ${e.message}`);
      }
    } finally {
      if (isSessionActive(sessionId)) {
        isDownloading.value = false;
        currentFile.value = "";
      }
    }
  };

  const cancelDownload = () => {
    // 取消当前会话：进行中的 IPC 可能仍会自然结束，但旧结果不会再污染新一轮状态。
    createSession();
    isCancelled.value = true;
    isDownloading.value = false;
    currentFile.value = "";
  };

  return {
    isDownloading,
    downloadedCount,
    skippedCount,
    downloadProgress,
    downloadTotalCount,
    currentFile,
    failedFiles,
    concurrentCount,
    startDownload,
    cancelDownload,
  };
};
