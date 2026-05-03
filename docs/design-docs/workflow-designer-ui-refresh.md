# Workflow Designer UI Refresh

> Status: Draft
> Updated: 2026-03-14

## Goal

Refresh the Workflow Designer shell without changing workflow runtime behavior:

- clarify information hierarchy
- move shell styling onto reusable tokens
- make the layout mobile-first and progressively enhanced

## Changes

### 1. Information Architecture

- The hero section now separates workflow identity, workflow summary, primary actions, and current focus context.
- Four overview cards stay visible at all times: graph scale, validation health, runtime progress, and selection context.
- The left node library is now treated as a stable resource panel instead of a hover-only drawer.
- Bridge and run controls are grouped into a dedicated control console for linking, dispatch strategy, zoom, and execution.
- Inline node inspection is now preferred only on wide canvases; narrower widths fall back to the right inspector to reduce overlap.

### 2. Visual System

- Added workflow-specific semantic tokens in `WorkflowDesigner.vue` (`--wf-*`) and mapped them to the orbit palette.
- Standardized panel chrome, radii, shadows, badges, and borders across the shell and workflow drawers.
- Shifted the palette away from uniform blue: the shell now uses warm copper, teal, and rose accents to separate hero, node library, control console, and inspector surfaces.
- Kept the dark mission-control canvas aesthetic while making shell surfaces and controls token-driven for future theme alignment.

### 3. Responsive Rules

- Base layout is single-column.
- `768px+`: overview cards move to two columns; inspector tabs and key data grids expand.
- `1024px+`: hero becomes two-column; main workspace becomes `left rail + canvas`, with the right inspector stacked below.
- `1440px+`: main workspace becomes `left rail + canvas + right inspector`.

### 4. Picker Motion

- `Add Node / Node Picker` now keeps the active item inside the viewport with smooth auto-scroll during keyboard navigation.
- Filter result updates now use lightweight entry / move transitions instead of abrupt list replacement.
- The picker list adds top / bottom scroll shadows and keyboard hint chips to reduce visual jumpiness while browsing long result sets.
- Bottom `Runtime Dock` no longer uses a hard fixed expanded height; it now supports top-edge drag resize, persists height in local storage, and lets the inner body scroll when content exceeds the viewport.

## Node Card Refinement

- Node cards now use a structured workstation block layout with dedicated port clusters, a header strip, a runtime status lamp, and parameter rows.
- Input and output ports now expose explicit `入参` / `出参` labels, connection-state hints, and parameter semantics from node definition `io.input` / `io.output`.
- Port zones now follow a ComfyUI-style readable socket pattern: `圆点插口 + 槽位文本标签` (direction prefix + primary parameter + `+N`), replacing tiny `IN/OUT` badges.
- Port parameter rendering now prefers `label (key)` when both exist, so users can read business meaning and real field keys at the same time.
- Edge records are now slot-aware (`sourcePort` / `targetPort`) so each line is anchored to an explicit input/output argument rather than a node-level default.
- Canvas and node visuals now map to ComfyUI dark tokens (`component-node-background`, `node-component-slot-text`, slot-color palette) instead of custom warm neon styling.
- Source/sink nodes are now auto-marked as `输入结点` / `输出结点` based on graph in-degree and out-degree, with stronger edge-side highlights on the corresponding side.
- The header now separates node badge, node family, runtime status, and destructive action into a tool-like title bar.
- Parameter summaries are rendered as compact rows instead of a single sentence, improving scanability on the canvas.

## Primary Files

