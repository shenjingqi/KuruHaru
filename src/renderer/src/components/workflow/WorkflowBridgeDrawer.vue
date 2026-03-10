<template>
  <section class="bridge-drawer" :class="{ expanded: pinned }">
    <div class="bridge-shell">
      <div class="bridge-topbar">
        <div class="bridge-heading">
          <p class="bridge-kicker">RUN CONSOLE</p>
          <div class="bridge-title-row">
            <h3>连线与运行控制台</h3>
            <span class="bridge-chip">{{ nodeCount }} / {{ edgeCount }}</span>
          </div>
          <p class="bridge-copy">
            用节点快选、调度策略与画布工具快速建立可执行的流程链路。
          </p>
        </div>

        <button
          type="button"
          class="bridge-toggle"
          :aria-expanded="pinned"
          @click="handleTogglePin"
        >
          {{ pinned ? "收起面板" : "展开面板" }}
        </button>
      </div>

      <div v-show="pinned" class="bridge-body">
        <div class="bridge-grid">
          <section class="bridge-card">
            <div class="section-head">
              <div>
                <h4>节点连接</h4>
                <p>指定起点与终点，快速生成或删除连线</p>
              </div>
            </div>

            <div class="bridge-line">
              <label class="bridge-field">
                <span>起点节点</span>
                <select
                  :value="sourceNodeId"
                  class="select bridge-select"
                  @change="emit('update:sourceNodeId', $event.target.value)"
                >
                  <option value="">选择起点</option>
                  <option
                    v-for="opt in currentNodeOptions"
                    :key="`source-${opt.value}`"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </label>

              <label class="bridge-field">
                <span>终点节点</span>
                <select
                  :value="targetNodeId"
                  class="select bridge-select"
                  @change="emit('update:targetNodeId', $event.target.value)"
                >
                  <option value="">选择终点</option>
                  <option
                    v-for="opt in currentNodeOptions"
                    :key="`target-${opt.value}`"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </label>
            </div>

            <div class="bridge-actions">
              <button
                type="button"
                class="bridge-btn"
                @click="emit('add-edge')"
              >
                创建连线
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                :disabled="!selectedEdgeId"
                @click="emit('remove-edge')"
              >
                删除选中连线
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="emit('auto-arrange')"
              >
                自动排布
              </button>
            </div>
          </section>

          <section class="bridge-card">
            <div class="section-head">
              <div>
                <h4>运行策略</h4>
                <p>调整调度方式与画布视图，再发起执行</p>
              </div>
              <span class="bridge-chip subtle">{{ canvasZoomPercent }}%</span>
            </div>

            <div class="dispatch-presets">
              <button
                type="button"
                class="preset-btn"
                :class="{ active: runtimeDispatchMode === 'single' }"
                @click="emit('update:runtimeDispatchMode', 'single')"
              >
                逐条
              </button>
              <button
                type="button"
                class="preset-btn"
                :class="{ active: runtimeDispatchMode === 'batch' }"
                @click="emit('update:runtimeDispatchMode', 'batch')"
              >
                批 50
              </button>
              <button
                type="button"
                class="preset-btn"
                :class="{ active: runtimeDispatchMode === 'fanout' }"
                @click="emit('update:runtimeDispatchMode', 'fanout')"
              >
                并行
              </button>
            </div>

            <div class="runtime-toolbar">
              <div class="zoom-cluster">
                <button
                  type="button"
                  class="zoom-btn"
                  :disabled="disableZoomOut"
                  @click="emit('zoom-out')"
                >
                  -
                </button>
                <span>{{ canvasZoomPercent }}%</span>
                <button
                  type="button"
                  class="zoom-btn"
                  :disabled="disableZoomIn"
                  @click="emit('zoom-in')"
                >
                  +
                </button>
              </div>

              <div class="run-actions">
                <button
                  type="button"
                  class="bridge-btn launch"
                  :disabled="isRunInProgress"
                  @click="emit('start-run')"
                >
                  {{ isRunInProgress ? "运行中" : "执行流程" }}
                </button>
                <button
                  type="button"
                  class="bridge-btn stop"
                  :disabled="!isRunInProgress"
                  @click="emit('cancel-run')"
                >
                  终止执行
                </button>
              </div>
            </div>
          </section>
        </div>

        <section class="bridge-card bridge-picker-card">
          <div class="section-head">
            <div>
              <h4>节点快选</h4>
              <p>点击可定位到画布，右侧按钮可直接指定连接角色</p>
            </div>
            <span class="bridge-chip subtle"
              >{{ nodePickerItems.length }} 个</span
            >
          </div>

          <div class="picker-list">
            <article
              v-for="item in nodePickerItems"
              :key="`picker-${item.id}`"
              class="picker-node"
              :class="[
                `status-${item.status}`,
                `cat-${item.categoryKey}`,
                { selected: selectedNodeId === item.id },
                { 'as-source': sourceNodeId === item.id },
                { 'as-target': targetNodeId === item.id },
              ]"
              :style="{ '--picker-accent': item.accent }"
            >
              <button
                type="button"
                class="picker-main"
                @click="emit('focus-node', item.id)"
              >
                <strong>{{ item.label }}</strong>
                <small>{{ item.type }}</small>
              </button>
              <div class="picker-actions">
                <button
                  type="button"
                  class="picker-assign source"
                  @click="emit('assign-source', item.id)"
                >
                  起
                </button>
                <button
                  type="button"
                  class="picker-assign target"
                  @click="emit('assign-target', item.id)"
                >
                  终
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  pinned: { type: Boolean, default: false },
  nodeCount: { type: Number, default: 0 },
  edgeCount: { type: Number, default: 0 },
  sourceNodeId: { type: String, default: "" },
  targetNodeId: { type: String, default: "" },
  currentNodeOptions: { type: Array, default: () => [] },
  nodePickerItems: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: "" },
  selectedEdgeId: { type: String, default: "" },
  runtimeDispatchMode: { type: String, default: "single" },
  canvasZoomPercent: { type: Number, default: 100 },
  disableZoomIn: { type: Boolean, default: false },
  disableZoomOut: { type: Boolean, default: false },
  isRunInProgress: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:pinned",
  "update:sourceNodeId",
  "update:targetNodeId",
  "update:runtimeDispatchMode",
  "focus-node",
  "assign-source",
  "assign-target",
  "add-edge",
  "remove-edge",
  "start-run",
  "cancel-run",
  "auto-arrange",
  "zoom-in",
  "zoom-out",
]);

