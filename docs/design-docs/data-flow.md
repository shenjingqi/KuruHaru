# 数据流设计

> 状态: ✅ 稳定  
> 最后更新: 2026-03-06

> 本轮同步标记: 2026-03-06（实现态对齐）
> 真相源路径: `docs/design-docs/data-flow.md`

本文档描述 KuruHaru 当前实现态的数据流向、模块交互与数据落盘。

---

## 1. 数据流总览（实现态）

```text
Renderer (Vue Components)
  └─ window.api.*
      └─ Preload (contextBridge + ipcRenderer.invoke/send)
          └─ Main Runtime (ipcMain.handle/on)
              ├─ modules/*   (ASMR / Whisper / TG / Config)
              ├─ workflow-runtime/* (工作流定义、调度与运行记录)
              ├─ utils/*     (TG 登录上传、日志、错误处理、重试)
              ├─ config.json (用户配置)
              ├─ 本地文件系统 (字幕、缓存、索引)
              └─ 外部 API / 工具
                  ├─ ASMR API
                  ├─ Telegram API / Bot API
                  └─ Whisper 本地可执行程序
```

---

## 2. 关键 IPC 通道族

| 业务域              | 主要通道（节选）                                                                                                                                     | 处理文件                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 配置与通用文件      | `get-config`, `save-config`, `dialog:*`, `write-file`, `fs-read-file`, `clean-data`, `extract-file-names`                                            | `src/main/modules/config.js`, `src/main/index.js` |
| ASMR 云端与筛选     | `asmr-fetch-cloud-works`, `asmr-trigger-cloud-data-fetch`, `asmr-get-cached-cloud-works`, `load-tag-db`, `asmr-fetch-playlist`, `filter-rj-from-url` | `src/main/modules/asmr-localization.js`           |
| ASMR 清理与汉化列表 | `asmr-delete-works`, `asmr-delete-local-files`, `asmr-delete-by-rj`, `asmr-fetch-chinese-works`, `asmr-set-chinese-list-path`                        | `src/main/modules/asmr-localization.js`           |
| Whisper             | `count-media-files`, `zip-subtitles`, `start-task`（事件）, `stop-task`（事件）                                                                      | `src/main/modules/whisper.js`                     |
| Telegram 登录与上传 | `tg-check-login`, `tg-login`, `tg-get-status`, `tg-upload-files`（事件）, `tg-cancel-upload`                                                         | `src/main/utils/telegram-login.js`                |
| TG 最近活动/下载    | `tg-scan-recent-activity`, `tg-read-recent-activity`, `get-recent-activity`, `download-tg-file`, `read-rj-list`, `clear-cache`                       | `src/main/modules/tg-recent-activity.js`          |
| TG 搜索 Bot         | `tg-bot-start`, `tg-bot-stop`, `tg-bot-status`, `tg-bot-search`, `tg-bot-sync-history`                                                               | `src/main/modules/tg-search-bot.js`               |
| RJ 重复检测         | `tg-scan-rj-duplicates`, `tg-delete-duplicate-messages`                                                                                              | `src/main/modules/tg-rj-duplicates.js`            |
| TG Info 报错恢复    | `tg-info-error-recover`                                                                                                                              | `src/main/modules/tg-info-error-recover.js`       |
| Workflow Runtime    | `workflow-list`, `workflow-get`, `workflow-save`, `workflow-delete`, `workflow-validate`, `workflow-run`, `workflow-cancel`, `workflow-get-run`, `workflow-list-runs`, `workflow-list-node-definitions`, `workflow-run-event`（事件） | `src/main/workflow-runtime/index.js`              |

---

## 3. 核心数据流

### 3.1 ASMR 云端同步与缓存广播

```text
Settings / CloudCleaner
    └─ invoke('asmr-fetch-cloud-works' 或 'asmr-trigger-cloud-data-fetch')
        └─ asmr-localization.js -> syncCloudWorksData()
            └─ ASMR API 拉取播放列表/作品
                └─ 更新 cloudWorksCache
                    └─ webContents.send('cloud-works-updated') 广播到前端
```

### 3.2 计划筛选与 RJ 过滤

```text
RjFilter.vue
    └─ invoke('filter-rj-from-url', { url, dateMode, compareFilePath })
        └─ asmr-localization.js 拉取搜索/列表结果
            ├─ 日期筛选
            ├─ TXT 去重比对
            └─ 返回 RJ 列表
                └─ Renderer 可继续 dialog:saveFile + write-file 导出
```

> 说明：`AdvancedSearch.vue` 当前直接拼接 ASMR 搜索 URL 并 `window.open`，不经过主进程 IPC。

### 3.3 Whisper 转写与打包

```text
WhisperTool.vue
    ├─ send('start-task', config)
    │   └─ whisper.js spawn 子进程执行转写
    │       ├─ send('log-update') 推进度
    │       └─ send('task-finished') 回传结果
    ├─ send('stop-task') 中断任务
    └─ invoke('zip-subtitles', payload) 打包字幕
```

### 3.4 Telegram 上传链路

```text
Settings.vue
    └─ invoke('tg-login' / 'tg-check-login')

UploadTool.vue
    ├─ send('tg-upload-files', { files, channelId })
    └─ invoke('tg-cancel-upload')

telegram-login.js
    └─ 串行发送消息 + 文件，持续 send('log-update')
```

### 3.5 最近活动与周期下载

```text
HomePanel / TgDownloader
    ├─ invoke('tg-scan-recent-activity')
    ├─ invoke('tg-read-recent-activity' / 'get-recent-activity')
    ├─ invoke('download-tg-file', { tgMessageId, fileName })
    └─ invoke('read-rj-list' / 'clear-cache')

tg-recent-activity.js
    └─ 落盘 recent_activity.json（uploadHistoryDir）
```

