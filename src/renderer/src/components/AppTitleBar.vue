<template>
  <header
    class="app-titlebar"
    :class="{
      dark: isDarkMode,
      blurred: !isWindowFocused,
      maximized: isWindowMaximized,
    }"
  >
    <div
      class="titlebar-top-strip"
      aria-hidden="true"
      @dblclick="handleTitleBarDoubleClick"
    />

    <div class="titlebar-lower-row" @dblclick="handleTitleBarDoubleClick">
      <div class="titlebar-brand">
        <span class="titlebar-dot" />
        <span class="titlebar-title">KuruHaru</span>
      </div>
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
import { useAppTitleBarControls } from "../composables/useAppTitleBarControls";

// 自定义标题栏只做状态映射；窗口焦点/最大化/主题态由 Electron 通道集中提供。
const {
  isWindowMaximized,
  isWindowFocused,
  isDarkMode,
  canUseWindowControls,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  handleTitleBarDoubleClick,
} = useAppTitleBarControls();
// 双击标题栏与按钮点击都走 composable，确保窗口控制行为在各入口保持一致。
</script>

<style scoped>
.app-titlebar {
  --titlebar-bg: #f1f1f2;
  --titlebar-text: #6e6b58;
  --titlebar-hover-bg: #e4e6ea;
  --titlebar-hover-text: #1f2732;
  --titlebar-active-bg: #d7dae0;
  --titlebar-border: #d8dbe1;
  --titlebar-brand: #2f3744;
  height: 44px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--titlebar-border);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  user-select: none;
  flex-shrink: 0;
  font-family:
    "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI",
    "Microsoft YaHei UI", sans-serif;
  transition:
    background-color 0.2s ease,
    opacity 0.2s ease;
}

.app-titlebar.blurred {
  opacity: 0.92;
}

.app-titlebar.dark {
  --titlebar-text: #ffffff;
  --titlebar-hover-bg: rgba(255, 255, 255, 0.08);
  --titlebar-hover-text: #ffffff;
  --titlebar-active-bg: rgba(255, 255, 255, 0.12);
  --titlebar-border: rgba(255, 255, 255, 0.08);
  --titlebar-bg: rgba(23, 28, 35, var(--titlebar-opacity, 0.72));
  --titlebar-brand: #ffffff;
}

.app-titlebar.dark {
  backdrop-filter: blur(calc(var(--panel-blur, 0px) * 0.9)) saturate(122%);
  -webkit-backdrop-filter: blur(calc(var(--panel-blur, 0px) * 0.9))
    saturate(122%);
}

.app-titlebar.maximized {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.titlebar-top-strip {
  height: 9px;
  min-height: 9px;
  -webkit-app-region: drag;
}

.titlebar-lower-row {
  height: 35px;
  min-height: 35px;
  display: flex;
  gap: 8px;
  align-items: stretch;
  padding-left: 12px;
  -webkit-app-region: drag;
}

.titlebar-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 105px;
  color: var(--titlebar-brand);
}

.titlebar-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(150deg, #adb571, #c4cd88);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.72);
}

.titlebar-title {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.titlebar-drag-zone {
  flex: 1;
  min-width: 0;
  background: transparent;
}

.titlebar-controls {
  height: 35px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 12px;
}

.titlebar-btn {
  width: 38px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--titlebar-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
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
  background: var(--titlebar-hover-bg);
  color: var(--titlebar-hover-text);
  transform: translateY(-1px);
}

.titlebar-btn:active {
  background: var(--titlebar-active-bg);
  transform: translateY(0);
}

.titlebar-btn-close:hover {
  background: #ef4444;
  color: #fff;
}

.titlebar-btn-close:active {
  background: #dc2626;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
