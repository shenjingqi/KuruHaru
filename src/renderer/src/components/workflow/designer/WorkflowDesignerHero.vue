<template>
  <header class="orbit-hero">
    <div class="hero-left">
      <p class="hero-kicker">KURUHARU NODE WORKSTATION</p>
      <div class="hero-title-row">
        <input
          v-model="workflow.name"
          class="hero-title-input"
          placeholder="未命名工作流"
        />
        <span class="hero-live-badge" :class="heroModeBadge.tone">
          {{ heroModeBadge.label }}
        </span>
      </div>
      <p class="hero-summary">
        {{
          workflow.description ||
          "把翻译、打包、上传与清理节点编排成一个可复用的自动化作业。"
        }}
      </p>
      <div class="hero-chips">
        <span class="hero-chip">ID · {{ workflow.id || "草稿态" }}</span>
        <span class="hero-chip">版本 · {{ workflow.version }}</span>
        <span class="hero-chip">节点 · {{ workflow.graph.nodes.length }}</span>
        <span class="hero-chip">连线 · {{ workflow.graph.edges.length }}</span>
        <span class="hero-chip"
          >调度 · {{ dispatchModeLabelMap[runtimeDispatchMode] }}</span
        >
        <span class="hero-chip"
          >状态 · {{ getRunStatusLabel(activeRunStatus) }}</span
        >
        <span class="hero-chip"
          >队列 · {{ queueStore.pending.length }} /
          {{ queueStore.running.length }}</span
        >
      </div>
    </div>

    <div class="hero-side">
      <div class="hero-focus-card">
        <span class="hero-focus-label">当前焦点</span>
        <strong>{{
          selectedNode ? resolveNodeLabel(selectedNode) : "未选中节点"
        }}</strong>
        <small>
          {{
            selectedNode
              ? `${getNodeTypeDisplay(selectedNode.type)} · ${selectedNode.id}`
              : "从画布、节点快选或仓库中选择一个节点后即可开始配置。"
          }}
        </small>
      </div>

      <div class="hero-actions">
        <button type="button" class="hero-btn ghost" @click="createNewWorkflow">
          新建流程
        </button>
        <button
          type="button"
          class="hero-btn ghost"
          :disabled="isValidating"
          @click="validateCurrentWorkflow"
        >
          {{ isValidating ? "校验中" : "校验" }}
        </button>
        <button
          type="button"
          class="hero-btn hot"
          :disabled="isRunInProgress"
          @click="startRun"
        >
          {{ isRunInProgress ? "运行中" : "启动" }}
        </button>
        <button
          type="button"
          class="hero-btn warning"
          :disabled="!isRunInProgress"
          @click="cancelRun"
        >
          停止
        </button>
        <button
          type="button"
          class="hero-btn cool"
          :disabled="isSaving"
          @click="saveCurrentWorkflow"
        >
          {{ isSaving ? "保存中" : "保存" }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { inject } from "vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);
const {
  workflow,
  heroModeBadge,
  selectedNode,
  dispatchModeLabelMap,
  runtimeDispatchMode,
  activeRunStatus,
  queueStore,
  getRunStatusLabel,
  resolveNodeLabel,
  getNodeTypeDisplay,
  createNewWorkflow,
  isValidating,
  validateCurrentWorkflow,
  isRunInProgress,
  startRun,
  cancelRun,
  isSaving,
  saveCurrentWorkflow,
} = context;
</script>
