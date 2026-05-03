export const NAV_GROUP_STORAGE_KEY = "app-navigation-groups-v2";
export const NAV_RECENT_STORAGE_KEY = "app-navigation-recent-v2";

export const standaloneMenuItems = [
  { key: "home", label: "首页", icon: "home" },
];

export const menuGroups = [
  {
    key: "tasks",
    label: "任务处理",
    icon: "tasks",
    items: [
      { key: "upload", label: "上传工具", icon: "upload" },
      { key: "whisper", label: "Whisper", icon: "whisper" },
      { key: "asmr-downloader", label: "音声下载", icon: "asmr-downloader" },
      { key: "recent", label: "最近活动", icon: "recent" },
    ],
  },
  {
    key: "data",
    label: "数据工具",
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
      { key: "rj-filter", label: "RJ 过滤", icon: "rj-filter" },
      { key: "chinese-list", label: "中文列表", icon: "chinese-list" },
      { key: "tools", label: "工具箱", icon: "tools" },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "telegram",
    items: [
      { key: "tg-search-bot", label: "TG 搜索 Bot", icon: "tg-search-bot" },
      { key: "tg-info-cache", label: "TG 信息缓存", icon: "tg-info-cache" },
      {
        key: "tg-info-error-recover",
        label: "TG 异常恢复",
        icon: "tg-info-error-recover",
      },
      {
        key: "rj-duplicate-detector",
        label: "RJ 重复检测",
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
  menuGroups.reduce((state, group) => {
    state[group.key] = false;
    return state;
  }, {});
