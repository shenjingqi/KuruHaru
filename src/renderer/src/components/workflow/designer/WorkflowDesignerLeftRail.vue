<template>
  <aside class="panel-stack workflow-left-rail">
    <WorkflowLibraryDrawer
      :pinned="!leftDockCollapsed"
      :groups="libraryDrawerGroups"
      :search-value="nodeSearchKeyword"
      :workflow-summaries="workflowSummaries"
      :active-workflow-id="workflow.id"
      @update:pinned="leftDockCollapsed = !$event"
      @update:search-value="nodeSearchKeyword = $event"
      @add-node="addNodeByType"
      @load-workflow="loadWorkflowById"
      @remove-workflow="removeWorkflowById"
      @drag-node-start="handleLibraryNodeDragStart"
    />
  </aside>
</template>

<script setup>
import { inject } from "vue";
import WorkflowLibraryDrawer from "../WorkflowLibraryDrawer.vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);
const {
  workflow,
  workflowSummaries,
  leftDockCollapsed,
  libraryDrawerGroups,
  nodeSearchKeyword,
  addNodeByType,
  loadWorkflowById,
  removeWorkflowById,
  handleLibraryNodeDragStart,
} = context;
</script>
