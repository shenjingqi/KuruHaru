<template>
  <section
    class="runtime-dock"
    :class="{ expanded: logDockExpanded, resizing: runtimeDockResizing }"
    :style="runtimeDockStyle"
  >
    <div
      v-if="logDockExpanded"
      class="dock-resize-handle"
      title="拖拽调整运行台高度"
      @pointerdown.prevent="startRuntimeDockResize"
    >
      <span class="dock-resize-grip" />
    </div>

    <button
      type="button"
      class="dock-toggle"
      @click="logDockExpanded = !logDockExpanded"
    >
      {{ logDockExpanded ? "收起运行台" : "展开运行台" }}
    </button>

    <div v-if="logDockExpanded" class="dock-body runtime-dock-body">
      <div class="runtime-dock-toolbar">
        <div class="dock-tabs">
          <button
            v-for="tab in runtimeTabs"
            :key="tab.value"
            type="button"
            class="dock-tab"
            :class="{ active: runtimeDockTab === tab.value }"
            @click="runtimeDockTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="runtime-dock-actions">
          <button
            type="button"
            class="dock-action"
            @click="validateCurrentWorkflow"
          >
            校验
          </button>
          <button type="button" class="dock-action primary" @click="startRun">
            加入队列
          </button>
          <button
            type="button"
            class="dock-action"
            @click="queueRunCurrentWorkflowFront"
          >
            前插运行
          </button>
          <button
            type="button"
            class="dock-action danger"
            :disabled="!isRunInProgress"
            @click="cancelRun"
          >
            停止
          </button>
        </div>
      </div>

      <div
        v-if="runtimeDockTab === 'queue'"
        class="runtime-dock-panel runtime-grid"
      >
        <section class="runtime-card runtime-card-queue">
          <div class="history-title">待执行</div>
          <div v-if="queueStore.pending.length" class="runtime-list">
            <article
              v-for="item in queueStore.pending"
              :key="`pending-${item.runId}`"
              class="runtime-row"
            >
              <strong>{{
                item.workflowName || item.workflowId || item.runId
              }}</strong>
              <small>{{ item.runId }}</small>
            </article>
          </div>
          <div v-else class="empty-hint">当前队列为空</div>
        </section>

        <section class="runtime-card runtime-card-running">
          <div class="history-title">运行中</div>
          <div v-if="queueStore.running.length" class="runtime-list">
            <article
              v-for="item in queueStore.running"
              :key="`running-${item.runId}`"
              class="runtime-row"
            >
              <div>
                <strong>{{
                  item.workflowName || item.workflowId || item.runId
                }}</strong>
                <small>{{ item.runId }}</small>
              </div>
              <span
                class="run-item-status"
                :class="getStatusClassByValue(item.status)"
              >
                {{ getRunStatusLabel(item.status) }}
              </span>
            </article>
          </div>
          <div v-else class="empty-hint">暂无运行中的工作流</div>
        </section>

        <section class="runtime-card runtime-card-wide runtime-card-status">
          <div class="history-title">当前状态</div>
          <div class="runtime-summary-grid">
            <div class="summary-chip">
              <span>当前运行</span>
              <strong>{{ activeRunId || "—" }}</strong>
            </div>
            <div class="summary-chip">
              <span>状态</span>
              <strong>{{ getRunStatusLabel(activeRunStatus) }}</strong>
            </div>
            <div class="summary-chip">
              <span>校验</span>
              <strong>{{ validationState.ok ? "通过" : "存在问题" }}</strong>
            </div>
            <div class="summary-chip">
              <span>队列更新时间</span>
              <strong>{{
                formatTimestampLabel(queueStore.lastUpdatedAt) || "刚刚"
              }}</strong>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="runtimeDockTab === 'history'" class="runtime-dock-panel">
        <div class="history-title">历史记录</div>
        <div v-if="runHistory.length" class="runtime-list history-list">
          <article
            v-for="run in runHistory"
            :key="run.runId"
            class="runtime-row history-row"
          >
            <div class="history-main">
              <strong>{{
                run.workflowName || run.workflowId || run.runId
              }}</strong>
              <small
                >{{ run.runId }} ·
                {{ formatTimestampLabel(run.startedAt) }}</small
              >
            </div>
            <span
              class="run-item-status"
              :class="getStatusClassByValue(run.status)"
            >
              {{ getRunStatusLabel(run.status) }}
            </span>
            <div class="history-actions">
              <button
                type="button"
                class="dock-action"
                @click="inspectRunHistoryItem(run)"
              >
                查看
              </button>
              <button
                type="button"
                class="dock-action"
                @click="rerunHistoryItem(run)"
              >
                重跑
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty-hint">暂无历史记录</div>
      </div>

      <div
        v-else-if="runtimeDockTab === 'selected'"
        class="runtime-dock-panel runtime-grid"
      >
        <section
          class="runtime-card runtime-card-selected"
          :class="{ 'runtime-card-error': selectedNodeRunState?.error }"
        >
          <div class="history-title">选中节点</div>
          <div v-if="selectedNode" class="runtime-stack">
            <strong>{{ resolveNodeLabel(selectedNode) }}</strong>
            <small>{{ selectedNode.id }} · {{ selectedNode.type }}</small>
            <small v-if="selectedNodeObjectInfo?.description">{{
              selectedNodeObjectInfo.description
            }}</small>
            <span class="run-item-status" :class="selectedNodeRunStatusClass">
              {{ getRunStatusLabel(selectedNodeRunState?.status || "idle") }}
            </span>
            <small>{{ selectedNodeRunDuration || "尚未执行" }}</small>
          </div>
          <div v-else class="empty-hint">请先选择节点</div>
        </section>

        <section class="runtime-card">
          <div class="history-title">输入预览</div>
          <pre class="dock-console compact">{{
            formatRuntimePreview(selectedNodeRunState?.inputPreview)
          }}</pre>
        </section>

        <section class="runtime-card">
          <div class="history-title">输出预览</div>
          <pre class="dock-console compact">{{
            formatRuntimePreview(selectedNodeRunState?.outputPreview)
          }}</pre>
        </section>

        <section class="runtime-card runtime-card-wide">
          <div class="history-title">节点日志</div>
          <pre class="dock-console">{{
            selectedNodeLogs.join("\n") || "暂无节点日志"
          }}</pre>
        </section>
      </div>

      <div v-else class="runtime-dock-panel runtime-grid">
        <section class="runtime-card runtime-card-wide">
          <div class="runtime-dock-toolbar runtime-dock-toolbar-sub">
            <div class="dock-tabs">
              <button
                type="button"
                class="dock-tab"
                :class="{ active: logDockScope === 'workflow' }"
                @click="logDockScope = 'workflow'"
              >
                流程
              </button>
              <button
                type="button"
                class="dock-tab"
                :class="{ active: logDockScope === 'node' }"
                @click="logDockScope = 'node'"
              >
                节点
              </button>
              <button
                type="button"
                class="dock-tab"
                :class="{ active: logDockScope === 'pipeline' }"
                @click="logDockScope = 'pipeline'"
              >
                流水线
              </button>
            </div>
            <input
              v-model="dockLogKeyword"
              class="input dock-search"
              placeholder="关键词过滤"
            />
          </div>
          <pre class="dock-console">{{
            dockFilteredLogLines.join("\n") || dockLogEmptyText
          }}</pre>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);

