<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <div
              class="app-shell"
              :class="{ 'with-custom-titlebar': showCustomTitleBar }"
            >
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
                      <div class="nav-fixed-section">
                        <div
                          v-for="item in standaloneMenuItems"
                          :key="item.key"
                          class="nav-item"
                          :class="{ active: isActive(item.key) }"
                          @click="handleMenuClick(item.key)"
                        >
                          <span class="nav-icon">{{ item.icon }}</span>
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
                              <span class="nav-group-icon">{{
                                group.icon
                              }}</span>
                              <span class="nav-group-title">{{
                                group.label
                              }}</span>
                            </span>
                            <span class="nav-group-arrow">{{
                              isGroupExpanded(group.key) ? "▾" : "▸"
                            }}</span>
                          </button>

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
                                <span class="nav-icon">{{ item.icon }}</span>
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
                                  :class="{ active: currentView === child.key }"
                                  @click.stop="handleMenuClick(child.key)"
                                >
                                  <span>{{ child.icon }}</span>
                                  <span>{{ child.label }}</span>
                                </div>
                              </div>
                            </template>
                          </div>
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
                              <span class="nav-group-icon">{{
                                group.icon
                              }}</span>
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
                                  <span>{{ item.icon }}</span>
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
                                    <span>{{ child.icon }}</span>
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
                        <component :is="activeComponent" :key="currentView" />
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
import { ref, computed, watch, onMounted, onUnmounted, provide } from "vue";
import {
  NConfigProvider,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  NDialogProvider,
  NPopover,
} from "naive-ui";
import HomePanel from "./components/HomePanel.vue";
import WhisperTool from "./components/WhisperTool.vue";
import LocalCleaner from "./components/LocalCleaner.vue";
import CloudCleaner from "./components/CloudCleaner.vue";
import UploadTool from "./components/UploadTool.vue";
import Settings from "./components/Settings.vue";
import RecentActivity from "./components/RecentActivity.vue";
import TgSearchBot from "./components/TgSearchBot.vue";
import RjDuplicateDetector from "./components/RjDuplicateDetector.vue";
import Tools from "./components/Tools.vue";
import ChineseList from "./components/ChineseList.vue";
import AdvancedSearch from "./components/AdvancedSearch.vue";
import RjFilter from "./components/RjFilter.vue";
import AppTitleBar from "./components/AppTitleBar.vue";

const currentView = ref("home");
let unsubscribeTgAuth = null; // 存储取消验证码监听的函数
const pendingAuthData = ref(null); // 存储待处理的验证码数据
const expandedSubmenu = ref(null);
const userAvatar = ref("");
const userAvatarBase64 = ref("");
const userName = ref("");
const sidebarCollapsed = ref(false);
const defaultAvatarBase64 = ref("");
const NAV_GROUP_STORAGE_KEY = "app-navigation-groups-v1";

const standaloneMenuItems = [{ key: "home", label: "仪表盘", icon: "🏠" }];

