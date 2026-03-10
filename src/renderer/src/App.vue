<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <div
              class="app-shell"
              :class="[
                { 'with-custom-titlebar': showCustomTitleBar },
                windowShellClasses,
              ]"
              :style="windowAppearanceStyle"
            >
              <div
                v-if="canShowResizeHandles"
                class="resize-handle-layer"
                aria-hidden="true"
              >
                <span
                  class="resize-handle top"
                  @mousedown.prevent="startManualResize('top', $event)"
                />
                <span
                  class="resize-handle right"
                  @mousedown.prevent="startManualResize('right', $event)"
                />
                <span
                  class="resize-handle bottom"
                  @mousedown.prevent="startManualResize('bottom', $event)"
                />
                <span
                  class="resize-handle left"
                  @mousedown.prevent="startManualResize('left', $event)"
                />
                <span
                  class="resize-handle top-left"
                  @mousedown.prevent="startManualResize('top-left', $event)"
                />
                <span
                  class="resize-handle top-right"
                  @mousedown.prevent="startManualResize('top-right', $event)"
                />
                <span
                  class="resize-handle bottom-right"
                  @mousedown.prevent="startManualResize('bottom-right', $event)"
                />
                <span
                  class="resize-handle bottom-left"
                  @mousedown.prevent="startManualResize('bottom-left', $event)"
                />
              </div>

              <div class="app-layout">
                <!-- 左侧导航 -->
                <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
                  <div class="sidebar-inner">
                    <!-- Logo + 用户头像（可点击收起/展开） -->
                    <div
                      class="logo"
                      title="点击收起/展开侧边栏"
                      @click="toggleSidebar"
                    >
                      <img
                        v-if="userAvatarBase64 || defaultAvatarBase64"
                        :src="userAvatarBase64 || defaultAvatarBase64"
                        alt="头像"
                        class="logo-avatar"
                      />
                      <div v-else class="logo-icon">K</div>
                      <span v-if="!sidebarCollapsed" class="logo-text"
                        >KuruHaru</span
                      >
                    </div>

                    <!-- 导航菜单 -->
                    <nav class="nav-list">
                      <section
                        v-if="!sidebarCollapsed && recentMenuItems.length"
                        class="nav-quick-section"
                      >
                        <div class="nav-quick-title">最近访问</div>
                        <div class="nav-quick-items">
                          <div
                            v-for="item in recentMenuItems"
                            :key="`recent-${item.key}`"
                            class="nav-item nav-item-quick"
                            :class="{ active: isActive(item.key) }"
                            @click="handleMenuClick(item.key)"
                          >
                            <n-icon class="nav-icon" :size="18">
                              <component :is="resolveNavIcon(item.icon)" />
                            </n-icon>
                            <span class="nav-text">{{ item.label }}</span>
                          </div>
                        </div>
                      </section>

                      <div class="nav-fixed-section">
                        <div
                          v-for="item in standaloneMenuItems"
                          :key="item.key"
                          class="nav-item"
                          :class="{ active: isActive(item.key) }"
                          @click="handleMenuClick(item.key)"
                        >
                          <n-icon class="nav-icon" :size="18">
                            <component :is="resolveNavIcon(item.icon)" />
                          </n-icon>
                          <span v-if="!sidebarCollapsed" class="nav-text">{{
                            item.label
                          }}</span>
                        </div>
                      </div>

                      <template v-if="!sidebarCollapsed">
                        <section
                          v-for="group in menuGroups"
                          :key="group.key"
                          class="nav-group-block"
                        >
                          <button
                            type="button"
                            class="nav-group-header"
                            :class="{ active: isGroupActive(group) }"
                            @click="toggleGroup(group.key)"
                          >
                            <span class="nav-group-label">
                              <n-icon class="nav-group-icon" :size="18">
                                <component :is="resolveNavIcon(group.icon)" />
                              </n-icon>
                              <span class="nav-group-title">{{
                                group.label
                              }}</span>
                            </span>
                            <span class="nav-group-arrow">{{
                              isGroupExpanded(group.key) ? "▾" : "▸"
                            }}</span>
                          </button>

                          <transition name="group-collapse">
                            <div
                              v-if="isGroupExpanded(group.key)"
                              class="nav-group-items"
                            >
                              <template
                                v-for="item in group.items"
                                :key="item.key"
                              >
                                <div
                                  class="nav-item"
                                  :class="{ active: isActive(item.key) }"
                                  @click="handleMenuClick(item.key)"
                                >
                                  <n-icon class="nav-icon" :size="18">
                                    <component
                                      :is="resolveNavIcon(item.icon)"
                                    />
                                  </n-icon>
                                  <span class="nav-text">{{ item.label }}</span>
                                </div>

                                <div
                                  v-if="
                                    item.children?.length &&
                                    isSubmenuExpanded(item)
                                  "
                                  class="submenu-inline"
                                >
                                  <div
                                    v-for="child in item.children"
                                    :key="child.key"
                                    class="submenu-item"
                                    :class="{
                                      active: currentView === child.key,
                                    }"
                                    @click.stop="handleMenuClick(child.key)"
                                  >
                                    <n-icon
                                      class="submenu-item-icon"
                                      :size="18"
                                    >
                                      <component
                                        :is="resolveNavIcon(child.icon)"
                                      />
                                    </n-icon>
                                    <span>{{ child.label }}</span>
                                  </div>
                                </div>
                              </template>
                            </div>
                          </transition>
                        </section>
                      </template>

                      <template v-else>
                        <n-popover
                          v-for="group in menuGroups"
                          :key="group.key"
                          trigger="hover"
                          placement="right-start"
                          :show-arrow="false"
                          :delay="80"
                        >
                          <template #trigger>
                            <button
                              type="button"
                              class="nav-group-pill"
                              :class="{ active: isGroupActive(group) }"
                            >
                              <n-icon class="nav-group-icon" :size="18">
                                <component :is="resolveNavIcon(group.icon)" />
                              </n-icon>
                            </button>
                          </template>

                          <div class="group-flyout">
                            <div class="group-flyout-title">
                              {{ group.label }}
                            </div>
                            <div class="group-flyout-items">
                              <template
                                v-for="item in group.items"
                                :key="item.key"
                              >
                                <div
                                  class="submenu-item"
                                  :class="{ active: isActive(item.key) }"
                                  @click.stop="handleMenuClick(item.key)"
                                >
                                  <n-icon class="submenu-item-icon" :size="18">
                                    <component
                                      :is="resolveNavIcon(item.icon)"
                                    />
                                  </n-icon>
                                  <span>{{ item.label }}</span>
                                </div>

                                <div
                                  v-if="item.children?.length"
                                  class="group-flyout-children"
                                >
                                  <div
                                    v-for="child in item.children"
                                    :key="child.key"
                                    class="submenu-item submenu-item-child"
                                    :class="{
                                      active: currentView === child.key,
                                    }"
                                    @click.stop="handleMenuClick(child.key)"
                                  >
                                    <n-icon
                                      class="submenu-item-icon"
                                      :size="18"
                                    >
                                      <component
                                        :is="resolveNavIcon(child.icon)"
                                      />
                                    </n-icon>
                                    <span>{{ child.label }}</span>
                                  </div>
                                </div>
                              </template>
                            </div>
                          </div>
                        </n-popover>
                      </template>
                    </nav>
                  </div>
                </aside>

                <section class="workspace">
                  <AppTitleBar v-if="showCustomTitleBar" />

                  <!-- 主内容区 -->
                  <main class="main-area">
                    <div class="content-scroll">
                      <transition name="fade" mode="out-in">
                        <keep-alive include="WorkflowDesigner">
                          <component :is="activeComponent" :key="currentView" />
                        </keep-alive>
                      </transition>
                    </div>
                  </main>
                </section>
              </div>
            </div>
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup>
import {
  NConfigProvider,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  NDialogProvider,
  NIcon,
  NPopover,
} from "naive-ui";
import AppTitleBar from "./components/AppTitleBar.vue";
import { useAppShellController } from "./composables/useAppShellController";
import { resolveNavIcon } from "./modules/navigation/icons";

