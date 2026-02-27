# 模块导航索引

> 状态: ✅ 稳定  
WR|> 最后更新: 2026-02-27

本文档是 KuruHaru 项目的模块导航索引，供 Agent 快速定位代码。

---

## 快速导航

### 需要修改功能？找对应模块

| 功能              | 需要修改的模块                           |
| ----------------- | ---------------------------------------- | ------------ | ---------------------------------------- |
| 配置管理          | `src/main/modules/config.js`             |
| ASMR 数据抓取     | `src/main/modules/asmr-localization.js`  |
| ASMR 登录         | `src/main/modules/asmr-login.js`         |
| Whisper 转写      | `src/main/modules/whisper.js`            |
| Telegram 登录     | `src/main/utils/telegram-login.js`       |
| Telegram 最近活动 | `src/main/modules/tg-recent-activity.js` |
| HTTP 客户端       | `src/main/modules/httpClient.js`         |
| 日志系统          | `src/main/utils/logger.js`               |
| 错误处理          | `src/main/utils/errorHandler.js`         |
| TV                |                                          | 重试机制     | `src/main/utils/retry.js`                |
| HM                |                                          | 任务隔离日志 | `src/main/utils/task-isolated-logger.js` |
| RR                |                                          | CDP 客户端   | `src/main/utils/cdp-client.js`           |
| MW                |                                          | DOM 快照     | `src/main/utils/dom-snapshot.js`         |

---

## 主进程模块

### 1. config.js

```javascript
// 路径: src/main/modules/config.js
// 职责: 配置管理
// 导出: getConfig(), saveConfig(), getDataDir()
```

QZ|| 获取数据目录 | `getDataDir()`      |
VJ|
QW|### IPC 通道

| 功能 | IPC 通道 |
| ---- | -------- |
| 读取主配置 | `get-config` |
| 保存主配置 | `save-config` |
| 读取 ASMR 配置 | `get-asmr-config` |
| 保存 ASMR 配置 | `save-asmr-config` |
| 读取 TG 配置 | `get-tg-config` |
| 保存 TG 配置 | `save-tg-config` |
| 读取路径配置 | `get-paths` |
| 保存路径配置 | `save-paths` |
| 读取上传配置 | `get-upload-config` |
| 保存上传配置 | `save-upload-config` |
| 读取 Whisper 配置 | `get-whisper-config` |
| 保存 Whisper 配置 | `save-whisper-config` |
| 读取系统配置 | `get-system-config` |
| 保存系统配置 | `save-system-config` |
| 读取日志配置 | `get-logging-config` |
| 保存日志配置 | `save-logging-config` |

---

### 2. asmr-localization.js

```javascript
// 路径: src/main/modules/asmr-localization.js
// 职责: ASMR 网站数据抓取
// 导出: setupASMRIPC()
```

HJ|| 下载文件     | `asmr:download`          |
|PQ|| 云端数据获取 | `asmr-trigger-cloud-data-fetch` |
|NZ|| 获取缓存    | `asmr-get-cached-cloud-works` |
|RW|| 扫描标签库  | `load-tag-db`                  |
|SH|| 本地ID扫描 | `scan-local-ids`               |
|TJ|| 获取上传历史| `get-upload-history`          |
|XZ|| 删除云端作品| `asmr-delete-works`           |
|VH|| 删除本地文件| `asmr-delete-local-files`     |
|GX|| RJ号删除   | `asmr-delete-by-rj`           |
|QH|| 中文作品   | `asmr-fetch-chinese-works`    |
|JV|| 设置中文列表| `asmr-set-chinese-list-path`  |
|YY|| 获取中文列表| `asmr-get-chinese-list-path`  |
|RZ|| 读取中文列表| `asmr-read-chinese-list`      |

XT|---

### 2.1. asmr-login.js

XH```javascript
// 路径: src/main/modules/asmr-login.js
// 职责: ASMR 网站登录认证
// 导出: setupAsmrLoginIPC()
```

VX|| 功能 | IPC 通道 |
| ------------ | ------------------ |
| 登录 | `asmr-login` |
| 检查登录状态 | `asmr-check-login` |
| 登出 | `asmr-logout` |

### 3. whisper.js

```javascript
// 路径: src/main/modules/whisper.js
// 职责: Whisper 语音转字幕
// 导出: setupWhisperIPC()
```

VX|| 功能 | IPC 通道 |
SJ|| -------- | ------------------ |
MZ|| 开始转写 | `start-task` |
WH|HK|JY|| 停止转写 | `stop-task` (ipcMain.on) |

