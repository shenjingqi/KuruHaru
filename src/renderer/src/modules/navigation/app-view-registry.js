import HomePanel from "../../components/HomePanel.vue";
import WhisperTool from "../../components/WhisperTool.vue";
import LocalCleaner from "../../components/LocalCleaner.vue";
import CloudCleaner from "../../components/CloudCleaner.vue";
import UploadTool from "../../components/UploadTool.vue";
import Settings from "../../components/Settings.vue";
import RecentActivity from "../../components/RecentActivity.vue";
import WorkflowDesigner from "../../components/WorkflowDesigner.vue";
import TgSearchBot from "../../components/TgSearchBot.vue";
import TgInfoCache from "../../components/TgInfoCache.vue";
import TgInfoErrorRecover from "../../components/TgInfoErrorRecover.vue";
import RjDuplicateDetector from "../../components/RjDuplicateDetector.vue";
import Tools from "../../components/Tools.vue";
import ChineseList from "../../components/ChineseList.vue";
import AdvancedSearch from "../../components/AdvancedSearch.vue";
import RjFilter from "../../components/RjFilter.vue";
import { createViewRegistry, resolveActiveViewComponent } from "./viewRegistry";

const appViewRegistry = createViewRegistry({
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
});

export const resolveAppActiveComponent = (currentView) =>
  resolveActiveViewComponent({
    currentView,
    registry: appViewRegistry,
    fallback: HomePanel,
    localCleaner: LocalCleaner,
    cloudCleaner: CloudCleaner,
  });
