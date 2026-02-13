<template>
  <div class="age-selector">
    <div class="selector-header">
      <span class="label">🎂 年龄分级</span>
      <span class="hint">(默认全部)</span>
    </div>

    <div class="age-options">
      <!-- 当前选中状态显示 -->
      <div v-if="selected && selected !== 'all'" class="current-selection">
        <span class="current-badge">{{ getLabel(selected) }}</span>
      </div>
      <label class="age-option" :class="{ active: selected === 'all' }">
        <input v-model="selected" type="radio" value="all" />
        🌐 全部
      </label>
      <label class="age-option" :class="{ active: selected === 'general' }">
        <input v-model="selected" type="radio" value="general" />
        👶 全年龄
      </label>
      <label class="age-option" :class="{ active: selected === 'r15' }">
        <input v-model="selected" type="radio" value="r15" />
        🔞 R15
      </label>
      <label class="age-option exclude" :class="{ active: selected === 'excludeAdult' }">
        <input v-model="selected" type="radio" value="excludeAdult" />
        🚫 不要R18
      </label>
    </div>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ modelValue: { type: String, default: 'all' } })
const emit = defineEmits(['update:modelValue'])
const selected = ref(props.modelValue || 'all')
const emitUpdate = () => {
  emit('update:modelValue', selected.value)
}
const getLabel = (val) => {
  const labels = { general: '👶 全年龄', r15: '🔞 R15', excludeAdult: '🚫 不要R18' }
  return labels[val] || val
}
watch(
  () => selected.value,
  () => {
    emitUpdate()
  }
)
watch(
  () => props.modelValue,
  (val) => {
    if (val) selected.value = val
  }
)
</script>
<style scoped>
.age-selector {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
}
.selector-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.label {
  font-weight: 600;
  color: #333;
}
.hint {
  font-size: 12px;
  color: #999;
}
.age-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.current-selection {
  margin-bottom: 8px;
}
.current-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #1890ff;
  color: #fff;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.age-option {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.age-option:hover {
  border-color: #1890ff;
}
.age-option.active {
  border-color: #1890ff;
  background: #e6f7ff;
}
.age-option.exclude.active {
  border-color: #ff4d4f;
  background: #fff2f0;
  color: #ff4d4f;
}
.age-option input[type='radio'] {
  margin-right: 10px;
  accent-color: #1890ff;
}
.age-option.exclude input[type='radio'] {
  accent-color: #ff4d4f;
}
</style>
