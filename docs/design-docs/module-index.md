# 模块导航索引

> 状态: ✅ 可用  
> 最后更新: 2026-03-06

本文档用于快速定位「功能 -> 代码文件 -> 关键 IPC」，并明确**当前已装配模块**与**兼容保留模块**。

## 1. 快速导航（实现态）

| 功能                     | 主要文件                                    | 装配状态                  |
| ------------------------ | ------------------------------------------- | ------------------------- |
| 配置管理                 | `src/main/modules/config.js`                | ✅ 已装配                 |
| ASMR 数据抓取 / 云端同步 | `src/main/modules/asmr-localization.js`     | ✅ 已装配                 |
| Whisper 转写 / 打包      | `src/main/modules/whisper.js`               | ✅ 已装配                 |
| TG 登录与上传            | `src/main/utils/telegram-login.js`          | ✅ 已装配                 |
| TG 最近活动              | `src/main/modules/tg-recent-activity.js`    | ✅ 已装配                 |
| TG 搜索 Bot              | `src/main/modules/tg-search-bot.js`         | ✅ 已装配                 |
| TG 信息缓存（BOT A）     | `src/main/modules/tg-info-cache.js`         | ✅ 已装配                 |
| TG RJ 重复检测           | `src/main/modules/tg-rj-duplicates.js`      | ✅ 已装配                 |
| TG Info 报错恢复         | `src/main/modules/tg-info-error-recover.js` | ✅ 已装配                 |
| Workflow Runtime         | `src/main/workflow-runtime/index.js`        | ✅ 已装配                 |
| TG Bot API 兼容入口      | `src/main/modules/tg-bot-api.js`            | ⚠️ 兼容保留（默认未装配） |
| ASMR 登录兼容模块        | `src/main/modules/asmr-login.js`            | ⚠️ 兼容保留（默认未装配） |
| ASMR 旧实现兼容模块      | `src/main/modules/asmr.js`                  | ⚠️ 兼容保留（默认未装配） |
| TG 重复检测旧实现        | `src/main/modules/tg-rj-duplicates-old.js`  | ⚠️ 兼容保留（默认未装配） |
| 日志                     | `src/main/utils/logger.js`                  | ✅ 通用依赖               |
| 错误处理                 | `src/main/utils/errorHandler.js`            | ✅ 通用依赖               |
| 重试                     | `src/main/utils/retry.js`                   | ✅ 通用依赖               |

---

## 2. 主进程入口与模块装配

入口文件：`src/main/index.js`

主进程启动时会装配以下模块：

- `setupAsmrIPC(...)`（来自 `asmr-localization.js`）
- `setupWhisperIPC()`
- `setupTelegramIPC()`
- `setupTgHistoryIPC()`
- `setupTgSearchBotIPC()`
- `setupTgInfoCacheIPC()`
- `setupRjDuplicatesIPC()`
- `setupTgInfoErrorRecoverIPC()`
- `setupConfigIPC()`
- `setupWorkflowRuntimeIPC()`

> 注意：最近活动模块的装配函数是 **`setupTgHistoryIPC`**（不是 `setupTGRecentActivityIPC`）。

> 注意：`asmr.js`、`asmr-login.js`、`tg-bot-api.js`、`tg-rj-duplicates-old.js` 当前默认不在 `index.js` 装配链路内。

---

## 3. 关键模块说明

### 3.1 `src/main/modules/config.js`

- 导出：`getConfig`, `saveConfig`, `getDataDir`, `setupConfigIPC`
- 关键 IPC：
  - `get-config` / `save-config`
  - `get-tg-config` / `save-tg-config`
  - `get-whisper-config` / `save-whisper-config`
  - `get-system-config` / `save-system-config`

### 3.2 `src/main/modules/asmr-localization.js`

