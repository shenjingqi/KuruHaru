<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
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
                    <div
                      v-for="item in menuItems"
                      :key="item.key"
                      class="nav-item"
                      :class="{ active: isActive(item.key) }"
                      @click="handleMenuClick(item.key)"
                    >
                      <span class="nav-icon">{{ item.icon }}</span>
                      <span v-if="!sidebarCollapsed" class="nav-text">{{
                        item.label
                      }}</span>

                      <!-- 子菜单 -->
                      <div
                        v-if="item.hasSubmenu && showCleanSubmenu"
                        class="submenu"
                      >
                        <div
                          class="submenu-item"
                          :class="{ active: currentView === 'local-clean' }"
                          @click.stop="handleMenuClick('local-clean')"
                        >
                          <span>📁</span>
                          <span>本地清理</span>
                        </div>
                        <div
                          class="submenu-item"
                          :class="{ active: currentView === 'cloud-clean' }"
                          @click.stop="handleMenuClick('cloud-clean')"
                        >
                          <span>☁️</span>
                          <span>云端清理</span>
                        </div>
                      </div>
                    </div>
                  </nav>
                </div>
              </aside>

              <!-- 主内容区 -->
              <main class="main-area">
                <div v-if="showHeader" class="content-header">
                  <h1 class="page-title">{{ pageTitle }}</h1>
                </div>

                <div class="content-scroll">
                  <transition name="fade" mode="out-in">
                    <component :is="activeComponent" :key="currentView" />
                  </transition>
                </div>
              </main>
            </div>
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, provide } from "vue";
import {
  NConfigProvider,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  NDialogProvider,
} from "naive-ui";
import HomePanel from "./components/HomePanel.vue";
import WhisperTool from "./components/WhisperTool.vue";
import LocalCleaner from "./components/LocalCleaner.vue";
import CloudCleaner from "./components/CloudCleaner.vue";
import UploadTool from "./components/UploadTool.vue";
import Settings from "./components/Settings.vue";
import RecentActivity from "./components/RecentActivity.vue";
import Tools from "./components/Tools.vue";
import ChineseList from "./components/ChineseList.vue";
import AdvancedSearch from "./components/AdvancedSearch.vue";
import RJFilter from "./components/RJFilter.vue";

const currentView = ref("home");
let unsubscribeTgAuth = null; // 存储取消验证码监听的函数
const pendingAuthData = ref(null); // 存储待处理的验证码数据
const expandedMenu = ref(null);
const userAvatar = ref("");
const userAvatarBase64 = ref("");
const userName = ref("");
const sidebarCollapsed = ref(false);
const defaultAvatarBase64 = ref("");

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

const showHeader = computed(() => {
  return [
    "home",
    "recent",
    "settings",
    "local-clean",
    "cloud-clean",
    "chinese-list",
    "advanced-search",
    "rj-filter",
    "tg-download",
  ].includes(currentView.value);
});

const showCleanSubmenu = computed(() => {
  return expandedMenu.value === "clean";
});

const pageTitle = computed(() => {
  const titles = {
    home: "仪表盘",
    upload: "上传字幕",
    whisper: "音声翻译",
    clean: "数据清理",
    "local-clean": "本地清理",
    "cloud-clean": "云端清理",
    recent: "最近上传",
    tools: "工具箱",
    settings: "设置",
    "chinese-list": "汉化列表",
    "advanced-search": "高级搜索",
    "rj-filter": "RJ筛选",
    "tg-download": "TG打包下载",
  };
  return titles[currentView.value] || "";
});

const menuItems = [
  { key: "home", label: "仪表盘", icon: "🏠" },
  { key: "upload", label: "上传字幕", icon: "📤" },
  { key: "whisper", label: "音声翻译", icon: "🎧" },
  { key: "clean", label: "数据清理", icon: "🧹", hasSubmenu: true },
  { key: "recent", label: "最近上传", icon: "📅" },
  { key: "advanced-search", label: "高级搜索", icon: "🔍" },
  { key: "rj-filter", label: "RJ筛选", icon: "🔢" },
  { key: "tools", label: "工具箱", icon: "🛠️" },
  { key: "chinese-list", label: "汉化列表", icon: "📝" },
  { key: "settings", label: "设置", icon: "⚙️" },
];

const activeComponent = computed(() => {
  const map = {
    home: HomePanel,
    upload: UploadTool,
    whisper: WhisperTool,
    clean: CloudCleaner,
    recent: RecentActivity,
    tools: Tools,
    settings: Settings,
    "chinese-list": ChineseList,
    "advanced-search": AdvancedSearch,
    "rj-filter": RJFilter,
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

const handleMenuClick = (key) => {
  currentView.value = key;

  // Toggle submenu for clean menu
  if (key === "clean") {
    expandedMenu.value = expandedMenu.value === "clean" ? null : "clean";
  } else {
    // Close submenu when clicking other items
    expandedMenu.value = null;
  }
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

html,
body,
#app {
  height: 100%;
  font-family: "Inter", "Microsoft YaHei", "PingFang SC", sans-serif;
  background: #fafafa;
  color: #262626;
}

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 左侧导航 */
.sidebar {
  width: 260px;
  background: #fff;
  border-right: 1px solid #e5e5e5;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.sidebar.collapsed {
  width: 80px;
}

.sidebar-inner {
  padding: 24px 16px;
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
    width: 80px;
  }

  .sidebar-inner {
    padding: 16px;
  }
}

@media (min-width: 1025px) {
  .sidebar {
    position: relative;
    transform: none;
  }
}

.sidebar-inner {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 10px;
}

.logo:hover {
  background: #f5f5f5;
}

.sidebar.collapsed .logo {
  justify-content: center;
  padding: 8px;
  margin-bottom: 16px;
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
  width: 100px;
  height: 100px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e5e5e5;
  flex-shrink: 0;
}

.sidebar.collapsed .logo-avatar {
  width: 48px;
  height: 48px;
}

.nav-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  color: #525252;
  font-size: 14px;
  transition: all 0.2s ease;
  position: relative;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 12px;
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
  font-size: 18px;
  width: 24px;
  text-align: center;
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

/* 子菜单 */
.submenu {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  min-width: 160px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e5e5;
  z-index: 100;
}

.submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  color: #525252;
  font-size: 13px;
  transition: all 0.2s ease;
}

.submenu-item:hover {
  background: #f5f5f5;
  color: #262626;
}

.submenu-item.active {
  background: #f0ebfc;
  color: #7c3aed;
}

/* 主内容区 */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafafa;
  transition: all 0.3s ease;
}

.content-header {
  padding: 32px 40px 0;
  background: #fff;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 40px;
}

/* 响应式主内容区 */
@media (max-width: 1280px) {
  .content-header {
    padding: 24px 32px 0;
  }

  .content-scroll {
    padding: 20px 32px;
  }
}

@media (max-width: 1024px) {
  .content-header {
    padding: 20px 24px 0;
  }

  .content-scroll {
    padding: 16px 24px;
  }

  .page-title {
    font-size: 20px;
  }
}

@media (max-width: 640px) {
  .content-header {
    padding: 16px 16px 0;
  }

  .content-scroll {
    padding: 12px 16px;
  }

  .page-title {
    font-size: 18px;
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
