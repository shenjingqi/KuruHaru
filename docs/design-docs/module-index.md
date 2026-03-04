# 模块导航索引

> 状态: ✅ 可用  
> 最后更新: 2026-03-04

本文档用于快速定位「功能 -> 代码文件 -> 关键 IPC」，并明确**当前已装配模块**与**兼容保留模块**。

## 1. 快速导航（实现态）

| 功能                     | 主要文件                                   | 装配状态                  |
| ------------------------ | ------------------------------------------ | ------------------------- |
| 配置管理                 | `src/main/modules/config.js`               | ✅ 已装配                 |
| ASMR 数据抓取 / 云端同步 | `src/main/modules/asmr-localization.js`    | ✅ 已装配                 |
| Whisper 转写 / 打包      | `src/main/modules/whisper.js`              | ✅ 已装配                 |
| TG 登录与上传            | `src/main/utils/telegram-login.js`         | ✅ 已装配                 |
| TG 最近活动              | `src/main/modules/tg-recent-activity.js`   | ✅ 已装配                 |
| TG 搜索 Bot              | `src/main/modules/tg-search-bot.js`        | ✅ 已装配                 |
| TG RJ 重复检测           | `src/main/modules/tg-rj-duplicates.js`     | ✅ 已装配                 |
| TG Bot API 兼容入口      | `src/main/modules/tg-bot-api.js`           | ⚠️ 兼容保留（默认未装配） |
| ASMR 登录兼容模块        | `src/main/modules/asmr-login.js`           | ⚠️ 兼容保留（默认未装配） |
| ASMR 旧实现兼容模块      | `src/main/modules/asmr.js`                 | ⚠️ 兼容保留（默认未装配） |
| TG 重复检测旧实现        | `src/main/modules/tg-rj-duplicates-old.js` | ⚠️ 兼容保留（默认未装配） |
| 日志                     | `src/main/utils/logger.js`                 | ✅ 通用依赖               |
| 错误处理                 | `src/main/utils/errorHandler.js`           | ✅ 通用依赖               |
| 重试                     | `src/main/utils/retry.js`                  | ✅ 通用依赖               |

---

## 2. 主进程入口与模块装配

入口文件：`src/main/index.js`

主进程启动时会装配以下模块：

- `setupAsmrIPC(...)`（来自 `asmr-localization.js`）
- `setupWhisperIPC()`
- `setupTelegramIPC()`
- `setupTgHistoryIPC()`
- `setupTgSearchBotIPC()`
- `setupRjDuplicatesIPC()`
- `setupConfigIPC()`

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

- 导出：`setupTgSearchBotIPC`, `startBot`, `stopBot`, `getBotStatus`, `handleSearchRequest`, `syncChannelHistoryToIndex`, `triggerStartupHistorySync`
- 关键 IPC：
  - `tg-bot-start`
  - `tg-bot-stop`
  - `tg-bot-status`
  - `tg-bot-search`
  - `tg-bot-sync-history`

### 3.7 `src/main/modules/tg-bot-api.js`（兼容入口）

- 导出：`setupTgBotApiIPC`（内部转发到 `setupTgSearchBotIPC`）
- 状态：兼容入口保留，当前默认不在 `index.js` 装配。

### 3.8 `src/main/modules/tg-rj-duplicates.js`

- 导出：`setupRjDuplicatesIPC`
- 关键 IPC：
  - `tg-scan-rj-duplicates`
  - `tg-delete-duplicate-messages`

### 3.9 `src/main/modules/tg-rj-duplicates-old.js`（旧实现）

- 导出：`setupRjDuplicatesIPC`
- 状态：旧实现保留，当前默认不在 `index.js` 装配。

### 3.10 `src/main/modules/asmr.js`（旧实现）

- 导出：`setupAsmrIPC`
- 状态：旧实现保留，当前默认不在 `index.js` 装配。

### 3.11 `src/main/utils/telegram-login.js`

- 导出：`setupTelegramIPC`, `tryAutoConnect`
- 关键 IPC：
  - `tg-check-login`
  - `tg-login`
  - `tg-get-status`
  - `tg-cancel-auth`
  - `tg-upload-files`（事件）
  - `tg-cancel-upload`

---

## 4. Renderer 主要组件

主要业务组件位于 `src/renderer/src/components/`：

- `HomePanel.vue`
- `UploadTool.vue`
- `WhisperTool.vue`
- `RecentActivity.vue`
- `TgDownloader.vue`
- `TgSearchBot.vue`
- `RjDuplicateDetector.vue`
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
