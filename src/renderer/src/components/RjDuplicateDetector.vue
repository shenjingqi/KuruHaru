<template>
  <div class="page-container rj-duplicate-theme">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2 class="page-title">RJ重复检测与清理</h2>
    </div>

    <!-- 配置区域 -->
    <div class="config-section card">
      <div class="card-header">
        <h3 class="section-title">扫描配置</h3>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <label class="label">扫描消息条数</label>
          <div class="input-wrap">
            <n-input-number
              v-model:value="scanLimit"
              :min="100"
              :max="10000"
              :step="100"
              :style="{ width: '100%' }"
            />
          </div>
        </div>

        <div class="action-bar">
          <button
            class="btn-primary"
            :disabled="isScanning"
            @click="handleScan"
          >
            {{ isScanning ? "扫描中..." : "开始扫描" }}
          </button>

          <button
            class="btn-warning"
            :disabled="selectedRowKeys.length === 0 || isDeleting"
            @click="handleSelectedDelete"
          >
            {{
              isDeleting ? "删除中..." : `删除选中 (${selectedRowKeys.length})`
            }}
          </button>

          <button
            class="btn-danger"
            :disabled="duplicatesToDelete.length === 0 || isDeleting"
            @click="handleBatchDelete"
          >
            {{
              isDeleting
                ? "删除中..."
                : `一键删除重复 (${duplicatesToDelete.length})`
            }}
          </button>

          <button
            class="btn-secondary"
            :disabled="selectedRowKeys.length === 0"
            @click="clearSelection"
          >
            清空选择
          </button>
        </div>
      </div>
    </div>

    <!-- 扫描进度 -->
    <div v-if="isScanning" class="progress-section card">
      <div class="card-body">
        <div class="progress-wrapper">
          <n-progress
            type="line"
            :percentage="scanProgress"
            :status="scanStatus"
            :stroke-width="8"
            :show-info="true"
          />
          <p class="progress-text">{{ scanProgressText }}</p>
        </div>
      </div>
    </div>

    <!-- 扫描结果 -->
    <div v-if="scanResults.length > 0" class="results-section card">
      <div class="card-header">
        <h3 class="section-title">
          扫描结果
          <span class="status-tag" :class="getResultStatusClass()">
            {{ statistics.totalScanned }} 条消息，{{ statistics.duplicateRJs }}
            个重复RJ号
          </span>
        </h3>
      </div>

      <div class="card-body">
        <n-data-table
          :columns="columns"
          :data="sortedScanResults"
          :row-key="getRowKey"
          :checked-row-keys="selectedRowKeys"
          :row-class-name="getRowClassName"
          :pagination="{ pageSize: 20, showSizePicker: true }"
          :scroll-x="1000"
          style="width: 100%"
          @update:checked-row-keys="handleSelectionChange"
        />
      </div>

      <!-- 统计信息 -->
      <div class="statistics-section">
        <div class="stat-card">
          <div class="stat-label">总扫描消息数</div>
          <div class="stat-value">{{ statistics.totalScanned }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">重复RJ号数量</div>
          <div class="stat-value">{{ statistics.duplicateRJs }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">待删除配对数</div>
          <div class="stat-value">{{ statistics.messagesToDelete }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">已删除配对数</div>
          <div class="stat-value">{{ statistics.deletedCount }}</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-if="scanResults.length === 0 && !isScanning && hasScanned"
      class="empty-state"
    >
      <span class="empty-icon">📭</span>
      <p>暂无重复的RJ号</p>
    </div>
  </div>
</template>

<script setup>
import { useMessage, useDialog } from "naive-ui";
import { useRjDuplicateDetectorController } from "../composables/useRjDuplicateDetectorController";

const message = useMessage();
const dialog = useDialog();

const {
  scanLimit,
  isScanning,
  isDeleting,
  scanResults,
  hasScanned,
  scanProgress,
  scanProgressText,
  scanStatus,
  statistics,
  columns,
  selectedRowKeys,
  duplicatesToDelete,
  sortedScanResults,
  getRowKey,
  getRowClassName,
  handleSelectionChange,
  clearSelection,
  getResultStatusClass,
  handleScan,
  handleBatchDelete,
  handleSelectedDelete,
} = useRjDuplicateDetectorController({
  message,
  dialog,
});
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #26251f;
}

.config-section {
  margin-bottom: 24px;
}

.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.card-header {
  padding: 16px 24px;
  border-bottom: 1px solid #d8d0bb;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-body {
  padding: 24px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #26251f;
}

.setting-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 16px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.label {
  min-width: 120px;
  font-size: 14px;
  color: #66614f;
}

.input-wrap {
  flex: 1;
}

.action-bar {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.btn-primary {
  padding: 10px 24px;
  background: #adb571;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #0d5da3;
}

.btn-primary:disabled {
  background: #c9c1ab;
  cursor: not-allowed;
}

.btn-danger {
  padding: 10px 24px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-danger:disabled {
  background: #c9c1ab;
  cursor: not-allowed;
}

.btn-warning {
  padding: 10px 24px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
}

.btn-warning:disabled {
  background: #c9c1ab;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 24px;
  background: #ded7c2;
  color: #374151;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: #c9c1ab;
}

.btn-secondary:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.progress-section {
  margin-bottom: 24px;
}

.progress-wrapper {
  margin: 16px 0;
}

.progress-text {
  margin-top: 8px;
  color: #666;
  font-size: 14px;
}

.results-section {
  margin-bottom: 24px;
}

.statistics-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 24px;
  padding: 0 24px 24px;
}

.stat-card {
  background: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #26251f;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #64748b;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.rj-code {
  font-weight: bold;
}

.type-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

.status-tag.online {
  background: #d1fae5;
  color: #065f46;
}

.status-tag.running {
  background: #fef3c7;
  color: #92400e;
}

/* 行样式 */
:deep(.row-keep) {
  background-color: rgba(16, 185, 129, 0.05);
}

:deep(.row-delete) {
  background-color: rgba(239, 68, 68, 0.05);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .label {
    min-width: auto;
  }

  .action-bar {
    flex-direction: column;
  }

  .action-bar button {
    width: 100%;
  }

  .statistics-section {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