- `src/renderer/src/components/WorkflowDesigner.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerHero.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerOverview.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerLeftRail.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerCenterHub.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerGraphCanvas.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerRuntimeDock.vue`
- `src/renderer/src/components/workflow/designer/WorkflowDesignerInspectorPanel.vue`
- `src/renderer/src/components/workflow/designer/workflowDesignerContext.js`
- `src/renderer/src/components/workflow/designer/workflow-designer.css`
- `src/renderer/src/composables/useWorkflowDesignerPage.js`
- `src/renderer/src/components/workflow/WorkflowLibraryDrawer.vue`
- `src/renderer/src/components/workflow/WorkflowBridgeDrawer.vue`
- `src/renderer/src/components/workflow/WorkflowContextMenu.vue`
- `src/renderer/src/components/workflow/WorkflowSelectionToolbox.vue`

## 2026-03-13 Runtime + Queue Alignment Update

- Added workflow runtime queue channels:
  - `workflow-queue-get`
  - `workflow-queue-run-front`
  - `workflow-queue-clear-pending`
- `workflow-run` now enqueues runs instead of direct-start; queue scheduler starts pending runs serially.
- `workflow-cancel` now supports:
  - cancel pending queue item
  - cancel active running item (existing behavior)
- Queue snapshot now contains `pending / running / history` summaries.
- `WorkflowDesigner` now consumes queue store state and exposes queue actions in canvas context menu.
- Runtime now broadcasts `queue.updated` over `workflow-run-event`; renderer queue state can update in real-time and still keeps polling as fallback.
- Queue operations (`enqueue/run-front/clear-pending/cancel`) now emit queue snapshots immediately after state mutation.

### Schema Compatibility (v1 + v2)

- Extended workflow schema normalization to support v2 graph fields:
  - `nodes`
  - `links`
  - `groups`
  - `reroutes`
  - `floatingLinks`
  - `state`
  - `extra`
  - `definitions`
- Still emits backward-compatible `graph.nodes` / `graph.edges`.
- Added migration/export helpers:
  - `migrateWorkflowV1ToV2(raw)`
  - `exportWorkflowV2ToV1(raw)`
  - `normalizeWorkflowGraphV2(raw)`
- Added Comfy converters:
  - `convertComfyWorkflowToInternal(rawComfyWorkflow)`
  - `convertComfyWorkflowApiToInternal(rawWorkflowApi)`
  - `convertInternalToComfyWorkflow(rawWorkflow)`
  - `convertInternalToComfyWorkflowApi(rawWorkflow)`
- Graph validator now checks `group / reroute / subgraph` cross-reference integrity in addition to node and edge integrity.

### Feature Flag

- Added `config.workflow.comfyParityMode` (default `true`) as the rollout switch for parity-mode behaviors.

## 2026-03-13 M1 Page Decomposition (In Progress)

- Split `WorkflowDesigner.vue` shell-level UI into dedicated components:
  - `workflow/designer/WorkflowDesignerHero.vue`
  - `workflow/designer/WorkflowDesignerOverview.vue`
  - `workflow/designer/WorkflowDesignerLeftRail.vue`
  - `workflow/designer/WorkflowDesignerCenterHub.vue`
  - `workflow/designer/WorkflowDesignerGraphCanvas.vue`
  - `workflow/designer/WorkflowDesignerRuntimeDock.vue`
  - `workflow/designer/WorkflowDesignerInspectorPanel.vue`
- Added `workflow/designer/workflowDesignerContext.js` and switched shell-level state sharing to `provide/inject` to avoid large prop chains during拆分阶段.
- Moved the large style block out of `WorkflowDesigner.vue` into `workflow/designer/workflow-designer.css`.
- Moved page orchestration logic out of `WorkflowDesigner.vue` into `useWorkflowDesignerPage.js` so the page file stays as shell composition.
- `WorkflowDesigner.vue` now mainly orchestrates state and context wiring; `hero / overview / left rail / center hub / right inspector` markup moved out.
- Kept behavior-compatible data flow: node edit, runtime settings, run history, and workflow metadata still bind to the same reactive sources in `useWorkflowDesigner.js`.

## 2026-03-13 M2 Canvas Interaction Alignment (In Progress)

- Added group layer rendering and interaction:
  - create group from selected nodes
  - group selection
  - group drag move
  - group resize (`NW/NE/SW/SE`)
  - group fit-to-contents action
