<template>
  <div class="age-selector">
    <div class="selector-header">
      <span class="label">年龄分级</span>
      <span class="hint">(默认全部)</span>
    </div>

    <div class="age-options">
      <!-- 当前选中状态显示 -->
      <div v-if="selected && selected !== 'all'" class="current-selection">
        <span class="current-badge">{{ getLabel(selected) }}</span>
      </div>
      <label class="age-option" :class="{ active: selected === 'all' }">
        <input v-model="selected" type="radio" value="all" />
        全部
      </label>
      <label class="age-option" :class="{ active: selected === 'general' }">
        <input v-model="selected" type="radio" value="general" />
        全年龄
      </label>
      <label class="age-option" :class="{ active: selected === 'r15' }">
        <input v-model="selected" type="radio" value="r15" />
        R15
      </label>
      <label
        class="age-option exclude"
        :class="{ active: selected === 'excludeAdult' }"
      >
        <input v-model="selected" type="radio" value="excludeAdult" />
        不要R18
      </label>
    </div>
  </div>
</template>
<script setup>
import { ref, watch } from "vue";
const props = defineProps({ modelValue: { type: String, default: "all" } });
const emit = defineEmits(["update:modelValue"]);
const selected = ref(props.modelValue || "all");
const emitUpdate = () => {
  emit("update:modelValue", selected.value);
};
const getLabel = (val) => {
  const labels = {
    general: "全年龄",
    r15: "R15",
    excludeAdult: "不要R18",
  };
  return labels[val] || val;
};
watch(
  () => selected.value,
  () => {
    emitUpdate();
  },
);
watch(
  () => props.modelValue,
  (val) => {
    if (val) selected.value = val;
  },
);
</script>
<style scoped>
.age-selector {
  background: color-mix(
    in srgb,
    var(--comp-surface-1) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-border);
  border-radius: 16px;
  padding: 16px;
}
.selector-header {
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
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
  font-size: 12px;
  font-weight: 700;
}
.age-option {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 10px 14px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-control-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  color: var(--comp-text);
}
.age-option:hover {
  border-color: color-mix(in srgb, var(--comp-accent) 30%, transparent);
}
.age-option.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
}
.age-option.exclude.active {
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border-color: color-mix(in srgb, #c98b8b 42%, transparent);
  color: #fffdf4;
}
.age-option input[type="radio"] {
  margin-right: 10px;
  accent-color: var(--comp-accent);
}
.age-option.exclude input[type="radio"] {
  accent-color: #c98b8b;
}
</style>
