<template>
  <aside class="library-drawer" :class="{ expanded: pinned }">
    <div class="drawer-shell">
      <div class="drawer-topbar">
        <div class="drawer-heading">
          <p class="drawer-kicker">NODE PALETTE</p>
          <div class="drawer-title-row">
            <h3>节点库与流程仓库</h3>
            <span class="drawer-chip">{{ groups.length }} 组</span>
          </div>
          <p class="drawer-copy">
            按类别检索可拖拽节点，或切换到已保存的工作流蓝图。
          </p>
        </div>

        <button
          type="button"
          class="drawer-toggle"
          :aria-expanded="pinned"
          @click="handleTogglePin"
        >
          {{ pinned ? "收起面板" : "展开面板" }}
        </button>
      </div>

      <div v-show="pinned" class="drawer-body">
        <section class="drawer-card">
          <div class="card-head">
            <div>
              <h4>节点素材库</h4>
              <p>按功能区搜索后，点击或拖拽到画布</p>
            </div>
            <span>{{ groups.length }} 组</span>
          </div>

          <label class="search-box" for="workflow-node-search">
            <span>节点搜索</span>
            <input
              id="workflow-node-search"
              :value="searchValue"
              class="input"
              placeholder="输入节点名称或类型"
              @input="emit('update:searchValue', $event.target.value)"
            />
          </label>

          <div class="palette-scroll">
            <section
              v-for="group in groups"
              :key="group.category"
              class="palette-group"
            >
              <header class="group-title">
                <span>{{ group.displayLabel }}</span>
                <small>{{ group.items.length }}</small>
              </header>

              <button
                v-for="nodeDef in group.items"
                :key="nodeDef.type"
                type="button"
                class="palette-node"
                draggable="true"
                @click="emit('add-node', nodeDef.type)"
                @dragstart="handleDragStart($event, nodeDef.type)"
              >
                <span class="node-badge">{{ nodeDef.badge }}</span>
                <span class="node-meta">
                  <strong>{{ nodeDef.label }}</strong>
                  <small>{{ nodeDef.type }}</small>
                </span>
              </button>
            </section>

            <div v-if="!groups.length" class="empty-hint">没有匹配节点</div>
          </div>
        </section>

        <section class="drawer-card saved-panel">
          <div class="card-head">
            <div>
              <h4>工作流仓库</h4>
              <p>复用已保存的蓝图，快速回到常用编排</p>
            </div>
            <span>{{ workflowSummaries.length }} 条</span>
          </div>

          <div class="saved-list">
            <div
              v-for="item in workflowSummaries"
              :key="item.id"
              class="saved-item"
              :class="{ active: activeWorkflowId === item.id }"
            >
              <button
                type="button"
                class="saved-open"
                @click="emit('load-workflow', item.id)"
              >
                <span class="saved-item-main">
                  <strong>{{ item.name || item.id }}</strong>
                  <small
                    >{{ item.nodeCount }} 节点 ·
                    {{ item.edgeCount }} 连线</small
                  >
                </span>
              </button>
              <button
                type="button"
                class="saved-delete"
                title="删除工作流"
                @click.stop="emit('remove-workflow', item.id)"
              >
                删除
              </button>
            </div>

            <div v-if="!workflowSummaries.length" class="empty-hint">
              暂无已保存工作流
            </div>
          </div>
        </section>
      </div>
    </div>
  </aside>
</template>

<script setup>
const props = defineProps({
  pinned: {
    type: Boolean,
    default: false,
  },
  groups: {
    type: Array,
    default: () => [],
  },
  searchValue: {
    type: String,
    default: "",
  },
  workflowSummaries: {
    type: Array,
    default: () => [],
  },
  activeWorkflowId: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "update:pinned",
  "update:searchValue",
  "add-node",
  "load-workflow",
  "remove-workflow",
  "drag-node-start",
]);

const handleTogglePin = () => {
  emit("update:pinned", !props.pinned);
};

const handleDragStart = (event, nodeType) => {
  if (!event?.dataTransfer) {
    return;
  }

  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-workflow-node-type", nodeType);
  emit("drag-node-start", nodeType);
};
</script>

<style scoped>
.library-drawer {
  position: sticky;
  top: 0;
  --wf-panel-accent: var(--wf-panel-accent, var(--wf-accent-cool, #44d7cd));
  --wf-panel-outline: var(--wf-panel-outline, rgba(68, 215, 205, 0.28));
  --wf-panel-outline-strong: var(
    --wf-panel-outline-strong,
    rgba(68, 215, 205, 0.42)
  );
  --wf-panel-surface: var(
    --wf-panel-surface,
    linear-gradient(165deg, rgba(8, 34, 36, 0.96), rgba(13, 15, 18, 0.94))
  );
  --wf-panel-surface-2: var(
    --wf-panel-surface-2,
    linear-gradient(160deg, rgba(9, 27, 29, 0.94), rgba(14, 16, 19, 0.92))
  );
  --wf-panel-chip-bg: var(--wf-panel-chip-bg, rgba(8, 27, 29, 0.74));
  --wf-panel-shadow: var(
    --wf-panel-shadow,
    0 1.4rem 2.8rem rgba(3, 25, 27, 0.32)
  );
  --wf-panel-muted: var(--wf-panel-muted, #b7d2cd);
}

.drawer-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.8rem;
  border: 1px solid var(--wf-panel-outline);
  border-radius: 1.25rem;
  background: var(--wf-panel-surface);
  box-shadow: var(--wf-panel-shadow);
  backdrop-filter: blur(18px);
}

.drawer-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 245, 230, 0.04);
  pointer-events: none;
}

