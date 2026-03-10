import { ref, computed, watch } from "vue";

export const useShellNavigation = ({
  currentView,
  standaloneMenuItems = [],
  menuGroups,
  createDefaultGroupState,
  navGroupStorageKey,
  navRecentStorageKey = "app-navigation-recent-v1",
  recentLimit = 3,
}) => {
  const expandedSubmenu = ref(null);
  const expandedGroups = ref(createDefaultGroupState());
  const recentViewKeys = ref([]);

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

  const viewMetaMap = computed(() => {
    const map = {};

    const appendItem = (item, groupKey = null) => {
      map[item.key] = {
        key: item.key,
        label: item.label,
        icon: item.icon || "•",
        groupKey,
      };
    };

    for (const item of standaloneMenuItems) {
      appendItem(item, "standalone");
    }

    for (const group of menuGroups) {
      for (const item of group.items) {
        appendItem(item, group.key);
        if (item.children?.length) {
          for (const child of item.children) {
            appendItem(child, group.key);
          }
        }
      }
    }

    return map;
  });

  const recentMenuItems = computed(() =>
    recentViewKeys.value
      .map((key) => viewMetaMap.value[key])
      .filter(Boolean)
      .slice(0, recentLimit),
  );

  const trackRecentView = (viewKey) => {
    // 仪表盘固定置顶，不纳入快捷区。
    if (!viewKey || viewKey === "home" || !viewMetaMap.value[viewKey]) {
      return;
    }

    recentViewKeys.value = [
      viewKey,
      ...recentViewKeys.value.filter((key) => key !== viewKey),
    ].slice(0, recentLimit);
  };

  const isActive = (key) => {
    if (key === "clean") {
      return ["clean", "local-clean", "cloud-clean"].includes(
        currentView.value,
      );
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

  const isGroupExpanded = (groupKey) => Boolean(expandedGroups.value[groupKey]);

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
      const saved = localStorage.getItem(navGroupStorageKey);
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

  const restoreRecentViews = () => {
    try {
      const saved = localStorage.getItem(navRecentStorageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;

      const validViewKeys = parsed.filter((key) => {
        return (
          typeof key === "string" &&
          key !== "home" &&
          Boolean(viewMetaMap.value[key])
        );
      });

      recentViewKeys.value = [...new Set(validViewKeys)].slice(0, recentLimit);
    } catch (error) {
      console.warn("[App] 读取最近访问失败:", error);
    }
  };

  watch(
    expandedGroups,
    (value) => {
      try {
        localStorage.setItem(navGroupStorageKey, JSON.stringify(value));
      } catch (error) {
        console.warn("[App] 保存导航分组状态失败:", error);
      }
    },
    { deep: true },
  );

  watch(
    recentViewKeys,
    (value) => {
      try {
        localStorage.setItem(navRecentStorageKey, JSON.stringify(value));
      } catch (error) {
        console.warn("[App] 保存最近访问失败:", error);
      }
    },
    { deep: true },
  );

  watch(
    currentView,
    (viewKey) => {
      ensureGroupExpandedByView(viewKey);
      trackRecentView(viewKey);
    },
    { immediate: true },
  );

  const handleMenuClick = (key) => {
    currentView.value = key;
    ensureGroupExpandedByView(key);

    if (key === "clean") {
      expandedSubmenu.value =
        expandedSubmenu.value === "clean" ? null : "clean";
      return;
    }

    if (["local-clean", "cloud-clean"].includes(key)) {
      expandedSubmenu.value = "clean";
      return;
    }

    expandedSubmenu.value = null;
  };

  return {
    expandedSubmenu,
    expandedGroups,
    recentMenuItems,
    isActive,
    isSubmenuExpanded,
    isGroupActive,
    isGroupExpanded,
    toggleGroup,
    ensureGroupExpandedByView,
    restoreExpandedGroups,
    restoreRecentViews,
    handleMenuClick,
  };
};
