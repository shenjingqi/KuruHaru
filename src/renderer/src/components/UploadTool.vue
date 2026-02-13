<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">上传字幕</h2>
    </div>

    <div class="status-bar card">
      <div class="status-left">
        <span class="dot" :class="{ online: tgConnected }"></span>
        {{ tgConnected ? 'TG 已连接' : 'TG 未连接' }}
      </div>
      <button v-if="!tgConnected" class="btn-secondary small" @click="goToSettings">
        去个人设置登录
      </button>
    </div>

    <div class="main-split">
      <div class="split-left card">
        <div class="tab-header">
          <div class="tab-btn" :class="{ active: mode === 'scan' }" @click="mode = 'scan'">
            智能扫描
          </div>
          <div class="tab-btn" :class="{ active: mode === 'drop' }" @click="mode = 'drop'">
            手动投递
          </div>
        </div>

        <div class="tab-content">
          <div v-if="mode === 'scan'" class="scan-mode">
            <button class="btn-primary full" @click="scanArchives">📂 扫描文件夹</button>
            <div v-if="scannedFiles.length > 0" class="list-controls">
              <label class="check-all">
                <input v-model="isAllSelected" type="checkbox" /> 全选 ({{ scannedFiles.length }})
              </label>
              <span class="clear-btn" @click="clearScan">清空列表</span>
            </div>
            <div class="file-list">
              <div
                v-for="file in scannedFiles"
                :key="file.path"
                class="file-item"
                :class="{ selected: selectedFiles.some((f) => f.path === file.path) }"
              >
                <input v-model="selectedFiles" type="checkbox" :value="file" />
                <div class="file-info">
                  <span v-if="file.code" class="code-badge">[{{ file.code }}]</span>
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
              <div v-if="manualFiles.length === 0" class="placeholder">📦 拖入文件</div>
              <div v-else class="file-list">
                <div class="list-controls">
                  <span class="clear-btn" @click="manualFiles = []">清空</span>
                </div>
                <div v-for="(f, i) in manualFiles" :key="i" class="file-tag">
                  {{ getFileName(f) }}
                  <span class="remove-btn" @click.stop="manualFiles.splice(i, 1)">×</span>
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
          class="btn-primary full"
          :disabled="filesToUpload.length === 0"
          @click="uploadFiles"
        >
          开始上传
        </button>
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch, toRaw } from 'vue'

const mode = ref('scan')
const tgConnected = ref(false)
const uploadChannelId = ref('')
const scannedFiles = ref([])
const selectedFiles = ref([])
const manualFiles = ref([])
const logs = ref([])
const logRef = ref(null)
let timer = null

const filesToUpload = computed(() =>
  mode.value === 'scan' ? selectedFiles.value : manualFiles.value
)
const isAllSelected = computed({
  get: () =>
    scannedFiles.value.length > 0 && selectedFiles.value.length === scannedFiles.value.length,
  set: (val) => {
    // 保存完整文件对象，不只是路径
    selectedFiles.value = val ? [...scannedFiles.value] : []
  }
})

onMounted(async () => {
  const result = await window.api.invoke('get-config')
  const cfg = result?.data || result
  if (cfg?.upload?.channelId) uploadChannelId.value = cfg.upload.channelId
  checkTgConnection()
  timer = setInterval(checkTgConnection, 30000)

  window.api.onLogUpdate((data) => {
    const msg = data?.msg || data || ''
    const type = data?.type || 'tg'
    if (type === 'tg') {
      logs.value.push(msg)
      nextTick(() => {
        if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
      })
    }
  })
})

const checkTgConnection = async () => {
  const connected = await window.api.tgCheckLogin()
  tgConnected.value = connected
}

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  window.api.removeAllListeners('log-update')
})
watch(uploadChannelId, (val) => window.api.invoke('save-config', { upload: { channelId: val } }))

