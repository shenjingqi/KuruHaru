import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  getWindowState,
  isWindowControlSupported,
  onWindowStateChanged,
} from "../api/systemApi";

const createDefaultWindowState = () => ({
  frameMode: "system",
  requestedFrameMode: "custom",
  customFrameEnabled: false,
  windowControlSupported: isWindowControlSupported(),
  maximized: false,
  focused: true,
  darkMode: false,
  themeMode: "auto",
  windowOpacity: 0.92,
  blurEnabled: true,
  blurIntensity: 8,
  blurRenderMode: "system",
  accentColor: "#adb571",
});

const normalizeOpacity = (rawValue) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 0.92;
  }
  return Math.min(1, Math.max(0.55, Number(parsed.toFixed(2))));
};

const normalizeBlurIntensity = (rawValue) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(40, Math.max(0, Math.round(parsed)));
};

const normalizeAccentColor = (rawValue) => {
  if (typeof rawValue === "string" && /^#[0-9a-fA-F]{6}$/.test(rawValue)) {
    return rawValue.toLowerCase();
  }

  return "#adb571";
};

const normalizeBlurRenderMode = (rawValue) => {
  if (rawValue === "gpu" || rawValue === "system") {
    return rawValue;
  }

  return "system";
};

const hexToRgba = (hex, alpha) => {
  const normalized = normalizeAccentColor(hex).replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DARK_TEXT_OVERRIDE_STYLE_ID = "kh-dark-text-overrides";
const DARK_TEXT_OVERRIDE_CSS = `
html[data-app-theme="dark"] .app-shell,
html[data-app-theme="dark"] .app-shell *,
html[data-app-theme="dark"] .app-shell *::before,
html[data-app-theme="dark"] .app-shell *::after {
  color: #ffffff !important;
}

html[data-app-theme="dark"] .app-shell input::placeholder,
html[data-app-theme="dark"] .app-shell textarea::placeholder {
  color: rgba(255, 255, 255, 0.78) !important;
}

html[data-app-theme="dark"] .app-shell .titlebar-dot,
html[data-app-theme="dark"] .app-shell .stat-icon,
html[data-app-theme="dark"] .app-shell .section-icon,
html[data-app-theme="dark"] .app-shell .status-icon {
  color: inherit !important;
}
`;

export const useWindowShellState = () => {
  const windowState = ref(createDefaultWindowState());
  let unsubscribe = null;

  const syncDarkTextOverrides = (isDark) => {
    if (typeof document === "undefined" || !document?.head) {
      return;
    }

    let styleElement = document.getElementById(DARK_TEXT_OVERRIDE_STYLE_ID);
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = DARK_TEXT_OVERRIDE_STYLE_ID;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = isDark ? DARK_TEXT_OVERRIDE_CSS : "";
  };

  const syncRootTheme = (stateSnapshot) => {
    if (typeof document === "undefined" || !document?.documentElement) {
      return;
    }

    const accentColor = normalizeAccentColor(stateSnapshot.accentColor);
    const isDark = Boolean(stateSnapshot.darkMode);
    const root = document.documentElement;

    root.setAttribute("data-app-theme", isDark ? "dark" : "light");
    root.style.setProperty("--app-accent", accentColor);
    syncDarkTextOverrides(isDark);
  };

  const applyState = (nextState) => {
    if (!nextState || typeof nextState !== "object") {
      return;
    }

    // 增量状态合并时统一布尔化，兼容主进程返回的不同类型值。
    windowState.value = {
      ...windowState.value,
      ...nextState,
      customFrameEnabled: Boolean(nextState.customFrameEnabled),
      windowControlSupported: Boolean(nextState.windowControlSupported),
      maximized: Boolean(nextState.maximized),
      focused:
        typeof nextState.focused === "boolean" ? nextState.focused : true,
      darkMode: Boolean(nextState.darkMode),
      themeMode:
        typeof nextState.themeMode === "string" ? nextState.themeMode : "auto",
      windowOpacity: normalizeOpacity(nextState.windowOpacity),
      blurEnabled:
        typeof nextState.blurEnabled === "boolean"
          ? nextState.blurEnabled
          : true,
      blurIntensity: normalizeBlurIntensity(nextState.blurIntensity),
      blurRenderMode: normalizeBlurRenderMode(nextState.blurRenderMode),
      accentColor: normalizeAccentColor(nextState.accentColor),
    };

    syncRootTheme(windowState.value);
  };

  const syncWindowState = async () => {
    try {
      const state = await getWindowState();
      applyState(state);
    } catch (error) {
      console.warn("[WindowShell] 获取窗口状态失败:", error);
    }
  };

  const showCustomTitleBar = computed(
    // 只有平台支持且 custom frame 已启用时，渲染自定义标题栏。
    () =>
      windowState.value.windowControlSupported &&
      windowState.value.customFrameEnabled,
  );

  const useSystemBlur = computed(
    () =>
      showCustomTitleBar.value &&
      Boolean(windowState.value.blurEnabled) &&
      windowState.value.blurRenderMode === "system",
  );

  const useGpuBlur = computed(
    () =>
      showCustomTitleBar.value &&
      Boolean(windowState.value.blurEnabled) &&
      windowState.value.blurRenderMode === "gpu",
  );

  const windowShellClasses = computed(() => ({
    "window-custom-frame": showCustomTitleBar.value,
    "window-system-frame": !showCustomTitleBar.value,
    "window-maximized": windowState.value.maximized,
    "window-blurred": !windowState.value.focused,
    "window-dark": windowState.value.darkMode,
    "window-system-blur": useSystemBlur.value,
    "window-gpu-blur": useGpuBlur.value,
  }));

  const windowAppearanceStyle = computed(() => {
    const opacity = normalizeOpacity(windowState.value.windowOpacity);
    const blurEnabled =
      typeof windowState.value.blurEnabled === "boolean"
        ? windowState.value.blurEnabled
        : true;
    const blurIntensity = blurEnabled
      ? normalizeBlurIntensity(windowState.value.blurIntensity)
      : 0;
    const accentColor = normalizeAccentColor(windowState.value.accentColor);
    const shellBlur = useGpuBlur.value
      ? Math.max(20, Math.round(blurIntensity * 1.12))
      : useSystemBlur.value
        ? Math.max(12, Math.round(blurIntensity * 0.6))
        : 0;
    const panelBlur = useGpuBlur.value
      ? Math.max(14, Math.round(blurIntensity * 0.84))
      : useSystemBlur.value
        ? Math.max(6, Math.round(blurIntensity * 0.32))
        : 0;
    const glassFactor = blurEnabled ? (opacity - 0.55) / 0.45 : 1;
    const clampAlpha = (value, min, max) =>
      Math.min(max, Math.max(min, Number(value.toFixed(2))));
    const isGpuMode = useGpuBlur.value;
    const workspaceAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.08 + glassFactor * 0.28, 0.08, 0.36)
        : clampAlpha(0.26 + glassFactor * 0.36, 0.26, 0.62)
      : 1;
    const workspaceStrongAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.12 + glassFactor * 0.3, 0.12, 0.42)
        : clampAlpha(0.34 + glassFactor * 0.34, 0.34, 0.68)
      : 1;
    const sidebarAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.14 + glassFactor * 0.28, 0.14, 0.42)
        : clampAlpha(0.3 + glassFactor * 0.3, 0.3, 0.6)
      : 1;
    const panelAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.18 + glassFactor * 0.28, 0.18, 0.46)
        : clampAlpha(0.42 + glassFactor * 0.22, 0.42, 0.64)
      : 1;
    const panelStrongAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.24 + glassFactor * 0.28, 0.24, 0.52)
        : clampAlpha(0.5 + glassFactor * 0.18, 0.5, 0.68)
      : 1;
    const headerAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.16 + glassFactor * 0.26, 0.16, 0.42)
        : clampAlpha(0.4 + glassFactor * 0.18, 0.4, 0.58)
      : 1;
    const controlAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.26 + glassFactor * 0.28, 0.26, 0.54)
        : clampAlpha(0.56 + glassFactor * 0.16, 0.56, 0.72)
      : 1;
    const titlebarAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.16 + glassFactor * 0.2, 0.16, 0.36)
        : clampAlpha(0.34 + glassFactor * 0.14, 0.34, 0.48)
      : 1;
    const borderAlpha = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.18 + glassFactor * 0.14, 0.18, 0.32)
        : clampAlpha(0.22 + glassFactor * 0.1, 0.22, 0.32)
      : 1;
    const frostStrength = blurEnabled ? clampAlpha(1 - glassFactor, 0, 1) : 0;
    const ambientOpacity = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.16 + frostStrength * 0.24, 0.16, 0.4)
        : clampAlpha(0.06 + frostStrength * 0.1, 0.06, 0.16)
      : 0;
    const ambientGlowOpacity = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.12 + frostStrength * 0.18, 0.12, 0.3)
        : clampAlpha(0.04 + frostStrength * 0.06, 0.04, 0.1)
      : 0;
    const ambientLineOpacity = blurEnabled
      ? isGpuMode
        ? clampAlpha(0.04 + frostStrength * 0.06, 0.04, 0.1)
        : clampAlpha(0.01 + frostStrength * 0.02, 0.01, 0.03)
      : 0;

    return {
      "--accent": accentColor,
      "--accent-soft": hexToRgba(accentColor, 0.2),
      "--shell-opacity": String(opacity),
      "--workspace-opacity": String(workspaceAlpha),
      "--workspace-strong-opacity": String(workspaceStrongAlpha),
      "--sidebar-opacity": String(sidebarAlpha),
      "--surface-opacity": String(panelAlpha),
      "--surface-strong-opacity": String(panelStrongAlpha),
      "--header-opacity": String(headerAlpha),
      "--control-opacity": String(controlAlpha),
      "--titlebar-opacity": String(titlebarAlpha),
      "--surface-border-opacity": String(borderAlpha),
      "--ambient-opacity": String(ambientOpacity),
      "--ambient-glow-opacity": String(ambientGlowOpacity),
      "--ambient-line-opacity": String(ambientLineOpacity),
      "--glass-blur": `${shellBlur}px`,
      "--panel-blur": `${panelBlur}px`,
    };
  });

  onMounted(() => {
    syncWindowState();
    // 订阅主进程窗口状态流，响应最大化/失焦/主题变化。
    unsubscribe = onWindowStateChanged((state) => {
      applyState(state);
    });
  });

  onUnmounted(() => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });

  return {
    windowState,
    showCustomTitleBar,
    windowShellClasses,
    windowAppearanceStyle,
    syncWindowState,
  };
};
