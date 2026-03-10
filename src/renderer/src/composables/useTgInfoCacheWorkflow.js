import { ref, onMounted } from "vue";
import { tgInfoCacheBuild, tgInfoCacheStatus } from "../api/tgApi";
import { openFile } from "../api/dialogApi";

const RECENT_TXT_PATHS_KEY = "tg-info-cache-recent-txt-v1";
const RECENT_TXT_PATHS_LIMIT = 6;

function loadRecentTxtPaths() {
  try {
    const raw = localStorage.getItem(RECENT_TXT_PATHS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, RECENT_TXT_PATHS_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentTxtPaths(paths) {
  try {
    localStorage.setItem(RECENT_TXT_PATHS_KEY, JSON.stringify(paths));
  } catch {
    // 忽略本地存储异常，避免影响主流程。
  }
}

export const useTgInfoCacheWorkflow = ({ message }) => {
  const isBuilding = ref(false);
  const isRefreshing = ref(false);
  const inputFilePath = ref("");
  const buildConcurrency = ref(5);
  const statusResult = ref(null);
  const buildResult = ref(null);
  const recentTxtPaths = ref([]);

  const pushRecentTxtPath = (pathValue) => {
    const normalizedPath = String(pathValue || "").trim();
    if (!normalizedPath) {
      return;
    }

    const deduped = [
      normalizedPath,
      ...recentTxtPaths.value.filter((item) => item !== normalizedPath),
    ].slice(0, RECENT_TXT_PATHS_LIMIT);

    recentTxtPaths.value = deduped;
    saveRecentTxtPaths(deduped);
  };

  const refreshStatus = async () => {
    isRefreshing.value = true;
    try {
      statusResult.value = await tgInfoCacheStatus();
    } catch (error) {
      message.error(`读取缓存状态失败: ${error.message}`);
    } finally {
      isRefreshing.value = false;
    }
  };

  const pickTxtFile = async () => {
    try {
      const result = await openFile({
        type: "file",
        filters: [{ name: "TXT", extensions: ["txt"] }],
      });

      if (result?.filePath) {
        inputFilePath.value = result.filePath;
        pushRecentTxtPath(result.filePath);
      }
    } catch (error) {
      message.error(`打开文件选择器失败: ${error.message}`);
    }
  };

  const buildCacheFromTxt = async () => {
    const normalizedPath = inputFilePath.value.trim();
    if (!normalizedPath) {
      message.warning("请输入 TXT 文件路径");
      return;
    }

    const normalizedConcurrency = Number.parseInt(buildConcurrency.value, 10);
    const maxConcurrency = Number.isFinite(normalizedConcurrency)
      ? Math.max(1, Math.min(20, normalizedConcurrency))
      : 5;

    buildConcurrency.value = maxConcurrency;

    isBuilding.value = true;
    try {
      const result = await tgInfoCacheBuild({
        inputFilePath: normalizedPath,
        maxConcurrency,
      });
      buildResult.value = result;

      if (result?.success) {
        message.success(result.message || "作品信息缓存构建成功");
        pushRecentTxtPath(normalizedPath);
        inputFilePath.value = "";
        await refreshStatus();
      } else {
        message.error(result?.error || result?.message || "构建失败");
      }
    } catch (error) {
      buildResult.value = {
        success: false,
        error: `构建失败: ${error.message}`,
      };
      message.error(`构建失败: ${error.message}`);
    } finally {
      isBuilding.value = false;
    }
  };

  const useRecentPath = (pathValue) => {
    const normalizedPath = String(pathValue || "").trim();
    if (!normalizedPath) {
      return;
    }

    inputFilePath.value = normalizedPath;
    pushRecentTxtPath(normalizedPath);
  };

  onMounted(() => {
    recentTxtPaths.value = loadRecentTxtPaths();
    refreshStatus();
  });

  return {
    isBuilding,
    isRefreshing,
    inputFilePath,
    buildConcurrency,
    statusResult,
    buildResult,
    recentTxtPaths,
    refreshStatus,
    pickTxtFile,
    buildCacheFromTxt,
    useRecentPath,
  };
};
