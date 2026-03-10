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

export const useLanguageSelector = ({ props, emit }) => {
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
    // 外部传入语言码统一转大写，和 DSL 语法保持一致。
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
    // 同一语言在 include/exclude 间互斥，切换时会自动从另一侧移除。
    if (mode.value === "exclude") {
      if (excludedLangs.value.includes(code)) {
        excludedLangs.value = excludedLangs.value.filter(
          (item) => item !== code,
        );
      } else {
        excludedLangs.value.push(code);
        selectedLangs.value = selectedLangs.value.filter(
          (item) => item !== code,
        );
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
      // 持续同步父组件模型，兼容外部重置/回填场景。
      syncFromModelValue(value);
    },
    { deep: true },
  );

  onMounted(() => {
    syncFromModelValue(props.modelValue);
  });

  return {
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
  };
};