const {
  currentView,
  sidebarCollapsed,
  userAvatarBase64,
  defaultAvatarBase64,
  standaloneMenuItems,
  menuGroups,
  recentMenuItems,
  isActive,
  isSubmenuExpanded,
  isGroupActive,
  isGroupExpanded,
  toggleGroup,
  handleMenuClick,
  toggleSidebar,
  themeOverrides,
  showCustomTitleBar,
  windowShellClasses,
  windowAppearanceStyle,
  canShowResizeHandles,
  startManualResize,
  activeComponent,
} = useAppShellController();
</script>

<style>
:root {
  --accent: #adb571;
  --accent-soft: rgba(173, 181, 113, 0.22);
  --radius-shell: 18px;
  --radius-panel: 14px;
}

@keyframes shellFadeIn {
  from {
    opacity: 0.8;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes paneSlideIn {
  from {
    opacity: 0.85;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes contentRiseIn {
  from {
    opacity: 0.88;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes driftA {
  from {
    transform: translate3d(-1%, -1%, 0) scale(1);
  }
  to {
    transform: translate3d(1.5%, 1%, 0) scale(1.03);
  }
}

@keyframes driftB {
  from {
    transform: translate3d(1%, -1%, 0);
  }
  to {
    transform: translate3d(-1.5%, 1.5%, 0);
  }
}

.app-shell {
  --shell-bg: transparent;
  --shell-border: rgba(183, 188, 154, 0.52);
  --workspace-bg: #f4f1e5;
  --workspace-bg-strong: #faf7ef;
  --sidebar-bg: #ece8da;
  --surface-1: #ffffff;
  --surface-2: #f0ecde;
  --text-primary: #1a2434;
  --text-secondary: #586679;
  --text-tertiary: #8390a3;
  --text-disabled: #a7b1c0;
  --text-strong: var(--text-primary);
  --text-muted: var(--text-secondary);
  --divider: rgba(190, 190, 165, 0.78);
  --hover-bg: rgba(255, 255, 255, 0.68);
  --active-bg: rgba(255, 255, 255, 0.88);
  --selected-bg: color-mix(in srgb, var(--accent, #adb571) 18%, #fbfaf3 82%);
  --selected-border: color-mix(
    in srgb,
    var(--accent, #adb571) 26%,
    transparent
  );
  --status-success-bg: #eaf7f0;
  --status-success-text: #0f6a3b;
  --status-success-border: #a9dec2;
  --status-info-bg: #eaf3ff;
  --status-info-text: #0f4c9a;
  --status-info-border: #afcbf5;
  --status-warning-bg: #fff6e6;
  --status-warning-text: #8a5300;
  --status-warning-border: #f2cd8a;
  --status-error-bg: #fdecec;
  --status-error-text: #9b1c1c;
  --status-error-border: #f2b2b2;
  --shadow: 0 20px 40px rgba(30, 51, 84, 0.05);
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  margin: 0;
  border: none;
  border-radius: 0;
  overflow: hidden;
  isolation: isolate;
  background: linear-gradient(
    180deg,
    var(--workspace-bg) 0%,
    var(--workspace-bg-strong) 100%
  );
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: var(--text-strong);
  font-family:
    "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI",
    "Microsoft YaHei UI", sans-serif;
  animation: shellFadeIn 280ms ease;
}

.app-shell::before,
.app-shell::after {
  content: none;
  display: none;
  position: absolute;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

.app-shell::before {
  inset: -12%;
  background: none;
  opacity: 0;
  animation: none;
}

.app-shell::after {
  inset: 0;
  background: none;
  opacity: 0;
  mix-blend-mode: normal;
  animation: none;
}

.window-system-blur.app-shell::before {
  content: "";
  display: block;
  background:
    radial-gradient(
      circle at 18% 12%,
      rgba(214, 219, 178, var(--ambient-glow-opacity, 0.08)) 0%,
      transparent 28%
    ),
    linear-gradient(
      180deg,
      rgba(16, 22, 31, var(--ambient-opacity, 0.1)) 0%,
      rgba(20, 28, 38, calc(var(--ambient-opacity, 0.1) + 0.04)) 100%
    );
  filter: blur(calc(var(--glass-blur, 0px) * 1.2));
  opacity: 1;
  animation: driftA 30s ease-in-out infinite alternate;
}

.window-system-blur.app-shell::after {
  content: "";
  display: block;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, var(--ambient-line-opacity, 0.02)) 0%,
    transparent 42%,
    rgba(255, 255, 255, calc(var(--ambient-line-opacity, 0.02) * 0.5)) 100%
  );
  opacity: 1;
}

.window-gpu-blur.app-shell::before {
  content: "";
  display: block;
  background:
    radial-gradient(
      circle at 14% 14%,
      rgba(205, 211, 167, var(--ambient-glow-opacity, 0.12)) 0%,
      transparent 26%
    ),
    radial-gradient(
      circle at 86% 10%,
      rgba(181, 188, 134, calc(var(--ambient-glow-opacity, 0.1) * 0.92)) 0%,
      transparent 24%
    ),
    linear-gradient(
      180deg,
      rgba(12, 18, 26, var(--ambient-opacity, 0.16)) 0%,
      rgba(17, 25, 35, calc(var(--ambient-opacity, 0.16) + 0.06)) 100%
    );
  filter: blur(calc(var(--glass-blur, 0px) * 1.45));
  opacity: 1;
  animation: driftA 24s ease-in-out infinite alternate;
}

.window-gpu-blur.app-shell::after {
  content: "";
  display: block;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, var(--ambient-line-opacity, 0.02)) 0%,
    transparent 26%,
    rgba(255, 255, 255, calc(var(--ambient-line-opacity, 0.02) * 0.66)) 54%,
    transparent 100%
  );
  opacity: 1;
  animation: driftB 28s ease-in-out infinite alternate;
}

.window-system-blur.app-shell .workspace {
  backdrop-filter: blur(var(--glass-blur)) saturate(112%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(112%);
}

.window-gpu-blur.app-shell .workspace {
  backdrop-filter: blur(calc(var(--glass-blur) * 1.12)) saturate(128%);
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.12)) saturate(128%);
}

.window-system-blur.app-shell .sidebar {
  backdrop-filter: blur(calc(var(--glass-blur) * 0.65)) saturate(110%);
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.65)) saturate(110%);
}

.window-gpu-blur.app-shell .sidebar {
  backdrop-filter: blur(calc(var(--glass-blur) * 0.95)) saturate(124%);
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.95)) saturate(124%);
}

.window-system-blur.app-shell .main-area {
  backdrop-filter: blur(calc(var(--glass-blur) * 0.32));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.32));
}