const handleTogglePin = () => {
  emit("update:pinned", !props.pinned);
};
</script>

<style scoped>
.bridge-drawer {
  min-width: 0;
  --wf-panel-accent: var(--wf-panel-accent, var(--wf-accent-warm, #ff9a57));
  --wf-panel-outline: var(--wf-panel-outline, rgba(255, 154, 87, 0.28));
  --wf-panel-outline-strong: var(
    --wf-panel-outline-strong,
    rgba(255, 201, 122, 0.44)
  );
  --wf-panel-surface: var(
    --wf-panel-surface,
    linear-gradient(165deg, rgba(45, 28, 16, 0.94), rgba(18, 15, 18, 0.94))
  );
  --wf-panel-surface-2: var(
    --wf-panel-surface-2,
    linear-gradient(165deg, rgba(34, 24, 17, 0.96), rgba(15, 15, 18, 0.92))
  );
  --wf-panel-chip-bg: var(--wf-panel-chip-bg, rgba(47, 28, 16, 0.54));
  --wf-panel-shadow: var(
    --wf-panel-shadow,
    0 1.4rem 2.8rem rgba(28, 13, 5, 0.3)
  );
  --wf-panel-muted: var(--wf-panel-muted, #d5c0a2);
}

.bridge-shell {
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

.bridge-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 245, 230, 0.05);
  pointer-events: none;
}

.bridge-shell::after {
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

.bridge-topbar {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 18%, rgba(255, 245, 230, 0.06));
}

.bridge-heading {
  display: grid;
  gap: 0.375rem;
}

.bridge-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--wf-panel-accent) 78%, #ffffff 22%);
}

.bridge-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.bridge-title-row h3,
.section-head h4 {
  margin: 0;
  font-size: 0.92rem;
  letter-spacing: 0.01em;
  font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
  color: var(--wf-text-strong, #ebf4ff);
}

.bridge-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0 0.625rem;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 40%, rgba(255, 245, 230, 0.08));
  background: var(--wf-panel-chip-bg);
  font-size: 0.75rem;
  color: var(--wf-panel-muted);
}

.bridge-chip.subtle {
  background: rgba(8, 18, 31, 0.46);
}

.bridge-copy,
.section-head p,
.bridge-field span,
.picker-main small {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--wf-panel-muted);
}

