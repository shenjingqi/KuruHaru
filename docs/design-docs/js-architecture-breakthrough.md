# JS 架构升级与设计突破（全量拆解配套）

> 状态: 🔄 活跃
> 最后更新: 2026-03-05
> 关联计划: `docs/exec-plans/completed/2026-03-04-页面与JS分阶段重构方案.md`

## 0. 红线约束（网络行为冻结）

本轮“全量拆解”属于结构性重构，以下内容必须保持不变：

1. ASMR 远程 URL、路径、参数语义不变。
2. TG 远程连接流程（登录/鉴权/同步/上传下载）顺序不变。
3. 允许改造代码组织和调用封装，不允许改造外部网络协议行为。

## 1. 现状信号（基于实测）

### 1.1 规模与复杂度热点

- Renderer：`Settings.vue (1444)`、`RecentActivity.vue (1121)`、`RjDuplicateDetector.vue (1034)`、`App.vue (992)`
- Main：`asmr-localization.js (1809)`、`asmr.js (1677)`、`tg-search-bot.js (1564)`、`tg-rj-duplicates.js (1257)`
- Preload：`index.js` 虽仅 `166` 行，但含 `invoke=60`、`send=7`（通道面过宽）

### 1.2 耦合热点

- `window.api` 在热点文件中高频直连：
  - `UploadTool.vue`: 16
  - `Settings.vue`: 15
  - `Tools.vue`: 12
- IPC 注册密度在少数文件集中（如 `asmr-localization.js`/`asmr.js` 各 21 个）
- `asmr-localization.js` 与 `asmr.js` 文本相似度约 `0.8542`，存在明显重复核心

### 1.3 根因

1. 页面文件同时承担容器、状态、副作用、视图细节。
2. IPC channel 命名与调用路径分散，缺单一真相源。
3. 业务逻辑与运行时适配逻辑（I/O、IPC、日志）混写。

---

## 2. 目标架构（突破方向）

目标是把“功能可用”升级为“可演进、可定位、可治理”的 JS 架构。

```text
UI Container
  -> Feature Composable
    -> Renderer API Adapter
      -> Preload IPC Contract
        -> Main IPC Register
          -> Service / Core (Pure)
            -> DataAccess / Repo (I/O)
```

核心原则：

1. **Contract-first**：先定义契约，再迁移实现。
2. **Core/Adapter 分离**：纯逻辑与副作用分层。
3. **Feature Slice**：按功能垂直切，不按技术横切堆文件。

---

## 3. 可落地的 8 个设计突破

### 3.1 IPC 契约表（单一真相源）

在 `src/shared/ipc/` 建立统一定义：

- `channels.js`：channel 常量
- `contracts.js`：请求/响应 JSDoc schema
- `index.js`：统一导出

收益：

- 消除字符串散落与拼写漂移。
- 让 preload/main/renderer 对齐同一契约。

### 3.2 Renderer Adapter 层（禁止页面直连 window.api）

新增 `src/renderer/src/api/` 分域适配：

- `api/tg.js`
- `api/asmr.js`
- `api/system.js`
- `api/dialog.js`

规则：页面与 composable 只依赖 `api/*`，不直接调用 `window.api.*`。

附加红线：Adapter 仅做“调用收口与参数归一化”，不得私自改写 ASMR/TG 远程 URL 或调用流程顺序。

### 3.3 Container + Composable + Presentational 三段式

页面拆分统一模板：

- `PageContainer.vue`：装配与路由上下文
- `useXxxFlow.js`：状态机与副作用
- `XxxPanel.vue`：纯展示与交互事件

### 3.4 Functional Core / Imperative Shell

在 main 模块里，先提取纯函数核心：

- `transforms.js` / `rules.js` / `matchers.js`（纯函数）
- `register-ipc.js` / `service-runtime.js`（I/O 和编排）

这样能直接解决 `asmr-localization` 与 `asmr` 的重复收敛问题。

### 3.5 Workflow Pattern（工具页统一工作流）

`RecentActivity`、`RjDuplicateDetector`、`TgDownloader` 使用统一 workflow 形态：

- `state`：idle/running/success/fail/cancelled
- `actions`：start/cancel/retry
- `timeline`：可观测日志流

收益：避免每个页面重复造“任务状态 + 日志 + 错误回退”轮子。

### 3.6 标准化错误信封（Error Envelope）

所有跨边界调用统一返回：

```js
{
  ok: boolean,
  data?: unknown,
  error?: { code: string, message: string, details?: unknown }
}
```

