<template>
  <div class="language-selector">
    <div class="selector-header">
      <span class="label">🌐 语言筛选</span>
      <span class="hint">(支持 $lang: / $-lang:)</span>
    </div>

    <div class="mode-toggle">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'include' }"
        @click="mode = 'include'"
      >
        包含 ($lang:)
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'exclude' }"
        @click="mode = 'exclude'"
      >
        不包含 ($-lang:)
      </button>
    </div>

    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        v-model="searchText"
        type="text"
        :placeholder="searchPlaceholder"
      />
      <button v-if="searchText" class="clear-btn" @click="searchText = ''">
        ✕
      </button>
    </div>

    <div class="lang-list">
      <label
        v-for="item in filteredLanguages"
        :key="item.code"
        class="lang-item"
        :class="{
          selected: isLanguageSelected(item.code),
          include: mode === 'include',
          exclude: mode === 'exclude',
        }"
      >
        <input
          type="checkbox"
          :checked="isLanguageSelected(item.code)"
          @change="toggleLanguage(item.code)"
        />
        <span class="lang-meta">
          <span class="lang-token">{{ getDisplayToken(item.code) }}</span>
          <span class="lang-desc">{{ item.region }} {{ item.name }}</span>
        </span>
      </label>

      <div v-if="filteredLanguages.length === 0" class="empty-state">
        未找到匹配语言
      </div>
    </div>

    <div
      v-if="selectedLangs.length > 0 || excludedLangs.length > 0"
      class="selected-langs"
    >
      <div class="selected-header">
        <span class="header-text">📋 已选:</span>
        <button class="clear-all-btn" @click="clearAll">清除</button>
      </div>

      <div class="lang-badges">
        <span
          v-for="code in selectedLangs"
          :key="`in-${code}`"
          class="lang-badge include"
          >$lang:{{ code }}$<button @click="removeSelected(code)">
            ✕
          </button></span
        >

        <span
          v-for="code in excludedLangs"
          :key="`ex-${code}`"
          class="lang-badge exclude"
          >$-lang:{{ code }}$<button @click="removeExcluded(code)">
            ✕
          </button></span
        >
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLanguageSelector } from "../composables/useLanguageSelector";

const props = defineProps({
  // 对外维持 include/exclude 双数组结构，与搜索语法 $lang/$-lang 一一对应。
  modelValue: { type: Object, default: () => ({ include: [], exclude: [] }) },
});

const emit = defineEmits(["update:modelValue"]);

// 组件本身只做 UI 绑定，筛选、模式切换与选中态判定由 composable 统一处理。
const {
  searchText,
  mode,
  selectedLangs,
  excludedLangs,
  searchPlaceholder,
  filteredLanguages,
  getDisplayToken,
  isLanguageSelected,
  toggleLanguage,
  clearAll,
  removeSelected,
  removeExcluded,
} = useLanguageSelector({ props, emit });
</script>

<style scoped>
.language-selector {
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
.mode-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.mode-btn {
  min-height: 34px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--comp-control-border);
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 88%,
    rgba(255, 253, 245, 0.08) 8%
  );
  color: var(--comp-text);
  cursor: pointer;
  transition: all 0.18s ease;
}
.mode-btn.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
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
.search-icon,
.clear-btn {
  color: color-mix(in srgb, var(--comp-muted) 72%, var(--comp-accent) 28%);
}
.clear-btn {
  border: none;
  background: transparent;
  cursor: pointer;
}
.langs-container {
  max-height: 220px;
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
.langs-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lang-item {
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
.lang-item:hover {
  background: color-mix(
    in srgb,
    var(--comp-accent) 10%,
    var(--comp-control-hover) 90%
  );
  border-color: color-mix(in srgb, var(--comp-accent) 30%, transparent);
}
.lang-item.selected.include {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--comp-accent) 58%, transparent);
  color: #fffdf4;
}
.lang-item.selected.exclude {
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  border-color: color-mix(in srgb, #c98b8b 42%, transparent);
  color: #fffdf4;
}
.lang-count {
  font-size: 11px;
  color: inherit;
  opacity: 0.78;
}
.selected-langs {
  margin-top: 12px;
  background: color-mix(
    in srgb,
    var(--comp-control-bg) 82%,
    rgba(255, 253, 245, 0.1) 18%
  );
  border: 1px solid var(--comp-divider);
  border-radius: 12px;
  padding: 12px;
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
.lang-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lang-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.lang-badge.include {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--comp-accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--comp-accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
}
.lang-badge.exclude {
  background: color-mix(in srgb, #7e4d4d 78%, #221414 22%);
  color: #fffdf4;
}
.lang-badge button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
</style>
