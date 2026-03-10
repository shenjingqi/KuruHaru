<template>
  <div class="rj-filter rj-filter-theme">
    <div class="filter-header">
      <h2>🔢 RJ号筛选工具</h2>
    </div>

    <div class="filter-content">
      <!-- 链接输入 -->
      <div class="input-section">
        <div class="input-group">
          <label>链接地址</label>
          <input
            v-model="inputUrl"
            type="text"
            placeholder="输入搜索链接或API链接，如: https://api.asmr-200.com/api/search/中文"
            class="url-input"
          />
        </div>

        <div class="date-group">
          <label>发售日期筛选</label>
          <div class="date-options">
            <label class="radio-option">
              <input v-model="dateMode" type="radio" value="all" />
              <span>全部获取</span>
            </label>
            <label class="radio-option">
              <input v-model="dateMode" type="radio" value="after" />
              <span>获取</span>
            </label>
            <input
              v-if="dateMode === 'after'"
              v-model="beforeDate"
              type="date"
              class="date-input"
            />
            <span v-if="dateMode === 'after'" class="date-hint"
              >之后发售的作品</span
            >
          </div>
        </div>
      </div>

      <!-- TXT比对 -->
      <div class="compare-section">
        <div class="input-group">
          <label>TXT比对文件（可选）</label>
          <div class="file-input-row">
            <input
              v-model="compareFilePath"
              type="text"
              placeholder="输入TXT文件路径，包含已有RJ号（一行一个）"
              class="file-input"
            />
            <button class="browse-btn" @click="browseFile">浏览</button>
          </div>
        </div>

        <div class="compare-options">
          <label class="checkbox-option">
            <input v-model="excludeExisting" type="checkbox" />
            <span>筛选出**不存在**于该TXT文件的RJ号</span>
          </label>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-section">
        <button
          class="action-btn primary"
          :disabled="!inputUrl || isProcessing"
          @click="startFilter"
        >
          {{ isProcessing ? "处理中..." : "开始筛选" }}
        </button>

        <button
          class="action-btn secondary"
          :disabled="!resultList.length"
          @click="exportResult"
        >
          📥 导出结果 ({{ resultList.length }}个)
        </button>

        <button
          class="action-btn secondary"
          :disabled="!resultList.length"
          @click="clearResult"
        >
          🗑️ 清空结果
        </button>
      </div>

      <!-- 进度显示 -->
      <div v-if="isProcessing" class="progress-section">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div class="progress-info">
          <span>{{ progressText }}</span>
          <span>{{ currentRJ || "处理中..." }}</span>
        </div>
        <div class="progress-hint">请查看控制台获取详细日志...</div>
      </div>

      <!-- 结果显示 -->
      <div v-if="resultList.length > 0" class="result-section">
        <div class="result-header">
          <h3>筛选结果</h3>
          <span class="result-count">共 {{ resultList.length }} 个RJ号</span>
        </div>
        <div class="result-list">
          <div
            v-for="(item, index) in resultList"
            :key="index"
            class="result-item"
          >
            <span class="rj-number">{{ item.rjCode }}</span>
            <span class="rj-title">{{ item.title }}</span>
            <span class="rj-date">{{ item.date }}</span>
            <span v-if="item.isNew" class="new-badge">新增</span>
          </div>
        </div>
      </div>

      <!-- 日志 -->
      <div v-if="logs.length > 0" class="log-section">
        <div class="log-header">
          <h3>操作日志</h3>
          <button class="clear-log-btn" @click="logs = []">清空</button>
        </div>
        <div class="log-list">
          <div
            v-for="(log, index) in logs"
            :key="index"
            class="log-item"
            :class="log.type"
          >
            {{ log.msg }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRjFilter } from "../composables/useRjFilter";

const {
  inputUrl,
  dateMode,
  beforeDate,
  compareFilePath,
  excludeExisting,
  isProcessing,
  progressPercent,
  progressText,
  currentRJ,
  resultList,
  logs,
  browseFile,
  startFilter,
  exportResult,
  clearResult,
} = useRjFilter();
</script>

<style scoped>
.rj-filter {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.filter-header {
  margin-bottom: 24px;
}

.filter-header h2 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.filter-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-section,
.compare-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

.input-group,
.date-group {
  margin-bottom: 16px;
}

.input-group:last-child,
.date-group:last-child {
  margin-bottom: 0;
}

.input-group label,
.date-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.url-input,
.file-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.url-input:focus,
.file-input:focus {
  border-color: #adb571;
}

.file-input-row {
  display: flex;
  gap: 8px;
}

.file-input {
  flex: 1;
}

.browse-btn {
  padding: 12px 20px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.browse-btn:hover {
  border-color: #adb571;
  color: #adb571;
}

.date-options {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.radio-option,
.checkbox-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.date-input {
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
}

.date-hint {
  color: #666;
  font-size: 13px;
}

.compare-options {
  margin-top: 12px;
}

.action-section {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: #adb571;
  color: #fff;
}

.action-btn.primary:hover:not(:disabled) {
  background: #2283d8;
}

.action-btn.primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.action-btn.secondary {
  background: #fff;
  border: 2px solid #e0e0e0;
  color: #333;
}

.action-btn.secondary:hover:not(:disabled) {
  border-color: #adb571;
  color: #adb571;
}

.action-btn.secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-section {
  background: #ece6d8;
  border-radius: 8px;
  padding: 16px;
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
}

.progress-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  font-style: italic;
}

.result-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.result-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.result-count {
  font-size: 13px;
  color: #666;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #fff;
  border-radius: 8px;
  font-size: 13px;
}

.rj-number {
  font-weight: 600;
  color: #adb571;
  min-width: 80px;
}

.rj-title {
  flex: 1;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rj-date {
  color: #999;
  font-size: 12px;
  min-width: 100px;
  text-align: right;
}

.new-badge {
  padding: 2px 8px;
  background: #f6ffed;
  color: #52c41a;
  border-radius: 4px;
  font-size: 11px;
}

.log-section {
  background: #1e1e1e;
  border-radius: 12px;
  padding: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.log-header h3 {
  margin: 0;
  font-size: 14px;
  color: #fff;
}

.clear-log-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
}

.clear-log-btn:hover {
  color: #fff;
}

.log-list {
  font-family: "Consolas", monospace;
  font-size: 12px;
}

.log-item {
  padding: 2px 0;
  color: #ccc;
}

.log-item.success {
  color: #52c41a;
}

.log-item.error {
  color: #ff4d4f;
}
</style>