- Added reroute point rendering and interaction:
  - double-click edge to add reroute
  - edge context menu add reroute
  - reroute drag move with grid snap
  - reroute context menu delete
- Upgraded edge path rendering to multi-segment bezier chains through reroute points.
- Added multi-selection batch node dragging with grid snap.
- Marquee selection now includes `group` and `reroute` items in addition to nodes.
- Extended context menu scopes:
  - `node`
  - `edge`
  - `group`
  - `reroute`
  - `canvas`
- Canvas menu now includes:
  - create group
  - link visibility toggle
  - canvas lock/unlock
  - minimap show/hide
  - queue front-run / clear pending
- Minimap now supports visibility toggle (`canvasStore.minimapVisible`) and keeps drag-sync viewport behavior.
- Added subgraph navigation framework state placeholders:
  - `subgraphNavigationStack`
  - `activeSubgraphId`
  - `enterSubgraph()`
  - `exitSubgraph()`
- Subgraph navigation is now wired to canvas behavior:
  - context-menu supports enter/exit subgraph actions
  - node visibility can be filtered by active subgraph container id
  - edge/reroute/group visibility follows filtered node set

## 2026-03-14 M3 Node Interaction + Visual Parity (Completed)

- Node header now supports inline title editing:
  - double click node title enters edit mode
  - `Enter` commits
  - `Esc` cancels
  - blur commits
- Added node visual state model (`node.visual`) and interactive toggles:
  - `muted`
  - `bypassed`
  - `pinned`
  - `collapsed`
- Added node-level quick actions in node header toolbar:
  - `P` pin
  - `M` mute
  - `B` bypass
  - `C` collapse
- Added node context-menu state operations:
  - toggle pin/mute/bypass/collapse
- Updated node card z-index behavior:
  - pinned nodes stay above regular nodes
  - selected nodes are raised above non-selected
- Updated runtime-state visual feedback on node cards:
  - `running/success/failed/cancelled` border/feedback styles
- Added node runtime progress overlay for parity mode:
  - per-node progress percent derived from run events
  - progress strip rendered on node card while `status=running`
- Added drag-state feedback on node cards:
  - `is-dragging` visual layer and lift behavior during batch drag
- Added widget rendering pipeline in node summary strip:
  - renderer selection by value type (`toggle/number/list/path/text`)
  - widget-state classes (`active/error`)
  - invalid numeric hint values now surface an in-card widget error marker
- Widget renderer pipeline now has a registry extension point:
  - `registerNodeWidgetRenderer(renderer)`
  - default renderers are registered once and executed by priority
  - custom renderers can override/extend built-in widget matching
- Port schema resolution is now multi-source and no longer depends only on key/label regex:
  - runtime `listNodeDefinitions`
  - `workflow.definitions` / `workflow.graph.definitions`
  - local fallback definitions for built-in node types
  - structured datatype inference prefers explicit `datatype/dataType/valueType` and key grammar (`[]`, `/path`, `/files`) before legacy regex fallback
- Updated node chrome toward Comfy-like compact dark panel:
  - denser header tooling
  - visible badge + family chip
  - compact title/type hierarchy
  - clearer close/delete affordance

## 2026-03-14 M3 Comfy Shell + Node Structure Realignment (Completed)

- `comfyParityMode=true` now enters a dedicated single-canvas shell:
  - hide `Hero`
  - hide `Overview`
  - hide left rail / right inspector orbit panels
- Center hub in parity mode now keeps only graph canvas:
  - hide `WorkflowBridgeDrawer`
  - hide `WorkflowDesignerRuntimeDock`
- Node card template in parity mode now uses Comfy-oriented structure:
  - title-first header (no `WH/P/M/B/C/x` visual strip)
  - explicit input/output slot labels with datatype text (`port-slot-type`)
  - compact parameter rows as in-node widget summary area