const getFileName = (f) => {
  if (!f) return 'Unknown'
  // 如果已经是字符串路径
  if (typeof f === 'string') return f.split(/[\\/]/).pop()
  // 如果是文件对象
  return f.name || f.path?.split(/[\\/]/).pop() || 'Unknown'
}
const scanArchives = async () => {
  const dir = await window.api.selectFile('dir')
  if (dir && dir.filePath) {
    const res = await window.api.invoke('scan-local-archives', dir.filePath)
    scannedFiles.value = res
  }
}
const clearScan = () => {
  scannedFiles.value = []
  selectedFiles.value = []
}
const handleDrop = (e) => {
  const newFiles = Array.from(e.dataTransfer.files).map((f) => ({
    code: '',
    path: f.path,
    name: f.name
  }))
  manualFiles.value.push(...newFiles)
}
const selectZipFiles = async () => {
  const p = await window.api.dialogOpenFile({
    type: 'file',
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  })
  if (p && p.filePaths) {
    const newFiles = p.filePaths.map((filePath) => ({
      code: '',
      path: filePath,
      name: filePath.split(/[/\\]/).pop()
    }))
    manualFiles.value.push(...newFiles)
  }
}

const uploadFiles = async () => {
  const connected = await window.api.tgCheckLogin()
  if (!connected) {
    logs.value.push('未连接 Telegram，请先去个人设置登录')
    return
  }
  // 使用 toRaw 提取原始对象，再用 JSON 克隆
  const files = JSON.parse(JSON.stringify(toRaw(filesToUpload.value) || []))
  window.api.send('tg-upload-files', {
    files,
    channelId: uploadChannelId.value
  })
}
const goToSettings = () => {
  window.dispatchEvent(new CustomEvent('change-view', { detail: 'settings' }))
}
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
  color: #262626;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.status-left {
  display: flex;
  align-items: center;
  color: #525252;
  font-size: 14px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #d4d4d4;
  border-radius: 50%;
  margin-right: 10px;
}

.dot.online {
  background: #22c55e;
}

.main-split {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.split-left {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.split-right {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-header {
  display: flex;
  border-bottom: 1px solid #e5e5e5;
  margin-bottom: 16px;
}

.tab-btn {
  flex: 1;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  color: #737373;
  font-size: 14px;
  transition: all 0.2s ease;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: #8b5cf6;
  border-bottom-color: #8b5cf6;
  font-weight: 500;
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scan-mode,
.drop-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
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
  background: #8b5cf6;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #525252;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #f5f5f5;
}

.btn-secondary:hover {
  background: #e5e5e5;
}

.btn-secondary.small {
  padding: 8px 16px;
  font-size: 13px;
}

.btn-full {
  width: 100%;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  background: #fafafa;
  border-radius: 8px;
  padding: 8px;
}

.file-item {
  display: flex;
  gap: 12px;
  padding: 10px;
  border-bottom: 1px solid #f5f5f5;
  align-items: center;
  transition: background 0.2s ease;
}

.file-item:hover {
  background: #fff;
}

.file-item.selected {
  background: #f0ebfc;
}

.file-info {
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
}

.code-badge {
  background: #eff6ff;
  color: #3b82f6;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
  margin-right: 10px;
  flex-shrink: 0;
}

.name-text {
  color: #525252;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.list-controls {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 13px;
  background: #fafafa;
  border-radius: 6px;
}

.check-all {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #525252;
}

.check-all input {
  width: 16px;
  height: 16px;
  accent-color: #8b5cf6;
}

.clear-btn {
  cursor: pointer;
  color: #8b5cf6;
}

.clear-btn:hover {
  text-decoration: underline;
}

.input {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  width: 100%;
  box-sizing: border-box;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  color: #262626;
  background: #fff;
}

.input:focus {
  border-color: #8b5cf6;
}

.input::placeholder {
  color: #a3a3a3;
}

.input.big-input {
  padding: 14px;
  font-size: 16px;
  text-align: center;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #262626;
}

.info-text {
  color: #737373;
  font-size: 14px;
}

.file-tag {
  background: #f0ebfc;
  color: #7c3aed;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.remove-btn {
  cursor: pointer;
  font-size: 16px;
  color: #7c3aed;
}

.remove-btn:hover {
  opacity: 0.8;
}

.drop-zone {
  flex: 1;
  border: 2px dashed #e5e5e5;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop-zone:hover {
  border-color: #8b5cf6;
  background: #f0ebfc;
}

.placeholder {
  color: #a3a3a3;
  font-size: 15px;
}

.log-panel {
  height: 100px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 13px;
}

.log-body {
  color: #525252;
}

.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}

.modal-box {
  width: 360px;
  padding: 24px;
  text-align: center;
}

.modal-box h3 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 500;
  color: #262626;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e5e5;
}

.file-list::-webkit-scrollbar {
  width: 6px;
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}
</style>
