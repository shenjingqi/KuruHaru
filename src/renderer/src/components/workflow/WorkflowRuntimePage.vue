<template>
  <section class="workflow-page-shell">
    <header class="workflow-page-hero">
      <div>
        <span class="workflow-page-kicker">工作流 / 运行台</span>
        <h2>运行台</h2>
        <p>
          这里是独立运行控制台，和设计器底部运行台共用同一套队列、运行、历史与恢复报告数据模型。
        </p>
      </div>
      <div class="workflow-page-actions">
        <n-button secondary @click="refreshRuntime">刷新</n-button>
        <n-button v-if="selectedRun" secondary @click="rerunSelected"
          >重新运行</n-button
        >
        <n-button v-if="selectedRun" type="error" @click="cancelSelected"
          >取消运行</n-button
        >
      </div>
    </header>

    <section class="workflow-runtime-grid">
      <article class="workflow-panel runtime-column">
        <div class="panel-title-row">
          <strong>运行队列与历史</strong>
          <span>{{ allRuntimeRows.length }} 条</span>
        </div>
        <div class="runtime-list">
          <button
            v-for="item in allRuntimeRows"
            :key="item.runSessionId || item.runId"
            type="button"
            class="runtime-row"
            :class="[
              `status-${item.status || 'unknown'}`,
              { active: activeRunId === (item.runSessionId || item.runId) },
            ]"
            @click="selectRun(item)"
          >
            <div class="runtime-row-main">
              <strong>{{
                item.workflowName || item.workflowId || "未命名工作流"
              }}</strong>
              <small>{{ formatRunStatus(item.status) }}</small>
            </div>
            <span>{{
              item.durationMs
                ? `${item.durationMs} ms`
                : item.requestedAt || "暂无时间"
            }}</span>
          </button>
        </div>
      </article>

      <article class="workflow-panel runtime-detail">
        <template v-if="selectedRun">
          <div class="panel-title-row">
            <strong>{{
              selectedRun.workflowName || selectedRun.workflowId
            }}</strong>
            <span>{{ formatRunStatus(selectedRun.status) }}</span>
          </div>

          <section class="detail-grid compact-grid">
            <div class="detail-block">
              <h3>运行摘要</h3>
              <div class="kv-grid">
                <span>运行 ID</span
                ><strong>{{ selectedRun.runSessionId }}</strong>
                <span>工作流 ID</span
                ><strong>{{ selectedRun.workflowId || "未命名工作流" }}</strong>
                <span>模式</span
                ><strong>{{ selectedRun.mode || "入队执行" }}</strong>
                <span>耗时</span
                ><strong>{{ selectedRun.durationMs || 0 }} ms</strong>
              </div>
            </div>
            <div class="detail-block">
              <h3>恢复报告</h3>
              <div
                v-if="selectedRecoveryReport?.items?.length"
                class="detail-list"
              >
                <article
                  v-for="item in selectedRecoveryReport.items"
                  :key="item.id"
                  class="detail-list-item compact"
                >
                  <strong>{{ item.title }}</strong>
                  <span>{{ formatRecoveryType(item.type) }}</span>
                  <small>{{ item.message }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">当前运行没有恢复项。</div>
            </div>
          </section>

          <section class="detail-block">
            <h3>节点状态</h3>
            <div v-if="nodeStateRows.length" class="detail-list">
              <article
                v-for="item in nodeStateRows"
                :key="item.nodeId"
                class="detail-list-item compact"
              >
                <strong>{{ item.nodeId }}</strong>
                <span>{{ formatRunStatus(item.status) }}</span>
                <small>
                  {{ item.durationMs ? `${item.durationMs} ms` : "执行中" }}
                  <template v-if="item.error?.message">
                    · {{ item.error.message }}</template
                  >
                </small>
              </article>
            </div>
            <div v-else class="empty-copy">当前运行还没有节点状态记录。</div>
          </section>
        </template>
        <div v-else class="empty-copy">请先从左侧选择一条运行记录。</div>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useWorkflowHubStore } from "../../stores/workflowHub";

const workflowHub = useWorkflowHubStore();
const activeRunId = ref("");