const menuGroups = [
  {
    key: "workflow",
    label: "高频工作流",
    icon: "⚡",
    items: [
      { key: "upload", label: "上传字幕", icon: "📤" },
      { key: "whisper", label: "音声翻译", icon: "🎧" },
      { key: "recent", label: "最近上传", icon: "📅" },
    ],
  },
  {
    key: "data",
    label: "数据与检索",
    icon: "📚",
    items: [
      {
        key: "clean",
        label: "数据清理",
        icon: "🧹",
        children: [
          { key: "local-clean", label: "本地清理", icon: "📁" },
          { key: "cloud-clean", label: "云端清理", icon: "☁️" },
        ],
      },
      { key: "advanced-search", label: "高级搜索", icon: "🔍" },
      { key: "rj-filter", label: "RJ筛选", icon: "🔢" },
      { key: "chinese-list", label: "汉化列表", icon: "📝" },
      { key: "tools", label: "工具箱", icon: "🛠️" },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "💬",
    items: [
      { key: "tg-search-bot", label: "TG搜索Bot", icon: "🤖" },
      { key: "rj-duplicate-detector", label: "RJ重复检测", icon: "🧩" },
    ],
  },
  {
    key: "system",
    label: "系统",
    icon: "⚙️",
    items: [{ key: "settings", label: "设置", icon: "⚙️" }],
  },
];

const createDefaultGroupState = () =>
  menuGroups.reduce((state, group) => {
    state[group.key] = group.key === "workflow";
    return state;
  }, {});

const expandedGroups = ref(createDefaultGroupState());

// 加载用户配置
const loadUserConfig = async () => {
  try {
    console.log("🔍 开始加载用户配置...");
    const result = await window.api.invoke("get-config");
    const config = result?.data || result;
    console.log("📋 配置已加载:", config?.profile);
    if (config?.profile) {
      userAvatar.value = config.profile.avatar || "";
      userName.value = config.profile.username || "";
      console.log("👤 用户头像路径:", userAvatar.value);

      // 加载头像为 base64
      if (userAvatar.value) {
        console.log("🖼️ 加载自定义头像...");
        userAvatarBase64.value = await window.api.invoke(
          "read-image-as-base64",
          userAvatar.value,
        );
        console.log(
          "✅ 自定义头像已加载，长度:",
          userAvatarBase64.value?.length,
        );
      } else {
        // 如果没有自定义头像，使用默认头像
        console.log("🎨 加载默认头像...");
        defaultAvatarBase64.value = await window.api.getDefaultAvatar();
        console.log(
          "✅ 默认头像已加载:",
          defaultAvatarBase64.value ? "成功" : "失败",
        );
        if (defaultAvatarBase64.value) {
          console.log("📏 默认头像大小:", defaultAvatarBase64.value.length);
        }
      }
    }
    console.log(
      "📊 最终状态 - userAvatarBase64:",
      !!userAvatarBase64.value,
      "defaultAvatarBase64:",
      !!defaultAvatarBase64.value,
    );
  } catch (e) {
    console.error("❌ 加载用户配置失败:", e);
  }
};

// 切换侧边栏收起/展开
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

onMounted(() => {
  restoreExpandedGroups();
  ensureGroupExpandedByView(currentView.value);
  loadUserConfig();

  // 监听 Telegram 验证码需求，自动跳转到设置页面
  if (window.api.onTgAuthNeeded) {
    unsubscribeTgAuth = window.api.onTgAuthNeeded((authData) => {
      console.log("[App] 收到验证码需求，自动跳转到设置页面", authData);
      // 保存验证码数据，供 Settings.vue 检查
      pendingAuthData.value = authData;
      currentView.value = "settings";
    });
  }
});

onUnmounted(() => {
  // 清理验证码事件监听
  if (unsubscribeTgAuth) {
    unsubscribeTgAuth();
    console.log("[App] 已清理 tgAuth 事件监听");
  }
});

// 提供待处理验证码数据给子组件
provide("pendingAuthData", pendingAuthData);

const themeOverrides = {
  common: {
    primaryColor: "#8b5cf6",
    primaryColorHover: "#a78bfa",
    primaryColorPressed: "#7c3aed",
    borderRadius: "8px",
    fontFamily: "'Inter', 'Microsoft YaHei', sans-serif",
  },
};

const showCustomTitleBar = computed(() => {
  return window.api?.windowControls?.supported === true;
});

const viewGroupMap = computed(() => {
  const map = {};
  for (const group of menuGroups) {
    for (const item of group.items) {
      map[item.key] = group.key;
      if (item.children?.length) {
        for (const child of item.children) {
          map[child.key] = group.key;
        }
      }
    }
  }
  return map;
});

const activeComponent = computed(() => {
  const map = {
    home: HomePanel,
    upload: UploadTool,
    whisper: WhisperTool,
    clean: CloudCleaner,
    recent: RecentActivity,
    "tg-search-bot": TgSearchBot,
    "rj-duplicate-detector": RjDuplicateDetector,
    tools: Tools,
    settings: Settings,
    "chinese-list": ChineseList,
    "advanced-search": AdvancedSearch,
    "rj-filter": RjFilter,
  };
  if (currentView.value === "local-clean") return LocalCleaner;
  if (currentView.value === "cloud-clean") return CloudCleaner;
  return map[currentView.value] || HomePanel;
});

const isActive = (key) => {
  if (key === "clean") {
    return ["clean", "local-clean", "cloud-clean"].includes(currentView.value);
  }
  return currentView.value === key;
};

const isSubmenuExpanded = (item) => {
  if (!item.children?.length) return false;
  if (expandedSubmenu.value === item.key) return true;
  return item.children.some((child) => child.key === currentView.value);
};

const isGroupActive = (group) => {
  return group.items.some((item) => {
    if (isActive(item.key)) return true;
    if (item.children?.length) {
      return item.children.some((child) => child.key === currentView.value);
    }
    return false;
  });
};

const isGroupExpanded = (groupKey) => {
  return Boolean(expandedGroups.value[groupKey]);
};

const toggleGroup = (groupKey) => {
  expandedGroups.value = {
    ...expandedGroups.value,
    [groupKey]: !expandedGroups.value[groupKey],
  };
};

const ensureGroupExpandedByView = (viewKey) => {
  const groupKey = viewGroupMap.value[viewKey];
  if (!groupKey || expandedGroups.value[groupKey]) return;
  expandedGroups.value = {
    ...expandedGroups.value,
    [groupKey]: true,
  };
};

const restoreExpandedGroups = () => {
  try {
    const saved = localStorage.getItem(NAV_GROUP_STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return;

    const normalized = createDefaultGroupState();
    for (const group of menuGroups) {
      if (typeof parsed[group.key] === "boolean") {
        normalized[group.key] = parsed[group.key];
      }
    }
    expandedGroups.value = normalized;
  } catch (error) {
    console.warn("[App] 读取导航分组状态失败:", error);
  }
};

watch(
  expandedGroups,
  (value) => {
    try {
      localStorage.setItem(NAV_GROUP_STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      console.warn("[App] 保存导航分组状态失败:", error);
    }
  },
  { deep: true },
);

watch(
  currentView,
  (viewKey) => {
    ensureGroupExpandedByView(viewKey);
  },
  { immediate: true },
);

const handleMenuClick = (key) => {
  currentView.value = key;
  ensureGroupExpandedByView(key);

  if (key === "clean") {
    expandedSubmenu.value = expandedSubmenu.value === "clean" ? null : "clean";
    return;
  }

  if (["local-clean", "cloud-clean"].includes(key)) {
    expandedSubmenu.value = "clean";
    return;
  }

  expandedSubmenu.value = null;
};
</script>

<style>
/* 全局样式 */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.app-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: inherit;
  border: 1px solid #dbe1ea;
  background: #f7f8fa;
  overflow: hidden;
}

.workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f8f9fb;
}

/* 左侧导航 */
.sidebar {
  width: 226px;
  background: #f8f9fb;
  border-right: 1px solid #dbe1ea;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.sidebar.collapsed {
  width: 72px;
}

.sidebar-inner {
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 响应式侧边栏 */
@media (max-width: 1024px) {
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
}

@media (min-width: 1025px) {
  .sidebar {
    position: relative;
    transform: none;
  }
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
  padding: 8px 10px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 10px;
}

.logo:hover {
  background: #f5f5f5;
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
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
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
  color: #262626;
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
  border: 2px solid #e5e5e5;
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
  gap: 4px;
  overflow-y: auto;
  padding-right: 4px;
}

.nav-fixed-section {
  margin-bottom: 8px;
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
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #737373;
  font-size: 13px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-group-header:hover {
  background: #f5f5f5;
  color: #262626;
}

.nav-group-header.active {
  background: #f5f2fc;
  color: #7c3aed;
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
  font-weight: 600;
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
  border-left: 1px solid #efefef;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: #525252;
  font-size: 13px;
  line-height: 1.2;
  transition: all 0.2s ease;
  position: relative;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}

.nav-group-pill {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #525252;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-group-pill:hover {
  background: #f5f5f5;
  color: #262626;
}

.nav-group-pill.active {
  background: #f0ebfc;
  color: #7c3aed;
}

.nav-item:hover {
  background: #f5f5f5;
  color: #262626;
}

.nav-item.active {
  background: #f0ebfc;
  color: #7c3aed;
  font-weight: 500;
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
  border-left: 1px dashed #e5e5e5;
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #525252;
  font-size: 13px;
  line-height: 1.2;
  transition: all 0.2s ease;
}

.submenu-item > span:first-child {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.submenu-item:hover {
  background: #f5f5f5;
  color: #262626;
}

.submenu-item.active {
  background: #f0ebfc;
  color: #7c3aed;
}

.submenu-item-child {
  padding-left: 24px;
}

.group-flyout {
  min-width: 220px;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.group-flyout-title {
  font-size: 12px;
  font-weight: 600;
  color: #737373;
  padding: 2px 10px 6px;
  border-bottom: 1px solid #f0f0f0;
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
  border-left: 1px dashed #ececec;
}

/* 主内容区 */
.main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  transition: all 0.3s ease;
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px;
}

/* 响应式主内容区 */
@media (max-width: 1280px) {
  .content-scroll {
    padding: 12px 16px;
  }
}

@media (max-width: 1024px) {
  .content-scroll {
    padding: 10px 14px;
  }
}

@media (max-width: 640px) {
  .content-scroll {
    padding: 8px 10px;
  }
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d4d4d4;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a3a3a3;
}
</style>
