<template>
  <div class="tag-selector">
    <div class="selector-header">
      <span class="label">{{ props.title }}</span>
      <span class="hint">{{ props.hint }}</span>
    </div>
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        v-model="searchText"
        type="text"
        :placeholder="props.searchPlaceholder"
      />
      <button v-if="searchText" class="clear-btn" @click="searchText = ''">
        ✕
      </button>
    </div>
    <div v-if="allTags.length > 0" class="tags-container">
      <div class="tags-grid">
        <label
          v-for="tag in filteredTags"
          :key="tag.id"
          class="tag-item"
          :class="{
            selected: selectedTags.includes(tag.name),
            excluded: excludedTags.includes(tag.name),
          }"
        >
          <input
            type="checkbox"
            :checked="selectedTags.includes(tag.name)"
            @change="toggleTag(tag.name)"
          />
          <span class="tag-name">{{ tag.name }}</span>
          <span class="tag-count">{{ tag.count }}</span>
        </label>
      </div>
    </div>
    <div
      v-if="selectedTags.length > 0 || excludedTags.length > 0"
      class="selected-tags"
    >
      <div class="selected-header">
        <span class="header-text">📋 已选:</span>
        <button class="clear-all-btn" @click="clearAllTags">清除</button>
      </div>
      <div class="tag-badges">
        <span v-for="tag in selectedTags" :key="tag" class="tag-badge include"
          >{{ tag }}<button @click="removeSelectedTag(tag)">✕</button></span
        >
        <span v-for="tag in excludedTags" :key="tag" class="tag-badge exclude"
          >{{ tag }}<button @click="removeExcludedTag(tag)">✕</button></span
        >
      </div>
    </div>
    <div class="exclude-toggle">
      <span class="toggle-label">模式:</span>
      <label
        ><input v-model="excludeMode" type="radio" :value="false" /> 包含</label
      >
      <label
        ><input v-model="excludeMode" type="radio" :value="true" /> 排除</label
      >
    </div>
  </div>
</template>
<script setup>
import { useTagSelector } from "../composables/useTagSelector";

const props = defineProps({
  // 统一对外暴露 include/exclude，便于上层直接拼接高级搜索参数。
  modelValue: { type: Object, default: () => ({ include: [], exclude: [] }) },
  // 通过标题/提示词实现复用：同一组件可承载普通标签和低愿力标签两种场景。
  title: { type: String, default: "🏷️ 标签选择" },
  hint: { type: String, default: "(可多选)" },
  searchPlaceholder: { type: String, default: "搜索标签..." },
});
const emit = defineEmits(["update:modelValue"]);

// 选中、排除与搜索过滤逻辑全部由 composable 管理，组件仅负责渲染与事件透传。
const {
  searchText,
  excludeMode,
  selectedTags,
  excludedTags,
  allTags,
  filteredTags,
  toggleTag,
  clearAllTags,
  removeSelectedTag,
  removeExcludedTag,
} = useTagSelector({ props, emit });
</script>
<style scoped>
.tag-selector {
  background: color-mix(
    in srgb,
    var(--comp-surface-1) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-border);
  border-radius: 16px;
  padding: 16px;
  color: var(--comp-text);
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
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-control-border);
  border-radius: 12px;
  margin-bottom: 12px;
}
.search-icon,
.clear-btn {
  color: color-mix(in srgb, var(--comp-muted) 72%, var(--comp-accent) 28%);
}
.search-box input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--comp-text);
}
.search-box input::placeholder {
  color: var(--comp-muted);
}
.clear-btn {
  border: none;
  background: transparent;
  cursor: pointer;
}
.tags-container {
  max-height: 300px;
  overflow-y: auto;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 76%,
    rgba(255, 253, 245, 0.1) 24%
  );
  border: 1px solid var(--comp-divider);
  border-radius: 12px;
  padding: 12px;
}
.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 12px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  border: 1px solid var(--comp-control-border);
  border-radius: 999px;
  cursor: pointer;
  color: var(--comp-text);
  transition: all 0.18s ease;
}
.tag-item:hover {
  background: color-mix(
    in srgb,
    var(--comp-accent) 10%,
    var(--comp-control-hover) 90%
  );
  border-color: color-mix(in srgb, var(--comp-accent) 30%, transparent);
}
.tag-item.selected {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
  box-shadow: 0 10px 20px
    color-mix(in srgb, var(--comp-accent) 20%, transparent);
}
.tag-item.excluded {
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border-color: color-mix(in srgb, #c98b8b 42%, transparent);
  color: #fffdf4;
}
.tag-item input {
  accent-color: var(--comp-accent);
}
.tag-count {
  font-size: 11px;
  color: inherit;
  opacity: 0.78;
}
.selected-tags {
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 82%,
    rgba(255, 253, 245, 0.1) 18%
  );
  border: 1px solid var(--comp-divider);
  border-radius: 12px;
  padding: 12px;
  margin-top: 12px;
}
.selected-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.header-text {
  font-size: 12px;
  color: var(--comp-muted);
}
.clear-all-btn {
  border: none;
  background: transparent;
  color: var(--comp-accent);
  cursor: pointer;
  font-size: 12px;
}
.tag-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.tag-badge.include {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
}
.tag-badge.exclude {
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  color: #fffdf4;
}
.tag-badge button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.exclude-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--comp-divider);
  color: var(--comp-text);
}
.toggle-label {
  font-size: 13px;
  color: var(--comp-muted);
}
.exclude-toggle input {
  accent-color: var(--comp-accent);
}
</style>
