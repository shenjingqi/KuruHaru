# ARCHITECTURE.md — KuruHaru 项目架构

> 状态: 🔄 持续更新  
> 最后更新: 2026-03-05

> 单智能体快速入口：`docs/README.md`

## 1. 系统总览

KuruHaru 是 Electron 桌面应用，采用 `Renderer -> Preload -> Main` 三段式架构。

```text
Renderer (Vue 3 + Pinia + Naive UI)
  └─ window.api.*
      └─ Preload (contextBridge)
          └─ ipcRenderer.invoke/send
              └─ Main Process (ipcMain.handle/on)
                  ├─ src/main/modules/*
                  └─ src/main/utils/*
```

---

## 2. 分层与职责

| 层级         | 目录                   | 职责                                    |
| ------------ | ---------------------- | --------------------------------------- |
| Renderer     | `src/renderer/src/`    | UI 展示、状态管理、用户交互             |
| Preload      | `src/preload/index.js` | 将安全 API 暴露给 `window.api`          |
| Main Runtime | `src/main/index.js`    | 窗口生命周期、托盘、IPC 装配            |
| Workflow Runtime | `src/main/workflow-runtime/` | 工作流定义校验、节点调度、运行态管理 |
| Modules      | `src/main/modules/`    | 业务逻辑（ASMR/TG/Whisper/配置）        |
| Utils        | `src/main/utils/`      | 通用工具（日志、错误、重试、TG 登录等） |

关键约束：

- Renderer 不直接访问 Node.js/文件系统。
- Renderer 通过 `window.api` 调用主进程能力。
- 主进程能力通过 IPC 通道暴露。

---

## 3. 主进程模块现状（代码实况）

### 3.1 `src/main/modules/`（11 个文件）

| 文件                      | 作用                                           |
| ------------------------- | ---------------------------------------------- |
| `asmr-localization.js`    | ASMR 数据抓取、云端/本地清理、中文列表相关 IPC |
| `asmr-login.js`           | ASMR 登录相关 IPC                              |
| `asmr.js`                 | ASMR 功能旧实现/兼容实现                       |
| `config.js`               | 配置读取与保存                                 |
| `httpClient.js`           | 统一 HTTP 客户端                               |
| `tg-bot-api.js`           | TG Bot API 适配                                |
| `tg-recent-activity.js`   | 最近活动扫描、下载、缓存读取                   |
| `tg-rj-duplicates.js`     | RJ 重复消息扫描与删除                          |
| `tg-rj-duplicates-old.js` | 旧版重复检测实现                               |
| `tg-search-bot.js`        | TG 搜索 Bot 与索引同步                         |
| `whisper.js`              | Whisper 转写与字幕打包                         |

### 3.2 `src/main/utils/`（关键文件）

| 文件                      | 作用                        |
| ------------------------- | --------------------------- |
| `telegram-login.js`       | Telegram 登录与上传流程 IPC |
| `logger.js`               | 统一日志发送器              |
| `errorHandler.js`         | 错误标准化                  |
| `retry.js`                | 通用重试工具                |
| `asmr-data-transforms.js` | ASMR 数据结构转换           |

---

## 4. IPC 通信模式（实际实现）

项目中并存两类 IPC：

1. 请求/响应：`ipcMain.handle()` + `ipcRenderer.invoke()`
2. 事件推送：`ipcMain.on()` + `ipcRenderer.send()` / `webContents.send()`

示例：

- 请求/响应：`dialog:openFile`、`get-config`、`tg-scan-recent-activity`
- 事件推送：`start-task`/`stop-task`、`log-update`、`task-finished`
- 工作流运行事件：`workflow-run-event`（携带 `runId` 的节点与运行态事件）

---

## 5. 配置管理（`src/main/modules/config.js`）

配置来源优先级（按实际逻辑）：

1. 若配置了 `paths.configDir`，优先读取 `<configDir>/config.json`
2. 否则读取 AppData 配置：`<userData>/config.json`
3. 若都不可用，回退到 `DEFAULT_CONFIG`

补充：项目目录下 `config/config.json` 会参与 `configDir` 发现流程。

配置保存行为（2026-03-05 对齐）：

- `saveConfig` 支持路径字段显式清空（如 `""` / `null`），不再忽略空值更新。
- 当本次保存修改了 `paths.configDir`，会直接写入新目录下的 `config.json`，并同步更新 `<userData>/config.json` 中的 `paths.configDir` 引导指针。

配置字段真相源：`src/main/modules/config.js` 中的 `DEFAULT_CONFIG`。

---

## 6. Renderer 组件现状

`src/renderer/src/components/` 当前包含：

- 23 个顶层 `.vue` 组件
- 1 个 `common/` 子目录

重点组件包括：

- `HomePanel.vue`
- `UploadTool.vue`
- `WhisperTool.vue`
- `RecentActivity.vue`
- `TgSearchBot.vue`
- `RjDuplicateDetector.vue`
- `Settings.vue`
- `Tools.vue`

---

## 7. 当前可验证状态（2026-03-04）

| 项目     | 命令             | 结果                              |
| -------- | ---------------- | --------------------------------- |
| 单元测试 | `npm run test`   | ✅ 通过（20/20）                  |
| 生产构建 | `npm run build`  | ✅ 通过                           |
| 综合验证 | `npm run verify` | ❌ 失败（lint 阶段有 3 个 error） |

当前 lint 阻塞错误（非本次文档修复引入）：

- `src/main/modules/asmr-login.js`：`axios` 直接导入受限
- `src/main/modules/asmr.js`：`axios` 直接导入受限
- `src/main/modules/asmr.js`：`path` 未定义

---

## 8. 架构文档同步状态（2026-03-04）

本轮已与代码实现对齐的文档：

- `docs/design-docs/module-index.md`（模块装配状态、兼容模块标记）
- `docs/design-docs/data-flow.md`（实现态 IPC 与数据流）
- `docs/design-docs/business-background.md`（补充 TG 搜索 Bot / RJ 重复检测）
- `docs/design-docs/business-boundary.md`（补充频道检索与治理边界）
- `docs/product-specs/README.md`（功能清单与流程图补齐）

---

## 9. 相关文档

- 模块导航：`docs/design-docs/module-index.md`
- 设计视角：`docs/design-docs/architecture-design.md`
- 文档结构：`docs/STRUCTURE.md`
- 质量状态：`docs/quality/README.md`
