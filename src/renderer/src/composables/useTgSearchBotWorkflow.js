import { ref, onMounted } from "vue";
import {
  tgBotStatus,
  tgBotStart,
  tgBotStop,
  tgBotSearch,
  tgBotInfo,
  tgBotSyncHistory,
  tgBotGenerateDailyZip,
  tgInfoCacheStatus,
} from "../api/tgApi";

export const useTgSearchBotWorkflow = ({ message }) => {
  // Bot 状态
  const botStatus = ref({
    running: false,
    connected: false,
  });

  // 控制加载状态
  const isStarting = ref(false);
  const isStopping = ref(false);
  const isSearching = ref(false);
  const isInfoSearching = ref(false);
  const isSyncingHistory = ref(false);
  const isGeneratingDailyZip = ref(false);

  // 搜索相关
  const searchRjCode = ref("");
  const searchResult = ref(null);
  const infoWorkCode = ref("");
  const infoResult = ref(null);
  const syncResult = ref(null);
  const infoCacheStatusResult = ref(null);
  const dailyZipResult = ref(null);

  // 获取 Bot 状态
  const getBotStatus = async () => {
    try {
      const result = await tgBotStatus();
      botStatus.value = result || {
        running: false,
        connected: false,
        indexedCount: 0,
        historyFilePath: "",
        sourceChannelId: "",
      };
    } catch (error) {
      console.error("获取 Bot 状态失败:", error);
    }
  };

  // 获取信息缓存状态
  const getInfoCacheStatusResult = async () => {
    try {
      infoCacheStatusResult.value = await tgInfoCacheStatus();
    } catch (error) {
      console.error("获取信息缓存状态失败:", error);
    }
  };

  // 启动 Bot
  const handleStartBot = async () => {
    isStarting.value = true;
    try {
      const result = await tgBotStart();
      if (result.success) {
        message.success("Bot 启动成功");
        await getBotStatus();
      } else {
        message.error(result.error || "Bot 启动失败");
      }
    } catch (error) {
      message.error(`启动失败: ${error.message}`);
    } finally {
      isStarting.value = false;
    }
  };

  // 停止 Bot
  const handleStopBot = async () => {
    isStopping.value = true;
    try {
      const result = await tgBotStop();
      if (result.success) {
        message.success("Bot 停止成功");
        await getBotStatus();
      } else {
        message.error(result.error || "Bot 停止失败");
      }
    } catch (error) {
      message.error(`停止失败: ${error.message}`);
    } finally {
      isStopping.value = false;
    }
  };

  // 处理搜索
  const handleSearch = async () => {
    const rjCode = searchRjCode.value.trim();
    if (!rjCode) {
      message.warning("请输入 RJ 号");
      return;
    }

    isSearching.value = true;
    try {
      const result = await tgBotSearch(rjCode);
      searchResult.value = result;
    } catch (error) {
      searchResult.value = {
        success: false,
        message: `搜索失败: ${error.message}`,
      };
    } finally {
      isSearching.value = false;
    }
  };

  // 处理作品信息查询
  const handleInfoSearch = async () => {
    const workCode = infoWorkCode.value.trim();
    if (!workCode) {
      message.warning("请输入 RJ/VJ/BJ 编号");
      return;
    }

    isInfoSearching.value = true;
    try {
      const result = await tgBotInfo(workCode);
      infoResult.value = result;
    } catch (error) {
      infoResult.value = {
        success: false,
        message: `查询失败: ${error.message}`,
      };
    } finally {
      isInfoSearching.value = false;
    }
  };

  // 同步频道历史到 Bot 索引文件
  const handleSyncHistory = async () => {
    isSyncingHistory.value = true;

    try {
      const result = await tgBotSyncHistory();

      syncResult.value = result;

      if (result?.success) {
        message.success(result.message || "索引同步成功");
        await getBotStatus();
      } else {
        message.error(result?.error || result?.message || "索引同步失败");
      }
    } catch (error) {
      syncResult.value = {
        success: false,
        error: `同步失败: ${error.message}`,
      };
      message.error(`同步失败: ${error.message}`);
    } finally {
      isSyncingHistory.value = false;
    }
  };

  const handleGenerateDailyZip = async () => {
    isGeneratingDailyZip.value = true;
    try {
      const result = await tgBotGenerateDailyZip();
      dailyZipResult.value = result;
      if (result?.success && result?.url) {
        message.success(
          `整合包已上传：${result.fileName || "kuruharu 每日整合包"}`,
        );
      } else {
        message.error(result?.error || "整合包生成失败");
      }
    } catch (error) {
      dailyZipResult.value = {
        success: false,
        error: `生成失败: ${error.message}`,
      };
      message.error(`整合包生成失败: ${error.message}`);
    } finally {
      isGeneratingDailyZip.value = false;
    }
  };

  // 组件挂载时获取 Bot 状态
  onMounted(() => {
    getBotStatus();
    getInfoCacheStatusResult();
  });

  return {
    botStatus,
    isStarting,
    isStopping,
    isSearching,
    isInfoSearching,
    isSyncingHistory,
    isGeneratingDailyZip,
    searchRjCode,
    searchResult,
    infoWorkCode,
    infoResult,
    syncResult,
    dailyZipResult,
    infoCacheStatusResult,
    getBotStatus,
    getInfoCacheStatusResult,
    handleStartBot,
    handleStopBot,
    handleSearch,
    handleInfoSearch,
    handleSyncHistory,
    handleGenerateDailyZip,
  };
};