- Parity mode now hides non-Comfy overlays on canvas:
  - hide selection toolbox floating strip
  - hide inline inspector floating panel
- Added `.workflow-orbit.workflow-orbit-comfy` style override layer:
  - canvas grid/background aligned to Comfy dark workspace
  - node surface/header/border hierarchy realigned
  - edge stroke and marker style realigned
  - port text/dot/readability realigned
  - resize handles kept (`NW/NE/SW/SE`) with compact visual style

## 2026-03-15 S6 Right Runtime Control Rail (Completed)

- The right inspector now exposes a dedicated runtime + queue control rail before node tabs.
- The new rail reuses the same designer state and actions as the existing runtime dock:
  - `validateCurrentWorkflow()`
  - `startRun()`
  - `queueRunCurrentWorkflowFront()`
  - `cancelRun()`
  - `clearPendingQueue()`
  - `inspectRunHistoryItem()`
  - `rerunHistoryItem()`
- The rail keeps queue visibility always on screen:
  - pending count
  - running count
  - history count
  - active run summary
  - queue updated timestamp
  - running list / pending list / recent history list
- The Comfy parity canvas now gives the right column more width so runtime controls read as a true side control zone instead of a narrow inspector strip.
- The bottom runtime dock now starts collapsed by default in parity flow so the right-side runtime rail becomes the primary visible control surface.
- Visual parity artifacts for this step are stored under `output/playwright/workflow-parity/`:
  - `S6-right-runtime-reference.png`
  - `S6-right-runtime-before-full.png`
  - `S6-right-runtime-after.png`
  - `S6-right-runtime-after-interaction.png`

## 2026-03-14 M4 Command + Keybinding (Completed)

- Command registry now includes core file/edit/view/queue actions:
  - `Comfy.File.New`
  - `Comfy.File.Save`
  - `Comfy.File.Validate`
  - `Comfy.Edit.Undo`
  - `Comfy.Edit.Redo`
  - `Comfy.Edit.SelectAll / Copy / Paste / Delete`
  - `Comfy.View.ZoomIn / ZoomOut / FitView / ResetView`
  - `Comfy.View.ToggleLinks / ToggleLock / ToggleMinimap`
  - `Comfy.Queue.Run / RunFront / Cancel`
- Added graph undo/redo history stack:
  - graph snapshots are captured automatically with debounce
  - supports node/edge/group/reroute-level graph edits
  - undo/redo restores graph and reconciles invalid selection
- Default keybindings now include:
  - `Ctrl+S` save
  - `Ctrl+Z` undo
  - `Ctrl+Y` / `Ctrl+Shift+Z` redo
  - existing `Ctrl+A/C/V`, `Delete`, `Ctrl+0`, `Ctrl+Enter`, `Ctrl+G`
  - `Ctrl+Shift+V` paste with connect
- Clipboard behavior now supports multi-node graph copy/paste:
  - copy keeps selected nodes + internal edges + reroute points
  - paste restores internal topology and preserves node widget/config state
  - legacy single-node clipboard data is still accepted
- Added `Comfy.Edit.PasteWithConnect`:
  - command + keybinding + context-menu entry are wired
  - when source nodes are selected, pasted entry nodes auto-link from source outputs
- Canvas context menu now supports quick node creation in parity mode:
  - shows a scrollable `添加节点` list with multiple business node types
  - keeps node creation available even when side library panel is hidden
  - falls back to built-in node type map when runtime node definitions are unavailable

## 2026-03-14 Workflow Parity Capture Protocol (Completed)

- All parity milestones now require a visual acceptance loop:
  - capture official reference screenshot
  - capture local before screenshot
  - implement or refine the target behavior
  - capture local after screenshot
  - write fixed diff checklist JSON
- Local Electron parity capture is now scripted in:
  - `scripts/capture-workflow-parity-local.mjs`
- The default capture scene list now covers `S4` through `S7`.
- All capture artifacts live in:
  - `output/playwright/workflow-parity/`