const allRuntimeRows = computed(() => [
  ...workflowHub.runtimeItems.running,
  ...workflowHub.runtimeItems.pending,
  ...workflowHub.runtimeItems.history,
]);
const selectedRun = computed(() => workflowHub.selectedRun);
const selectedRecoveryReport = computed(
  () => workflowHub.selectedRecoveryReport,
);
const nodeStateRows = computed(() =>
  Object.values(selectedRun.value?.nodeStates || {}).sort((left, right) =>
    String(left.nodeId || "").localeCompare(String(right.nodeId || "")),
  ),
);

const formatRunStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  const labels = {
    pending: "待执行",
    running: "运行中",
    succeeded: "成功",
    success: "成功",
    failed: "失败",
    cancelled: "已取消",
    idle: "待命",
    unknown: "未知",
  };

  return labels[normalized] || labels.unknown;
};

const formatRecoveryType = (type) => {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  const labels = {
    "missing-node": "缺失节点",
    "missing-resource": "缺失资源",
    "execution-failure": "执行失败",
  };

  return labels[normalized] || "待处理";
};

const selectRun = async (item) => {
  const runId = item.runSessionId || item.runId;
  activeRunId.value = runId;
  await workflowHub.inspectRun(runId);
};

const refreshRuntime = async () => {
  await workflowHub.bootstrap(true);
  await workflowHub.refreshRuntime();
  if (!activeRunId.value && allRuntimeRows.value.length) {
    await selectRun(allRuntimeRows.value[0]);
  }
};

const rerunSelected = async () => {
  if (!selectedRun.value) {
    return;
  }
  await workflowHub.rerunSession(selectedRun.value);
  await refreshRuntime();
};

const cancelSelected = async () => {
  if (!selectedRun.value?.runSessionId) {
    return;
  }
  await workflowHub.cancelRun(selectedRun.value.runSessionId);
  await refreshRuntime();
};

onMounted(async () => {
  await refreshRuntime();
});
</script>

<style scoped>
.workflow-page-shell {
  display: grid;
  gap: 18px;
}

.workflow-page-hero,
.workflow-panel {
  border: 1px solid rgba(112, 136, 176, 0.18);
  border-radius: 18px;
  background: rgba(12, 18, 28, 0.82);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.workflow-page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
}

.workflow-page-kicker {
  display: inline-flex;
  margin-bottom: 8px;
  color: #9fb2d4;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workflow-page-hero h2,
.detail-block h3,
.runtime-row strong {
  color: #f4f7ff;
}

.workflow-page-hero p,
.empty-copy,
.runtime-row small,
.runtime-row span,
.detail-list-item span,
.detail-list-item small,
.kv-grid span {
  color: #9db0cf;
}

.workflow-page-actions {
  display: inline-flex;
  gap: 10px;
}

.workflow-runtime-grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 18px;
}

.workflow-panel {
  padding: 18px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  color: #dfe7f5;
}

.runtime-list,
.detail-list {
  display: grid;
  gap: 10px;
}

.runtime-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(120, 144, 188, 0.18);
  border-radius: 14px;
  background: rgba(16, 24, 38, 0.88);
  text-align: left;
}

.runtime-row.active,
.runtime-row:hover {
  border-color: rgba(151, 186, 255, 0.52);
}

.runtime-row-main {
  display: grid;
  gap: 4px;
}

.status-running {
  box-shadow: inset 0 0 0 1px rgba(128, 204, 153, 0.35);
}

.status-failed,
.status-cancelled {
  box-shadow: inset 0 0 0 1px rgba(229, 127, 127, 0.32);
}

.detail-grid,
.compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.detail-block {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(16, 24, 38, 0.88);
  margin-bottom: 14px;
}

.kv-grid {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px 12px;
}

.detail-list-item.compact {
  display: grid;
  gap: 4px;
}

@media (max-width: 1100px) {
  .workflow-runtime-grid,
  .detail-grid,
  .workflow-page-hero {
    grid-template-columns: minmax(0, 1fr);
    flex-direction: column;
  }
}
</style>
