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
import { computed, onMounted, ref, watch } from "vue";

const LANGUAGE_OPTIONS = [
  { code: "JPN", region: "JP", name: "日本語" },
  { code: "ENG", region: "US", name: "English" },
  { code: "CHI_HANS", region: "CN", name: "简体中文" },
  { code: "CHI_HANT", region: "HK", name: "繁體中文" },
  { code: "CHI", region: "CN", name: "中文" },
  { code: "KO_KR", region: "KR", name: "한국어" },
  { code: "SPA", region: "ES", name: "Español" },
  { code: "ITA", region: "IT", name: "Italiano" },
  { code: "GER", region: "DE", name: "Deutsch" },
  { code: "FRE", region: "FR", name: "Français" },
];

const props = defineProps({
  modelValue: { type: Object, default: () => ({ include: [], exclude: [] }) },
});

const emit = defineEmits(["update:modelValue"]);

const searchText = ref("");
const mode = ref("include");
const selectedLangs = ref([]);
const excludedLangs = ref([]);

const searchPlaceholder = computed(() => {
  return mode.value === "include"
    ? "搜索要包含的语言，例如 $lang:JPN$"
    : "搜索要排除的语言，例如 $-lang:ENG$";
});

const filteredLanguages = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!query) return LANGUAGE_OPTIONS;

  return LANGUAGE_OPTIONS.filter((item) => {
    const code = item.code.toLowerCase();
    const region = item.region.toLowerCase();
    const name = item.name.toLowerCase();
    const includeToken = `$lang:${item.code}$`.toLowerCase();
    const excludeToken = `$-lang:${item.code}$`.toLowerCase();
    return (
      includeToken.includes(query) ||
      excludeToken.includes(query) ||
      code.includes(query) ||
      region.includes(query) ||
      name.includes(query)
    );
  });
});

const emitUpdate = () => {
  emit("update:modelValue", {
    include: [...selectedLangs.value],
    exclude: [...excludedLangs.value],
  });
};

const syncFromModelValue = (value) => {
  selectedLangs.value = Array.isArray(value?.include)
    ? value.include.map((item) => String(item).toUpperCase())
    : [];
  excludedLangs.value = Array.isArray(value?.exclude)
    ? value.exclude.map((item) => String(item).toUpperCase())
    : [];
};

const getDisplayToken = (code) => {
  return mode.value === "include" ? `$lang:${code}$` : `$-lang:${code}$`;
};

const isLanguageSelected = (code) => {
  return mode.value === "include"
    ? selectedLangs.value.includes(code)
    : excludedLangs.value.includes(code);
};

const toggleLanguage = (code) => {
  if (mode.value === "exclude") {
    if (excludedLangs.value.includes(code)) {
      excludedLangs.value = excludedLangs.value.filter((item) => item !== code);
    } else {
      excludedLangs.value.push(code);
      selectedLangs.value = selectedLangs.value.filter((item) => item !== code);
    }
  } else if (selectedLangs.value.includes(code)) {
    selectedLangs.value = selectedLangs.value.filter((item) => item !== code);
  } else {
    selectedLangs.value.push(code);
    excludedLangs.value = excludedLangs.value.filter((item) => item !== code);
  }

  emitUpdate();
};

const clearAll = () => {
  selectedLangs.value = [];
  excludedLangs.value = [];
  emitUpdate();
};

const removeSelected = (code) => {
  selectedLangs.value = selectedLangs.value.filter((value) => value !== code);
  emitUpdate();
};

const removeExcluded = (code) => {
  excludedLangs.value = excludedLangs.value.filter((value) => value !== code);
  emitUpdate();
};

watch(
  () => props.modelValue,
  (value) => {
    syncFromModelValue(value);
  },
  { deep: true },
);

onMounted(() => {
  syncFromModelValue(props.modelValue);
});
</script>

<style scoped>
.language-selector {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
}

.selector-header {
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

.mode-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.mode-btn {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #595959;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: #40a9ff;
  color: #1677ff;
}

.mode-btn.active {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.search-box {
  display: flex;
  align-items: center;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px 12px;
}

.search-box input {
  flex: 1;
  border: none;
  outline: none;
}

.clear-btn {
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
}

.lang-list {
  margin-top: 12px;
  max-height: 260px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
}

.lang-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.lang-item:hover {
  background: #f5f5f5;
}

.lang-item.selected.include {
  background: #e6f7ff;
  border: 1px solid #1890ff;
}

.lang-item.selected.exclude {
  background: #fff2f0;
  border: 1px solid #ff4d4f;
}

.lang-meta {
  display: flex;
  flex-direction: column;
}

.lang-token {
  font-family: monospace;
  font-size: 12px;
  color: #333;
}

.lang-desc {
  font-size: 12px;
  color: #666;
}

.empty-state {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 8px;
}

.selected-langs {
  margin-top: 12px;
  background: #fff;
  border-radius: 8px;
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
  color: #666;
}

.clear-all-btn {
  border: none;
  background: transparent;
  color: #1890ff;
  cursor: pointer;
  font-size: 12px;
}

.lang-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lang-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lang-badge button {
  border: none;
  background: transparent;
  cursor: pointer;
}

.lang-badge.include {
  background: #e6f7ff;
  color: #1890ff;
}

.lang-badge.exclude {
  background: #fff2f0;
  color: #ff4d4f;
}
</style>