- Current official reference baseline is reused from the public ComfyUI README page:
  - `https://github.com/Comfy-Org/ComfyUI?tab=readme-ov-file`
  - local reference base: `output/playwright/workflow-parity/comfyui-interface-reference-base.png`

## 2026-03-14 M5 Object Info Lite + Three-Surface Consistency (Completed / Acceptable Delta)

- `workflowGetObjectInfo()` remains the renderer-side primary metadata source.
- Node search scenes now filter with a stable schema-driven keyword (`extract`) instead of corrupted placeholder text.
- Node card and Inspector labels now prefer schema-derived labels / widget metadata in the same order.
- Inspector no longer renders the read-only `Schema Config` overview when a dedicated config editor or schema widget editor is already present.
- Acceptance artifacts:
  - `output/playwright/workflow-parity/S5-node-card-reference.png`
  - `output/playwright/workflow-parity/S5-node-card-before.png`
  - `output/playwright/workflow-parity/S5-node-card-after.png`
  - `output/playwright/workflow-parity/S5-node-card-diff.json`
  - `output/playwright/workflow-parity/S5-inspector-reference.png`
  - `output/playwright/workflow-parity/S5-inspector-before.png`
  - `output/playwright/workflow-parity/S5-inspector-after.png`
  - `output/playwright/workflow-parity/S5-inspector-diff.json`
  - `output/playwright/workflow-parity/S5-node-search-reference.png`
  - `output/playwright/workflow-parity/S5-node-search-before.png`
  - `output/playwright/workflow-parity/S5-node-search-after.png`
  - `output/playwright/workflow-parity/S5-node-search-diff.json`
  - `output/playwright/workflow-parity/S5-summary.md`
- M5 delta note:
  - search / inspector are close to object-info-first consumption
  - node card is still a schema + instance-config hybrid summary, so parity is marked `acceptable delta` rather than `match`

## 2026-03-14 M6 Connection Semantics Parity (Completed / Acceptable Delta)

- Connection validation is now schema-driven by datatype compatibility:
  - incompatible ports are blocked
  - compatible targets are highlighted
- Single-input takeover behavior is enforced when reconnecting the same input slot.
- Parity capture scenes now cover:
  - `S6-port-hover`
  - `S6-drag-connect`
  - `S6-connect-target`
  - `S6-connected-widget-taken`
  - `S6-optional-widget-editable`
- Comfy-mode port rows now emphasize compatibility state at the row level, not only on the socket dot.
- Acceptance artifacts are written beside the scene names above with `reference / before / after / diff.json` naming.
- M6 delta note:
  - `S6-optional-widget-editable` uses `input.manual` as the closest built-in optional-input approximation in this codebase

## 2026-03-14 M7 Runtime Dock as Main Run Console (Completed / Acceptable Delta)

- Bottom runtime dock is now treated as the main execution console for parity work:
  - queue
  - running
  - history
  - selected node status / I/O preview / logs
- Runtime parity capture scenes now cover:
  - `S7-queue-empty`
  - `S7-queued`
  - `S7-running`
  - `S7-node-failed`
  - `S7-history`
  - `S7-selected-node`
- Runtime cards now use stronger visual focus states for:
  - running queue status
  - selected node error state
  - runtime summary strip
- Acceptance artifacts are written beside the scene names above with `reference / before / after / diff.json` naming.
- M7 intentional delta:
  - ComfyUI typically distributes runtime controls differently across its shell
  - KuruHaru intentionally consolidates them into the bottom dock to support internal debugging and node-level I/O review in one place

## Follow-Up

- If more pages adopt the same shell pattern, extract the workflow tokens from `WorkflowDesigner.vue` into a shared theme layer.
- Continue consolidating duplicate runtime and log surfaces so the bottom dock and right inspector do not compete for the same information.
- Keep `useWorkflowDesigner.js` defaults aligned with renderer-side sizing constants whenever node card defaults change.