const {
  logDockExpanded,
  runtimeDockTab,
  logDockScope,
  dockLogKeyword,
  dockFilteredLogLines,
  dockLogEmptyText,
  queueStore,
  runHistory,
  activeRunId,
  activeRunStatus,
  isRunInProgress,
  validationState,
  selectedNode,
  selectedNodeObjectInfo,
  selectedNodeRunState,
  selectedNodeRunStatusClass,
  selectedNodeRunDuration,
  selectedNodeLogs,
  resolveNodeLabel,
  getRunStatusLabel,
  getStatusClassByValue,
  formatTimestampLabel,
  formatRuntimePreview,
  validateCurrentWorkflow,
  startRun,
  cancelRun,
  queueRunCurrentWorkflowFront,
  inspectRunHistoryItem,
  rerunHistoryItem,
} = context;

const runtimeTabs = computed(() => [
  { label: "队列", value: "queue" },
  { label: "历史", value: "history" },
  { label: "选中", value: "selected" },
  { label: "日志", value: "logs" },
]);

const RUNTIME_DOCK_COLLAPSED_HEIGHT = 32;
const RUNTIME_DOCK_DEFAULT_HEIGHT = 320;
const RUNTIME_DOCK_MIN_HEIGHT = 220;
const RUNTIME_DOCK_STORAGE_KEY = "workflow.runtimeDockHeight";

