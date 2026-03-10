import { ref, reactive, computed } from "vue";
import { buildSearchUrl } from "../utils/searchQueryBuilder";

const createEmptyBiFilter = () => ({ include: [], exclude: [] });

const createDefaultDuration = () => ({
  value: null,
  unit: "m",
  mode: "greater",
});

const createDefaultRating = () => ({
  value: null,
  mode: "greater",
});

const createDefaultPrice = () => ({
  value: null,
  mode: "greater",
});

const createEmptyPresetFilters = () => ({
  tags: createEmptyBiFilter(),
  tagw: createEmptyBiFilter(),
  lang: createEmptyBiFilter(),
});

const mergeBiFilter = (manual = {}, preset = {}) => {
  const include = new Set([
    ...(manual.include || []),
    ...(preset.include || []),
  ]);
  const exclude = new Set([
    ...(manual.exclude || []),
    ...(preset.exclude || []),
  ]);

  return {
    include: Array.from(include),
    exclude: Array.from(exclude),
  };
};

const clearPresetFilters = (presetFilters) => {
  presetFilters.tags.include = [];
  presetFilters.tags.exclude = [];
  presetFilters.tagw.include = [];
  presetFilters.tagw.exclude = [];
  presetFilters.lang.include = [];
  presetFilters.lang.exclude = [];
};

export const useAdvancedSearchWorkflow = () => {
  const params = reactive({
    tags: createEmptyBiFilter(),
    tagw: createEmptyBiFilter(),
    lang: createEmptyBiFilter(),
    duration: createDefaultDuration(),
    rating: createDefaultRating(),
    price: createDefaultPrice(),
    age: "all",
  });

  // 预设带来的筛选条件（勾选预设时更新）
  const presetFilters = reactive(createEmptyPresetFilters());
  const presets = ref([]);

  // mergedParams 直接从 params + presetFilters 计算
  const mergedParams = computed(() => {
    return {
      tags: mergeBiFilter(params.tags, presetFilters.tags),
      tagw: mergeBiFilter(params.tagw, presetFilters.tagw),
      lang: mergeBiFilter(params.lang, presetFilters.lang),
      duration: params.duration,
      rating: params.rating,
      price: params.price,
      age: params.age,
    };
  });

  const resetAll = () => {
    params.tags = createEmptyBiFilter();
    params.tagw = createEmptyBiFilter();
    params.lang = createEmptyBiFilter();
    clearPresetFilters(presetFilters);
    params.duration = createDefaultDuration();
    params.rating = createDefaultRating();
    params.price = createDefaultPrice();
    params.age = "all";
  };

  // 勾选预设时：只更新预设带来的筛选条件（不覆盖用户手动选择）
  const onPresetUpdate = (data) => {
    if (!data.presets || data.presets.length === 0) {
      // 没有勾选任何预设
      clearPresetFilters(presetFilters);
      params.duration = createDefaultDuration();
      params.rating = createDefaultRating();
      params.age = "all";
      return;
    }

    // 收集所有预设筛选条件
    const allTagInclude = new Set();
    const allTagExclude = new Set();
    const allTagwInclude = new Set();
    const allTagwExclude = new Set();
    const allLangInclude = new Set();
    const allLangExclude = new Set();

    data.presets.forEach((name) => {
      const preset = presets.value.find((p) => p.name === name);
      if (!preset?.params) return;

      const p = preset.params;
      if (p.tags?.include?.length)
        p.tags.include.forEach((t) => allTagInclude.add(t));
      if (p.tags?.exclude?.length)
        p.tags.exclude.forEach((t) => allTagExclude.add(t));
      if (p.tagw?.include?.length)
        p.tagw.include.forEach((t) => allTagwInclude.add(t));
      if (p.tagw?.exclude?.length)
        p.tagw.exclude.forEach((t) => allTagwExclude.add(t));
      if (p.lang?.include?.length)
        p.lang.include.forEach((lang) =>
          allLangInclude.add(String(lang).toUpperCase()),
        );
      if (p.lang?.exclude?.length)
        p.lang.exclude.forEach((lang) =>
          allLangExclude.add(String(lang).toUpperCase()),
        );
    });

    presetFilters.tags.include = Array.from(allTagInclude);
    presetFilters.tags.exclude = Array.from(allTagExclude);
    presetFilters.tagw.include = Array.from(allTagwInclude);
    presetFilters.tagw.exclude = Array.from(allTagwExclude);
    presetFilters.lang.include = Array.from(allLangInclude);
    presetFilters.lang.exclude = Array.from(allLangExclude);

    // 取最后一个勾选预设的 duration/rating/age
    const lastPreset = data.presets
      .map((name) => presets.value.find((p) => p.name === name))
      .filter((p) => p?.params)
      .pop();

    if (lastPreset?.params) {
      if (
        lastPreset.params.duration?.value !== null &&
        lastPreset.params.duration?.value !== undefined
      )
        params.duration = { ...lastPreset.params.duration };
      if (
        lastPreset.params.rating?.value !== null &&
        lastPreset.params.rating?.value !== undefined
      )
        params.rating = { ...lastPreset.params.rating };
      if (lastPreset.params.age) params.age = lastPreset.params.age;
    }
  };

  // 点击预设名称时：加载预设的全部条件
  const onApplyPreset = (presetParams) => {
    if (presetParams.tags) {
      params.tags = {
        include: [...(presetParams.tags.include || [])],
        exclude: [...(presetParams.tags.exclude || [])],
      };
    } else {
      params.tags = createEmptyBiFilter();
    }

    if (presetParams.tagw) {
      params.tagw = {
        include: [...(presetParams.tagw.include || [])],
        exclude: [...(presetParams.tagw.exclude || [])],
      };
    } else {
      params.tagw = createEmptyBiFilter();
    }

    if (presetParams.lang) {
      params.lang = {
        include: (presetParams.lang.include || []).map((lang) =>
          String(lang).toUpperCase(),
        ),
        exclude: (presetParams.lang.exclude || []).map((lang) =>
          String(lang).toUpperCase(),
        ),
      };
    } else {
      params.lang = createEmptyBiFilter();
    }

    if (presetParams.duration) params.duration = { ...presetParams.duration };
    if (presetParams.rating) params.rating = { ...presetParams.rating };
    if (presetParams.age) params.age = presetParams.age;

    // 清空预设合并区（因为已经加载到用户筛选里了）
    clearPresetFilters(presetFilters);
  };

  const onSavePreset = (data) => {
    presets.value = data.presets;
  };

  const executeSearch = () => {
    const url = buildSearchUrl(mergedParams.value);
    if (url) {
      window.open(url, "_blank");
    }
  };

  return {
    params,
    presets,
    mergedParams,
    resetAll,
    onPresetUpdate,
    onApplyPreset,
    onSavePreset,
    executeSearch,
  };
};