## 2026-03-15 S4 Node Toolbar Parity Pass (Completed / Acceptable Delta)

- Comfy 模式下的节点头主操作已收口到单一工具栏，不再依赖额外浮动选择条承担单节点主路径。
- `WorkflowDesignerGraphCanvas.vue` 现在在节点头直接暴露：
  - partial execute
  - node docs
  - mute
  - bypass
  - collapse
  - delete
- 旧的字母按钮 `P / M / B / C / x` 仅保留在非 Comfy 模式下。
- Comfy 模式下节点头移除了重复的 runtime status pill，只保留轻量状态点和紧凑图标按钮。
- 本轮验收产物：
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-reference.png`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-before.png`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-after.png`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-diff.json`
  - `output/playwright/workflow-parity/S4/S4-summary.md`
- 当前仍为 `acceptable delta`：
  - 顶部全局运行按钮与右侧属性区仍偏重
  - 底部 Dock 尚未成为唯一运行焦点

## 2026-03-15 S4 External Node Toolbar Pass (Completed / Acceptable Delta)

- Comfy 模式下节点主操作已从节点头内部移到节点外部上方的悬浮工具条。
- 新外置工具条包含：
  - delete
  - node info
  - runtime status
  - adjust size
  - node docs
  - partial execute
  - bypass
  - more actions
- 三点菜单当前提供：
  - rename
  - copy
  - duplicate
  - node info
  - adjust size
  - minimize node
  - pin
  - mute
  - bypass
  - delete
