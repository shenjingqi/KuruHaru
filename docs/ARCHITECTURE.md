# 系统架构与模块边界

> 状态：`current`
> 校验日期：2026-11-06

## 运行边界

```text
Vue 页面 / composables / stores
        -> Renderer API adapters
        -> Preload capability allowlist
        -> Main IPC handler (registry where adopted) / request validation
        -> Domain services / repositories / external adapters
        -> 用户数据、文件、Telegram、ASMR.ONE、Aria2、Whisper
```

- `src/main/index.js` 负责 Electron 生命周期，并调用组合根。
- `src/main/bootstrap/module-assembly.js` 负责领域服务、IPC 和后台任务的启动/停止顺序。
- `src/main/system/` 负责窗口、对话框和授权文件能力。
- `src/main/ipc/registry.js` 负责受信发送方校验和统一错误包装。
- `src/main/domains/` 正在提供领域服务、仓储和 IPC 适配边界；部分服务仍委托现有 `src/main/modules/` 实现，并未完成完整的领域拆分。
- `src/preload/index.js` 是 Renderer 的唯一宿主能力入口；Renderer 不直接访问 Node.js。

## 模块归属

| 能力 | 组合/入口 | 主要实现 |
| --- | --- | --- |
| 窗口、托盘、文件能力 | `src/main/system/` | 系统服务 |
| ASMR | `src/main/domains/asmr/` | 服务、凭据、仓储、IPC 适配 |
| Telegram 搜索 | `src/main/domains/telegram-search/` | 搜索服务和适配器，连接现有搜索模块 |
| TG 信息缓存 | `src/main/domains/tg-info-cache/` | 缓存服务、仓储、调度器和适配器 |
| 自动翻译 | `src/main/domains/translation-automation/` | 编排器、状态仓储、调度器和适配器 |
| 自动翻译云端心跳 | `src/main/modules/translation-automation-heartbeat.js` | 快照归一化、续约/节流/去重、释放与 TTL 兜底；HTTP 传输在 `src/main/modules/httpClient.js` |
| Whisper | `src/main/modules/whisper.js` | 转写、任务事件和字幕打包 |
| Telegram 登录/上传 | `src/main/utils/telegram-login.js` | 客户端、认证、上传和操作状态；User API 客户端由 `requireConnectedTelegramClient()` 统一复用 |
| 重复检测 | `src/main/modules/tg-rj-duplicates.js` | 扫描、预览、执行和审计 |
| 音声下载 | `src/main/modules/asmr-audio-downloader.js` | 规划、manifest 和 Aria2 提交 |

## IPC 约束

- 每个频道只有一个 owner；变更同时更新 Main、Preload、Renderer adapter、测试和本文档。
- 长任务必须返回 operation/task id，并提供独立的事件解绑函数。
- 所有 User API 读取/写入域必须复用 `telegram-login` 的单例客户端，不得使用同一 StringSession 创建并行 `TelegramClient`。
- 发送方校验、输入校验、错误码和敏感字段脱敏必须在 Main 边界完成。
- 频道名、外部链接、搜索顺序、上传成功语义和删除规则不是内部实现细节，未经批准不得改变。
- 当前仍有旧模块直接调用 `ipcMain.handle/on`；这是后续 P1 收敛项，不在本轮伪装成已完成。

## 主进程日志与窗口生命周期

- Main 的 `console.log/info/warn/error/debug` 通过 `src/main/utils/logger.js` 异步写入文件，不直接写 inherited stdout/stderr，避免宿主终端暂停时阻塞 Electron 主线程。
- 日志文件写入失败不会回退到控制台；敏感字段在序列化前脱敏。
- 托盘动作只对未销毁的 BrowserWindow 执行；窗口 `closed` 后清空主窗口引用。

### Whisper 进程收尾

- `src/main/modules/whisper.js` 直接启动 Whisper 可执行文件，不再通过 `cmd /c` 包装进程，避免包装进程和引擎进程出现不同的退出生命周期。
- 转写期间 Main 进程同时观察引擎输出和目标目录；连续两次轮询确认字幕与音频完整匹配后，结束仍存活的引擎进程并发布一次成功事件。
- 连续 `10` 分钟没有日志或字幕目录变化时，Main 终止进程树并将任务标记为 watchdog 失败，避免 Renderer 永久保持忙碌。
- 用户取消先落盘 `cancelled` 状态和 `user-stop` 事件，再终止子进程；随后到达的 `close`/`error` 事件不会覆盖取消结果。
- Main 会识别外部引擎输出的“VAD 注入已停用”日志，并给引擎 15 秒收尾宽限期；宽限期后仍未退出时由 Main 负责终止，因此不依赖重新构建外部 Python 包。外部包中的 ONNX 显式释放改动仍可作为后续优化，但不会替代 Main 侧兜底。