.drawer-shell::after {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 0.28rem;
  border-radius: 1.25rem 1.25rem 0 0;
  background: linear-gradient(
    90deg,
    var(--wf-panel-accent),
    rgba(255, 255, 255, 0)
  );
  pointer-events: none;
}

.drawer-topbar {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 18%, rgba(255, 245, 230, 0.06));
}

.drawer-heading {
  display: grid;
  gap: 0.375rem;
}

.drawer-kicker,
.overview-chip {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--wf-panel-accent) 78%, #ffffff 22%);
}

.drawer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.drawer-title-row h3 {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.2;
  letter-spacing: 0.01em;
  font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
  color: var(--wf-text-strong, #ebf4ff);
}

.drawer-chip,
.card-head span,
.group-title small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 38%, rgba(255, 245, 230, 0.08));
  background: var(--wf-panel-chip-bg);
  font-size: 0.75rem;
  color: var(--wf-panel-muted);
}

.drawer-copy,
.card-head p,
.empty-hint,
.node-meta small,
.saved-item-main small {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--wf-panel-muted);
}

.drawer-toggle {
  min-height: 2.35rem;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 44%, rgba(255, 245, 230, 0.1));
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    rgba(7, 22, 24, 0.94),
    rgba(9, 12, 15, 0.92)
  );
  color: var(--wf-text-strong, #ebf4ff);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.drawer-body {
  display: grid;
  gap: 0.875rem;
}

.drawer-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  padding: 0.75rem;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 26%, rgba(255, 245, 230, 0.06));
  border-radius: 1rem;
  background: var(--wf-panel-surface-2);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 16%, rgba(255, 245, 230, 0.06));
}

.card-head h4 {
  margin: 0;
  font-size: 0.92rem;
  letter-spacing: 0.01em;
  font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
  color: var(--wf-text-strong, #ebf4ff);
}

.search-box {
  display: grid;
  gap: 0.42rem;
  font-size: 0.8rem;
  color: var(--wf-panel-muted);
}

.input {
  width: 100%;
  min-height: 2.55rem;
  box-sizing: border-box;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 28%, rgba(255, 245, 230, 0.06));
  border-radius: 0.9rem;
  background: rgba(7, 16, 18, 0.82);
  color: var(--wf-text-strong, #ebf4ff);
  padding: 0.75rem 0.875rem;
}

.palette-scroll,
.saved-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 0;
  max-height: min(26rem, 42vh);
  overflow: auto;
  padding-right: 0.125rem;
}

.palette-group {
  display: grid;
  gap: 0.5rem;
}

.group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.82rem;
  color: var(--wf-panel-muted);
}

.palette-node,
.saved-open,
.saved-delete {
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 24%, rgba(255, 245, 230, 0.06));
  background: linear-gradient(
    160deg,
    rgba(7, 22, 24, 0.92),
    rgba(11, 14, 16, 0.9)
  );
  color: var(--wf-text-strong, #ebf4ff);
}

.palette-node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.72rem;
  padding: 0.74rem 0.82rem;
  border-radius: 1rem;
  text-align: left;
  cursor: pointer;
}

.palette-node:hover,
.saved-open:hover,
.saved-delete:hover,
.drawer-toggle:hover {
  border-color: var(--wf-panel-outline-strong);
  box-shadow: 0 0.9rem 1.8rem rgba(3, 25, 27, 0.24);
}

.node-badge {
  min-width: 2rem;
  height: 2rem;
  border-radius: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--wf-panel-accent) 42%, rgba(255, 245, 230, 0.08)),
    rgba(18, 14, 14, 0.58)
  );
  border: 1px solid rgba(255, 245, 230, 0.08);
  font-size: 0.72rem;
  font-weight: 700;
}

.node-meta,
.saved-item-main {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.node-meta strong,
.saved-item-main strong {
  font-size: 0.92rem;
  line-height: 1.3;
}

.saved-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.625rem;
}

.saved-item.active .saved-open {
  border-color: var(--wf-panel-outline-strong);
  box-shadow: 0 0 0 1px
    color-mix(in srgb, var(--wf-panel-accent) 30%, transparent);
}

.saved-open {
  width: 100%;
  display: flex;
  align-items: center;
  min-height: 3.15rem;
  padding: 0.8rem 0.875rem;
  border-radius: 1rem;
  text-align: left;
  cursor: pointer;
}

.saved-delete {
  min-width: 3.25rem;
  min-height: 3.15rem;
  padding: 0 0.875rem;
  border-radius: 1rem;
  color: #ffd6d9;
  background: rgba(221, 105, 118, 0.14);
  cursor: pointer;
}

@media (min-width: 768px) {
  .drawer-topbar {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }

  .drawer-toggle {
    min-width: 6.5rem;
  }
}
</style>