**导出函数**:
- `setupWhisperIPC()` - 注册 IPC 处理器

**核心功能**:
1. **语音转字幕**: 调用 Whisper 引擎生成字幕文件
2. **字幕打包**: 将字幕文件打包成 ZIP
3. **进度跟踪**: 实时解析 stderr 获取进度

**IPC 参数**:
| 通道 | 参数 | 说明 |
| ---- | ---- | ---- |
PT|| `stop-task` | - | 停止任务（单向，无需返回值） |
|HH|| `zip-subtitles` | `{targetPath, outputDir}` | 打包字幕 |

**错误处理**:
- spawn 失败: 返回 `{ error: spawnError.message }`
- 进程异常: 捕获 stderr 输出并返回
- 目标路径不存在: 返回错误消息

**依赖**:
- `whisper` (Python 引擎) - 语音转字幕
- `archiver` - ZIP 打包
- `logger.js` - 统一日志

**Whisper 参数**:
- `--audio_suffixes` - 支持的音频格式
- `--sub_formats` - 输出的字幕格式 (srt/lrc/vtt/txt/ass)
- `--device` - 运行设备 (cuda/cpu)

**进度解析**:
- 从 stderr 匹配 `正在翻译 (X/Y)` 获取进度百分比
- 通过 `log-update` 事件发送实时日志
- 完成后发送 `task-finished` 事件

**注意事项**:
- 仅处理 RJ/VJ/BJ 开头的文件夹
- 打包时自动跳过已是最新 (mtime 比较) 的 ZIP
- 支持的字幕格式: .srt, .lrc, .vtt, .txt, .ass

XZ|---

### 4. tg-recent-activity.js

```javascript
// 路径: src/main/modules/tg-recent-activity.js
// 职责: Telegram 最近活动
// 导出: setupTGRecentActivityIPC()
```

TZ|VX|| 功能 | IPC 通道 |
BR||NK|| ------------ | ---------------------- |
XY|XQ||BW|| 读取缓存 | `tg-read-recent-activity` |
|RR|XZ||WX|| 下载TG文件 | `download-tg-file` |
|BQ|VQ||JZ|| 清除缓存 | `clear-cache` |
|ZZ|VH|| 统计信息 | `tg-get-statistics` |
|XV|VB|| 读取RJ列表 | `read-rj-list` |
BP||
**导出函数**:
- `scanAndSaveRecentActivity()` - 扫描并保存最近活动
- `saveRecentActivity(dir, data)` - 保存数据到 JSON
- `loadRecentActivity(dir)` - 读取缓存数据
- `setupTgHistoryIPC()` - 注册 IPC 处理器

**错误处理**:
- 使用 try/catch 包裹所有 API 调用
- 失败时返回 `{ success: false, error: error.message }`
- 自动处理网络超时和连接失败

**依赖**:
- `telegram` (GramJS) - Telegram API 客户端
- `config.js` - 读取 tg.discussion/channel 配置
- 内置 console.log (待迁移至 logger.js)

**核心逻辑**:
1. **增量扫描**: 仅获取 `minId` 之后的新消息
2. **基准点检测**: >150MB 文件视为"新整合包"，触发列表重置
3. **冷启动回溯**: 无本地缓存时，倒序查找最近的整合包

**注意事项**:
- 仅支持压缩包文件 (zip/rar/7z/tar/gz)
- 文件大小上限: 2MB
- 缓存有效期: 5分钟 (对话列表)
- 消息扫描上限: 2000条/次

**数据存储**:
- 路径: `{uploadHistoryDir}/recent_activity.json`
- 结构: `{ metadata: {lastScannedId, anchor, lastUpdated}, files[], statistics }`

QT|SJ|---

### 5. httpClient.js

```javascript
// 路径: src/main/modules/httpClient.js
// 职责: HTTP 客户端（带代理）
// 导出: getAsmrClient(), getTgClient(), getHttpClient()
```

| 客户端            | 用途              |
| ----------------- | ----------------- |
| `getAsmrClient()` | ASMR API 请求     |
| `getTgClient()`   | Telegram API 请求 |
| `getHttpClient()` | 通用 HTTP 请求    |

ZJ|---

### 6. telegram-login.js

```javascript
// 路径: src/main/utils/telegram-login.js
// 职责: Telegram 登录认证和文件上传
// 导出: setupTelegramIPC(), tryAutoConnect(), startLogin(), isConnected()
```