.window-gpu-blur.app-shell .main-area {
  backdrop-filter: blur(calc(var(--glass-blur) * 0.62));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.62));
}

.window-maximized.app-shell {
  width: 100vw;
  height: 100vh;
  margin: 0;
  border-radius: 0;
  border-color: transparent;
}

.window-system-frame.app-shell {
  width: 100vw;
  height: 100vh;
  margin: 0;
  border-radius: 0;
}

.window-blurred.app-shell {
  filter: none;
}

.window-dark.app-shell {
  --shell-bg: transparent;
  --shell-border: rgba(164, 170, 121, 0.32);
  --workspace-bg: rgba(17, 22, 29, var(--workspace-opacity, 0.76));
  --workspace-bg-strong: rgba(
    21,
    27,
    36,
    var(--workspace-strong-opacity, 0.86)
  );
  --sidebar-bg: rgba(28, 31, 24, var(--sidebar-opacity, 0.82));
  --surface-1: #1c1f18;
  --surface-2: #262920;
  --text-primary: #ffffff;
  --text-secondary: #ffffff;
  --text-tertiary: #ffffff;
  --text-disabled: #ffffff;
  --text-strong: var(--text-primary);
  --text-muted: var(--text-secondary);
  --divider: rgba(164, 170, 121, 0.18);
  --hover-bg: rgba(255, 255, 255, 0.06);
  --active-bg: rgba(255, 255, 255, 0.1);
  --selected-bg: rgba(173, 181, 113, 0.16);
  --selected-border: rgba(173, 181, 113, 0.42);
  --status-success-bg: #173226;
  --status-success-text: #77d9a4;
  --status-success-border: #2d6e4b;
  --status-info-bg: #182d49;
  --status-info-text: #8ec2ff;
  --status-info-border: #32547d;
  --status-warning-bg: #3a2b12;
  --status-warning-text: #ffcc73;
  --status-warning-border: #6e5329;
  --status-error-bg: #3a1b1b;
  --status-error-text: #ff9b9b;
  --status-error-border: #7a3636;
  --shadow: 0 24px 40px rgba(0, 0, 0, 0.18);
}

