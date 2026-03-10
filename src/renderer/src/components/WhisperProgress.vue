<template>
  <div class="page-container">
    <div class="progress-section card">
      <div class="progress-header">
        <span class="file-name">{{ store.currentFile || "等待开始..." }}</span>
        <span class="percentage">{{ overallProgress }}%</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: overallProgress + '%' }"
        ></div>
      </div>
      <div class="stats-row">
        <span>{{ statusText }}</span>
        <span>{{ formatTime(store.elapsedTime) }}</span>
      </div>
    </div>

    <div class="log-section card">
      <div ref="logRef" class="log-body">
        <div v-for="(log, i) in store.logs" :key="i" class="log-line">
          {{ log }}
        </div>
        <div v-if="store.logs.length === 0" class="log-empty">暂无日志</div>
      </div>
    </div>

    <div class="action-footer">
      <button class="btn-primary" :disabled="!store.isBusy" @click="stopTask">
        停止翻译
      </button>
      <button class="btn-secondary" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { useWhisperProgressWorkflow } from "../composables/useWhisperProgressWorkflow";

// 仅向父层抛出关闭意图，父层决定是隐藏弹窗还是销毁任务视图。
const emit = defineEmits(["close"]);
// 进度计算、状态文案、日志滚动与停止任务入口统一由 workflow 封装。
const { store, logRef, overallProgress, statusText, formatTime, stopTask } =
  useWhisperProgressWorkflow();
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #f7f2e8;
}

.progress-section {
  padding: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.file-name {
  color: #adb571;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16px;
}

.percentage {
  font-weight: 600;
  color: #26251f;
}

.progress-track {
  height: 8px;
  background: #d8d0bb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #adb571, #2283d8);
  transition: width 0.3s ease;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: #66614f;
  padding-top: 8px;
  border-top: 1px solid #d8d0bb;
}

.log-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: 16px;
}

.log-body {
  flex: 1;
  overflow-y: auto;
  font-family: monospace;
  font-size: 13px;
  background: #f7f2e8;
  border-radius: 8px;
  padding: 12px;
}

.log-line {
  padding: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a3a3a3;
}

.log-body::-webkit-scrollbar {
  width: 6px;
}

.log-body::-webkit-scrollbar-thumb {
  background: #d8d0bb;
  border-radius: 3px;
}

.action-footer {
  display: flex;
  gap: 12px;
}

.btn-primary {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #adb571;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-secondary {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #f2ede0;
  color: #66614f;
  font-weight: 500;
  cursor: pointer;
}

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #d8d0bb;
}
</style>