并统一通过 `normalizeError()` 与 `withRetry()` 处理异步错误。

### 3.7 复杂度门禁（CI）

新增软/硬阈值治理：

- 单文件目标：页面 `< 450` 行，main 模块 `< 700` 行
- 单函数目标：`< 60` 行、嵌套深度 `< 4`
- 页面中 `window.api` 直接调用目标：`0`

### 3.8 重复治理（Similarity Gate）

对高重复模块（如 asmr 双模块）设置阈值：

- 当前基线：`~0.8542`
- 第一阶段目标：`<= 0.60`
- 收敛目标：`<= 0.45`

---

## 4. 推荐目录骨架（实施后）

```text
src/
├─ shared/
│  └─ ipc/
│     ├─ channels.js
│     ├─ contracts.js
│     └─ index.js
├─ renderer/src/
│  ├─ api/
│  │  ├─ asmr.js
│  │  ├─ tg.js
│  │  ├─ system.js
│  │  └─ dialog.js
│  ├─ modules/
│  │  └─ navigation/
│  ├─ composables/
│  └─ features/
└─ main/
   ├─ ipc/
   │  ├─ register-asmr.js
   │  ├─ register-tg.js
   │  └─ register-system.js
   ├─ services/
   └─ core/
```

---

## 5. 迁移策略（按波次）

1. **波次 1**：契约先行（IPC 常量 + Adapter）
2. **波次 2**：页面拆容器（App/Settings/RecentActivity）
3. **波次 3**：main 核心抽离（asmr 双模块收敛）
4. **波次 4**：工具页 workflow 统一（TG 相关页面）
5. **波次 5**：全量收口（其余页面/JS 全部套入统一模式）

---

## 6. 验收指标（可量化）

| 指标                       |                    当前基线 |       阶段目标 |
| -------------------------- | --------------------------: | -------------: |
| 最大页面行数               |                        1444 |         <= 450 |
| 最大 main 模块行数         |                        1809 |         <= 700 |
| 热点页面 `window.api` 直连 | 43（Upload/Settings/Tools） |              0 |
| Preload 通道契约覆盖       |                67/67 未集中 | 67/67 集中定义 |
| asmr 双模块相似度          |                     ~0.8542 |        <= 0.45 |

### 6.1 阶段进展快照（2026-03-05）

- Renderer `.vue` 中 `window.api` 直接调用：`0`
- Preload 命名空间已落地：`config/dialog/system/whisper/asmr/tg`（平铺 API 兼容保留）
- 页面拆分进展：`Settings.vue` 与 `RecentActivity.vue` 已完成首批 composable 外提
- 协议守卫脚本已落地：`npm run verify:protocol`

### 6.2 收口快照（2026-03-05）

- 热点脚本已完成第二轮下沉：
  - `RjDuplicateDetector`：`254 -> 34`（script 行数）
  - `TgSearchBot`：`153 -> 39`
  - `Settings`：`120 -> 75`
  - `AdvancedSearch`、`LanguageSelector` 已迁移至 workflow composable
- Main 侧 `tg-search-bot` 完成 pure helper 外提到 `tg-search-bot-core/*`。
- Main 侧 ASMR 模块继续收敛：新增 `asmr-core/url-filter-utils.js`，统一 `asmr.js` 与 `asmr-localization.js` 的 URL 判定/筛选映射纯逻辑。
- Main 侧 RJ 匹配逻辑继续收敛：`asmr-core/rj-filter-utils.js` 新增 exact / case-insensitive 匹配 helper，并在两条删除路径复用。
- Main 侧搜索元数据逻辑继续收敛：`search-utils` 新增 URL/headers/分页元数据 helper，`asmr.js` 与 `asmr-localization.js` 共享。
- Preload 完成 descriptor map + factory 生成式桥接，保持平铺/命名空间双兼容。
- 验收结果：`verify:protocol` ✅、`test` ✅（20/20）、`verify` ✅（0 error，lint warning 仅既有项）。

---

## 7. 实施注意事项

1. 不做“冻结业务 + 大爆炸迁移”，坚持每波次可回滚。
2. 不为了拆而拆，低复杂文件以“职责边界明确”为先。
3. ASMR/TG 网络行为冻结：URL 与流程顺序不可变。
4. 任一波次结束后必须更新：
   - `docs/exec-plans/active/*`
   - `docs/design-docs/design-decisions.md`
   - `docs/design-docs/module-index.md`（若模块边界发生变化）
