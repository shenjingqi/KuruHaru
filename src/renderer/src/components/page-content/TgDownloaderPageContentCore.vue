<template>
  <div class="tg-downloader">
    <div class="download-header">
      <h2>📦 TG打包下载</h2>
    </div>

    <div class="download-content">
      <!-- TXT比对文件选择 -->
      <TgDownloaderCompareSection
        v-model:use-filter="useFilter"
        :exclude-file-path="excludeFilePath"
        :exclude-file-r-j-count="excludeFileRJCount"
        @browse-file="browseFile"
      />

      <!-- 文件列表 -->
      <div class="files-section">
        <TgDownloaderFilesToolbarSection
          :total-files="allFiles.length"
          :use-filter="useFilter"
          :skip-count="skipFiles.length"
          :download-count="downloadFiles.length"
          :selected-count="selectedFiles.length"
          :concurrent-count="concurrentCount"
          :is-downloading="isDownloading"
          @select-all="selectAll"
          @deselect-all="deselectAll"
          @reload-and-scan="reloadAndScan"
          @start-download="startDownload"
          @update:concurrent-count="concurrentCount = $event"
        />

        <div class="files-list">
          <div
            v-for="file in displayedFiles"
            :key="file.id"
            class="file-item"
            :class="{
              selected: selectedFiles.includes(file.id),
              skipped: skippedFileIds.has(file.id),
            }"
            @click="toggleSelect(file.id)"
          >
            <input
              type="checkbox"
              :checked="selectedFiles.includes(file.id)"
              :disabled="skippedFileIds.has(file.id)"
              @click.stop
              @change="toggleSelect(file.id)"
            />
            <span class="file-rj">{{ file.rjCode }}</span>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-date">{{ formatDate(file.date) }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
            <span v-if="skippedFileIds.has(file.id)" class="skip-badge"
              >跳过</span
            >
          </div>
        </div>

        <!-- 分页 -->
        <TgDownloaderPaginationControls
          v-if="totalPages > 1"
          :current-page="currentPage"
          :total-pages="totalPages"
          @update:current-page="currentPage = $event"
        />
      </div>

      <!-- 下载进度 -->
      <TgDownloaderProgressSection
        v-if="isDownloading"
        :progress-percent="progressPercent"
        :downloaded-count="downloadedCount"
        :selected-count="downloadTotalCount"
        :current-file="currentFile"
        @cancel="cancelDownload"
      />

      <!-- 日志 -->
      <TgDownloaderLogSection
        v-if="logs.length > 0"
        :logs="logs"
        @clear="logs = []"
      />
    </div>
  </div>
</template>

<script setup>
import TgDownloaderCompareSection from "../tg-downloader/TgDownloaderCompareSection.vue";
import TgDownloaderFilesToolbarSection from "../tg-downloader/TgDownloaderFilesToolbarSection.vue";
import TgDownloaderLogSection from "../tg-downloader/TgDownloaderLogSection.vue";
import TgDownloaderPaginationControls from "../tg-downloader/TgDownloaderPaginationControls.vue";
import TgDownloaderProgressSection from "../tg-downloader/TgDownloaderProgressSection.vue";
import { useTgDownloaderWorkflow } from "../../composables/useTgDownloaderWorkflow";

const {
  allFiles,
  selectedFiles,
  skippedFileIds,
  excludeFilePath,
  excludeFileRJCount,
  useFilter,
  currentPage,
  isDownloading,
  downloadedCount,
  progressPercent,
  downloadTotalCount,
  currentFile,
  concurrentCount,
  logs,
  displayedFiles,
  totalPages,
  skipFiles,
  downloadFiles,
  browseFile,
  toggleSelect,
  selectAll,
  deselectAll,
  reloadAndScan,
  startDownload,
  cancelDownload,
  formatDate,
  formatSize,
} = useTgDownloaderWorkflow();
</script>
<style scoped src="./TgDownloaderPageContentCore.css"></style>
