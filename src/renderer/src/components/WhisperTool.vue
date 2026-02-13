<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">音声翻译</h2>
      <div class="status-tag" :class="{ running: store.isBusy }">{{ statusText }}</div>
    </div>

    <div class="content-box card">
      <div class="setting-row">
        <div class="label">引擎路径</div>
        <div class="input-wrap">
          <input v-model="localExePath" class="input" readonly />
          <button class="btn-secondary" @click="selectExe">选择</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="label">媒体目录</div>
        <div class="input-wrap">
          <input v-model="targetPath" class="input" readonly />
          <button class="btn-secondary" @click="selectTarget">选择</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="label">格式</div>
        <div class="tags-group">
          <label v-for="fmt in ['lrc', 'srt', 'vtt']" :key="fmt" class="tag-checkbox">
            <input v-model="subFormats" type="checkbox" :value="fmt" />
            <span class="tag-body">{{ fmt.toUpperCase() }}</span>
          </label>
        </div>
      </div>

      <div class="action-footer">
        <button class="btn-primary" :disabled="store.isBusy || !canStart" @click="startTranslate">
          开始翻译
        </button>
        <button v-if="store.isBusy" class="btn-secondary" @click="showProgressModal = true">
          查看进度
        </button>
      </div>
    </div>

    <!-- 进度页面模态框 -->
    <Teleport to="body">
      <div v-if="showProgressModal" class="modal-mask">
        <div class="progress-modal-box">
          <WhisperProgress :is-busy="store.isBusy" @close="handleCloseProgress" />
        </div>
      </div>
    </Teleport>

    <!-- 结果弹窗 -->
    <div v-if="showResultModal" class="modal-mask">
      <div class="modal-box card">
        <div class="modal-icon">{{ resultData.success ? '✓' : '!' }}</div>
        <h3>{{ resultData.title }}</h3>
        <button class="btn-primary full" @click="showResultModal = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import WhisperProgress from './WhisperProgress.vue'
import { useWhisperStore } from '../stores/whisper'

const store = useWhisperStore()

const localExePath = ref('')
const targetPath = ref('')
const subFormats = ref(['lrc', 'srt', 'vtt'])
const canStart = computed(() => localExePath.value && targetPath.value)

const showProgressModal = ref(false)
const showResultModal = ref(false)
const resultData = ref({})

const statusText = computed(() => {
  if (store.isBusy) {
    return '翻译中...'
  }
  return '准备就绪'
})

// 打开进度页面
watch(
  () => store.isBusy,
  (busy) => {
    if (busy) {
      showProgressModal.value = true
    }
  }
)

const getSafePayload = () => {
  const formatsValue = subFormats.value
  const serializedFormats = (() => {
    try {
      const str = JSON.stringify(formatsValue)
      return JSON.parse(str)
    } catch {
      return ['lrc']
    }
  })()

  return {
    exePath: localExePath.value,
    targetPath: targetPath.value,
    subFormats: serializedFormats
  }
}

const sanitizePath = (val) => {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val[0] || ''
  if (val.filePath) return val.filePath
  if (val.filePaths && val.filePaths.length > 0) return val.filePaths[0]
  return ''
}

const selectExe = async () => {
  const p = await window.api.selectFile('exe')
  if (p) {
    localExePath.value = sanitizePath(p)
    saveWhisperConfig()
  }
}

const selectTarget = async () => {
  const p = await window.api.selectFile('dir')
  if (p) {
    targetPath.value = sanitizePath(p)
    saveWhisperConfig()
  }
}

const saveWhisperConfig = async () => {
  const payload = getSafePayload()
  console.log('[WhisperTool] 保存配置:', payload)
  await window.api.invoke('save-config', { whisper: payload })
  console.log('[WhisperTool] 配置保存完成')
}

// 任务完成处理器
const taskFinishedHandler = () => {
  store.stopTask()
  store.setProgress(100)
  resultData.value = {
    success: true,
    type: 'translate',
    title: '翻译任务结束'
  }
  showResultModal.value = true
}

onMounted(async () => {
  console.log('[WhisperTool] 组件挂载，开始加载配置')
  const result = await window.api.invoke('get-config')
  const cfg = result?.data || result
  console.log('[WhisperTool] 获取到的配置:', cfg?.whisper)
  if (cfg?.whisper) {
    if (cfg.whisper.exePath) {
      localExePath.value = cfg.whisper.exePath
      console.log('[WhisperTool] 加载 exePath:', cfg.whisper.exePath)
    }
    if (cfg.whisper.targetPath) {
      targetPath.value = cfg.whisper.targetPath
      console.log('[WhisperTool] 加载 targetPath:', cfg.whisper.targetPath)
    }
    if (cfg.whisper.subFormats && Array.isArray(cfg.whisper.subFormats)) {
      subFormats.value = cfg.whisper.subFormats
      console.log('[WhisperTool] 加载 subFormats:', cfg.whisper.subFormats)
    }
  } else {
    console.log('[WhisperTool] 未找到 whisper 配置')
  }

  window.api.onTaskFinished(taskFinishedHandler)
})

// 组件卸载时清理监听器
onUnmounted(() => {
  window.api.removeListener('task-finished', taskFinishedHandler)
})

const startTranslate = async () => {
  if (!canStart.value) return
  store.reset() // 先重置，再启动
  store.startTask()

  try {
    const count = await window.api.countMediaFiles(targetPath.value)
    store.totalFiles = count > 0 ? count : 1
    store.addLog(`扫描到 ${count} 个媒体文件`)
  } catch {
    store.totalFiles = 1
  }

  const payload = getSafePayload()
  try {
    await window.api.saveConfig({ whisper: payload })
    window.api.startTask(payload)
  } catch (e) {
    store.addLog(e.message)
    store.stopTask()
  }
}

const handleCloseProgress = () => {
  showProgressModal.value = false
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.status-tag {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 20px;
  background: #f5f5f5;
  color: #737373;
  border: 1px solid #e5e5e5;
}

.status-tag.running {
  color: #8b5cf6;
  border-color: #8b5cf6;
  background: #f0ebfc;
  font-weight: 500;
}

.content-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 14px;
  font-weight: 500;
  color: #525252;
}

.input-wrap {
  display: flex;
  gap: 10px;
}

.input {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  outline: none;
  font-size: 14px;
  color: #262626;
  background: #fff;
}

.input:focus {
  border-color: #8b5cf6;
}

.input:readonly {
  color: #737373;
  background: #fafafa;
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
  padding: 12px 20px;
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

.tags-group {
  display: flex;
  gap: 10px;
}

.tag-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.tag-checkbox input {
  display: none;
}

.tag-body {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  background: #f5f5f5;
  color: #737373;
  transition: all 0.2s ease;
}

.tag-checkbox input:checked + .tag-body {
  background: #8b5cf6;
  color: #fff;
}

.action-footer {
  margin-top: auto;
  display: flex;
  gap: 12px;
}

.action-footer .btn-primary,
.action-footer .btn-secondary {
  flex: 1;
  padding: 14px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e5e5;
}

/* 进度页面模态框 */
.progress-modal-box {
  width: 90%;
  max-width: 900px;
  height: 80vh;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* 结果弹窗 */
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
  width: 380px;
  padding: 24px;
  text-align: center;
}

.modal-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.modal-box h3 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 500;
  color: #262626;
}

.btn-full {
  width: 100%;
}
</style>
