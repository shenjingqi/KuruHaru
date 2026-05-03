<template>
  <section class="center-hub">
    <div
      class="center-hub-top"
      :class="{
        'comfy-parity': comfyParityMode,
        'inspector-hidden': !showMainInspector,
      }"
    >
      <div class="center-hub-canvas">
        <WorkflowDesignerGraphCanvas />
      </div>
      <WorkflowDesignerInspectorPanel />
    </div>
    <WorkflowDesignerRuntimeDock />
  </section>
</template>

<script setup>
import { computed, inject } from "vue";
import WorkflowDesignerGraphCanvas from "./WorkflowDesignerGraphCanvas.vue";
import WorkflowDesignerInspectorPanel from "./WorkflowDesignerInspectorPanel.vue";
import WorkflowDesignerRuntimeDock from "./WorkflowDesignerRuntimeDock.vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);

const { selectedNode, nodeInlineInspectorVisible, comfyParityMode } = context;

const showMainInspector = computed(
  () => !(selectedNode.value && nodeInlineInspectorVisible.value),
);
</script>

<style scoped>
.center-hub {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 0.42rem;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.center-hub-top {
  min-width: 0;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(15rem, 19vw, 18rem);
  gap: 0.5rem;
  overflow: hidden;
}

.center-hub-top.comfy-parity {
  grid-template-columns: minmax(0, 1fr) clamp(16.5rem, 20vw, 19.25rem);
  gap: 0.38rem;
}

.center-hub-top.inspector-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.center-hub-canvas {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.center-hub-top :deep(.panel-stack.right) {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}

.center-hub-top.inspector-hidden :deep(.panel-stack.right) {
  display: none;
}

:deep(.runtime-dock) {
  position: sticky;
  bottom: 0;
  z-index: 18;
  min-height: 32px;
  max-height: 32px;
}

@media (max-width: 1180px) {
  .center-hub-top {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
