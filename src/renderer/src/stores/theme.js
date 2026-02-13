import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const darkMode = ref(true)

  const setDarkMode = (value) => {
    darkMode.value = value
    localStorage.setItem('theme-darkMode', String(value))
  }

  // 初始化
  const saved = localStorage.getItem('theme-darkMode')
  if (saved !== null) {
    darkMode.value = saved === 'true'
  }

  return {
    darkMode,
    setDarkMode
  }
})
