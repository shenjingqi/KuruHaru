import { ref, computed, onMounted } from "vue";
import { tgReadRecentActivity, tgScanRecentActivity } from "../api/tgApi";
import { clearCache } from "../api/systemApi";

export const useHomePanelWorkflow = ({ message, dialog }) => {
  const historyList = ref([]);
  const daysSinceUpdate = ref("未知");
  const isLoading = ref(false);

  const lastScanTime = ref(0);
  const SCAN_DEBOUNCE_MS = 3000;

  const recentHistory = computed(() => {
    return historyList.value
      .filter((item) => item.rawDate)
      .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
      .slice(0, 10);
  });

  const totalUploads = computed(() => {
    return historyList.value.length;
  });

  const todayUploads = computed(() => {
    const today = new Date().toDateString();
    return historyList.value.filter((item) => {
      if (!item.rawDate) return false;
      return new Date(item.rawDate).toDateString() === today;
    }).length;
  });

  const getDaysSince = (dateString) => {
    if (!dateString) return "未知";
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? "今天" : `${diffDays} 天前`;
  };

  const refreshData = async () => {
    isLoading.value = true;
    try {
      const recentActivity = await tgReadRecentActivity();
      if (recentActivity && recentActivity.success && recentActivity.data) {
        if (recentActivity.data.files) {
          const fileMap = new Map();
          recentActivity.data.files.forEach((file) => {
            const id = file.rjCode || file.id;
            const existing = fileMap.get(id);

            if (!file.name && file.fileName) {
              file.name = file.fileName;
            }

            if (existing) {
              // 相同 RJ/ID 仅保留最新记录，避免历史重复刷满首页列表。
              const existingDate = new Date(existing.rawDate).getTime();
              const newDate = new Date(file.date).getTime();
              if (newDate > existingDate) {
                fileMap.set(id, {
                  id,
                  date: file.date
                    ? new Date(file.date).toLocaleString("zh-CN")
                    : "未知时间",
                  rawDate: file.date,
                  name: file.name || file.fileName || "unknown",
                });
              }
            } else {
              fileMap.set(id, {
                id,
                date: file.date
                  ? new Date(file.date).toLocaleString("zh-CN")
                  : "未知时间",
                rawDate: file.date,
                name: file.name || file.fileName || "unknown",
              });
            }
          });
          historyList.value = Array.from(fileMap.values());
        }

        const metadata = recentActivity.data?.metadata;
        if (metadata?.anchor) {
          const refDate = metadata.anchor.date;
          daysSinceUpdate.value = getDaysSince(refDate);
        } else if (metadata?.currentAnchor) {
          const refDate = metadata.currentAnchor.date;
          daysSinceUpdate.value = getDaysSince(refDate);
        } else if (metadata?.referenceFile) {
          const refDate = metadata.referenceFile.date;
          daysSinceUpdate.value = getDaysSince(refDate);
        }
      }
    } catch (e) {
      console.error("刷新数据失败:", e);
    } finally {
      isLoading.value = false;
    }
  };

  const scanInBackground = async () => {
    try {
      await tgScanRecentActivity();
      await refreshData();
    } catch (e) {
      console.error("后台扫描失败:", e);
    }
  };

  const handleManualScan = async () => {
    console.log("🔥 HOME PANEL BUTTON CLICKED");

    if (isLoading.value) {
      message.warning("扫描正在进行中，请稍候...");
      return;
    }

    const now = Date.now();
    const timeSinceLastScan = now - lastScanTime.value;
    // 手动扫描设置短防抖，避免用户连续点击触发并发请求。
    if (timeSinceLastScan < SCAN_DEBOUNCE_MS) {
      const remainingSeconds = Math.ceil(
        (SCAN_DEBOUNCE_MS - timeSinceLastScan) / 1000,
      );
      message.warning(`请等待 ${remainingSeconds} 秒后再试`);
      return;
    }

    lastScanTime.value = now;
    isLoading.value = true;

    const loadingMessage = message.loading("正在连接 Telegram 扫描文件...", {
      duration: 0,
    });

    try {
      // 先展示现有缓存，再执行扫描并二次刷新，降低等待感知。
      console.log("🔥 SHOWING CACHED DATA FIRST");
      await refreshData();

      console.log("🔥 RUNNING SCAN IN BACKGROUND");
      const result = await tgScanRecentActivity();
      await refreshData();

      loadingMessage.destroy();

      if (result && result.success) {
        const fileCount = historyList.value.length;
        dialog.success({
          title: "扫描完成",
          content: `成功获取到 ${fileCount} 个文件`,
          positiveText: "确定",
        });
      } else {
        dialog.error({
          title: "扫描失败",
          content: result?.error || "未知错误，请检查网络连接或配置",
          positiveText: "确定",
        });
      }
    } catch (e) {
      loadingMessage.destroy();

      console.error("手动扫描失败:", e);
      dialog.error({
        title: "扫描出错",
        content: e?.message || "扫描过程出错，请检查网络或控制台日志",
        positiveText: "确定",
      });
    } finally {
      isLoading.value = false;
    }
  };

  const handleClearCache = () => {
    dialog.warning({
      title: "确认删除缓存",
      content: "确定要删除最近上传的缓存数据吗？删除后将重新扫描。",
      positiveText: "确定删除",
      negativeText: "取消",
      onPositiveClick: async () => {
        try {
          isLoading.value = true;
          message.info("正在删除缓存...");

          const clearResult = await clearCache("recent_activity.json");

          if (clearResult.success) {
            message.success("缓存已删除");
            // 清缓存后立即刷新，确保首页状态与磁盘缓存一致。
            await refreshData();
          } else {
            message.error("删除缓存失败: " + (clearResult.error || "未知错误"));
          }
        } catch (e) {
          console.error("删除缓存失败:", e);
          message.error("删除缓存失败: " + e.message);
        } finally {
          isLoading.value = false;
        }
      },
    });
  };

  onMounted(async () => {
    await refreshData();
    scanInBackground();
  });

  return {
    daysSinceUpdate,
    isLoading,
    recentHistory,
    totalUploads,
    todayUploads,
    handleManualScan,
    handleClearCache,
  };
};
