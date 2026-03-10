<template>
  <div class="preset-manager">
    <div class="preset-header">
      <span class="label">💾 预设管理</span>
    </div>

    <!-- 保存/更新预设 -->
    <div class="preset-save">
      <input
        v-model="presetName"
        type="text"
        placeholder="输入预设名称"
        class="preset-input"
      />
      <button class="save-btn" :disabled="!presetName" @click="savePreset">
        保存
      </button>
    </div>

    <!-- 预设列表 -->
    <div v-if="presets.length > 0" class="preset-list">
      <div
        v-for="(preset, index) in presets"
        :key="index"
        class="preset-item"
        :class="{ active: activePresets.includes(preset.name) }"
        @click="loadPreset(preset)"
      >
        <label class="preset-checkbox">
          <input
            type="checkbox"
            :checked="activePresets.includes(preset.name)"
            @change="togglePreset(preset.name)"
          />
        </label>
        <span class="preset-name">{{ preset.name }}</span>
        <div v-if="getPresetTags(preset).length > 0" class="preset-tags">
          <span
            v-for="tag in getPresetTags(preset).slice(0, 3)"
            :key="tag"
            class="mini-tag"
            >{{ tag }}</span
          >
          <span v-if="getPresetTags(preset).length > 3" class="more-tags"
            >+{{ getPresetTags(preset).length - 3 }}</span
          >
        </div>
        <div class="preset-actions">
          <button
            class="update-btn"
            title="用当前条件更新"
            @click.stop="updatePreset(preset)"
          >
            ✏️
          </button>
          <button class="delete-btn" @click.stop="deletePreset(index)">
            ✕
          </button>
        </div>
      </div>
    </div>

    <div v-else class="preset-empty">
      <span>选择好条件后保存为预设</span>
    </div>
  </div>
</template>
<script setup>
import { usePresetManagerWorkflow } from "../composables/usePresetManagerWorkflow";

const props = defineProps({
  presetsData: { type: Array, default: () => [] },
  currentParams: {
    type: Object,
    default: () => ({
      tags: { include: [], exclude: [] },
      tagw: { include: [], exclude: [] },
      lang: { include: [], exclude: [] },
      duration: null,
      rating: null,
      age: "all",
    }),
  },
});
const emit = defineEmits(["update:active", "apply", "save"]);

const {
  presetName,
  presets,
  activePresets,
  getPresetTags,
  togglePreset,
  loadPreset,
  deletePreset,
  savePreset,
  updatePreset,
} = usePresetManagerWorkflow({ props, emit });
</script>
<style scoped>
.preset-manager {
  background: color-mix(
    in srgb,
    var(--comp-surface-1) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-border);
  border-radius: 16px;
  padding: 16px;
}
.preset-header {
  margin-bottom: 12px;
}
.label {
  font-weight: 700;
  color: var(--comp-text);
}
.preset-save {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.preset-input {
  flex: 1;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--comp-control-border);
  border-radius: 12px;
  outline: none;
  font-size: 13px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  color: var(--comp-text);
}
.preset-input::placeholder {
  color: var(--comp-muted);
}
.save-btn {
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid color-mix(in srgb, var(--comp-accent) 56%, transparent);
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}
.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.preset-list {
  max-height: 220px;
  overflow-y: auto;
}
.preset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid transparent;
  border-radius: 12px;
  margin-bottom: 6px;
}
.preset-item.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 22%, transparent),
    color-mix(in srgb, var(--comp-accent) 12%, rgba(0, 0, 0, 0.06))
  );
  border-color: color-mix(in srgb, var(--comp-accent) 42%, transparent);
  box-shadow: 0 10px 20px
    color-mix(in srgb, var(--comp-accent) 16%, transparent);
}
.preset-checkbox {
  display: flex;
  align-items: center;
}
.preset-checkbox input {
  accent-color: var(--comp-accent);
}
.preset-name {
  flex: 1;
  font-size: 14px;
  color: var(--comp-text);
  cursor: pointer;
}
.preset-name:hover {
  color: var(--comp-accent);
}
.preset-tags {
  display: flex;
  gap: 4px;
  max-width: 120px;
  overflow: hidden;
}
.mini-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 6px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid color-mix(in srgb, var(--comp-border) 70%, transparent);
  border-radius: 999px;
  font-size: 10px;
  color: var(--comp-muted);
  white-space: nowrap;
}
.more-tags {
  font-size: 10px;
  color: var(--comp-muted);
}
.preset-actions {
  display: flex;
  gap: 4px;
}
.update-btn,
.delete-btn {
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 8px;
  background: transparent;
}
.update-btn {
  color: color-mix(in srgb, var(--comp-accent) 82%, #d8dfab 18%);
}
.update-btn:hover {
  background: color-mix(in srgb, var(--comp-accent) 12%, transparent);
}
.delete-btn {
  color: color-mix(in srgb, var(--comp-muted) 74%, #b68484 26%);
}
.delete-btn:hover {
  background: color-mix(in srgb, #7e4d4d 18%, transparent);
  color: #fff1f1;
}
.preset-empty {
  text-align: center;
  color: var(--comp-muted);
  padding: 20px 0;
  font-size: 13px;
}
</style>
