<template>
  <div class="page-container">
    <div class="progress-section card">
      <div class="progress-header">
        <span class="file-name">{{ store.currentFile || '等待开始...' }}</span>
        <span class="percentage">{{ overallProgress }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: overallProgress + '%' }"></div>
      </div>
      <div class="stats-row">
        <span>{{ statusText }}</span>
        <span>{{ formatTime(store.elapsedTime) }}</span>
      </div>
    </div>

    <div class="log-section card">
      <div ref="logRef" class="log-body">
        <div v-for="(log, i) in store.logs" :key="i" class="log-line">{{ log }}</div>
        <div v-if="store.logs.length === 0" class="log-empty">暂无日志</div>
      </div>
    </div>

    <div class="action-footer">
      <button class="btn-primary" :disabled="!store.isBusy" @click="stopTask">停止翻译</button>
      <button class="btn-secondary" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useWhisperStore } from '../stores/whisper'

const emit = defineEmits(['close'])
const store = useWhisperStore()
const logRef = ref(null)

const overallProgress = computed(() => {
  if (store.totalFiles > 0) {
    return Math.round((store.processedCount / store.totalFiles) * 100)
  }
  return 0
})

const statusText = computed(() => {
  if (store.totalFiles > 0) {
    return `正在翻译 (${store.processedCount}/${store.totalFiles})`
  }
  return '正在翻译...'
})

const formatTime = (ms) => {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

const stopTask = () => {
  window.api.stopTask()
  store.stopTask()
  store.addLog('[系统] 用户请求停止翻译')
}

const scrollToBottom = () => {
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight
    }
  })
}

// 保存监听器引用
let logHandler = null
let taskHandler = null

onMounted(() => {
  logHandler = (data) => {
    const msg = typeof data === 'string' ? data : data?.msg || ''
    const type = typeof data === 'object' ? data?.type : 'whisper'

    if (type === 'whisper-progress') {
      if (data.progress !== undefined) store.setProgress(data.progress)
      if (data.currentFile !== undefined && data.totalFiles !== undefined) {
        store.setFileInfo(data.file || '', data.currentFile, data.totalFiles)
      }
      return
    }

    if (type === 'whisper') {
      store.addLog(msg)
      const translateMatch = msg.match(/正在翻译[（(](\d+)\/(\d+)[）)]/)
      if (translateMatch) {
        store.processedCount = parseInt(translateMatch[1])
        store.totalFiles = parseInt(translateMatch[2])
      }
      const fileMatch = msg.match(/Processing[:\s]+(.+)/i)
      if (fileMatch) {
        store.currentFile = fileMatch[1].trim().split(/[/\\]/).pop()
        if (store.processedCount < store.totalFiles) store.processedCount++
      }
      scrollToBottom()
    }
  }

  taskHandler = () => {
    store.stopTask()
    store.processedCount = store.totalFiles
    store.addLog('[系统] 翻译任务完成')
    store.addLog(`[系统] 总耗时: ${formatTime(store.elapsedTime)}`)
    scrollToBottom()
  }

  window.api.onLogUpdate(logHandler)
  window.api.onTaskFinished(taskHandler)
})

onUnmounted(() => {
  // 清除所有监听器
  if (logHandler) {
    window.api.removeListener('log-update', logHandler)
    logHandler = null
  }
  if (taskHandler) {
    window.api.removeListener('task-finished', taskHandler)
    taskHandler = null
  }
})
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: #fafafa;
}

.progress-section {
  padding: 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.file-name {
  color: #8b5cf6;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16px;
}

.percentage {
  font-weight: 600;
  color: #262626;
}

.progress-track {
  height: 8px;
  background: #e5e5e5;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  transition: width 0.3s ease;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: #525252;
  padding-top: 8px;
  border-top: 1px solid #e5e5e5;
}

.log-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: 16px;
}

.log-body {
  flex: 1;
  overflow-y: auto;
  font-family: monospace;
  font-size: 13px;
  background: #fafafa;
  border-radius: 8px;
  padding: 12px;
}

.log-line {
  padding: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a3a3a3;
}

.log-body::-webkit-scrollbar {
  width: 6px;
}

.log-body::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

.action-footer {
  display: flex;
  gap: 12px;
}

.btn-primary {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #8b5cf6;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-secondary {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #f5f5f5;
  color: #525252;
  font-weight: 500;
  cursor: pointer;
}

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e5e5;
}
</style>
