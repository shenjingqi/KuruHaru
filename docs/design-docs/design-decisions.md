# 设计决策日志

> 状态: ✅ 活跃  
> 最后更新: 2026-03-06

本文档用于沉淀“已完成执行计划”里的长期有效设计决策，避免知识只停留在 `exec-plans`。

---

## 决策清单（按时间）

## 2026-02-26：向前依赖架构（已实现）

**背景**

- 代码跨层依赖不清晰，修改成本高。

**决策**

- 采用分层依赖方向：

```text
Types → Config → Repo → DataAccess → Service → Runtime → UI
```

**影响**

- 明确了架构治理基线，后续文档与 ESLint 规则围绕该方向演进。

---

## 2026-02-26：HTTP 客户端统一入口（已实现）

**背景**

- 业务模块存在直接使用 axios 的路径，代理与错误处理难统一。

**决策**

- 网络请求统一通过 `src/main/modules/httpClient.js`。
- 约束层面禁止直接导入 axios（ESLint 限制规则）。

**影响**

- 代理、超时、错误处理策略可集中治理。

---

## 2026-02-27：T0 质量基线（已实现）

> 来源：`exec-plans/completed/2026-02-27-harness-t0-improvements.md`

**背景**

- 需要先建立最低可验证质量基线（测试 + 统一错误链路 + 网络拦截）。

**决策**

1. 引入 Vitest 作为单测框架（与 Vite/Electron 工程兼容）。
2. `errorHandler` 与 `retry` 进入可回归测试范围。
3. `httpClient` 使用请求/响应拦截器，响应阶段统一接入 `normalizeError`。

**影响**

- 当时测试基线固定为 20 tests（`errorHandler` 14 + `retry` 6），当前已扩展为 42 tests。
- 错误处理从“分散处理”转为“标准化输出”，当前 `normalizeError()` 兼容重复标准化与 TLS 握手失败等网络异常。

---

## 2026-03-03：Telegram Search Bot 迁移到 Bot API 主线（已实现）

> 来源：`exec-plans/completed/2026-03-03-telegram-bot-api-migration.md`

**背景**

- 需要以 Bot Token 为核心构建可运营的搜索 Bot，同时保留频道历史能力。

**决策**

1. 主实现统一到 `src/main/modules/tg-search-bot.js`。  
   `src/main/modules/tg-bot-api.js` 仅保留兼容转发入口。
2. 搜索链路采用分层命中：
   - 历史索引（本地）
   - 前置包内存索引（极速）
   - 频道检索（User API，可选）
3. 索引能力支持：
   - 手动同步 `tg-bot-sync-history`
   - 启动自动同步 `triggerStartupHistorySync`
   - `channel_post` 在线增量更新
4. 运行模式支持 Polling 与 Webhook 双模式。

**影响**

- Bot 能稳定提供 `/start`、`/help`、`/search`。
- 配置面扩展（`tg.botToken`、`tg.searchChannelId`、白名单、前置包路径、索引文件路径等）。

---

## 2026-03-03：RJ 重复检测改为“配对识别 + 安全删除链路”（已实现）

> 来源：
>
> - `exec-plans/completed/2026-03-03-rj-duplicate-detector-v3.md`
> - `exec-plans/completed/2026-03-03-rj-duplicate-detector-id-delete-hotfix.md`

**背景**

- 旧方案仅按 RJ 文本去重，未可靠处理“原始消息 + Bot 回复”关系。
- 删除链路在频道转发/镜像场景中存在失败与误删风险。

**决策**

1. 扫描范围严格限定到 `tg.channel`（不再回退 `tg.discussion`）。
2. 原始消息定义调整为：`senderType in {user, channel}` 且可提取 RJ。
3. 关联算法采用三轮：
   - `reply_to` 直接关联
   - 时间窗 + RJ 匹配（60s）
   - 无回复兜底
4. 删除链路强化：
   - 输入 ID 归一化（正整数 + 去重）
   - 主实体删除 + 频道镜像删除
   - 失败时按频道发送者回退删除
   - 返回 `partial` / `deletedMessageIds` / `errors[*].attempts`

**影响**

- 前端可按“实际删除成功 ID”移除行，避免错误移除。
- 运维可从日志快速定位删除失败原因（含 code/message/attempts/meta）。

---

## 2026-03-03：业务理解纠偏机制（已吸收）

> 来源：`exec-plans/completed/2026-03-03-rj-duplicate-detector-v2.md`