### 3.6 TG 搜索 Bot

```text
TgSearchBot.vue
    ├─ invoke('tg-bot-start' / 'tg-bot-stop' / 'tg-bot-status')
    ├─ invoke('tg-bot-sync-history')
    └─ invoke('tg-bot-search', rjCode)

tg-search-bot.js
    └─ 搜索顺序：历史索引 -> 前置包索引 -> 频道检索
```

### 3.7 RJ 重复检测与清理

```text
RjDuplicateDetector.vue
    ├─ invoke('tg-scan-rj-duplicates', options)
    └─ invoke('tg-delete-duplicate-messages', messageIds)

tg-rj-duplicates.js
    └─ 频道扫描 -> 消息配对 -> 重复分组 -> 安全删除返回 deletedMessageIds/errors
```

### 3.8 工具箱本地清洗

```text
Tools.vue
    └─ invoke('clean-data', { mainFile, compareDir, deleteFiles })
        └─ index.js 比对 zip 文件名中的 RJ/VJ/BJ 与主文件列表
            └─ 返回待删除/已删除统计
```

### 3.9 TG Info 报错恢复

```text
任意前端/脚本调用
    └─ invoke('tg-info-error-recover', options)
        └─ tg-info-error-recover.js
            ├─ 复用 telegram-login 连接（requireConnectedTelegramClient）
            ├─ 在讨论组按关键词扫描报错消息
            ├─ 扫描报错消息附近上下若干条并匹配最可能目标，下载评论区 ZIP
            └─ 按转发来源删除频道原帖（safetyMode 可只预览不删除）
```

### 3.10 Workflow 设计器执行链路

```text
WorkflowDesigner.vue / useWorkflowDesigner.js
    ├─ invoke('workflow-list' / 'workflow-get' / 'workflow-save' / 'workflow-validate')
    ├─ invoke('workflow-run' / 'workflow-cancel')
    ├─ invoke('workflow-list-runs' / 'workflow-get-run')
    └─ on('workflow-run-event')

workflow-runtime/index.js
    ├─ normalizeWorkflowDefinition + validateWorkflowGraph
    ├─ startWorkflowExecution(node-registry + adapters)
    ├─ run-store 管理 run 状态/取消控制
    └─ storage 持久化定义与运行记录
```

> 说明：默认首节点为 `whisper.translateSubtitles`，配置项与音声翻译页对齐（`exePath`、`targetPath`、`subFormats`）。
> 说明：`whisper.translateSubtitles` 运行中会通过 `workflow-run-event` 附带进度字段（`currentRj`、`remainingWorks`、`completedWorks`）。
> Note: Workflow node library also includes the following runtime nodes:
> - `whisper.packSubtitles`: Reuse toolbox subtitle packing, scan RJ/VJ/BJ folders and generate zip archives.
> - `tg.uploadSubtitles`: Run smart archive scan inside the node, then upload scanned files to the target channel.
> - `asmr.cloudDeleteRecentUploads`: Resolve recent-upload codes to cloud works and perform remote deletion.
> - `files.localDeleteScanned`: Scan local archives and delete matched local files (preview mode supported).

---

## 4. 数据存储与缓存

| 数据            | 默认位置（实现态）                                        | 说明                               |
| --------------- | --------------------------------------------------------- | ---------------------------------- |
| 用户配置        | `<userData>/config.json`（支持 `paths.configDir` 覆盖）   | `config.js` 合并默认配置与用户配置 |
| TG 最近活动缓存 | `paths.uploadHistoryDir/recent_activity.json`             | `tg-recent-activity.js` 读写       |
| TG Bot 历史索引 | `tg.botHistoryPath` 或 `getDataDir()/tg-bot-history.json` | `tg-search-bot.js` 读写            |
| 汉化列表        | `paths.chineseListPath` 或默认数据目录文本文件            | `asmr-localization.js` 管理        |
| 工作流定义      | `<userData>/workflows/definitions/*.json`                 | `workflow-runtime/storage.js` 读写 |
| 工作流运行记录  | `<userData>/workflows/runs/*.json`                        | `workflow-runtime/storage.js` 读写 |
| 日志            | `paths.logsDir`                                           | 主进程日志输出                     |

---

## 5. 通信模式

### 5.1 请求-响应（`invoke/handle`）

```javascript
// Renderer
const result = await window.api.invoke("channel-name", payload);

// Main
ipcMain.handle("channel-name", async (_event, payload) => {
  return result;
});
```

### 5.2 事件推送（`send/on`）

```javascript
// Renderer -> Main
window.api.send("start-task", payload);

// Main -> Renderer
event.sender.send("log-update", { type: "whisper", msg: "..." });
event.sender.send("task-finished", { success: true });
```

> 说明：当前实现态示例使用 `event.sender.send(...)`。若你看到 `mainWindow.webContents.send(...)` 的通用示例，多半是旧版本内容。

---

## 6. 旧通道说明（已从文档主链路移除）

以下示例名不再代表当前实现真相源：

- `asmr:search`
- `whisper:start`
- `tg:upload`
- `clean:local`
- `clean:cloud`

请以本文件第 2 节“关键 IPC 通道族”与对应代码文件为准。

---

## 文档更新日志

| 日期       | 变更                                     |
| ---------- | ---------------------------------------- |
| 2026-03-06 | Added workflow node-library responsibilities (pack/upload/cloud recent delete/local scanned delete) |
| 2026-03-06 | 新增 Workflow Runtime IPC/执行链路/存储路径说明 |
| 2026-03-06 | 新增 TG Info 报错恢复 IPC 数据流说明     |
| 2026-03-04 | 按当前代码重写数据流、IPC 通道与存储路径 |
| 2026-02-26 | 初始版本                                 |
