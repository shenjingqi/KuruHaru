<template>
  <div class="price-picker">
    <div class="picker-header">
      <span class="label">💰 价格筛选</span>
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
    <div class="input-container">
      <input
        v-model.number="inputValue"
        type="number"
        min="0"
        step="1"
        class="price-input"
        placeholder="输入价格"
        @input="emitUpdate"
      />
      <span class="unit">日元</span>
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
    <button v-if="hasValue" class="clear-btn" @click="clearValue">
      清除筛选
    </button>
  </div>
</template>
<script setup>
import { ref, computed, watch } from "vue";
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ value: null, mode: "greater" }),
  },
});
const emit = defineEmits(["update:modelValue"]);
const mode = ref(props.modelValue.mode || "greater");
const inputValue = ref(props.modelValue.value);
const presets = [
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "1500", value: 1500 },
  { label: "2000", value: 2000 },
  { label: "3000", value: 3000 },
];
const hasValue = computed(
  () => inputValue.value !== null && inputValue.value !== "",
);
const setPreset = (value) => {
  inputValue.value = value;
  emitUpdate();
};
const clearValue = () => {
  inputValue.value = null;
  emitUpdate();
};
const emitUpdate = () => {
  emit("update:modelValue", { value: inputValue.value, mode: mode.value });
};
watch(
  () => props.modelValue,
  (nv) => {
    if (nv) {
      mode.value = nv.mode || "greater";
      inputValue.value = nv.value;
    }
  },
  { deep: true },
);
</script>
<style scoped>
.price-picker {
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
.input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.price-input {
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
