// 通过依赖注入构建 key -> 组件映射，避免本模块直接耦合具体组件 import 路径。
export const createViewRegistry = ({
  HomePanel,
  UploadTool,
  WhisperTool,
  CloudCleaner,
  RecentActivity,
  WorkflowDesigner,
  TgSearchBot,
  TgInfoCache,
  TgInfoErrorRecover,
  RjDuplicateDetector,
  Tools,
  Settings,
  ChineseList,
  AdvancedSearch,
  RjFilter,
}) => ({
  // "clean" 是父菜单入口，默认指向云端清理页；子项由 resolveActiveViewComponent 分流。
  home: HomePanel,
  upload: UploadTool,
  whisper: WhisperTool,
  clean: CloudCleaner,
  recent: RecentActivity,
  "workflow-designer": WorkflowDesigner,
  "tg-search-bot": TgSearchBot,
  "tg-info-cache": TgInfoCache,
  "tg-info-error-recover": TgInfoErrorRecover,
  "rj-duplicate-detector": RjDuplicateDetector,
  tools: Tools,
  settings: Settings,
  "chinese-list": ChineseList,
  "advanced-search": AdvancedSearch,
  "rj-filter": RjFilter,
});

export const resolveActiveViewComponent = ({
  currentView,
  registry,
  fallback,
  localCleaner,
  cloudCleaner,
}) => {
  // 两个子路由视图不在主 registry 中，单独走显式分支确保父级菜单结构可复用。
  if (currentView === "local-clean") return localCleaner;
  if (currentView === "cloud-clean") return cloudCleaner;
  // 未知 view key 兜底 fallback，保证异常状态下仍有可渲染组件。
  return registry[currentView] || fallback;
};
