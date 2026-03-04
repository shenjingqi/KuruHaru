<template>
  <header class="app-titlebar">
    <div
      class="titlebar-top-strip"
      aria-hidden="true"
      @dblclick="handleTitleBarDoubleClick"
    />

    <div class="titlebar-lower-row" @dblclick="handleTitleBarDoubleClick">
      <div class="titlebar-drag-zone" aria-hidden="true" />

      <div
        v-if="canUseWindowControls"
        class="titlebar-controls no-drag"
        @dblclick.stop
      >
        <button
          class="titlebar-btn"
          type="button"
          title="最小化"
          aria-label="最小化"
          @click.stop="minimizeWindow"
        >
          <svg viewBox="0 0 12 12" class="titlebar-icon" aria-hidden="true">
            <path d="M2 6h8" />
          </svg>
        </button>

        <button
          class="titlebar-btn"
          type="button"
          :title="isWindowMaximized ? '还原' : '最大化'"
          :aria-label="isWindowMaximized ? '还原' : '最大化'"
          @click.stop="toggleMaximizeWindow"
        >
          <svg
            v-if="isWindowMaximized"
            viewBox="0 0 12 12"
            class="titlebar-icon"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="6" height="6" rx="0.6" />
            <path d="M4 4V2h6v6H8" />
          </svg>
          <svg
            v-else
            viewBox="0 0 12 12"
            class="titlebar-icon"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="8" height="8" rx="0.8" />
          </svg>
        </button>

        <button
          class="titlebar-btn titlebar-btn-close"
          type="button"
          title="关闭"
          aria-label="关闭"
          @click.stop="closeWindow"
        >
          <svg viewBox="0 0 12 12" class="titlebar-icon" aria-hidden="true">
            <path d="M2.5 2.5 9.5 9.5" />
            <path d="M9.5 2.5 2.5 9.5" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const isWindowMaximized = ref(false);
let resizeTimer = null;

const canUseWindowControls = computed(() => {
  return Boolean(window.api?.windowControls);
});

const syncMaximizedState = async () => {
  if (!canUseWindowControls.value) return;

  try {
    const maximized = await window.api.windowControls.isMaximized();
    isWindowMaximized.value = Boolean(maximized);
  } catch (error) {
    console.warn("[AppTitleBar] 获取窗口最大化状态失败:", error);
  }
};

const minimizeWindow = async () => {
  if (!canUseWindowControls.value) return;

  try {
    await window.api.windowControls.minimize();
  } catch (error) {
    console.warn("[AppTitleBar] 最小化窗口失败:", error);
  }
};

const toggleMaximizeWindow = async () => {
  if (!canUseWindowControls.value) return;

  try {
    const nextMaximizedState = await window.api.windowControls.toggleMaximize();
    isWindowMaximized.value = Boolean(nextMaximizedState);
  } catch (error) {
    console.warn("[AppTitleBar] 切换窗口最大化失败:", error);
  }
};

const closeWindow = async () => {
  if (!canUseWindowControls.value) return;

  try {
    await window.api.windowControls.close();
  } catch (error) {
    console.warn("[AppTitleBar] 关闭窗口失败:", error);
  }
};

const handleTitleBarDoubleClick = async () => {
  if (!canUseWindowControls.value) return;
  await toggleMaximizeWindow();
};

const handleWindowResize = () => {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer);
  }

  resizeTimer = window.setTimeout(() => {
    syncMaximizedState();
  }, 100);
};

onMounted(() => {
  syncMaximizedState();
  window.addEventListener("resize", handleWindowResize);
});

onUnmounted(() => {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer);
  }
  window.removeEventListener("resize", handleWindowResize);
});
</script>

<style scoped>
.app-titlebar {
  height: 40px;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  user-select: none;
  flex-shrink: 0;
}

.titlebar-top-strip {
  height: 8px;
  min-height: 8px;
  -webkit-app-region: drag;
}

.titlebar-lower-row {
  height: 32px;
  min-height: 32px;
  display: flex;
  align-items: stretch;
  -webkit-app-region: drag;
}

.titlebar-drag-zone {
  flex: 1;
  min-width: 0;
  background: transparent;
}

.titlebar-controls {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 12px;
}

.titlebar-btn {
  width: 38px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.titlebar-icon {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.titlebar-btn:hover {
  background: rgba(100, 116, 139, 0.16);
  color: #0f172a;
}

.titlebar-btn:active {
  background: rgba(100, 116, 139, 0.22);
}

.titlebar-btn-close:hover {
  background: #ef4444;
  color: #fff;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