**背景**

- V2 阶段暴露出“对 Telegram 发送者类型与消息关联关系理解偏差”。

**决策**

- 在 RJ 关联链路中保留“可观测统计 + 样本日志”，用于快速发现分类偏差：
  - `userWithRJ / channelWithRJ / originWithRJ`
  - `reply无RJ消息发送者Top` 等
- 前后端统一消息 ID 读取规则：`message.messageId ?? message.id`。

**影响**

- 后续排障不再依赖猜测，能够基于日志快速判断“数据问题 vs 算法问题”。

---

## 2026-03-04：页面与 JS 全量拆解采用“全量纳入 + 分波次落地”（已实现）

> 来源：`exec-plans/completed/2026-03-04-页面与JS分阶段重构方案.md`

**背景**

- Renderer 与 Main 出现多个超大文件，且页面层存在 `window.api` 直连热点。
- `asmr-localization.js` 与 `asmr.js` 高相似度（约 0.8542），重复治理空间明显。

**决策**

1. 覆盖口径改为“全量纳入”而非“只治大文件”
   - Renderer `.vue`：28
   - Main/Preload/Renderer `.js`：34
2. 执行策略采用“分波次”
   - A：高风险强耦合
   - B：中体量流程型文件
   - C：全量收口与标准化
3. 技术路线采用“契约优先”
   - IPC 常量与契约集中定义
   - Renderer 引入 API Adapter，逐步消除页面对 `window.api` 的直连
4. 网络行为冻结（用户约束）
   - ASMR 远程 URL 与参数语义保持不变
   - TG 远程连接流程顺序保持不变
5. 引入协议冻结守卫（Protocol Freeze Invariant）
   - 不变量范围：ASMR 关键 URL token、preload 关键 IPC channel、Renderer `.vue` 禁止 `window.api` 直连
   - 使用 `npm run verify:protocol` 作为波次验收守卫

**影响**

- 保证全量拆解目标不变，同时把回归风险控制在可回滚批次内。
- 后续可在不改业务语义的前提下，持续降低文件复杂度和重复实现比例。
- 已执行波次 1：App 壳层拆分 + Renderer API Adapter 收口 + ASMR 搜索纯逻辑共享化。
- 渲染层 `.vue` 中 `window.api` 直连已降为 0，桥接调用统一经 `src/renderer/src/api/*`。
- 新增 `asmr-core/file-list-utils.js`，收敛汉化列表读写逻辑，外部 URL 与流程保持冻结。
- Preload 已新增 `config/dialog/system/whisper/asmr/tg` 命名空间，且平铺 API 兼容保留。
- 页面拆分进入波次 2：`Settings.vue`、`RecentActivity.vue` 首批流程已迁移到 composable。
- 新增 `verify:protocol` 守卫脚本，持续校验 URL/IPC/流程不漂移。

### 波次进展补充（2026-03-05）

- 变更：
  - Renderer adapter 回退策略已统一到 `src/renderer/src/api/*`，按“命名空间优先，平铺回退”执行。
  - 页面 composable 拆分继续落地，`Settings.vue` 与 `RecentActivity.vue` 已接入首批流程 composable。
  - 页面流程拆分继续推进，`TgDownloader.vue` 与 `ChineseList.vue` 已下沉到 `useTgDownloaderWorkflow` / `useChineseListWorkflow`。
  - 上传流程拆分继续推进，`UploadTool.vue` 已下沉到 `useUploadToolWorkflow`，并使用 `tg-upload-finished` 结束信号辅助恢复 UI 状态。
  - 热点脚本收口完成：`RjDuplicateDetector.vue`、`AdvancedSearch.vue`、`TgSearchBot.vue`、`LanguageSelector.vue` 已完成 composable/helper 下沉。
  - `RjDuplicateDetector` 进一步拆分为 controller/runtime/table-view 三层，并将列定义外提到 `modules/rj-duplicate/table-columns.js`。
  - `tg-search-bot.js` 已抽取 `tg-search-bot-core/*` 纯 helper（normalizers/parsers/link/permissions/logging/history/response）。
  - `asmr.js` 与 `asmr-localization.js` 进一步抽取共享 pure helper：`asmr-core/url-filter-utils.js`（URL 模式判定、搜索 URL 构建、日期筛选、结果映射）。
  - RJ 删除匹配逻辑进一步抽取到 `asmr-core/rj-filter-utils.js`，统一 exact / case-insensitive 两种匹配模式，减少主模块重复。
  - 搜索请求元数据逻辑抽取到 `asmr-core/search-utils.js`（search base/page URL、browser headers、total count/total pages 计算），两端主模块复用且请求顺序保持不变。
  - preload 完成 descriptor map + factory 生成式封装，保持平铺 API 与命名空间别名双栈兼容。
  - Core helper 抽取继续推进，`asmr-core/search-utils.js`、`asmr-core/file-list-utils.js` 与 `rj-duplicate/message-helpers.js` 已进入复用路径。
  - 契约补齐：`asmr-write-chinese-list` 与 `tg-upload-finished` 已形成 main/preload/renderer 端到端链路；`filter-rj-from-url` 与 `filter_rj_from_url` 双通道兼容保留。