**导出函数**:
- `tryAutoConnect()` - 自动重连已保存的 session
- `startLogin(sender, params)` - 发起登录流程
- `isConnected()` - 检查连接状态
- `getConnectionState()` - 获取当前状态
- `cancelAuth()` - 取消认证
- `setupTelegramIPC()` - 注册 IPC 处理器

**登录状态 (LOGIN_STATE)**:
| 状态 | 含义 |
| ---- | ---- |
| `DISCONNECTED` | 未连接 |
| `CONNECTING` | 正在连接 |
| `AUTHENTICATING` | 正在认证 |
| `CONNECTED` | 已连接 |
| `AUTH_FAILED` | 认证失败 |
| `CANCELLED` | 已取消 |

**IPC 通道**:
| 功能 | 通道 |
| ---- | ---- |
| 检查登录 | `tg-check-login` |
| 发起登录 | `tg-login` |
| 取消认证 | `tg-cancel-auth` |
| 获取状态 | `tg-get-status` |
| 上传文件 | `tg-upload-files` |
| 取消上传 | `tg-cancel-upload` |
| 认证回复 | `tg-auth-reply` |

**错误处理**:
- 使用 `normalizeError()` 包装错误
- 支持超时检测 (180s 验证码等待)
- 支持流控处理 (FLOOD_WAIT)
- 支持断线重连

**依赖**:
- `telegram` (GramJS) - Telegram API
- `config.js` - 读取/保存 tg 配置
- `errorHandler.js` - 统一错误处理

**上传流程**:
1. 检查连接状态，必要时自动重连
2. 发送索引消息 (文件名)
3. 上传文件 (支持进度回调)
4. 验证上传结果 (超时处理)
5. 间隔 4s 后继续下一个文件

**重试策略**:
- 文字消息: 3 次重试，间隔 5s
- 文件上传: 3 次重试，间隔 5s
- 步骤超时: 文字 20s，文件 30s

**注意事项**:
- Session 存储在配置中，登录后自动保存
- 上传前需确保机器人已加入目标频道
- 支持两步验证 (password)

JM|
YM|
KZ|### asmr-data-transforms.js

XH```javascript
// 路径: src/main/utils/asmr-data-transforms.js
// 职责: ASMR API 数据转换工具
// 导出: normalizeWorkItem(), normalizeWorkItems()
```

VX|| 函数 | 说明 |
| ---- | ---- |
| `normalizeWorkItem(item)` | 标准化单个作品数据项 |
| `normalizeWorkItems(items)` | 批量标准化作品数据 |
## Utils 工具

### logger.js

```javascript
// 路径: src/main/utils/logger.js
// 导出: createLogSender(moduleName)
const logger = createLogSender("module-name");
logger.info("message");
logger.error("message");
logger.warn("message");
```

---

### errorHandler.js

```javascript
// 路径: src/main/utils/errorHandler.js
// 导出: normalizeError(error, context)
const normalized = normalizeError(error, { context: "operation-name" });
```

---

### retry.js

````javascript
// 路径: src/main/utils/retry.js
// 导出: withRetry(fn, options)
const result = await withRetry(() => api.call(), {
  maxRetries: 3,
  delay: 1000,
});
NN|```
PY|
QM|---
YZ|
SM|### task-isolated-logger.js

XH|```javascript
MX|// 路径: src/main/utils/task-isolated-logger.js
XP|// 导出: createTaskLogger(taskId, moduleName), queryTaskLogs(), generateTaskId()
XK|
XZ|// 创建任务日志记录器
XS|const logger = createTaskLogger("task-123", "my-module");
YQ|logger.info("开始操作");
JK|logger.error("操作失败", { error: err.message });
VX|
YZ|// 查询日志
HQ|const logs = await queryTaskLogs(logDir, { taskId: "task-123", level: "error" });
BX|```

---

### cdp-client.js

XH|```javascript
NX|// 路径: src/main/utils/cdp-client.js
YZ|// 导出: CDPClient, createCDPClient(), getCDPPort(), isCDPAvailable()

YQ|// 创建 CDP 客户端
HV|const client = createCDPClient({ host: "localhost", port: 9222 });
VT|await client.connect();

XK|// 获取页面截图
YH|const pages = await client.getPages();
SQ|const screenshot = await client.takeScreenshot(pages[0].id);

HV|client.disconnect();
````

---

### dom-snapshot.js

