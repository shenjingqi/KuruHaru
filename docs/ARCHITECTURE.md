# ARCHITECTURE.md — KuruHaru 项目架构

> 本文档描述 KuruHaru 应用的系统架构、业务域划分和模块关系。
> 供 Agent 理解代码组织方式，用于自主导航和决策。

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer (Vue 3)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │ Components  │  │   Stores    │  │       Utils         │   │
│  │ (UI Layer)  │  │  (Pinia)    │  │  (filter, clone...) │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                 │                     │               │
│         └─────────────────┼─────────────────────┘               │
│                           │                                     │
│                    window.api                                   │
│                     (IPC Bridge)                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Preload (Bridge)                             │
│              ipcRenderer.invoke() / send()                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Main Process (Node.js)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    IPC Handlers                             ││
│  │   dialog:*, fs:*, config:*, asmr:*, whisper:*, tg:*        ││
│  └────────────────────────────┬────────────────────────────────┘│
│                               │                                  │
│  ┌────────────┐  ┌───────────┴───────────┐  ┌──────────────┐ │
│  │  Modules   │  │        Utils           │  │    Config    │ │
│  │ asmr-local │  │  telegram-login       │  │   (JSON)     │ │
│  │ whisper    │  │  logger                │  │               │ │
│  │ tg-history │  │  errorHandler         │  │               │ │
│  │ httpClient │  │  retry                 │  │               │ │
│  └────────────┘  └────────────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 分层架构

### 2.1 层级定义

| 层级             | 目录                         | 职责                     | 规则                |
| ---------------- | ---------------------------- | ------------------------ | ------------------- |
| **Runtime**      | `src/main/index.js`          | 窗口管理、生命周期、托盘 | 入口文件            |
| **IPC Handlers** | `src/main/index.js`          | 处理 renderer 请求       | 只能调用 Modules    |
| **Modules**      | `src/main/modules/`          | 业务逻辑核心             | 可调用 Utils        |
| **Utils**        | `src/main/utils/`            | 通用工具函数             | 无业务逻辑          |
| **Config**       | `src/main/modules/config.js` | 配置读写                 | 被所有层调用        |
| **Renderer**     | `src/renderer/src/`          | UI 展示                  | 只能调用 window.api |

### 2.2 依赖方向

```
Config ──────► Modules ──────► Utils
  │               │
  │               ▼
  │         IPC Handlers ──────► Renderer
  │               │
  ▼               ▼
Main Process ◄─── Preload
```

**强制规则**:

- ❌ Renderer 不能直接 require Node.js 模块
- ❌ Renderer 不能直接访问文件系统
- ❌ Service 层不能引用 UI 组件
- ✅ 所有主进程功能通过 IPC 暴露
- ✅ 数据流向必须是单向的

---

## 3. 业务域划分

### 3.1 核心业务域

| 域            | 模块                       | 描述                            |
| ------------- | -------------------------- | ------------------------------- |
| **ASMR 内容** | `asmr-localization.js`     | ASMR 网站数据抓取、播放列表管理 |
|               | `asmr-login.js`            | ASMR 网站登录认证               |
| **Telegram**  | `telegram-login.js`        | Telegram 登录认证               |
|               | `tg-recent-activity.js`    | 最近活动扫描                    |
| **Whisper**   | `whisper.js`               | 语音转字幕功能                  |
| **文件处理**  | `src/main/index.js` (内联) | 压缩包扫描、文件清理、数据清洗  |
| **配置**      | `config.js`                | 配置读取/保存                   |

### 3.2 工具域

| 模块                      | 描述                   |
| ------------------------- | ---------------------- |
| `logger.js`               | 日志系统，支持文件输出 |
| `errorHandler.js`         | 全局错误处理           |
| `retry.js`                | 重试机制               |
| `httpClient.js`           | HTTP 请求封装          |
| `asmr-data-transforms.js` | ASMR 数据格式转换      |

### 3.3 UI 组件域

| 组件                 | 描述         |
| -------------------- | ------------ |
| `HomePanel.vue`      | 仪表盘       |
| `UploadTool.vue`     | 上传字幕     |
| `WhisperTool.vue`    | Whisper 工具 |
| `LocalCleaner.vue`   | 本地清理     |
| `CloudCleaner.vue`   | 云端清理     |
| `RecentActivity.vue` | 最近上传     |
| `ChineseList.vue`    | 汉化列表     |
| `AdvancedSearch.vue` | 高级搜索     |
| `RjFilter.vue`       | RJ 筛选      |
| `Tools.vue`          | 工具箱       |
| `Settings.vue`       | 设置页面     |

---

## 4. IPC 通信模式

### 4.1 主进程 → 渲染进程

