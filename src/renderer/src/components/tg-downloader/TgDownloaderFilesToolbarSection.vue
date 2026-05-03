<template>
  <div>
    <div class="files-header">
      <h3>待下载文件</h3>
      <div class="files-stats">
        <span class="stat">总文件: {{ totalFiles }}</span>
        <span v-if="useFilter" class="stat skip">将跳过: {{ skipCount }}</span>
        <span class="stat will-download">将下载: {{ downloadCount }}</span>
      </div>
    </div>

    <div class="files-actions">
      <label class="concurrency-control">
        <span>并发</span>
        <input
          :value="concurrentCount"
          type="number"
          min="1"
          max="10"
          class="concurrency-input"
          @input="emit('update:concurrent-count', Number($event.target.value))"
        />
      </label>
      <button class="action-btn" @click="emit('select-all')">全选</button>
      <button class="action-btn" @click="emit('deselect-all')">全不选</button>
      <button class="action-btn" @click="emit('reload-and-scan')">
        清除缓存并重新扫描
      </button>
      <button
        class="action-btn primary"
        :disabled="selectedCount === 0 || isDownloading"
        @click="emit('start-download')"
      >
        {{ isDownloading ? "下载中..." : `开始下载 (${selectedCount})` }}
      </button>
    </div>
  </div>
</template>

<script setup>
// 该工具栏为纯展示组件：统计值均由父组件计算后下发。
defineProps({
  totalFiles: {
    type: Number,
    default: 0,
  },
  useFilter: {
    type: Boolean,
    default: true,
  },
  skipCount: {
    type: Number,
    default: 0,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  selectedCount: {
    type: Number,
    default: 0,
  },
  concurrentCount: {
    type: Number,
    default: 3,
  },
  isDownloading: {
    type: Boolean,
    default: false,
  },
});

// 所有按钮只上抛“意图事件”，真正的选择/下载副作用由父层统一执行。
const emit = defineEmits([
  "select-all",
  "deselect-all",
  "reload-and-scan",
  "start-download",
  "update:concurrent-count",
]);
</script>

<style scoped>
.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.files-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.files-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.stat.skip {
  color: #faad14;
}

.stat.will-download {
  color: #52c41a;
}

.files-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.concurrency-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #555;
}

.concurrency-input {
  width: 72px;
  padding: 8px 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
}

.action-btn {
  padding: 8px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.action-btn:hover {
  border-color: #adb571;
  color: #adb571;
}

.action-btn.primary {
  background: #adb571;
  color: #fff;
  border-color: #adb571;
}

.action-btn.primary:hover:not(:disabled) {
  background: #2283d8;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 1024px) {
  .files-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .files-stats {
    flex-wrap: wrap;
    gap: 8px;
  }
}

@media (max-width: 768px) {
  .files-actions {
    flex-wrap: wrap;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    min-width: 80px;
    text-align: center;
  }
}
</style>
