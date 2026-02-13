import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWhisperStore = defineStore('whisper', () => {
  // 进度状态
  const isBusy = ref(false)
  const progressValue = ref(0)
  const currentFile = ref('')
  const totalFiles = ref(0)
  const processedCount = ref(0)
  const elapsedTime = ref(0)
  const startTime = ref(0)

  // 日志
  const logs = ref([])

  // 定时器
  let timerInterval = null

  const reset = () => {
    progressValue.value = 0
    currentFile.value = ''
    processedCount.value = 0
    totalFiles.value = 0
    elapsedTime.value = 0
    startTime.value = 0
    logs.value = []
  }

  const startTask = () => {
    isBusy.value = true
    // 重置后重新启动计时
    elapsedTime.value = 0
    startTime.value = Date.now()
    timerInterval = setInterval(() => {
      elapsedTime.value = Date.now() - startTime.value
    }, 1000)
  }

  const stopTask = () => {
    isBusy.value = false
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  const addLog = (msg) => {
    logs.value.push(msg)
    // 限制日志数量，防止内存溢出
    if (logs.value.length > 1000) {
      logs.value = logs.value.slice(-500)
    }
  }

  const setProgress = (value) => {
    progressValue.value = value
  }

  const setFileInfo = (file, current, total) => {
    currentFile.value = file
    processedCount.value = current
    totalFiles.value = total
  }

  return {
    isBusy,
    progressValue,
    currentFile,
    totalFiles,
    processedCount,
    elapsedTime,
    startTime,
    logs,
    startTask,
    stopTask,
    reset,
    addLog,
    setProgress,
    setFileInfo
  }
})
