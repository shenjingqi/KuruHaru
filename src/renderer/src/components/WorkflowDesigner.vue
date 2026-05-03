<template>
  <div
    class="page-container workflow-designer-theme workflow-orbit workflow-orbit-comfy"
  >
    <div v-if="workflowRenderError" class="workflow-error-shell">
      <h3>工作流页面渲染失败</h3>
      <p>{{ workflowRenderError }}</p>
    </div>
    <div v-else class="comfy-shell">
      <WorkflowDesignerCenterHub />
    </div>
  </div>
</template>

<script setup>
import { onErrorCaptured, ref } from "vue";
import WorkflowDesignerCenterHub from "./workflow/designer/WorkflowDesignerCenterHub.vue";
import "./workflow/designer/workflow-designer.css";
import { useWorkflowDesignerPage } from "../composables/useWorkflowDesignerPage";

useWorkflowDesignerPage();

const workflowRenderError = ref("");

onErrorCaptured((error) => {
  const message = String(
    error?.stack || error?.message || error || "未知渲染错误",
  ).trim();
  workflowRenderError.value = message;
  return false;
});
</script>

<style scoped>
.comfy-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  align-items: flex-start;
  width: 100%;
  height: clamp(34rem, 80vh, 46rem);
  min-height: clamp(34rem, 80vh, 46rem);
  max-height: calc(100vh - 7rem);
  overflow: hidden;
}

.workflow-error-shell {
  position: relative;
  z-index: 1;
  border: 1px solid rgba(235, 116, 116, 0.45);
  border-radius: 0.75rem;
  background: rgba(40, 15, 18, 0.92);
  color: #ffd9d9;
  padding: 1rem;
  max-height: calc(100vh - 8rem);
  overflow: auto;
}

.workflow-error-shell h3 {
  margin: 0 0 0.5rem;
  font-size: 0.98rem;
}

.workflow-error-shell p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: "Cascadia Mono", "Consolas", "Aptos Mono", monospace;
  font-size: 0.74rem;
  line-height: 1.45;
}
</style>
