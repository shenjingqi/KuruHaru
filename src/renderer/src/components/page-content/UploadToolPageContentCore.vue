<template>
  <div class="page-container upload-tool-theme">
    <div class="page-header">
      <h2 class="page-title">投稿视频</h2>
    </div>

    <div class="status-bar card">
      <div class="status-left">
        <span class="dot" :class="{ online: tgConnected }"></span>
        {{ tgConnected ? "TG 已连接" : "TG 未连接" }}
      </div>
      <button
        v-if="!tgConnected"
        class="btn-secondary small"
        @click="goToSettings"
      >
        去个人设置登录
      </button>
    </div>

    <div class="main-split">
      <div class="split-left card">
        <div class="tab-header">
          <div
            class="tab-btn"
            :class="{ active: mode === 'scan' }"
            @click="mode = 'scan'"
          >
            智能扫描
          </div>
          <div
            class="tab-btn"
            :class="{ active: mode === 'drop' }"
            @click="mode = 'drop'"
          >
            手动投递
          </div>
        </div>

        <div class="tab-content">
          <div v-if="mode === 'scan'" class="scan-mode">
            <button class="btn-primary full" @click="scanArchives">
              📂 扫描文件夹
            </button>
            <div v-if="scannedFiles.length > 0" class="list-controls">
              <label class="check-all">
                <input v-model="isAllSelected" type="checkbox" /> 全选 ({{
                  scannedFiles.length
                }})
              </label>
              <span class="clear-btn" @click="clearScan">清空列表</span>
            </div>
            <div class="file-list">
              <div
                v-for="file in scannedFiles"
                :key="file.path"
                class="file-item"
                :class="{
                  selected: selectedFiles.some((f) => f.path === file.path),
                }"
              >
                <input v-model="selectedFiles" type="checkbox" :value="file" />
                <div class="file-info">
                  <span v-if="file.code" class="code-badge"
                    >[{{ file.code }}]</span
                  >
                  <span class="name-text">{{ file.name }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="mode === 'drop'" class="drop-mode">
            <div
              class="drop-zone"
              @click="selectZipFiles"
              @drop.prevent="handleDrop"
              @dragover.prevent
            >
              <div v-if="manualFiles.length === 0" class="placeholder">
                📦 拖入文件
              </div>
              <div v-else class="file-list">
                <div class="list-controls">
                  <span class="clear-btn" @click="manualFiles = []">清空</span>
                </div>
                <div v-for="(f, i) in manualFiles" :key="i" class="file-tag">
                  {{ getFileName(f.path || f) }}
                  <span
                    class="remove-btn"
                    @click.stop="manualFiles.splice(i, 1)"
                    >×</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="split-right card">
        <h3 class="section-title">发送设置</h3>
        <input v-model="uploadChannelId" class="input" placeholder="频道 ID" />
        <div class="info-text">选中: {{ filesToUpload.length }} 个</div>
        <button
          v-if="!isUploading"
          class="btn-primary full"
          :disabled="filesToUpload.length === 0"
          @click="uploadFiles"
        >
          开始上传
        </button>
        <button v-else class="btn-danger full" @click="cancelUpload">
          取消上传
        </button>
      </div>
    </div>

    <div v-if="authNeeded" class="modal-mask">
      <div class="modal-box card">
        <h3>验证</h3>
        <input v-model="authCode" class="input big-input" />
        <button class="btn-primary full" @click="submitAuth">确认</button>
      </div>
    </div>

    <div class="log-panel card">
      <div ref="logRef" class="log-body">
        <div v-for="(log, i) in logs" :key="i">{{ log }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useUploadToolWorkflow } from "../../composables/useUploadToolWorkflow";

// 页面聚合“扫描/拖拽/鉴权/上传”四条流程线，具体状态机由 workflow 承担。
const {
  mode,
  tgConnected,
  uploadChannelId,
  scannedFiles,
  selectedFiles,
  manualFiles,
  logs,
  logRef,
  authNeeded,
  authCode,
  isUploading,
  filesToUpload,
  isAllSelected,
  getFileName,
  scanArchives,
  clearScan,
  handleDrop,
  selectZipFiles,
  submitAuth,
  uploadFiles,
  cancelUpload,
  goToSettings,
} = useUploadToolWorkflow();
// mode 与 filesToUpload 在 workflow 内联动，视图层只根据暴露状态渲染交互入口。
</script>
<style scoped src="./UploadToolPageContentCore.css"></style>