const readStoredRuntimeDockHeight = () => {
  if (typeof window === "undefined") {
    return RUNTIME_DOCK_DEFAULT_HEIGHT;
  }

  const rawValue = window.localStorage.getItem(RUNTIME_DOCK_STORAGE_KEY);
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isFinite(parsed) ? parsed : RUNTIME_DOCK_DEFAULT_HEIGHT;
};

const clampRuntimeDockHeight = (rawHeight) => {
  if (typeof window === "undefined") {
    return Math.max(RUNTIME_DOCK_MIN_HEIGHT, rawHeight);
  }

  const viewportMaxHeight = Math.max(
    RUNTIME_DOCK_MIN_HEIGHT,
    Math.min(Math.round(window.innerHeight * 0.62), window.innerHeight - 96),
  );
  return Math.min(
    viewportMaxHeight,
    Math.max(RUNTIME_DOCK_MIN_HEIGHT, rawHeight),
  );
};

const runtimeDockHeight = ref(
  clampRuntimeDockHeight(readStoredRuntimeDockHeight()),
);
const runtimeDockResizing = ref(false);

const runtimeDockStyle = computed(() => {
  const height = logDockExpanded.value
    ? clampRuntimeDockHeight(runtimeDockHeight.value)
    : RUNTIME_DOCK_COLLAPSED_HEIGHT;

  return {
    minHeight: `${height}px`,
    height: `${height}px`,
    maxHeight: `${height}px`,
  };
});

let stopRuntimeDockResizeListeners = null;
const handleWindowResize = () => {
  runtimeDockHeight.value = clampRuntimeDockHeight(runtimeDockHeight.value);
};

const persistRuntimeDockHeight = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RUNTIME_DOCK_STORAGE_KEY,
    String(clampRuntimeDockHeight(runtimeDockHeight.value)),
  );
};

const detachRuntimeDockResizeListeners = () => {
  if (typeof stopRuntimeDockResizeListeners === "function") {
    stopRuntimeDockResizeListeners();
    stopRuntimeDockResizeListeners = null;
  }
  runtimeDockResizing.value = false;
};

const startRuntimeDockResize = (event) => {
  if (typeof window === "undefined") {
    return;
  }

  detachRuntimeDockResizeListeners();

  const startY = event.clientY;
  const startHeight = clampRuntimeDockHeight(runtimeDockHeight.value);
  runtimeDockResizing.value = true;

  const handlePointerMove = (moveEvent) => {
    const delta = startY - moveEvent.clientY;
    runtimeDockHeight.value = clampRuntimeDockHeight(startHeight + delta);
  };

  const handlePointerUp = () => {
    persistRuntimeDockHeight();
    detachRuntimeDockResizeListeners();
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp, { once: true });

  stopRuntimeDockResizeListeners = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  };
};

