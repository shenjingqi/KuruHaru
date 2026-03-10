<template>
  <div class="page-container recent-activity-theme">
    <div class="page-header activity-header">
      <div class="page-header-main">
        <span class="page-eyebrow">Telegram / Recent Activity</span>
        <h2 class="page-title">最近上传</h2>
        <p class="page-header-subtitle">
          在同一工作区完成扫描、排除与下载，保持近期任务流简洁可控。
        </p>
      </div>

      <div class="header-side">
        <div class="page-header-meta">
          <span class="header-chip">已扫描 {{ allFiles.length }} 个文件</span>
          <span class="header-chip accent"
            >待下载 {{ selectedFiles.length }}</span
          >
        </div>

        <div class="header-actions">
          <button
            class="btn-secondary"
            :disabled="isScanning"
            @click="scanRecentActivity"
          >
            {{ isScanning ? "扫描中..." : "扫描讨论组" }}
          </button>
          <button
            class="btn-primary"
            :disabled="selectedFiles.length === 0 || isDownloading"
            @click="startDownload"
          >
            {{
              isDownloading ? "下载中..." : `下载选中 (${selectedFiles.length})`
            }}
          </button>
        </div>
      </div>
    </div>

    <div class="filter-section card command-bar">
      <div class="filter-row">
        <div class="filter-group filter-group-primary">
          <span class="section-caption">排除规则</span>
          <label>排除已下载的 RJ / VJ / BJ 号</label>
          <div class="file-input-row">
            <input
              v-model="excludeFilePath"
              type="text"
              placeholder="选择 TXT 文件路径（包含已有 RJ / VJ / BJ 号）"
              class="file-input"
              readonly
            />
            <button class="browse-btn" @click="browseFile">浏览</button>
          </div>
        </div>

        <div class="filter-group stats">
          <div class="stat-item">
            <span class="stat-label">总文件</span>
            <span class="stat-value">{{ allFiles.length }}</span>
          </div>
          <div class="stat-item skip">
            <span class="stat-label">将跳过</span>
            <span class="stat-value">{{ skipFiles.length }}</span>
          </div>
          <div class="stat-item download">
            <span class="stat-label">将下载</span>
            <span class="stat-value">{{ selectedFiles.length }}</span>
          </div>
        </div>
      </div>

      <div class="filter-actions">
        <button class="action-link" @click="selectAll">全选</button>
        <button class="action-link" @click="deselectAll">全不选</button>
        <button class="action-link" @click="invertSelect">反选</button>
      </div>
    </div>

    <div class="files-container card">
      <div v-if="allFiles.length > 0 && !isScanning" class="list-toolbar">
        <div class="section-head-copy">
          <h3 class="section-title">待处理文件</h3>
          <p class="card-caption">点击行即可切换选择状态，跳过项会自动禁用。</p>
        </div>
        <div class="card-toolbar">
          <span class="summary-chip"
            >{{ currentPage }} / {{ totalPages || 1 }} 页</span
          >
        </div>
      </div>

      <div v-if="isScanning" class="scanning-overlay">
        <div class="loader"></div>
        <p>正在连接 Telegram 扫描文件，请稍候...</p>
      </div>

      <div v-else-if="allFiles.length === 0" class="empty-activity">
        <span class="empty-icon">??</span>
        <p>暂无文件，点击扫描讨论组获取</p>
        <button class="btn-primary" @click="scanRecentActivity">
          扫描讨论组
        </button>
      </div>

      <div v-else class="files-list">
        <div
          v-for="file in paginatedFiles"
          :key="file.id"
          class="file-item"
          :class="{
            selected: selectedFileIds.has(file.id),
            skipped: skipFiles.some((f) => f.id === file.id),
          }"
          @click="toggleSelect(file.id)"
        >
          <input
            type="checkbox"
            :checked="selectedFileIds.has(file.id)"
            :disabled="skipFiles.some((f) => f.id === file.id)"
            @click.stop
            @change="toggleSelect(file.id)"
          />
          <span class="file-rj">{{ file.rjCode }}</span>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-date">{{ formatDate(file.date) }}</span>
          <span class="file-size">{{ formatSize(file.size) }}</span>
          <span
            v-if="skipFiles.some((f) => f.id === file.id)"
            class="skip-badge"
            >跳过</span
          >
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          class="page-btn"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          上一页
        </button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          下一页
        </button>
        <div class="concurrent-setting">
          <label>并发</label>
          <input
            v-model.number="concurrentCount"
            type="number"
            min="1"
            max="10"
            class="concurrent-input"
          />
        </div>
      </div>
    </div>

    <div v-if="isDownloading" class="progress-section card">
      <div class="progress-header">
        <span>下载进度 ({{ concurrentCount }} 个并发)</span>
        <span>{{ downloadProgress }}%</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: downloadProgress + '%' }"
        ></div>
      </div>
      <div class="progress-info">
        <span
          >{{ downloadedCount + skippedCount + failedFiles.length }} /
          {{ selectedFiles.length }}</span
        >
        <span class="current-file">{{ currentFile || "准备中..." }}</span>
      </div>
      <div class="progress-details">
        <span v-if="downloadedCount > 0" class="detail-success"
          >新下载 {{ downloadedCount }}</span
        >
        <span v-if="skippedCount > 0" class="detail-skipped"
          >已存在 {{ skippedCount }}</span
        >
        <span v-if="failedFiles.length > 0" class="detail-failed"
          >失败 {{ failedFiles.length }}</span
        >
      </div>
      <button class="cancel-btn" @click="cancelDownload">取消</button>
    </div>
  </div>
</template>

<script setup>
import { useMessage, useDialog } from "naive-ui";
import { useRecentActivityPageController } from "../../composables/useRecentActivityPageController";

const message = useMessage();
const dialog = useDialog();

const {
  allFiles,
  selectedFileIds,
  skipFiles,
  excludeFilePath,
  isScanning,
  currentPage,
  paginatedFiles,
  totalPages,
  selectedFiles,
  scanRecentActivity,
  browseFile,
  toggleSelect,
  selectAll,
  deselectAll,
  invertSelect,
  isDownloading,
  downloadedCount,
  skippedCount,
  downloadProgress,
  currentFile,
  failedFiles,
  concurrentCount,
  startDownload,
  cancelDownload,
  formatDate,
  formatSize,
} = useRecentActivityPageController({
  message,
  dialog,
});
</script>
<style scoped src="./RecentActivityPageContentCore.css"></style>