使用 `ipcMain.handle()` 注册处理函数：

```javascript
// src/main/index.js
ipcMain.handle("dialog:openFile", async (event, options) => {
  // 处理逻辑
  return { canceled: false, filePath: "..." };
});
```

### 4.2 渲染进程调用

```javascript
// src/preload/index.js
api.dialogOpenFile = (options) =>
  ipcRenderer.invoke("dialog:openFile", options);

// src/renderer/src/components/xxx.vue
const result = await window.api.dialogOpenFile({ type: "file" });
```

### 4.3 事件推送

```javascript
// 主进程推送日志
mainWindow.webContents.send("log-update", { type: "system", msg: "..." });

// 渲染进程监听
window.api.onLogUpdate((data) => {
  console.log(data.msg);
});
```

---

## 5. 配置管理

### 5.1 配置结构

```javascript
// src/main/modules/config.js - DEFAULT_CONFIG
{
  profile: { username, avatar, status },
  tg: { apiId, apiHash, phone, session, discussion, channel },
  asmr: { username, password, token, playlistId },
  paths: { sourceDir, toolOutputDir, whisperTargetPath, ... },
  upload: { channelId },
  whisper: { exePath, targetPath, subFormats },
  logging: { level, enableFileLog },
  system: { theme, language, autoStart, minimizeToTray }
}
```

### 5.2 配置加载优先级

1. 用户自定义配置目录 (`configDir/config.json`)
2. AppData 配置 (`%APPDATA%/KuruHaru/config.json`)
3. 默认配置 (`DEFAULT_CONFIG`)

---

## 6. 数据流示例

### 6.1 上传字幕流程

```
User 点击上传
    │
    ▼
UploadTool.vue ──invoke──► ipcMain.handle('upload-subtitle')
    │                           │
    │                           ▼
    │                    asmr-localization.js (处理业务逻辑)
    │                           │
    │                           ▼
    │                    返回结果
    │
    ▼
更新 UI
```

### 6.2 Whisper 转写流程

```
User 选择文件
    │
    ▼
WhisperTool.vue ──send──► ipcMain.on('start-task')
    │                           │
    │                           ▼
    │                    whisper.js (启动子进程)
    │                           │
    │                           ▼
    │                    进度推送 'log-update'
    │                           │
    │                           ▼
    │                    完成推送 'task-finished'
    │
    ▼
更新进度 UI
```

---

## 7. 模块依赖图

```
                    ┌─────────────────┐
                    │  config.js      │ ◄── 配置文件读写
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ asmr-localize │  │ whisper.js    │  │ tg-history    │
│ asmr-login    │  │               │  │ tg-login      │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │ httpClient.js │
                    │ retry.js      │
                    │ logger.js     │
                    └───────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │ main/index.js │ ◄── IPC 入口
                    └───────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │   preload     │ ◄── 桥接层
                    └───────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │   renderer    │ ◄── Vue UI
                    └───────────────┘
```

---

## 8. 技术约束

### 8.1 安全约束

- **Context Isolation**: 启用 `contextIsolation: true`
- **Node Integration**: 禁用 `nodeIntegration`（渲染进程）
- **Preload Script**: 所有 API 通过 preload 暴露
- **外部数据校验**: 所有外部输入必须做 Schema 校验

### 8.2 性能约束

- **主进程**: 避免长时间阻塞操作，使用 async/await
- **IPC**: 大数据使用流式传输，避免一次性传递大对象
- **渲染进程**: 使用虚拟列表处理大数据集

---

## 9. 扩展指引

### 添加新模块

1. 在 `src/main/modules/` 创建 `new-module.js`
2. 导出 `setupNewModuleIPC()` 函数
3. 在 `src/main/index.js` 中引入并调用
4. 在 `src/preload/index.js` 暴露 API

### 添加新组件

1. 在 `src/renderer/src/components/` 创建 `NewComponent.vue`
2. 使用 `<script setup>` 语法
3. 在 `App.vue` 注册组件和菜单项

---

## 10. 验证状态

| 层级         | 状态      | 备注                        |
| ------------ | --------- | --------------------------- |
| 主进程模块化 | ✅ 良好   | 6 个业务模块清晰分离        |
| IPC 通信     | ✅ 规范   | 统一使用 handle/invoke 模式 |
| 配置管理     | ✅ 完整   | 支持多级配置覆盖            |
| 前端组件     | ✅ 完整   | 21 个组件覆盖所有功能       |
| 分层约束     | ⚠️ 待增强 | 需 ESLint 规则强制          |

---

## 相关文档

- **入门手册**: `AGENTS.md`
- **配置字段**: `docs/config-fields.md`
- **API 参考**: `src/preload/index.js`
