import { ref, computed, onMounted, provide } from "vue";
import {
  NAV_GROUP_STORAGE_KEY,
  NAV_RECENT_STORAGE_KEY,
  standaloneMenuItems,
  menuGroups,
  createDefaultGroupState,
} from "../modules/navigation/schema";
import { resolveAppActiveComponent } from "../modules/navigation/app-view-registry";
import { useShellNavigation } from "./useShellNavigation";
import { useProfileBootstrap } from "./useProfileBootstrap";
import { useTgAuthBridge } from "./useTgAuthBridge";
import { useWindowShellState } from "./useWindowShellState";
import { useWindowManualResize } from "./useWindowManualResize";

const normalizeAccentColor = (rawValue) => {
  if (typeof rawValue === "string" && /^#[0-9a-fA-F]{6}$/.test(rawValue)) {
    return rawValue.toLowerCase();
  }

  return "#adb571";
};

const shiftHexColor = (hex, delta) => {
  const normalized = normalizeAccentColor(hex).replace("#", "");
  const clamp = (value) => Math.max(0, Math.min(255, value));

  const r = clamp(Number.parseInt(normalized.slice(0, 2), 16) + delta);
  const g = clamp(Number.parseInt(normalized.slice(2, 4), 16) + delta);
  const b = clamp(Number.parseInt(normalized.slice(4, 6), 16) + delta);

  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
};

const createThemeTokens = ({ isDark, accentColor }) => {
  if (isDark) {
    return {
      textColorBase: "#ffffff",
      textColor1: "#ffffff",
      textColor2: "#e3e8f2",
      textColor3: "#c5cedc",
      bodyColor: "#111722",
      cardColor: "#1a2332",
      popoverColor: "#1a2332",
      modalColor: "#1a2332",
      tableColor: "#1a2332",
      borderColor: "#2f3d54",
      dividerColor: "#2f3d54",
      inputColor: "#182334",
      inputColorDisabled: "#142033",
      actionColor: "rgba(232, 237, 245, 0.08)",
      hoverColor: "#27364c",
      primaryColor: shiftHexColor(accentColor, 44),
      primaryColorHover: shiftHexColor(accentColor, 66),
      primaryColorPressed: shiftHexColor(accentColor, 26),
      primaryColorSuppl: shiftHexColor(accentColor, 44),
      successColor: "#77d9a4",
      successColorHover: "#8ce0b4",
      successColorPressed: "#5fbe8a",
      successColorSuppl: "#77d9a4",
      infoColor: "#8ec2ff",
      infoColorHover: "#a3ceff",
      infoColorPressed: "#6daeea",
      infoColorSuppl: "#8ec2ff",
      warningColor: "#ffcc73",
      warningColorHover: "#ffd78d",
      warningColorPressed: "#e3b461",
      warningColorSuppl: "#ffcc73",
      errorColor: "#ff9b9b",
      errorColorHover: "#ffadad",
      errorColorPressed: "#e58686",
      errorColorSuppl: "#ff9b9b",
    };
  }

  return {
    textColorBase: "#111111",
    textColor1: "#111111",
    textColor2: "#2e3440",
    textColor3: "#5d6470",
    bodyColor: "#f3f5f8",
    cardColor: "#ffffff",
    popoverColor: "#ffffff",
    modalColor: "#ffffff",
    tableColor: "#ffffff",
    borderColor: "#d7dee8",
    dividerColor: "#d7dee8",
    inputColor: "#ffffff",
    inputColorDisabled: "#f0f3f8",
    actionColor: "rgba(30, 36, 48, 0.04)",
    hoverColor: "#edf3fa",
    primaryColor: accentColor,
    primaryColorHover: shiftHexColor(accentColor, 20),
    primaryColorPressed: shiftHexColor(accentColor, -20),
    primaryColorSuppl: accentColor,
    successColor: "#0f6a3b",
    successColorHover: "#147d47",
    successColorPressed: "#0c5b33",
    successColorSuppl: "#0f6a3b",
    infoColor: "#0f4c9a",
    infoColorHover: "#145caf",
    infoColorPressed: "#0d4182",
    infoColorSuppl: "#0f4c9a",
    warningColor: "#8a5300",
    warningColorHover: "#9b6000",
    warningColorPressed: "#724500",
    warningColorSuppl: "#8a5300",
    errorColor: "#9b1c1c",
    errorColorHover: "#b82424",
    errorColorPressed: "#7f1717",
    errorColorSuppl: "#9b1c1c",
  };
};

export const useAppShellController = () => {
  const currentView = ref("home");
  const sidebarCollapsed = ref(false);

  const { userAvatarBase64, defaultAvatarBase64, loadUserConfig } =
    useProfileBootstrap();

  const { pendingAuthData } = useTgAuthBridge({
    onAuthRequired: () => {
      // 认证挑战统一跳转设置页，避免业务页处理登录中断状态。
      currentView.value = "settings";
    },
  });

  // 向子树透传认证上下文，避免多层组件逐级透传 props。
  provide("pendingAuthData", pendingAuthData);

  const {
    isActive,
    isSubmenuExpanded,
    isGroupActive,
    isGroupExpanded,
    recentMenuItems,
    toggleGroup,
    ensureGroupExpandedByView,
    restoreExpandedGroups,
    restoreRecentViews,
    handleMenuClick,
  } = useShellNavigation({
    currentView,
    standaloneMenuItems,
    menuGroups,
    createDefaultGroupState,
    navGroupStorageKey: NAV_GROUP_STORAGE_KEY,
    navRecentStorageKey: NAV_RECENT_STORAGE_KEY,
  });

  const {
    showCustomTitleBar,
    windowShellClasses,
    windowAppearanceStyle,
    windowState,
  } = useWindowShellState();
  const { canShowResizeHandles, startManualResize } = useWindowManualResize({
    showCustomTitleBar,
    windowState,
  });

  const themeOverrides = computed(() => {
    const accentColor = normalizeAccentColor(windowState.value.accentColor);
    const isDark = Boolean(windowState.value.darkMode);
    const tokens = createThemeTokens({ isDark, accentColor });

    return {
      common: {
        borderRadius: "10px",
        fontFamily:
          "'Segoe UI Variable Text', 'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
        ...tokens,
      },
    };
  });

  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  };

  onMounted(() => {
    // 启动时先恢复导航展开态与最近访问，再按当前视图修正展开组。
    restoreExpandedGroups();
    restoreRecentViews();
    ensureGroupExpandedByView(currentView.value);
    loadUserConfig();
  });

  const activeComponent = computed(() =>
    // 视图标识只在这里映射为组件，收敛路由/菜单的耦合点。
    resolveAppActiveComponent(currentView.value),
  );

  return {
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
  };
};
