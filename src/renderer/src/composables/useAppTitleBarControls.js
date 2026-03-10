import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  getWindowState,
  minimizeWindow as minimizeAppWindow,
  toggleMaximizeWindow as toggleAppMaximizeWindow,
  closeWindow as closeAppWindow,
  isWindowControlSupported,
  onWindowStateChanged,
} from "../api/systemApi";

const WINDOW_FRAME_MODE_CUSTOM = "custom";

export const useAppTitleBarControls = () => {
  const isWindowMaximized = ref(false);
  const isWindowFocused = ref(true);
  const isDarkMode = ref(false);
  const frameMode = ref("system");
  let unsubscribe = null;

  const canUseWindowControls = computed(
    // 仅当平台支持且当前为 custom frame 时才启用自绘标题栏按钮。
    () =>
      isWindowControlSupported() &&
      frameMode.value === WINDOW_FRAME_MODE_CUSTOM,
  );

  const applyWindowState = (state) => {
    if (!state || typeof state !== "object") {
      return;
    }

    // 主进程可能分批推送状态字段，缺失字段按安全默认值兜底。
    isWindowMaximized.value = Boolean(state.maximized);
    isDarkMode.value = Boolean(state.darkMode);
    isWindowFocused.value =
      typeof state.focused === "boolean" ? state.focused : true;
    frameMode.value =
      typeof state.frameMode === "string" ? state.frameMode : "system";
  };

  const syncWindowState = async () => {
    if (!isWindowControlSupported()) return;

    try {
      const state = await getWindowState();
      applyWindowState(state);
    } catch (error) {
      console.warn("[AppTitleBar] 获取窗口状态失败:", error);
    }
  };

  const minimizeWindow = async () => {
    if (!canUseWindowControls.value) return;

    try {
      await minimizeAppWindow();
    } catch (error) {
      console.warn("[AppTitleBar] 最小化窗口失败:", error);
    }
  };

  const toggleMaximizeWindow = async () => {
    if (!canUseWindowControls.value) return;

    try {
      const nextMaximizedState = await toggleAppMaximizeWindow();
      // 使用主进程返回值回写状态，避免前端盲目翻转导致不同步。
      isWindowMaximized.value = Boolean(nextMaximizedState);
    } catch (error) {
      console.warn("[AppTitleBar] 切换窗口最大化失败:", error);
    }
  };

  const closeWindow = async () => {
    if (!canUseWindowControls.value) return;

    try {
      await closeAppWindow();
    } catch (error) {
      console.warn("[AppTitleBar] 关闭窗口失败:", error);
    }
  };

  const handleTitleBarDoubleClick = async () => {
    if (!canUseWindowControls.value) return;
    await toggleMaximizeWindow();
  };

  onMounted(() => {
    syncWindowState();
    // 实时订阅窗口状态变化，处理快捷键/系统手势导致的外部状态切换。
    unsubscribe = onWindowStateChanged((state) => {
      applyWindowState(state);
    });
  });

  onUnmounted(() => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });

  return {
    isWindowMaximized,
    isWindowFocused,
    isDarkMode,
    canUseWindowControls,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    handleTitleBarDoubleClick,
  };
};
