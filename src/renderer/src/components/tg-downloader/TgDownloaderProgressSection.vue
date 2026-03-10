<template>
  <div class="progress-section">
    <div class="progress-bar">
      <div
        class="progress-fill"
        :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>
    <div class="progress-info">
      <span>{{ downloadedCount }} / {{ selectedCount }}</span>
      <span class="current-file">{{ currentFile || "准备中..." }}</span>
    </div>
    <div class="progress-actions">
      <button class="cancel-btn" @click="emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup>
// 进度组件本身无业务状态，所有进度值由下载主流程实时注入。
defineProps({
  progressPercent: {
    type: Number,
    default: 0,
  },
  downloadedCount: {
    type: Number,
    default: 0,
  },
  selectedCount: {
    type: Number,
    default: 0,
  },
  currentFile: {
    type: String,
    default: "",
  },
});

// 取消按钮只发出意图，真正的取消请求与资源回收由父流程执行。
const emit = defineEmits(["cancel"]);
</script>

<style scoped>
.progress-section {
  background: #ece6d8;
  border-radius: 12px;
  padding: 20px;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #adb571;
  transition: width 0.3s;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.current-file {
  color: #adb571;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-actions {
  text-align: center;
}

.cancel-btn {
  padding: 6px 16px;
  border: 1px solid #ff4d4f;
  border-radius: 4px;
  background: #fff;
  color: #ff4d4f;
  cursor: pointer;
  font-size: 13px;
}

@media (max-width: 768px) {
  .progress-section {
    padding: 16px;
    border-radius: 8px;
  }
}
</style>
