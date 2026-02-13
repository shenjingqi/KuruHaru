<template>
  <div class="rating-picker">
    <div class="picker-header">
      <span class="label">⭐ 评分筛选</span>
      <span class="hint">(留空表示不限制)</span>
    </div>
    <div class="mode-selector">
      <label :class="{ active: mode === 'greater' }"
        ><input v-model="mode" type="radio" value="greater" /> 📈 高于</label
      >
      <label :class="{ active: mode === 'less' }"
        ><input v-model="mode" type="radio" value="less" /> 📉 低于</label
      >
    </div>
    <div class="slider-container">
      <input
        v-model.number="sliderValue"
        type="range"
        min="0"
        max="5"
        step="0.1"
        class="rating-slider"
        @input="onSliderChange"
      />
      <div class="slider-labels">
        <span>0.0</span><span class="current-value">{{ Number(sliderValue).toFixed(1) }}</span
        ><span>5.0</span>
      </div>
    </div>
    <div class="input-container">
      <input
        v-model.number="inputValue"
        type="number"
        min="0"
        max="5"
        step="0.1"
        class="rating-input"
        placeholder="输入评分"
        @input="onInputChange"
      />
      <span class="unit">分</span>
    </div>
    <div class="quick-select">
      <button
        v-for="preset in presets"
        :key="preset.value"
        class="preset-btn"
        :class="{ active: inputValue === preset.value }"
        @click="setPreset(preset.value)"
      >
        {{ preset.label }}
      </button>
    </div>
    <button v-if="hasValue" class="clear-btn" @click="clearValue">清除筛选</button>
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
const props = defineProps({
  modelValue: { type: Object, default: () => ({ value: null, mode: 'greater' }) }
})
const emit = defineEmits(['update:modelValue'])
const mode = ref(props.modelValue.mode || 'greater')
const sliderValue = ref(4.5)
const inputValue = ref(4.5)
const presets = [
  { label: '3.0', value: 3.0 },
  { label: '4.0', value: 4.0 },
  { label: '4.5', value: 4.5 },
  { label: '4.8', value: 4.8 },
  { label: '5.0', value: 5.0 }
]
const hasValue = computed(() => inputValue.value !== null && inputValue.value !== '')
const onSliderChange = () => {
  inputValue.value = parseFloat(Number(sliderValue.value).toFixed(1))
  emitUpdate()
}
const onInputChange = () => {
  if (inputValue.value !== null) {
    sliderValue.value = Math.min(Math.max(inputValue.value, 0), 5)
  }
  emitUpdate()
}
const setPreset = (value) => {
  inputValue.value = value
  sliderValue.value = value
  emitUpdate()
}
const clearValue = () => {
  inputValue.value = null
  sliderValue.value = 0
  emitUpdate()
}
const emitUpdate = () => {
  emit('update:modelValue', { value: inputValue.value, mode: mode.value })
}
watch(
  () => props.modelValue,
  (nv) => {
    if (nv) {
      mode.value = nv.mode || 'greater'
      inputValue.value = nv.value
      sliderValue.value = nv.value || 0
    }
  },
  { deep: true }
)
</script>
<style scoped>
.rating-picker {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
}
.picker-header {
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
.mode-selector {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.mode-selector label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
}
.mode-selector label.active {
  border-color: #1890ff;
  background: #e6f7ff;
  color: #1890ff;
}
.slider-container {
  margin-bottom: 16px;
}
.rating-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  background: linear-gradient(to right, #52c41a, #52c41a);
  border-radius: 3px;
}
.rating-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: #1890ff;
  border-radius: 50%;
  cursor: pointer;
}
.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}
.current-value {
  font-size: 18px;
  font-weight: 600;
  color: #1890ff;
}
.input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.rating-input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  outline: none;
}
.unit {
  font-size: 14px;
  color: #666;
}
.quick-select {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.preset-btn {
  flex: 1;
  padding: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.preset-btn:hover {
  border-color: #1890ff;
}
.preset-btn.active {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}
.clear-btn {
  width: 100%;
  padding: 10px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  color: #666;
  cursor: pointer;
}
.clear-btn:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
}
</style>