- 导出：`setupAsmrIPC`
- 关键 IPC（节选）：
  - `asmr-trigger-cloud-data-fetch`
  - `asmr-get-cached-cloud-works`
  - `asmr-fetch-cloud-works`
  - `load-tag-db`
  - `scan-local-ids`
  - `asmr-login` / `asmr-check-login` / `asmr-logout`
  - `asmr-delete-works` / `asmr-delete-local-files` / `asmr-delete-by-rj`
  - `asmr-fetch-chinese-works`
  - `asmr-set-chinese-list-path` / `asmr-get-chinese-list-path` / `asmr-read-chinese-list`
  - `filter-rj-from-url`

### 3.3 `src/main/modules/asmr-login.js`（兼容保留）

- 导出：`setupAsmrIPCHandlers`
- 关键 IPC：`asmr-login`、`asmr-check-login`、`asmr-logout`
- 状态：默认未装配，保留用于兼容与迁移期间参考。

### 3.4 `src/main/modules/whisper.js`

- 导出：`setupWhisperIPC`
- 关键 IPC：
  - `count-media-files`
  - `zip-subtitles`
  - `start-task`（事件）
  - `stop-task`（事件）
- 行为补充：
  - 翻译任务启动后会自动扫描 `targetPath` 下的 `RJ/VJ/BJ` 编号，并触发作品信息缓存预热（复用 `tg-info-cache`）

### 3.5 `src/main/modules/tg-recent-activity.js`

- 导出：`scanAndSaveRecentActivity`, `saveRecentActivity`, `loadRecentActivity`, `setupTgHistoryIPC`
- 关键 IPC：
  - `tg-scan-recent-activity`
  - `tg-read-recent-activity`
  - `get-recent-activity`
  - `download-tg-file`
  - `clear-cache`
  - `read-rj-list`

### 3.6 `src/main/modules/tg-search-bot.js`

- 导出：`setupTgSearchBotIPC`, `startBot`, `stopBot`, `getBotStatus`, `handleSearchRequest`, `handleInfoRequest`, `syncChannelHistoryToIndex`, `triggerStartupHistorySync`
- 关键 IPC：
  - `tg-bot-start`
  - `tg-bot-stop`
  - `tg-bot-status`
  - `tg-bot-search`
  - `tg-bot-info`
  - `tg-bot-sync-history`

### 3.7 `src/main/modules/tg-info-cache.js`

- 导出：`setupTgInfoCacheIPC`, `buildInfoCacheFromTextFile`, `buildInfoCacheFromWorkCodes`, `fetchWorkInfoByCode`, `getInfoCacheStatus`, `formatWorkInfoMessage`
- 关键 IPC：
  - `tg-info-cache-build`
  - `tg-info-cache-status`
- 行为补充：
  - 作品信息缓存支持按 `tg.infoCacheMaxFileSizeMB` 进行超限淘汰（仅作用于 `tg-info-cache.json`）
  - `/search` 链接索引缓存 `tg-bot-history.json` 不受该机制影响

### 3.8 `src/main/modules/tg-bot-api.js`（兼容入口）

- 导出：`setupTgBotApiIPC`（内部转发到 `setupTgSearchBotIPC`）
- 状态：兼容入口保留，当前默认不在 `index.js` 装配。

### 3.9 `src/main/modules/tg-rj-duplicates.js`

- 导出：`setupRjDuplicatesIPC`
- 关键 IPC：
  - `tg-scan-rj-duplicates`
  - `tg-delete-duplicate-messages`

### 3.10 `src/main/modules/tg-rj-duplicates-old.js`（旧实现）

- 导出：`setupRjDuplicatesIPC`
- 状态：旧实现保留，当前默认不在 `index.js` 装配。

### 3.11 `src/main/modules/tg-info-error-recover.js`

- 导出：`setupTgInfoErrorRecoverIPC`
- 关键 IPC：
  - `tg-info-error-recover`
- 行为补充：
  - 在讨论组中按关键词（默认 `获取作品信息失败`）扫描报错消息
  - 回查报错消息附近上下若干条消息，按评分匹配最可能目标并下载评论区 ZIP
  - 解析转发来源并删除频道原帖（支持 `safetyMode` 测试模式）
  - 复用 `telegram-login` 的连接状态（`requireConnectedTelegramClient`）

### 3.12 `src/main/modules/asmr.js`（旧实现）

