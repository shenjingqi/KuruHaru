// localStorage key 带版本号，便于导航结构调整后做无痛迁移或重置。
export const NAV_GROUP_STORAGE_KEY = "app-navigation-groups-v1";
export const NAV_RECENT_STORAGE_KEY = "app-navigation-recent-v1";

export const standaloneMenuItems = [
  { key: "home", label: "仪表盘", icon: "home" },
];

// 导航树的真相源：每个节点约定 { key, label, icon, items?/children? } 结构。
export const menuGroups = [
  {
    key: "workflow",
    label: "高频工作流",
    icon: "workflow",
    items: [
      { key: "upload", label: "上传字幕", icon: "upload" },
      { key: "whisper", label: "音声翻译", icon: "whisper" },
      { key: "recent", label: "最近上传", icon: "recent" },
      {
        key: "workflow-designer",
        label: "工作流设计",
        icon: "workflow-designer",
      },
    ],
  },
  {
    key: "data",
    label: "数据与检索",
    icon: "data",
    items: [
      {
        key: "clean",
        label: "数据清理",
        icon: "clean",
        children: [
          { key: "local-clean", label: "本地清理", icon: "local-clean" },
          { key: "cloud-clean", label: "云端清理", icon: "cloud-clean" },
        ],
      },
      { key: "advanced-search", label: "高级搜索", icon: "advanced-search" },
      { key: "rj-filter", label: "RJ筛选", icon: "rj-filter" },
      { key: "chinese-list", label: "汉化列表", icon: "chinese-list" },
      { key: "tools", label: "工具箱", icon: "tools" },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "telegram",
    items: [
      { key: "tg-search-bot", label: "TG搜索Bot", icon: "tg-search-bot" },
      { key: "tg-info-cache", label: "TG信息缓存", icon: "tg-info-cache" },
      {
        key: "tg-info-error-recover",
        label: "TG报错恢复",
        icon: "tg-info-error-recover",
      },
      {
        key: "rj-duplicate-detector",
        label: "RJ重复检测",
        icon: "rj-duplicate-detector",
      },
    ],
  },
  {
    key: "system",
    label: "系统",
    icon: "system",
    items: [{ key: "settings", label: "设置", icon: "settings" }],
  },
];

export const createDefaultGroupState = () =>
  // 默认仅展开 workflow，其他组折叠，避免首次进入时信息密度过高。
  menuGroups.reduce((state, group) => {
    state[group.key] = group.key === "workflow";
    return state;
  }, {});