## 状态与持久化

| 状态 | 默认位置 | 用途 |
| --- | --- | --- |
| 下载 manifest | `paths.dataDir/asmr_download_manifest.json` | 任务身份、路径、GID、状态和人工复核 |
| Whisper 任务 | `<userData>/data/whisper-task-state.json` | 阶段、时长、中断和失败原因 |
| 上传状态 | `paths.uploadHistoryDir/upload_state.json` | confirmed/uncertain 幂等状态 |
| 自动翻译 | `paths.dataDir/translation-automation-state.json` | 队列阶段、外部引用和恢复信息 |
| 重复审计 | `paths.dataDir/rj-duplicate-audit.json` | 快照、预览和逐项结果 |
| TG 信息缓存 | 应用数据目录 | 来源、新鲜度和刷新失败 |

自动翻译队列每轮开始处理前，会先等待 Telegram 最近活动历史扫描完成，再读取本地历史索引。已配置 Telegram 频道和登录会话但同步失败时，本轮会停止，避免多个队列实例基于过期历史重复收获；未配置这些条件时跳过同步并沿用本地历史。

### 自动翻译心跳边界

- 生命周期绑定 `runOnce()`：只有通过 `enabled` 与低峰时段门禁并设置 `running = true` 后才启动；`finally` 先停止定时器并尝试释放，再清理本地运行状态。`stopTranslationAutomation()` 与应用退出流程同样会停止心跳。
- `runtimeStatus` 变化只更新内存快照；控制器去重并节流，默认运行开始立即发送、每 60 秒续约、实质变化最快每 12 秒同步一次。高频 5 秒下载进度不会逐次发起网络请求。
- 心跳请求由 Main 进程执行，使用 `httpClient.js` 的专用传输；失败只记录脱敏警告，不改变自动翻译状态，不在失败后紧密重试。
- `translationAutomation.heartbeatUrl` 是普通公开配置；生产构建只接受 HTTPS，开发构建仅额外允许 `localhost`/`127.0.0.1`/`::1` 的 HTTP。`heartbeatSecret` 不是配置字段，保存时由 Main 提取到 `safeStorage`，普通配置保存逻辑会剥离它。IPC 仍复用现有 `translation-automation-save-config` / `translation-automation-status` 频道，不新增 Renderer 能力。
- Renderer 只能获得心跳地址与 `heartbeat.secretConfigured` 布尔值；实际密钥不进入 Renderer、日志、配置 JSON 或 IPC 返回值。

## 配置边界与精简策略

- `src/shared/config-contract.mjs` 是配置 section、默认值和版本的唯一来源。
- `config/config-template.json` 通过 `npm run config:template` 生成，不手工维护第二套默认值。
- 运行配置默认位于 Electron `userData/config.json`；设置 `paths.configDir` 后使用指定目录。
- 配置分为用户偏好、敏感凭据、运行策略、运行状态和派生路径；敏感字段不得写入模板、日志和诊断输出。
- 自动翻译心跳地址属于运行策略并进入模板；心跳密钥只进入 `src/main/domains/asmr/credential-store.js` 管理的内存/安全存储，不属于配置契约字段。
- 新字段必须说明 owner、生产者、消费者、持久化、迁移、回滚和删除条件。
- v1 配置精简先做字段盘点和读写追踪，将字段标为用户明确选择、凭据、内部运行策略、派生路径或持久化状态；未确认用途和消费者前不删字段。
- 界面只暴露用户能理解且需要主动决策的选项；内部运行参数优先使用安全默认值，归入高级选项前应证明用户确实需要调节。
- 废弃字段先停止写入，再提供迁移/兼容期和回滚说明；不得直接删除用户现有值或把不兼容迁移混入界面重做。

## 架构改造路线

1. **边界真实化**：验证领域 wrapper 是否承载真实业务边界，逐步替换只转发不隔离依赖的 façade。
2. **IPC 收敛**：统计并迁移绕过 registry 的 handler/listener，补齐 owner 和契约测试。
3. **状态统一**：为下载、转写、上传、缓存、重复检测和自动翻译统一状态事件、恢复入口和审计格式。
4. **Renderer 解耦**：页面只编排 UI 状态；业务计划和副作用下沉到 Main 领域服务。
5. **体积与启动**：以首屏体积和交互延迟为基线，对低频页面采用异步组件和功能域拆包。

这些是 v1 后续实施顺序，不表示当前代码已经全部完成。