watch(logDockExpanded, (expanded) => {
  if (!expanded) {
    detachRuntimeDockResizeListeners();
    return;
  }

  runtimeDockHeight.value = clampRuntimeDockHeight(runtimeDockHeight.value);
});

if (typeof window !== "undefined") {
  window.addEventListener("resize", handleWindowResize);
}

onBeforeUnmount(() => {
  detachRuntimeDockResizeListeners();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleWindowResize);
  }
});
</script>

<style scoped>
.runtime-dock {
  display: flex;
  flex-direction: column;
}

.dock-resize-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 12px;
  cursor: ns-resize;
  border-bottom: 1px solid rgba(217, 138, 55, 0.1);
  background: linear-gradient(
    180deg,
    rgba(58, 34, 18, 0.18),
    rgba(24, 18, 14, 0)
  );
}

.dock-resize-grip {
  width: 48px;
  height: 4px;
  border-radius: 999px;
  background: rgba(244, 197, 107, 0.32);
  box-shadow: 0 0 0 1px rgba(20, 10, 4, 0.22);
}

.runtime-dock.resizing .dock-resize-grip,
.dock-resize-handle:hover .dock-resize-grip {
  background: rgba(244, 197, 107, 0.58);
}

.runtime-dock-body {
  min-height: 0;
  overflow: auto;
  flex: 1;
  gap: 0.9rem;
}

.runtime-dock-toolbar,
.runtime-dock-toolbar-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.runtime-dock-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.runtime-dock-panel,
.runtime-grid {
  min-height: 0;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.runtime-card {
  min-height: 0;
  display: grid;
  gap: 0.55rem;
  padding: 0.68rem;
  border: 1px solid rgba(217, 138, 55, 0.16);
  border-radius: 0.7rem;
  background: rgba(18, 16, 18, 0.68);
}

.runtime-card-queue {
  border-color: rgba(124, 160, 219, 0.22);
}

.runtime-card-running {
  border-color: rgba(87, 214, 122, 0.34);
  box-shadow: inset 0 0 0 1px rgba(87, 214, 122, 0.08);
}

.runtime-card-status {
  background: linear-gradient(
    180deg,
    rgba(24, 25, 30, 0.86),
    rgba(14, 15, 19, 0.82)
  );
}

.runtime-card-selected.runtime-card-error {
  border-color: rgba(216, 105, 119, 0.42);
  box-shadow: inset 0 0 0 1px rgba(216, 105, 119, 0.12);
}

.runtime-card-wide {
  grid-column: 1 / -1;
}

.runtime-list,
.runtime-stack {
  display: grid;
  gap: 0.45rem;
}

.runtime-row,
.history-row {
  display: grid;
  gap: 0.5rem;
  padding: 0.56rem 0.62rem;
  border: 1px solid rgba(217, 138, 55, 0.12);
  border-radius: 0.65rem;
  background: rgba(8, 9, 12, 0.82);
}

.history-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
}

.history-main {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.history-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.runtime-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}

.summary-chip {
  display: grid;
  gap: 0.2rem;
  padding: 0.6rem;
  border-radius: 0.65rem;
  background: rgba(255, 255, 255, 0.04);
}

.summary-chip span,
.runtime-row small,
.runtime-stack small {
  color: #aaaeb9;
  font-size: 0.72rem;
}

.summary-chip strong,
.runtime-row strong,
.runtime-stack strong {
  color: #f1f3f7;
}

.dock-action {
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(217, 138, 55, 0.18);
  border-radius: 0.55rem;
  background: rgba(22, 18, 16, 0.88);
  color: #f3e7d0;
  cursor: pointer;
}

.dock-action.primary {
  border-color: rgba(244, 197, 107, 0.38);
}

.dock-action.danger {
  border-color: rgba(221, 105, 118, 0.32);
  color: #ffd7dc;
}

.dock-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dock-search {
  min-width: min(18rem, 100%);
}

@media (max-width: 1080px) {
  .runtime-grid,
  .runtime-summary-grid,
  .history-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