.window-dark.app-shell::before {
  background: none;
  opacity: 0;
}

.window-dark.app-shell::after {
  opacity: 0;
}

.app-layout {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.resize-handle-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  pointer-events: auto;
}

.resize-handle.top {
  top: 0;
  left: 16px;
  right: 16px;
  height: 10px;
  cursor: ns-resize;
}

.resize-handle.right {
  top: 16px;
  right: 0;
  bottom: 16px;
  width: 10px;
  cursor: ew-resize;
}

.resize-handle.bottom {
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 10px;
  cursor: ns-resize;
}

.resize-handle.left {
  top: 16px;
  left: 0;
  bottom: 16px;
  width: 10px;
  cursor: ew-resize;
}

.resize-handle.top-left {
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}

.resize-handle.top-right {
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nesw-resize;
}

.resize-handle.bottom-right {
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}

.resize-handle.bottom-left {
  left: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nesw-resize;
}

.workspace {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--workspace-bg) 86%, #ffffff 14%) 0%,
    var(--workspace-bg-strong) 100%
  );
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  animation: contentRiseIn 260ms ease;
}

.sidebar {
  width: 236px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--sidebar-bg) 92%, #ffffff 8%) 0%,
    var(--sidebar-bg) 100%
  );
  border-right: 1px solid var(--divider);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  flex-shrink: 0;
  transition:
    width 220ms ease,
    background-color 220ms ease;
  animation: paneSlideIn 260ms ease;
}

