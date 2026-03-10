import { computed, onUnmounted } from "vue";
import { getWindowBounds, setWindowBounds } from "../api/systemApi";

const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 620;

export const useWindowManualResize = ({ showCustomTitleBar, windowState }) => {
  const canShowResizeHandles = computed(
    // 自定义标题栏且非最大化时才允许手动拖拽边框。
    () => showCustomTitleBar?.value && !windowState?.value?.maximized,
  );

  let resizeContext = null;
  let rafId = null;
  let pendingEvent = null;

  const applyResize = async (event) => {
    if (!resizeContext || !event) return;

    const { direction, startMouseX, startMouseY, startBounds } = resizeContext;
    const deltaX = event.screenX - startMouseX;
    const deltaY = event.screenY - startMouseY;

    let nextX = startBounds.x;
    let nextY = startBounds.y;
    let nextWidth = startBounds.width;
    let nextHeight = startBounds.height;

    if (direction.includes("right")) {
      nextWidth = Math.max(MIN_WINDOW_WIDTH, startBounds.width + deltaX);
    }

    if (direction.includes("left")) {
      nextWidth = Math.max(MIN_WINDOW_WIDTH, startBounds.width - deltaX);
      // 从左/上侧收缩时需要补偿 x/y，保证拖拽边缘贴合鼠标方向。
      nextX = startBounds.x + (startBounds.width - nextWidth);
    }

    if (direction.includes("bottom")) {
      nextHeight = Math.max(MIN_WINDOW_HEIGHT, startBounds.height + deltaY);
    }

    if (direction.includes("top")) {
      nextHeight = Math.max(MIN_WINDOW_HEIGHT, startBounds.height - deltaY);
      nextY = startBounds.y + (startBounds.height - nextHeight);
    }

    await setWindowBounds({
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: Math.round(nextWidth),
      height: Math.round(nextHeight),
    });
  };

  const flushPendingResize = async () => {
    rafId = null;
    const event = pendingEvent;
    pendingEvent = null;
    await applyResize(event);
  };

  const onMouseMove = (event) => {
    if (!resizeContext) return;
    pendingEvent = event;

    // 用 RAF 合并高频 mousemove，降低跨进程 setWindowBounds 压力。
    if (!rafId) {
      rafId = window.requestAnimationFrame(() => {
        flushPendingResize().catch((error) => {
          console.warn("[WindowResize] 应用窗口尺寸失败:", error);
        });
      });
    }
  };

  const cleanupResize = () => {
    resizeContext = null;
    pendingEvent = null;
    // 始终移除全局监听，避免鼠标释放后仍持续响应拖拽。
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", cleanupResize, true);

    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const startManualResize = async (direction, event) => {
    if (!canShowResizeHandles.value) return;
    if (!event || event.button !== 0) return;

    try {
      const bounds = await getWindowBounds();
      if (!bounds) return;

      resizeContext = {
        direction,
        startMouseX: event.screenX,
        startMouseY: event.screenY,
        startBounds: bounds,
      };

      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", cleanupResize, true);
    } catch (error) {
      console.warn("[WindowResize] 获取窗口尺寸失败:", error);
    }
  };

  onUnmounted(() => {
    cleanupResize();
  });

  return {
    canShowResizeHandles,
    startManualResize,
  };
};
