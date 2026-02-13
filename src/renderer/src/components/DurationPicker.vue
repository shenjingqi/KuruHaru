<template>
  <div class="duration-picker">
    <div class="picker-header">
      <span class="label">⏱️ 时长筛选</span>
      <span class="hint">(留空表示不限制)</span>
    </div>
    <div class="mode-selector">
      <label :class="{ active: mode === 'greater' }"
        ><input v-model="mode" type="radio" value="greater" /> 📈 大于</label
      >
      <label :class="{ active: mode === 'less' }"
        ><input v-model="mode" type="radio" value="less" /> 📉 小于</label
      >
    </div>
    <div class="slider-container">
      <input
        v-model="sliderValue"
        type="range"
        min="0"
        max="180"
        step="5"
        class="duration-slider"
        @input="onSliderChange"
      />
      <div class="slider-labels"><span>0分钟</span><span>180分钟</span></div>
    </div>
    <div class="input-container">
      <input
        v-model.number="inputValue"
        type="number"
        min="0"
        class="duration-input"
        placeholder="输入时长"
        @input="onInputChange"
      />
      <select v-model="unit" class="unit-select">
        <option value="m">分钟</option>
        <option value="h">小时</option>
      </select>
    </div>
    <button v-if="hasValue" class="clear-btn" @click="clearValue">清除筛选</button>
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
const props = defineProps({
  modelValue: { type: Object, default: () => ({ value: null, unit: 'm', mode: 'greater' }) }
})
const emit = defineEmits(['update:modelValue'])
const mode = ref(props.modelValue.mode || 'greater')
const unit = ref(props.modelValue.unit || 'm')
const sliderValue = ref(30)
const inputValue = ref(30)
const hasValue = computed(() => inputValue.value !== null && inputValue.value !== '')
const onSliderChange = () => {
  inputValue.value = sliderValue.value
  emitUpdate()
}
const onInputChange = () => {
  if (inputValue.value !== null) {
    if (unit.value === 'h') {
      sliderValue.value = Math.min(inputValue.value * 60, 180)
    } else {
      sliderValue.value = Math.min(inputValue.value, 180)
    }
  }
  emitUpdate()
}
const clearValue = () => {
  inputValue.value = null
  sliderValue.value = 0
  emitUpdate()
}
const emitUpdate = () => {
  emit('update:modelValue', { value: inputValue.value, unit: unit.value, mode: mode.value })
}
watch(
  () => props.modelValue,
  (nv) => {
    if (nv) {
      mode.value = nv.mode || 'greater'
      unit.value = nv.unit || 'm'
      inputValue.value = nv.value
    }
  },
  { deep: true }
)
</script>
<style scoped>
.duration-picker {
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
.duration-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  background: linear-gradient(to right, #e0e0e0, #e0e0e0);
  border-radius: 3px;
}
.duration-slider::-webkit-slider-thumb {
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
.input-container {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.duration-input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.unit-select {
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
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