.sidebar.collapsed {
  width: 74px;
}

.sidebar-inner {
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
  border-radius: 16px;
  border: 1px solid transparent;
}

.logo:hover {
  background: color-mix(in srgb, var(--hover-bg) 86%, #ffffff 14%);
  border-color: color-mix(in srgb, var(--divider) 82%, transparent);
}

.sidebar.collapsed .logo {
  justify-content: center;
  padding: 8px 6px;
  margin-bottom: 10px;
}

.logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(
    145deg,
    var(--accent, #adb571),
    color-mix(in srgb, var(--accent, #adb571), #ffffff 24%)
  );
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
}

.logo-text {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .logo-text {
  display: none;
}

.logo-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.sidebar.collapsed .logo-avatar {
  width: 40px;
  height: 40px;
}

.nav-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding-right: 4px;
}

.nav-quick-section {
  margin: 0 0 12px;
  padding: 10px 8px 8px;
  border: 1px solid var(--divider);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--sidebar-bg) 82%, #ffffff 18%);
  box-shadow: 0 12px 18px rgba(30, 51, 84, 0.04);
}

.nav-quick-title {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.nav-quick-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-fixed-section {
  margin-bottom: 10px;
}

.nav-group-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
}

.nav-group-header:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--hover-bg) 90%);
  color: var(--text-strong);
}

.nav-group-header.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 26%, transparent),
    color-mix(in srgb, var(--accent) 14%, rgba(0, 0, 0, 0.08))
  );
  border-color: var(--selected-border);
  color: #ffffff;
  box-shadow: 0 10px 20px color-mix(in srgb, var(--accent) 16%, transparent);
}

