<template>
  <div class="page-container local-cleaner-theme">
    <div class="page-header">
      <h2 class="page-title">本地清理</h2>
    </div>

    <div class="action-bar">
      <button class="btn-secondary" :disabled="isBusy" @click="scanFolder">
        扫描文件夹
      </button>
      <button class="btn-secondary" :disabled="isBusy" @click="loadFromTxt">
        从TXT导入
      </button>
      <button
        v-if="txtRJCodes.length > 0"
        class="btn-secondary"
        @click="clearTxt"
      >
        清空
      </button>

      <!-- 扫描后的云端删除 -->
      <template v-if="localItems.length > 0">
        <button
          class="btn-primary"
          :disabled="selectedPaths.length === 0"
          @click="executeDelete"
        >
          云端删除 ({{ selectedPaths.length }})
        </button>
        <div class="select-actions">
          <button class="btn-secondary small" @click="selectAll">全选</button>
          <button class="btn-secondary small" @click="clearSelection">
            取消
          </button>
        </div>
      </template>
    </div>

    <!-- TXT导入的云端删除列表 -->
    <div v-if="txtRJCodes.length > 0" class="txt-panel card">
      <div class="txt-header">
        <span class="txt-title"
          >📄 TXT导入 - 云端删除 ({{ txtRJCodes.length }})</span
        >
        <div class="txt-actions">
          <button class="btn-secondary small" @click="copyRJCodes">复制</button>
          <button
            class="btn-primary small"
            :disabled="isBusy"
            @click="executeCloudDelete"
          >
            删除云端
          </button>
        </div>
      </div>
      <div class="txt-list">
        <span v-for="code in txtRJCodes" :key="code" class="rj-tag">{{
          code
        }}</span>
      </div>
    </div>

    <!-- 本地文件列表 -->
    <div class="file-list card">
      <div
        v-for="item in localItems"
        :key="item.path"
        class="file-row"
        :class="{ selected: selectedPaths.includes(item.path) }"
        @click="toggleSelect(item.path)"
      >
        <input
          type="checkbox"
          :checked="selectedPaths.includes(item.path)"
          readonly
        />
        <span class="code">{{ item.code || "?" }}</span>
        <span class="name">{{ item.name }}</span>
        <span class="size">{{ formatSize(item.size) }}</span>
      </div>
      <div v-if="localItems.length === 0" class="empty">
        点击"扫描文件夹"选择要清理的目录，或"从TXT导入"删除云端数据
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocalCleaner } from "../composables/useLocalCleaner";

const {
  localItems,
  selectedPaths,
  isBusy,
  txtRJCodes,
  scanFolder,
  loadFromTxt,
  clearTxt,
  copyRJCodes,
  selectAll,
  clearSelection,
  toggleSelect,
  formatSize,
  executeDelete,
  executeCloudDelete,
} = useLocalCleaner();
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
}

.page-header {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #26251f;
}

.action-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .page-container {
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .action-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .action-bar .btn-secondary,
  .action-bar .btn-primary {
    width: 100%;
    text-align: center;
  }

  .select-actions {
    margin-left: 0;
    justify-content: center;
  }

  .file-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .name {
    width: 100%;
    order: 3;
  }

  .size {
    margin-left: auto;
  }
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .file-row {
    padding: 10px;
    font-size: 13px;
  }

  .code {
    font-size: 12px;
    padding: 3px 8px;
  }

  .txt-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .txt-actions {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .page-title {
    font-size: 18px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 10px 16px;
    font-size: 13px;
  }
}

.btn-secondary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #66614f;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #f2ede0;
}

.btn-secondary:hover:not(:disabled) {
  background: #d8d0bb;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #adb571;
}

.btn-primary:hover:not(:disabled) {
  background: #0d5da3;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-small {
  padding: 8px 14px;
  font-size: 13px;
}

.select-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  border: 1px solid #d8d0bb;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.file-row:hover {
  background: #f7f2e8;
}

.file-row.selected {
  background: #e8f1fa;
}

.file-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #adb571;
}

.code {
  background: #e8f1fa;
  color: #0d5da3;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.name {
  color: #26251f;
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  color: #86806f;
  font-size: 13px;
  font-family: monospace;
}

.empty {
  text-align: center;
  color: #a3a3a3;
  padding: 60px 20px;
  font-size: 14px;
}

/* TXT面板样式 */
.txt-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.txt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.txt-title {
  font-size: 14px;
  font-weight: 500;
  color: #66614f;
}

.txt-actions {
  display: flex;
  gap: 8px;
}

.txt-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.rj-tag {
  background: #e8f1fa;
  color: #0d5da3;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  font-weight: 500;
}

.card::-webkit-scrollbar {
  width: 6px;
}

.card::-webkit-scrollbar-track {
  background: transparent;
}

.card::-webkit-scrollbar-thumb {
  background: #d8d0bb;
  border-radius: 3px;
}

.card::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}
</style>