- 导出：`setupAsmrIPC`
- 状态：旧实现保留，当前默认不在 `index.js` 装配。

### 3.13 `src/main/utils/telegram-login.js`

- 导出：`setupTelegramIPC`, `tryAutoConnect`, `getConnectedTelegramClient`, `requireConnectedTelegramClient`
- 关键 IPC：
  - `tg-check-login`
  - `tg-login`
  - `tg-get-status`
  - `tg-cancel-auth`
  - `tg-upload-files`（事件）
  - `tg-cancel-upload`

### 3.14 `src/main/workflow-runtime/index.js`

- 导出：`setupWorkflowRuntimeIPC`
- 关键 IPC：
  - `workflow-list`
  - `workflow-get`
  - `workflow-save`
  - `workflow-delete`
  - `workflow-validate`
  - `workflow-run`
  - `workflow-cancel`
  - `workflow-get-run`
  - `workflow-list-runs`
  - `workflow-list-node-definitions`
  - `workflow-run-event`（事件）
- 行为补充：
  - 启动时挂载定义/运行记录目录（`<userData>/workflows/*`）
  - 运行前执行图校验（节点存在性、依赖关系、环路）
  - 内置首个节点类型 `whisper.translateSubtitles`（翻译字幕）
  - `whisper.translateSubtitles` 必填配置：`exePath`、`targetPath`，`subFormats` 至少一项
  - `whisper.translateSubtitles` 运行时会推送 RJ 维度进度（当前 RJ、已完成作品数、剩余作品数）
  - `whisper.packSubtitles`: reuse toolbox packing flow; scan subtitle folders and output RJ/VJ/BJ zip archives
  - `tg.uploadSubtitles`: reuse smart-scan upload flow; scan archives then send them to target channel
  - `asmr.cloudDeleteRecentUploads`: map recent-upload records to cloud works and execute remote cleanup
  - `files.localDeleteScanned`: reuse local-clean scan behavior for scan-folder + delete-local-files flow
  - 运行时支持取消、状态事件推送与运行记录持久化

---

## 4. Renderer 主要组件

主要业务组件位于 `src/renderer/src/components/`：

- `HomePanel.vue`
- `UploadTool.vue`
- `WhisperTool.vue`
- `RecentActivity.vue`
- `TgDownloader.vue`
- `TgSearchBot.vue`
- `TgInfoCache.vue`
- `TgInfoErrorRecover.vue`
- `RjDuplicateDetector.vue`
- `WorkflowDesigner.vue`
- `Settings.vue`
- `Tools.vue`
- `LocalCleaner.vue`
- `CloudCleaner.vue`

---

## 5. 常用命令

| 命令             | 用途                    |
| ---------------- | ----------------------- |
| `npm run dev`    | 开发模式                |
| `npm run test`   | 单元测试                |
| `npm run build`  | 生产构建                |
| `npm run lint`   | ESLint 检查             |
| `npm run verify` | `lint + build` 综合验证 |

---

## 6. 相关文档

- `docs/ARCHITECTURE.md`
- `docs/design-docs/architecture-design.md`
- `docs/design-docs/data-flow.md`
- `docs/design-docs/feature-local-file-management.md`
- `docs/design-docs/feature-cloud-data-sync.md`
- `docs/design-docs/feature-whisper-transcription.md`
- `docs/design-docs/feature-telegram-upload.md`
- `docs/design-docs/feature-local-cleaning.md`
- `docs/design-docs/feature-cloud-cleaning.md`
- `docs/design-docs/feature-recent-activity.md`
- `docs/design-docs/feature-rj-filter.md`
- `docs/design-docs/feature-advanced-search.md`
- `docs/design-docs/feature-telegram-search-bot.md`
- `docs/design-docs/feature-rj-duplicate-detector.md`
- `docs/quality/README.md`

---

## 7. Update Log

| Date       | Change |
| ---------- | ------ |
| 2026-03-06 | Added workflow node-library entries for `whisper.packSubtitles`, `tg.uploadSubtitles`, `asmr.cloudDeleteRecentUploads`, and `files.localDeleteScanned` with data-flow responsibilities. |