XH|```javascript
XB|// 路径: src/main/utils/dom-snapshot.js
KQ|// 导出: captureDOMSnapshot(), saveSnapshot(), loadSnapshot(), diffSnapshots()

HZ|// 捕获 DOM 快照
XP|const snapshot = await captureDOMSnapshot(client, sessionId);

YV|// 保存快照
NK|const { jsonPath, screenshotPath } = await saveSnapshot(snapshot, "./snapshots");

BX|// 对比快照
RV|const diff = diffSnapshots(snapshotA, snapshotB);

````

---

## IPC 通信模式

### 主进程注册

```javascript
// src/main/index.js
ipcMain.handle("channel:name", async (event, payload) => {
  // 处理逻辑
  return result;
});
````

### Preload 暴露

```javascript
// src/preload/index.js
api.channelName = (payload) => ipcRenderer.invoke("channel:name", payload);
```

### Renderer 调用

```javascript
// Vue 组件
const result = await window.api.channelName(payload);
```

ZZ|---

### IPC 命名规范

**命名格式**: `模块:操作` 或 `模块-操作`

**推荐风格**:
| 类型 | 格式 | 示例 |
| ---- | ---- | ---- |
| 资源操作 | `模块:动词` | `dialog:openFile`, `config:save` |
| 数据获取 | `模块:名词` | `config:get`, `tg:getStatus` |
| 任务执行 | `模块:动作` | `whisper:start`, `tg:scan` |

**现有 IPC 通道一览**:
| 模块 | 通道 |
| ---- | ---- |
| dialog | `dialog:openFile`, `dialog:saveFile`, `dialog:openDirectory` |
PJ|| config | `get-config`, `save-config`, `get-asmr-config`, `save-asmr-config`, `get-tg-config`, `save-tg-config`, `get-paths`, `save-paths`, `get-upload-config`, `save-upload-config`, `get-whisper-config`, `save-whisper-config`, `get-system-config`, `save-system-config`, `get-logging-config`, `save-logging-config` |
HR|| asmr | `asmr:search`, `asmr:getDetail`, `asmr:getPlaylist`, `asmr:download`, `asmr-trigger-cloud-data-fetch`, `asmr-delete-works`, `asmr-delete-local-files`, `asmr-delete-by-rj`, `asmr-fetch-chinese-works` |
NT|| tg | `tg:scan-recent-activity`, `tg-read-recent-activity`, `tg-check-login`, `tg-login`, `tg-get-status`, `tg-upload-files`, `tg-cancel-upload`, `download-tg-file`, `clear-cache`, `tg-get-statistics`, `read-rj-list` |
| whisper | `start-task`, `stop-task`, `zip-subtitles`, `count-media-files` |
| file | `scan-local-archives`, `extract-file-names`, `fs-read-file`, `write-file`, `clean-data` |
| image | `read-image-as-base64`, `get-default-avatar` |

**注意事项**:
- 新增 IPC 通道需要在对应模块的 `setup*IPC()` 函数中注册
- Preload 层需要同步暴露新通道
- 使用 `ipcMain.handle()` 返回 Promise，支持 async/await

SS|

---

## 常用命令

| 命令                   | 用途                |
| ---------------------- | ------------------- |
| `npm run dev`          | 开发模式            |
| `npm run build`        | 构建                |
| `npm run lint`         | 代码检查            |
| `npm run format`       | 代码格式化          |
| `npm run test`         | 运行单元测试        |
| `npm run ralph "任务"` | RalphWiggum Loop    |
| `npm run verify`       | 验证 (lint + build) |

| 命令                   | 用途                |
| ---------------------- | ------------------- |
| `npm run dev`          | 开发模式            |
| `npm run build`        | 构建                |
| `npm run lint`         | 代码检查            |
| `npm run format`       | 代码格式化          |
WZ|| `npm run ralph "任务"` | RalphWiggum Loop    |
SJ|| `npm run test`         | 运行单元测试        |
PY|| `npm run verify`       | 验证 (lint + build) |
| `npm run verify`       | 验证 (lint + build) |

---

## 文档索引

| 文档                                              | 描述     |
| ------------------------------------------------- | -------- |
| [架构设计](../design-docs/architecture-design.md) | 系统分层 |
| [业务边界](../design-docs/business-boundary.md)   | 业务边界 |
| [数据流设计](../design-docs/data-flow.md)         | 数据流向 |
| [质量评分](../quality/README.md)                  | 模块评分 |

---

## 文档更新日志

| 日期       | 变更                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-02-26 | 初始版本                                                                     |
NQ|| 2026-02-27 | 添加 Agent 视觉系统工具索引 (task-isolated-logger, cdp-client, dom-snapshot) |
|RP|| 2026-02-27 | 更新 IPC 通道列表：whisper 添加 stop-task，asmr/tg/config 模块同步最新通道，添加 asmr-data-transforms.js 模块 |
NT|
