<template>
  <div class="rating-picker">
    <div class="picker-header">
      <span class="label">评分筛选</span>
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
    <div class="slider-container">
      <input
        v-model.number="sliderValue"
        type="range"
        min="0"
        max="5"
        step="0.1"
        class="rating-slider"
        :style="ratingSliderStyle"
        @input="onSliderChange"
      />
      <div class="slider-labels">
        <span>0.0</span
        ><span class="current-value">{{ Number(sliderValue).toFixed(1) }}</span
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
const sliderValue = ref(4.5);
const inputValue = ref(4.5);
const ratingSliderStyle = computed(() => {
  const currentValue = Number(sliderValue.value);
  const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
  const clamped = Math.min(5, Math.max(0, safeValue));
  const progress = ((clamped / 5) * 100).toFixed(2);
  return {
    background: `linear-gradient(90deg, rgba(173,181,113,0.98) 0%, rgba(205,214,141,0.98) ${progress}%, rgba(132,137,118,0.28) ${progress}%, rgba(132,137,118,0.28) 100%)`,
    "--slider-track-glow": "rgba(173,181,113,0.24)",
    "--slider-thumb-glow": "rgba(173,181,113,0.44)",
  };
});
const presets = [
  { label: "3.0", value: 3.0 },
  { label: "4.0", value: 4.0 },
  { label: "4.5", value: 4.5 },
  { label: "4.8", value: 4.8 },
  { label: "5.0", value: 5.0 },
];
const hasValue = computed(
  () => inputValue.value !== null && inputValue.value !== "",
);
const onSliderChange = () => {
  // 滑块结果统一保留 1 位小数，避免输入框与滑块出现精度漂移。
  inputValue.value = parseFloat(Number(sliderValue.value).toFixed(1));
  emitUpdate();
};
const onInputChange = () => {
  if (inputValue.value !== null) {
    // 手动输入时将值限制在评分区间 [0, 5]，再映射回滑块位置。
    sliderValue.value = Math.min(Math.max(inputValue.value, 0), 5);
  }
  emitUpdate();
};
const setPreset = (value) => {
  // 预设按钮与手动输入共享同一更新路径，保持对外事件一致。
  inputValue.value = value;
  sliderValue.value = value;
  emitUpdate();
};
const clearValue = () => {
  inputValue.value = null;
  sliderValue.value = 0;
  emitUpdate();
};
// 组件只在这里对外发出 modelValue，便于维护单一数据出口。
const emitUpdate = () => {
  emit("update:modelValue", { value: inputValue.value, mode: mode.value });
};
// 父级回灌（如切换预设）时，重建本地编辑态。
watch(
  () => props.modelValue,
  (nv) => {
    if (nv) {
      mode.value = nv.mode || "greater";
      inputValue.value = nv.value;
      sliderValue.value = nv.value || 0;
    }
  },
  { deep: true },
);
</script>
<style scoped>
.rating-picker {
  background: color-mix(
    in srgb,
    var(--comp-surface-1) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-border);
  border-radius: 18px;
  padding: 18px;
}
.picker-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
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
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-control-border);
  border-radius: 14px;
  cursor: pointer;
  color: var(--comp-text);
  transition: all 0.18s ease;
}
.mode-selector label:hover,
.preset-btn:hover {
  border-color: color-mix(in srgb, var(--comp-accent) 30%, transparent);
}
.mode-selector label.active,
.preset-btn.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 90%, #cbd39c 10%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
  box-shadow: 0 12px 22px
    color-mix(in srgb, var(--comp-accent) 16%, transparent);
}
.slider-container {
  margin-bottom: 18px;
}
.rating-slider {
  width: 100%;
  height: 10px;
  -webkit-appearance: none;
  appearance: none;
  border: none;
  border-radius: 999px;
  background-size: 100% 100%;
  box-shadow:
    inset 0 0 0 1px rgba(205, 214, 141, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 16px
      color-mix(
        in srgb,
        var(--slider-track-glow, rgba(173, 181, 113, 0.24)) 38%,
        transparent
      );
  cursor: pointer;
}
.rating-slider:hover {
  box-shadow:
    inset 0 0 0 1px rgba(205, 214, 141, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-track-glow, rgba(173, 181, 113, 0.24)) 52%,
        transparent
      );
}
.rating-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -4px;
  border-radius: 50%;
  border: 3px solid rgba(255, 253, 245, 0.94);
  background: radial-gradient(
    circle at 35% 35%,
    #edf2ca 0%,
    #adb571 58%,
    #8f985f 100%
  );
  box-shadow:
    0 0 0 5px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.44)) 26%,
        transparent
      ),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.44)) 44%,
        transparent
      ),
    0 2px 6px rgba(0, 0, 0, 0.28);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.rating-slider:hover::-webkit-slider-thumb {
  transform: scale(1.04);
}
.rating-slider::-moz-range-track {
  height: 10px;
  border: none;
  border-radius: 999px;
  background: transparent;
}
.rating-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 3px solid rgba(255, 253, 245, 0.94);
  background: radial-gradient(
    circle at 35% 35%,
    #edf2ca 0%,
    #adb571 58%,
    #8f985f 100%
  );
  box-shadow:
    0 0 0 5px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.44)) 26%,
        transparent
      ),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.44)) 44%,
        transparent
      ),
    0 2px 6px rgba(0, 0, 0, 0.28);
}
.slider-labels {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--comp-muted);
}
.current-value {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  min-height: 30px;
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
  box-shadow: 0 10px 18px
    color-mix(in srgb, var(--comp-accent) 16%, transparent);
}
.input-container {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.rating-input {
  min-height: 42px;
  padding: 10px 14px;
  border: 1px solid var(--comp-control-border);
  border-radius: 14px;
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
.rating-input::placeholder {
  color: var(--comp-muted);
}
.unit {
  color: var(--comp-muted);
  font-weight: 600;
}
.clear-btn {
  width: 100%;
  min-height: 40px;
  padding: 10px;
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border: 1px solid color-mix(in srgb, #c98b8b 42%, transparent);
  border-radius: 14px;
  color: #fffdf4;
  cursor: pointer;
}
</style>