.nav-group-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.nav-group-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  flex-shrink: 0;
}

.nav-group-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-group-arrow {
  font-size: 12px;
  color: inherit;
}

.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
  margin-left: 8px;
  border-left: 1px solid var(--divider);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.2;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
  position: relative;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.nav-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--hover-bg) 90%);
  color: var(--text-strong);
}

.nav-item.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 28%, transparent),
    color-mix(in srgb, var(--accent) 16%, rgba(0, 0, 0, 0.08))
  );
  border-color: var(--selected-border);
  color: #ffffff;
  font-weight: 700;
  box-shadow:
    inset 3px 0 0 var(--accent),
    0 12px 22px color-mix(in srgb, var(--accent) 14%, transparent);
}

.nav-item-quick {
  min-height: 36px;
  padding: 8px 10px;
}

.nav-group-pill {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-group-pill:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--hover-bg) 90%);
  color: var(--text-strong);
}

.nav-group-pill.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 24%, transparent),
    color-mix(in srgb, var(--accent) 12%, rgba(0, 0, 0, 0.06))
  );
  border-color: var(--selected-border);
  color: #ffffff;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed .nav-text {
  display: none;
}

.submenu-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 2px 0 4px;
  padding-left: 12px;
  border-left: 1px dashed var(--divider);
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.2;
  transition: all 0.2s ease;
}

.submenu-item-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.submenu-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--hover-bg) 90%);
  color: var(--text-strong);
}

.submenu-item.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 22%, transparent),
    color-mix(in srgb, var(--accent) 10%, rgba(0, 0, 0, 0.05))
  );
  border-color: var(--selected-border);
  color: #ffffff;
}

.submenu-item-child {
  padding-left: 24px;
}

.group-flyout {
  min-width: 226px;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--divider);
  background: color-mix(in srgb, var(--sidebar-bg) 74%, #ffffff 26%);
  box-shadow: var(--shadow);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.group-flyout-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 2px 10px 6px;
  border-bottom: 1px solid var(--divider);
}

.group-flyout-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-flyout-children {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 4px;
  padding-left: 10px;
  border-left: 1px dashed var(--divider);
}

.main-area {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--workspace-bg);
}

.content-scroll {
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px 22px;
}

.content-scroll > * {
  animation: contentRiseIn 320ms ease;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.group-collapse-enter-active,
.group-collapse-leave-active {
  transition: all 0.18s ease;
}

.group-collapse-enter-from,
.group-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 1280px) {
  .content-scroll {
    padding: 12px 16px;
  }
}

@media (max-width: 1024px) {
  .app-shell {
    width: 100vw;
    height: 100vh;
    margin: 0;
    border-radius: 0;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    z-index: 100;
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar.collapsed {
    width: 72px;
  }

  .sidebar-inner {
    padding: 12px 10px;
  }

  .content-scroll {
    padding: 10px 14px;
  }
}

@media (min-width: 1025px) {
  .sidebar {
    position: relative;
    transform: none;
  }
}

@media (max-width: 640px) {
  .content-scroll {
    padding: 8px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>

.nav-item.active .nav-icon, .nav-item.active .nav-text, .nav-group-header.active
.nav-group-icon, .nav-group-header.active .nav-group-title,
.nav-group-pill.active .nav-icon, .submenu-item.active .submenu-item-icon {
color: inherit; } .nav-group-header:active, .nav-item:active,
.nav-group-pill:active, .submenu-item:active { background: color-mix(in srgb,
var(--accent) 18%, var(--active-bg) 82%); border-color: color-mix(in srgb,
var(--accent) 32%, transparent); transform: translateY(0); }
.nav-group-header.active .nav-group-icon, .nav-group-header.active
.nav-group-title, .nav-group-header.active .nav-group-arrow, .nav-item.active
.nav-icon, .nav-item.active .nav-text, .nav-group-pill.active .nav-icon,
.submenu-item.active .submenu-item-icon { color: #fffdf4 !important; }
