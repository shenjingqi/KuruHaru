import {
  ArrowUpload24Regular,
  Bot24Regular,
  Broom24Regular,
  CalendarLtr24Regular,
  Chat24Regular,
  Circle24Regular,
  Cloud24Regular,
  Flash24Regular,
  Folder24Regular,
  Headphones24Regular,
  Home24Regular,
  Library24Regular,
  NumberSymbol24Regular,
  PuzzlePiece24Regular,
  Search24Regular,
  Settings24Regular,
  TextBulletListSquare24Regular,
  Toolbox24Regular,
} from "@vicons/fluent";

// 图标键与导航 schema 的 icon 字段一一对应；集中注册避免散落硬编码。
const NAV_ICON_REGISTRY = Object.freeze({
  home: Home24Regular,
  workflow: Flash24Regular,
  upload: ArrowUpload24Regular,
  whisper: Headphones24Regular,
  recent: CalendarLtr24Regular,
  "workflow-designer": PuzzlePiece24Regular,
  data: Library24Regular,
  clean: Broom24Regular,
  "local-clean": Folder24Regular,
  "cloud-clean": Cloud24Regular,
  "advanced-search": Search24Regular,
  "rj-filter": NumberSymbol24Regular,
  "chinese-list": TextBulletListSquare24Regular,
  tools: Toolbox24Regular,
  telegram: Chat24Regular,
  "tg-search-bot": Bot24Regular,
  "tg-info-cache": Folder24Regular,
  "tg-info-error-recover": Search24Regular,
  "rj-duplicate-detector": PuzzlePiece24Regular,
  system: Settings24Regular,
  settings: Settings24Regular,
});

// 未知 iconKey 统一降级到 Circle，避免菜单渲染因缺图标中断。
export const resolveNavIcon = (iconKey) =>
  NAV_ICON_REGISTRY[iconKey] || Circle24Regular;