- 已验证：
  - `scripts/verify-protocol-invariants.js` 已落地并定义 Protocol Freeze Invariant 三项检查。
  - `package.json` 已提供 `npm run verify:protocol` 执行入口。
  - 最新验收：`npm run verify:protocol`、`npm run test`（20/20）、`npm run verify` 已通过（lint 仅 warning，无 error）。
  - 新增热点拆分文件 LSP 诊断通过（0 diagnostics）。
- 剩余：
  - 进入稳定化阶段：以小步微调 `Settings.vue` / `RecentActivity.vue` 为主，保持行为冻结。
  - preload 继续维持 descriptor + alias 兼容期，按契约守卫渐进收口。
  - main 侧继续抽取可复用 pure helper，保持外部 URL 与流程冻结。

---

## 2026-03-05：无边框窗口采用“Windows 自定义 + 非 Windows 系统边框兜底”（已实现）

> 来源：`exec-plans/completed/2026-03-04-无边框窗口设计方案.md`

**背景**

- 纯 `frame: false` 在跨平台行为差异较大，且 Linux/macOS 回归成本高。
- 需要同时满足“Windows 无边框体验”和“其他平台可操作稳定性”。

**决策**

1. 系统配置新增 `system.windowFrameMode`（`custom/system`），提供可回退开关。
2. 实际生效策略：
   - Windows：`custom` 走无边框自绘标题栏。
   - macOS/Linux：自动兜底 `system`，避免不可操作窗口。
3. main/preload/renderer 新增窗口状态合同：
   - `window-get-state`
   - `window-state-changed`
   - 状态包含 `frameMode/customFrameEnabled/maximized/focused/darkMode`。

**影响**

- App 壳层与标题栏可按窗口状态联动样式（最大化、失焦、深色）。
- 最大化/还原时边框与阴影可控，降低视觉抖动。
- “系统边框/无边框”切换进入可配置状态，兼顾体验与兼容性。

---

## 2026-03-06：工作流设计器 IPC 采用“运行前序列化 + 前置必填检查”（已实现）

> 来源：`src/renderer/src/composables/useWorkflowDesigner.js` 修复提交

**背景**

- 工作流设计器在 `run/save/validate` 时直接把 `workflow.value`（Vue 响应式对象）传入 IPC。
- 在 Electron IPC 结构化克隆阶段，响应式 Proxy 存在 `DataCloneError` 风险，表现为“点击运行但未真正进入主进程”。
- 默认首节点为 `whisper.translateSubtitles`，若未设置 `exePath/targetPath`，会在主进程校验阶段直接拒绝执行。

**决策**

1. 渲染层在 `run/save/validate` 前统一执行工作流载荷序列化（转为纯对象）后再发 IPC。
2. `startRun/saveCurrentWorkflow/validateCurrentWorkflow` 补齐异常捕获，统一向 UI 返回明确错误信息。
3. `startRun` 增加 Whisper 节点必填前置检查（引擎路径、媒体目录），优先在前端阻断无效启动。

**影响**

- 避免因 Proxy 直接跨 IPC 传输导致的静默失败，提升“点击运行有反馈”的确定性。
- 错误暴露从“主进程未触达/无提示”改为“前端可见提示 + 运行日志可追踪”。
- 运行失败更早、更可解释，减少用户误判为“工作流引擎不可用”。

---

## 文档更新规则

1. `exec-plans/completed/*` 的结果若形成长期规则，必须回写到本日志或对应 feature 设计文档。
2. 只记录“稳定决策”，临时调试步骤不写入本文件。
3. 记录时必须附来源计划文件，保证可追溯。
