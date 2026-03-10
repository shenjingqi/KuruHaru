<template>
  <div class="duration-picker">
    <div class="picker-header">
      <span class="label">时长筛选</span>
      <span class="hint">(留空表示不限制)</span>
    </div>
    <div class="mode-selector">
      <label :class="{ active: mode === 'greater' }"
        ><input v-model="mode" type="radio" value="greater" /> 大于</label
      >
      <label :class="{ active: mode === 'less' }"
        ><input v-model="mode" type="radio" value="less" /> 小于</label
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
        :style="durationSliderStyle"
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
    default: () => ({ value: null, unit: "m", mode: "greater" }),
  },
});
const emit = defineEmits(["update:modelValue"]);
// 本地维护 UI 交互态（模式/单位/值），统一通过 emitUpdate 向外同步。
const mode = ref(props.modelValue.mode || "greater");
const unit = ref(props.modelValue.unit || "m");
const sliderValue = ref(30);
const inputValue = ref(30);
const durationSliderStyle = computed(() => {
  const currentValue = Number(sliderValue.value);
  const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
  const clamped = Math.min(180, Math.max(0, safeValue));
  const progress = ((clamped / 180) * 100).toFixed(2);
  return {
    background: `linear-gradient(90deg, rgba(15,108,189,0.98) 0%, rgba(72,166,255,0.98) ${progress}%, rgba(188,194,205,0.72) ${progress}%, rgba(188,194,205,0.72) 100%)`,
    "--slider-track-glow": "rgba(15,108,189,0.34)",
    "--slider-thumb-glow": "rgba(15,108,189,0.6)",
  };
});
const hasValue = computed(
  () => inputValue.value !== null && inputValue.value !== "",
);
const onSliderChange = () => {
  // 滑块只表达分钟值，直接回写到输入框后再统一触发更新。
  inputValue.value = sliderValue.value;
  emitUpdate();
};
const onInputChange = () => {
  if (inputValue.value !== null) {
    // 输入为小时时先换算成分钟，并对滑块上限 180 分钟做裁剪。
    if (unit.value === "h") {
      sliderValue.value = Math.min(inputValue.value * 60, 180);
    } else {
      sliderValue.value = Math.min(inputValue.value, 180);
    }
  }
  emitUpdate();
};
const clearValue = () => {
  inputValue.value = null;
  sliderValue.value = 0;
  emitUpdate();
};
const emitUpdate = () => {
  emit("update:modelValue", {
    value: inputValue.value,
    unit: unit.value,
    mode: mode.value,
  });
};
// 外部参数变化（如应用预设）时，回灌到本地状态以保持 UI 一致。
watch(
  () => props.modelValue,
  (nv) => {
    if (nv) {
      mode.value = nv.mode || "greater";
      unit.value = nv.unit || "m";
      inputValue.value = nv.value;
    }
  },
  { deep: true },
);
</script>
<style scoped>
.duration-picker {
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
.mode-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}
.mode-selector label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
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
.mode-selector label:hover {
  border-color: color-mix(in srgb, var(--comp-accent) 30%, transparent);
}
.mode-selector label.active {
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
.duration-slider {
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
        var(--slider-track-glow, rgba(173, 181, 113, 0.26)) 38%,
        transparent
      );
  cursor: pointer;
}
.duration-slider:hover {
  box-shadow:
    inset 0 0 0 1px rgba(205, 214, 141, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-track-glow, rgba(173, 181, 113, 0.26)) 52%,
        transparent
      );
}
.duration-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -5px;
  border-radius: 50%;
  border: 3px solid rgba(255, 253, 245, 0.94);
  background: radial-gradient(
    circle at 35% 35%,
    #d8dfab 0%,
    #adb571 58%,
    #8f985f 100%
  );
  box-shadow:
    0 0 0 5px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.46)) 28%,
        transparent
      ),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.46)) 48%,
        transparent
      ),
    0 2px 6px rgba(0, 0, 0, 0.28);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.duration-slider:hover::-webkit-slider-thumb {
  transform: scale(1.04);
}
.duration-slider::-moz-range-track {
  height: 10px;
  border: none;
  border-radius: 999px;
  background: transparent;
}
.duration-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid rgba(255, 253, 245, 0.94);
  background: radial-gradient(
    circle at 35% 35%,
    #d8dfab 0%,
    #adb571 58%,
    #8f985f 100%
  );
  box-shadow:
    0 0 0 5px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.46)) 28%,
        transparent
      ),
    0 10px 18px
      color-mix(
        in srgb,
        var(--slider-thumb-glow, rgba(173, 181, 113, 0.46)) 48%,
        transparent
      ),
    0 2px 6px rgba(0, 0, 0, 0.28);
}
.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--comp-muted);
}
.input-container {
  display: grid;
  grid-template-columns: 1fr 96px;
  gap: 10px;
  align-items: center;
}
.duration-input,
.unit-select {
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--comp-control-border);
  border-radius: 14px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  color: var(--comp-text);
  outline: none;
}
.duration-input::placeholder {
  color: var(--comp-muted);
}
.clear-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 14px;
  padding: 10px;
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border: 1px solid color-mix(in srgb, #c98b8b 42%, transparent);
  border-radius: 14px;
  color: #fffdf4;
  cursor: pointer;
}
</style>