- 验收产物：
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-external-closed-after-v4.png`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-external-menu-after-v3.png`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-external-diff.json`
  - `output/playwright/workflow-parity/S4/S4-node-toolbar-external-summary.md`
- 当前仍是 `acceptable delta`：
  - toolbar 边缘定位仍需继续细抠
  - 顶部 Run 与右侧 Inspector 仍偏重

## 2026-03-15 S4 Run Control Parity Pass (Completed / Acceptable Delta)

- 设计器顶栏右上角已新增 Comfy 风格的单一运行控制块：
  - `Run`
  - `Front`
  - pending count
  - `Stop / Clear`
  - `Queue`
  - `History`
- 顶部运行区不再只是普通文本按钮拼接，而是独立深色 grouped control。
- 交互接线复用现有运行骨架，没有再写第二套运行逻辑：
  - `Run` -> `startRun()`
  - `Front` -> `queueRunCurrentWorkflowFront()`
  - `Stop / Clear` -> 运行中 `cancelRun()` / 空闲时 `clearPendingQueue()`
  - `Queue` / `History` -> 聚焦现有底部 runtime dock
- 为保证浏览器截图验收稳定，`src/renderer/src/main.js` 现补了一层 browser preview mock bridge：
  - workflow flat methods
  - workflow namespace methods
  - config load/save fallback
  - system avatar/image fallback
- 本轮验收产物：
  - `output/playwright/workflow-parity/S4/S4-run-control-reference.png`
  - `output/playwright/workflow-parity/S4/S4-run-control-before.png`
  - `output/playwright/workflow-parity/S4/S4-run-control-after.png`
  - `output/playwright/workflow-parity/S4/S4-run-control-diff.json`
  - `output/playwright/workflow-parity/S4/S4-run-control-summary.md`
  - `output/playwright/workflow-parity/S4/S4-run-control-after-wide.png`
  - `output/playwright/workflow-parity/S4/S4-run-control-runtime-dock-after.png`
- 当前仍为 `acceptable delta`：
  - Save / Validate 仍在左侧，尚未完全并入官方那种整体顶栏壳
  - 顶部运行块与底部运行台的视觉耦合还不够紧
  - 节点工具条仍采用 KuruHaru 的外置悬浮方案，这是本轮 intentional delta

## 2026-03-15 S4 Layout Tight Pass (Completed / Acceptable Delta)

- 顶栏命令区进一步收口：
  - `Save`
  - `Validate`
  - `Run`
  - `Front`
  - queue count
  - `Stop / Clear`
  - `Queue`
  - `History`
  现在以统一 shell 呈现，而不是左右两块松散漂浮。
- 右侧 Inspector 在 Comfy 模式下进一步降权：
  - 窄列宽度
  - 更轻的 panel chrome
  - 更紧凑的 tabs / 标题 / 状态 pill
  - 右侧仅保留运行摘要与属性编辑，队列 / 历史 / 日志统一收纳到底部 Runtime Dock，避免信息重复
- 本轮还修掉了一个真实布局 bug：
  - `panel-stack.right` 继承旧 `grid-area: right`
  - 在 `WorkflowDesignerCenterHub` 的二列 grid 里制造了隐式列
  - 导致右侧出现大块无意义空白
  - 现已在 `WorkflowDesignerCenterHub.vue` 中显式钉死 canvas / inspector 列位
- 本轮验收产物：
  - `output/playwright/workflow-parity/S4/S4-layout-tight-reference.png`
  - `output/playwright/workflow-parity/S4/S4-layout-tight-before.png`
  - `output/playwright/workflow-parity/S4/S4-layout-tight-after.png`
  - `output/playwright/workflow-parity/S4/S4-layout-tight-diff.json`
  - `output/playwright/workflow-parity/S4/S4-layout-tight-summary.md`
- 当前仍为 `acceptable delta`：
  - workflow 标题区还不是 Comfy 那种 dropdown + plus 的头部模型
  - 顶栏图标语义和官方还没完全一致

## 2026-03-15 S9 External Node Toolbar + Canvas Nav Tools (Completed / Acceptable Delta)

- Comfy ?????????????????????????????????????
  - `Node Docs`
  - `Partial Execute`
  - runtime status
  - `Node Info`
  - `Bypass`
  - `More Actions`
  - `Delete`
- ????????????????????????????????????
  - `Move Mode`
  - `Pan Mode`
  - `Toggle Minimap`
  - `Toggle Links`
- `Pan Mode` ??????????????????
  - ?????????? `pan` ?????
  - ????? `Space + ??` ?????
- ?????????? `workflowCanvas` store?
  - `navigationMode`
  - `minimapVisible`
  - `linkVisible`
- ???????
  - `output/playwright/workflow-parity/S9-node-toolbar-reference.png`
  - `output/playwright/workflow-parity/S9-node-toolbar-before.png`
  - `output/playwright/workflow-parity/S9-node-toolbar-after.png`
  - `output/playwright/workflow-parity/S9-node-toolbar-diff.json`
  - `output/playwright/workflow-parity/S9-canvas-nav-reference.png`
  - `output/playwright/workflow-parity/S9-canvas-nav-before.png`
  - `output/playwright/workflow-parity/S9-canvas-nav-after.png`
  - `output/playwright/workflow-parity/S9-canvas-nav-after-interaction.png`
  - `output/playwright/workflow-parity/S9-canvas-nav-diff.json`
  - `output/playwright/workflow-parity/S9-summary.md`
- ???? `acceptable delta`?
  - ???????? KuruHaru ???????? intentional delta
  - ??????????????????????????????


## 2026-03-16 S10 Compact Workspace Height Pass (Completed / Acceptable Delta)

- Comfy ????????????????????????????????????
- ?????? 3 ????????
  - `WorkflowDesigner.vue` ? `.comfy-shell` ?????? `clamp` ??
  - `WorkflowDesignerCenterHub.vue` ??? runtime dock ? `168px` ?? `152px`
  - `workflow-designer.css` ?? `.flow-canvas-shell` ????????????
- ??????? minimap ???
  - ??
  - ???
  - ????????????
- ???????
  - `output/playwright/workflow-parity/S10-compact-workspace-reference.png`
  - `output/playwright/workflow-parity/S10-compact-workspace-before.png`
  - `output/playwright/workflow-parity/S10-compact-workspace-after.png`
  - `output/playwright/workflow-parity/S10-compact-workspace-diff.json`
  - `output/playwright/workflow-parity/S10-compact-nav-after.png`
  - `output/playwright/workflow-parity/S10-summary.md`
- ???? `acceptable delta`?
  - ?? Inspector ??? KuruHaru ???????? intentional delta
  - ???????????????????????????????????????????

## 2026-03-16 S11 Node Menu Anchor Pass (Completed / Acceptable Delta)

- ?? `More Actions` ??????????????????????????
- `WorkflowDesignerGraphCanvas.vue` ???? `floatingNodeToolbarMenuStyle` ???????
- `More Actions` ???? `.comfy-node-toolbar-menu-anchor`??????????????
- `workflow-designer.css` ?? `.comfy-node-toolbar-menu` ?? `top + right` ???????? `translateX(-50%)`?
- ???????
  - `output/playwright/workflow-parity/S11-node-menu-reference.png`
  - `output/playwright/workflow-parity/S11-node-menu-before.png`
  - `output/playwright/workflow-parity/S11-node-menu-after.png`
  - `output/playwright/workflow-parity/S11-node-menu-diff.json`
  - `output/playwright/workflow-parity/S11-summary.md`
- ?????`acceptable delta`
  - ???????????????????
  - ????? chrome ??? KuruHaru ??????????? intentional delta?

## 2026-03-16 S12 Node Toolbar Order + Icon Refresh (Completed / Acceptable Delta)

- ????????????????? 8 ??????
  - `Partial Execute`
  - `Runtime Status`
  - `Bypass`
  - `Pin`
  - `Node Info`
  - `Rename`
  - `Delete`
  - `Node Docs`
- ??????? `More Actions` ???????????????????
- ????????????? ComfyUI ??? icon ???
- ???????????group gap?separator ? icon ?????????
- `Partial Execute` ???????? disabled ????????????
- ???????
  - `output/playwright/workflow-parity/S12-node-toolbar-reference.png`
  - `output/playwright/workflow-parity/S12-node-toolbar-before.png`
  - `output/playwright/workflow-parity/S12-node-toolbar-after.png`
  - `output/playwright/workflow-parity/S12-node-toolbar-diff.json`
  - `output/playwright/workflow-parity/S12-summary.md`
- ?????`acceptable delta`
  - ??????????????????????
  - ?????? KuruHaru ???????? intentional delta?

## 2026-03-16 S13 Node Menu Content Restore (Completed / Acceptable Delta)

- ??????????? `...` ??????????????????
- ???????
  - `Rename`
  - `Copy`
  - `Duplicate`
  - `Node Info`
  - `Adjust Size`
  - `Minimize Node`
  - `Pin`
  - `Mute`
  - `Bypass`
  - `Delete`
- ????????????????????????????????
- ???????
  - `output/playwright/workflow-parity/S13-node-menu-content-reference.png`
  - `output/playwright/workflow-parity/S13-node-menu-content-before.png`
  - `output/playwright/workflow-parity/S13-node-menu-content-after.png`
  - `output/playwright/workflow-parity/S13-node-menu-content-diff.json`
  - `output/playwright/workflow-parity/S13-summary.md`
- ?????`acceptable delta`
  - ???????????????
  - ??????? KuruHaru ??????? intentional delta?

## 2026-03-16 S14 Navigator Raise Pass (Completed / Acceptable Delta)

- ???????????????????????????????????? `196px`?
- ??????????????????????????
- ?????????? `178px`?padding ?? `6px`????????????
- ???????
  - `output/playwright/workflow-parity/S14-nav-height-before.png`
  - `output/playwright/workflow-parity/S14-nav-height-after.png`
  - `output/playwright/workflow-parity/S14-nav-height-diff.json`
  - `output/playwright/workflow-parity/S14-summary.md`
- ?????`acceptable delta`
  - ??????????
  - ?????????????????? 