.bridge-toggle,
.bridge-btn,
.zoom-btn,
.preset-btn,
.picker-assign,
.select {
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 32%, rgba(255, 245, 230, 0.08));
  background: linear-gradient(
    180deg,
    rgba(29, 20, 15, 0.92),
    rgba(13, 12, 15, 0.9)
  );
  color: var(--wf-text-strong, #ebf4ff);
}

.bridge-toggle {
  min-height: 2.55rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.bridge-body {
  display: grid;
  gap: 0.875rem;
}

.bridge-grid {
  display: grid;
  gap: 0.875rem;
}

.bridge-card {
  display: grid;
  gap: 0.7rem;
  padding: 0.75rem;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 22%, rgba(255, 245, 230, 0.08));
  border-radius: 1rem;
  background: var(--wf-panel-surface-2);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 16%, rgba(255, 245, 230, 0.06));
}

.bridge-line,
.runtime-toolbar,
.run-actions {
  display: grid;
  gap: 0.65rem;
}

.bridge-field {
  display: grid;
  gap: 0.42rem;
}

.select {
  width: 100%;
  min-height: 2.55rem;
  border-radius: 0.9rem;
  padding: 0.75rem 0.875rem;
}

.bridge-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.6rem;
}

.bridge-btn {
  min-height: 2.55rem;
  border-radius: 0.95rem;
  padding: 0 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.bridge-btn.launch {
  border-color: rgba(244, 197, 107, 0.42);
  background: linear-gradient(
    135deg,
    rgba(217, 138, 55, 0.94),
    rgba(244, 197, 107, 0.76)
  );
  color: #18110d;
}

.bridge-btn.stop {
  border-color: rgba(221, 105, 118, 0.44);
  background: linear-gradient(
    135deg,
    rgba(111, 44, 55, 0.92),
    rgba(221, 105, 118, 0.64)
  );
  color: #fff1f2;
}

.dispatch-presets,
.zoom-cluster {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  width: fit-content;
  max-width: 100%;
  padding: 0.375rem;
  border: 1px solid
    color-mix(in srgb, var(--wf-panel-accent) 22%, rgba(255, 245, 230, 0.08));
  border-radius: 1rem;
  background: rgba(20, 15, 15, 0.62);
}

.preset-btn,
.zoom-btn,
.picker-assign {
  min-height: 2.15rem;
  border-radius: 0.8rem;
  padding: 0 0.85rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.preset-btn.active {
  border-color: var(--wf-panel-outline-strong);
  background: rgba(217, 138, 55, 0.2);
}

.zoom-cluster {
  gap: 0.625rem;
  color: var(--wf-panel-muted);
}

.zoom-btn {
  width: 2.25rem;
  padding: 0;
}

.picker-list {
  display: grid;
  gap: 0.5rem;
  max-height: min(22rem, 40vh);
  overflow: auto;
}

.picker-node {
  --picker-accent: #d9c3a2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
  padding: 0.74rem;
  border: 1px solid
    color-mix(in srgb, var(--picker-accent) 42%, rgba(255, 245, 230, 0.08));
  border-radius: 1rem;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--picker-accent) 14%, rgba(34, 20, 15, 0.92)),
    rgba(15, 13, 16, 0.72)
  );
}

.picker-node.selected {
  box-shadow:
    0 0 0 1px rgba(255, 245, 230, 0.06),
    0 0 0 2px color-mix(in srgb, var(--picker-accent) 34%, transparent),
    0 0.9rem 1.6rem rgba(24, 12, 6, 0.22);
}

.picker-main {
  border: 0;
  background: transparent;
  color: var(--wf-text-strong, #ebf4ff);
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 0.18rem;
  padding: 0;
}

.picker-main strong {
  font-size: 0.9rem;
  line-height: 1.3;
}

.picker-actions {
  display: grid;
  gap: 0.375rem;
}

.picker-assign {
  min-width: 2.5rem;
}

.picker-node.as-source .picker-assign.source,
.picker-node.as-target .picker-assign.target {
  border-color: var(--wf-panel-outline-strong);
  background: rgba(217, 138, 55, 0.18);
}

@media (min-width: 768px) {
  .bridge-topbar {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }

  .bridge-toggle {
    min-width: 6.5rem;
  }

  .bridge-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bridge-line,
  .runtime-toolbar,
  .run-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .zoom-cluster {
    justify-self: start;
  }
}

@media (min-width: 1024px) {
  .picker-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
