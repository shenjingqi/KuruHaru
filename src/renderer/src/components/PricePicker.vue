<template>
  <div class="price-picker">
    <div class="picker-header">
      <span class="label">价格筛选</span>
      <span class="hint">(留空表示不限制)</span>
    </div>
    <div class="mode-selector">
      <label :class="{ active: mode === 'greater' }"
        ><input v-model="mode" type="radio" value="greater" /> 高于</label
      >
      <label :class="{ active: mode === 'less' }"
        ><input v-model="mode" type="radio" value="less" /> 低于</label
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
  // 预设和手输共用同一更新通道，确保对外事件结构稳定。
  inputValue.value = value;
  emitUpdate();
};
const clearValue = () => {
  // 用 null 表达“无价格限制”，而不是 0。
  inputValue.value = null;
  emitUpdate();
};
// 统一出口：所有本地交互最终都走这里同步给父组件。
const emitUpdate = () => {
  emit("update:modelValue", { value: inputValue.value, mode: mode.value });
};
// 响应父级传入的新条件（如加载搜索预设）。
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
  background: color-mix(
    in srgb,
    var(--comp-surface-1) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-border);
  border-radius: 16px;
  padding: 16px;
}
.picker-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.label {
  font-weight: 700;
  color: var(--comp-text);
}
.hint {
  font-size: 12px;
  color: var(--comp-muted);
}
.mode-selector,
.quick-select {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.mode-selector label,
.preset-btn {
  flex: 1;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-control-border);
  border-radius: 12px;
  cursor: pointer;
  color: var(--comp-text);
}
.mode-selector label.active,
.preset-btn.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
}
.input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.price-input {
  flex: 1;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--comp-control-border);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  outline: none;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  color: var(--comp-text);
}
.unit {
  color: var(--comp-muted);
}
.clear-btn {
  width: 100%;
  min-height: 38px;
  padding: 10px;
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border: 1px solid color-mix(in srgb, #c98b8b 42%, transparent);
  border-radius: 12px;
  color: #fffdf4;
  cursor: pointer;
}
</style>
