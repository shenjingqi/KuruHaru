import { defineStore } from "pinia";
import { computed, ref } from "vue";

const STORAGE_KEY = "workflow.canvas.state.v1";
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readStoredCanvasState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const useWorkflowCanvasStore = defineStore("workflowCanvas", () => {
  const zoom = ref(DEFAULT_ZOOM);
  const scrollLeft = ref(0);
  const scrollTop = ref(0);
  const viewportWidth = ref(0);
  const viewportHeight = ref(0);
  const linkVisible = ref(true);
  const locked = ref(false);
  const minimapVisible = ref(true);
  const navigationMode = ref("move");

  const persist = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        zoom: zoom.value,
        scrollLeft: scrollLeft.value,
        scrollTop: scrollTop.value,
        viewportWidth: viewportWidth.value,
        viewportHeight: viewportHeight.value,
        linkVisible: linkVisible.value,
        locked: locked.value,
        minimapVisible: minimapVisible.value,
        navigationMode: navigationMode.value,
      }),
    );
  };

  const hydrate = () => {
    const stored = readStoredCanvasState();
    if (!stored) {
      return;
    }

    zoom.value = clamp(
      toSafeNumber(stored.zoom, DEFAULT_ZOOM),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    scrollLeft.value = Math.max(0, toSafeNumber(stored.scrollLeft, 0));
    scrollTop.value = Math.max(0, toSafeNumber(stored.scrollTop, 0));
    viewportWidth.value = Math.max(0, toSafeNumber(stored.viewportWidth, 0));
    viewportHeight.value = Math.max(0, toSafeNumber(stored.viewportHeight, 0));
    linkVisible.value = stored.linkVisible !== false;
    locked.value = stored.locked === true;
    minimapVisible.value = stored.minimapVisible !== false;
    navigationMode.value = stored.navigationMode === "pan" ? "pan" : "move";
  };

  const setZoom = (nextZoom) => {
    zoom.value = clamp(
      toSafeNumber(nextZoom, DEFAULT_ZOOM),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    persist();
  };

  const zoomIn = () => {
    setZoom(zoom.value + 0.1);
  };

  const zoomOut = () => {
    setZoom(zoom.value - 0.1);
  };

  const resetView = () => {
    zoom.value = DEFAULT_ZOOM;
    scrollLeft.value = 0;
    scrollTop.value = 0;
    persist();
  };

  const fitView = ({
    contentWidth,
    contentHeight,
    padding = 80,
    canvasWidth,
    canvasHeight,
  } = {}) => {
    const safeCanvasWidth = Math.max(
      1,
      toSafeNumber(canvasWidth, viewportWidth.value),
    );
    const safeCanvasHeight = Math.max(
      1,
      toSafeNumber(canvasHeight, viewportHeight.value),
    );
    const safeContentWidth = Math.max(
      1,
      toSafeNumber(contentWidth, safeCanvasWidth),
    );
    const safeContentHeight = Math.max(
      1,
      toSafeNumber(contentHeight, safeCanvasHeight),
    );
    const zoomByWidth = (safeCanvasWidth - padding * 2) / safeContentWidth;
    const zoomByHeight = (safeCanvasHeight - padding * 2) / safeContentHeight;
    setZoom(Math.min(zoomByWidth, zoomByHeight));
  };

  const updateViewport = ({ left, top, width, height } = {}) => {
    if (Number.isFinite(Number(left))) {
      scrollLeft.value = Math.max(0, Number(left));
    }
    if (Number.isFinite(Number(top))) {
      scrollTop.value = Math.max(0, Number(top));
    }
    if (Number.isFinite(Number(width))) {
      viewportWidth.value = Math.max(0, Number(width));
    }
    if (Number.isFinite(Number(height))) {
      viewportHeight.value = Math.max(0, Number(height));
    }
    persist();
  };

  const setLinkVisible = (value) => {
    linkVisible.value = value !== false;
    persist();
  };

  const setLocked = (value) => {
    locked.value = value === true;
    persist();
  };

  const setMinimapVisible = (value) => {
    minimapVisible.value = value !== false;
    persist();
  };

  const setNavigationMode = (value) => {
    navigationMode.value = value === "pan" ? "pan" : "move";
    persist();
  };

  const zoomPercent = computed(() => Math.round(zoom.value * 100));

  hydrate();

  return {
    zoom,
    zoomPercent,
    scrollLeft,
    scrollTop,
    viewportWidth,
    viewportHeight,
    linkVisible,
    locked,
    minimapVisible,
    navigationMode,
    setZoom,
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    updateViewport,
    setLinkVisible,
    setLocked,
    setMinimapVisible,
    setNavigationMode,
  };
});
