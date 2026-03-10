import { ref } from "vue";
import { tgDownloadFile } from "../api/tgApi";

export const useRecentActivityDownload = ({ selectedFiles }) => {
  const isDownloading = ref(false);
  const isCancelled = ref(false);
  const downloadedCount = ref(0);
  const skippedCount = ref(0);
  const downloadProgress = ref(0);
  const currentFile = ref("");
  const failedFiles = ref([]);
  const concurrentCount = ref(3);

  const startDownload = async () => {
    if (selectedFiles.value.length === 0 || isDownloading.value) return;

    isDownloading.value = true;
    downloadedCount.value = 0;
    skippedCount.value = 0;
    downloadProgress.value = 0;
    failedFiles.value = [];
    currentFile.value = "";
    isCancelled.value = false;

    const filesToDownload = [...selectedFiles.value];
    const total = filesToDownload.length;
    const maxConcurrent = concurrentCount.value;
    // 按批次并发下载：每批固定并发数，批间串行推进便于统计进度。

    const downloadWorker = async (file) => {
      if (isCancelled.value) return { success: false, file };

      if (!file.name) {
        console.warn(`[downloadWorker] File missing 'name', id=${file.id}`);
        return { success: false, file, error: "文件缺少名称" };
      }

      try {
        const result = await tgDownloadFile({
          fileId: file.id,
          fileName: file.name,
          tgMessageId: file.tgMessageId,
        });
        return {
          success: result.success,
          skipped: result.skipped,
          file,
          error: result.error || result.msg,
        };
      } catch (e) {
        return { success: false, file, error: e.message };
      }
    };

    try {
      for (let i = 0; i < total; i += maxConcurrent) {
        // 取消只在批次边界生效，避免中途打断已发出的请求 Promise。
        if (isCancelled.value) break;

        const batch = filesToDownload.slice(i, i + maxConcurrent);
        const results = await Promise.all(batch.map(downloadWorker));

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
      alert(`下载失败: ${e.message}`);
    } finally {
      isDownloading.value = false;
      currentFile.value = "";
    }
  };

  const cancelDownload = () => {
    // 当前为软取消：标记状态并阻止后续批次，不会强制终止进行中的单请求。
    isCancelled.value = true;
    isDownloading.value = false;
    currentFile.value = "";
  };

  return {
    isDownloading,
    downloadedCount,
    skippedCount,
    downloadProgress,
    currentFile,
    failedFiles,
    concurrentCount,
    startDownload,
    cancelDownload,
  };
};
