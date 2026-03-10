import { ref, watch, onMounted } from "vue";

export const usePresetManagerWorkflow = ({ props, emit }) => {
  const presetName = ref("");
  const presets = ref([]);
  const activePresets = ref([]);

  const emitPresetsUpdate = () => {
    emit("save", { presets: presets.value });
  };

  watch(
    () => props.presetsData,
    (val) => {
      // 仅在本地预设为空时接管父级数据，避免双向同步时互相覆盖。
      if (
        val &&
        Array.isArray(val) &&
        val.length > 0 &&
        presets.value.length === 0
      ) {
        presets.value = val;
        emitPresetsUpdate();
      }
    },
    { immediate: true },
  );

  const getPresetTags = (preset) => {
    if (!preset?.params) return [];

    const normalTags = [
      ...(preset.params.tags?.include || []),
      ...(preset.params.tags?.exclude || []),
    ];
    const lowWishTags = [
      ...(preset.params.tagw?.include || []),
      ...(preset.params.tagw?.exclude || []),
    ].map((tag) => `低愿力:${tag}`);
    const langs = [
      ...(preset.params.lang?.include || []),
      ...(preset.params.lang?.exclude || []),
    ].map((lang) => `语言:${String(lang).toUpperCase()}`);

    return [...normalTags, ...lowWishTags, ...langs];
  };

  const updateParent = () => {
    const merged = mergePresets();
    emit("update:active", {
      presets: [...activePresets.value],
      params: merged,
    });
  };

  const togglePreset = (name) => {
    const idx = activePresets.value.indexOf(name);
    if (idx >= 0) {
      activePresets.value.splice(idx, 1);
    } else {
      activePresets.value.push(name);
    }
    updateParent();
  };

  const loadPreset = (preset) => {
    if (preset?.params) {
      emit("apply", preset.params);
    }
  };

  const saveToStorage = () => {
    try {
      const data = JSON.stringify(presets.value);
      localStorage.setItem("searchPresets", data);
    } catch (e) {
      console.error("保存失败", e);
    }
  };

  const deletePreset = (index) => {
    const name = presets.value[index].name;
    presets.value.splice(index, 1);
    const idx = activePresets.value.indexOf(name);
    if (idx >= 0) activePresets.value.splice(idx, 1);
    saveToStorage();
    updateParent();
  };

  const normalizeCurrentParams = () => {
    const ageValue = props.currentParams.age;
    // 兼容旧结构：age 可能是字符串，也可能是 { age: "..." } 对象。
    const ageStr =
      typeof ageValue === "string" ? ageValue : ageValue?.age || "all";

    return {
      tags: props.currentParams.tags
        ? JSON.parse(JSON.stringify(props.currentParams.tags))
        : { include: [], exclude: [] },
      tagw: props.currentParams.tagw
        ? JSON.parse(JSON.stringify(props.currentParams.tagw))
        : { include: [], exclude: [] },
      lang: props.currentParams.lang
        ? {
            include: (props.currentParams.lang.include || []).map((lang) =>
              String(lang).toUpperCase(),
            ),
            exclude: (props.currentParams.lang.exclude || []).map((lang) =>
              String(lang).toUpperCase(),
            ),
          }
        : { include: [], exclude: [] },
      duration: props.currentParams.duration
        ? JSON.parse(JSON.stringify(props.currentParams.duration))
        : null,
      rating: props.currentParams.rating
        ? JSON.parse(JSON.stringify(props.currentParams.rating))
        : null,
      age: ageStr,
    };
  };

  const savePreset = () => {
    if (!presetName.value.trim()) return;

    const existingIndex = presets.value.findIndex(
      (p) => p.name === presetName.value.trim(),
    );

    const newPreset = {
      name: presetName.value.trim(),
      params: normalizeCurrentParams(),
    };

    if (existingIndex >= 0) {
      // 同名预设走覆盖确认，避免无提示地替换历史配置。
      if (confirm(`预设"${presetName.value}"已存在，是否更新？`)) {
        presets.value[existingIndex] = newPreset;
      } else {
        return;
      }
    } else {
      presets.value.push(newPreset);
    }

    saveToStorage();
    emit("save", { presets: presets.value });
    presetName.value = "";
  };

  const updatePreset = (preset) => {
    const index = presets.value.findIndex((p) => p.name === preset.name);
    if (index >= 0) {
      presets.value[index] = {
        name: preset.name,
        params: normalizeCurrentParams(),
      };
      saveToStorage();
      emit("save", { presets: presets.value });
    }
  };

  const mergePresets = () => {
    const result = {
      tags: { include: [], exclude: [] },
      tagw: { include: [], exclude: [] },
      lang: { include: [], exclude: [] },
      duration: null,
      rating: null,
      age: "all",
    };

    activePresets.value.forEach((name) => {
      const preset = presets.value.find((p) => p.name === name);
      if (!preset?.params) return;

      const p = preset.params;

      if (p.tags?.include?.length) {
        p.tags.include.forEach((t) => {
          if (!result.tags.include.includes(t)) result.tags.include.push(t);
        });
      }
      if (p.tags?.exclude?.length) {
        p.tags.exclude.forEach((t) => {
          if (!result.tags.exclude.includes(t)) result.tags.exclude.push(t);
        });
      }
      if (p.tagw?.include?.length) {
        p.tagw.include.forEach((t) => {
          if (!result.tagw.include.includes(t)) result.tagw.include.push(t);
        });
      }
      if (p.tagw?.exclude?.length) {
        p.tagw.exclude.forEach((t) => {
          if (!result.tagw.exclude.includes(t)) result.tagw.exclude.push(t);
        });
      }
      if (p.lang?.include?.length) {
        p.lang.include.forEach((lang) => {
          const normalized = String(lang).toUpperCase();
          if (!result.lang.include.includes(normalized))
            result.lang.include.push(normalized);
        });
      }
      if (p.lang?.exclude?.length) {
        p.lang.exclude.forEach((lang) => {
          const normalized = String(lang).toUpperCase();
          if (!result.lang.exclude.includes(normalized))
            result.lang.exclude.push(normalized);
        });
      }
      if (p.duration?.value !== null && p.duration?.value !== undefined)
        // 数值区间类字段按“最后激活的预设覆盖”处理，避免冲突叠加。
        result.duration = { ...p.duration };
      if (p.rating?.value !== null && p.rating?.value !== undefined)
        result.rating = { ...p.rating };
      if (p.age && p.age !== "all") result.age = p.age;
    });

    return result;
  };

  onMounted(() => {
    try {
      const saved = localStorage.getItem("searchPresets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((preset) => {
            if (preset.params?.age && typeof preset.params.age !== "string") {
              preset.params.age = preset.params.age?.age || "all";
            }
          });
          presets.value = parsed;
          emitPresetsUpdate();
          return;
        }
      }
    } catch (e) {
      console.error("加载失败", e);
    }

    if (props.presetsData && props.presetsData.length > 0) {
      presets.value = props.presetsData;
      emitPresetsUpdate();
    }
  });

  return {
    presetName,
    presets,
    activePresets,
    getPresetTags,
    togglePreset,
    loadPreset,
    deletePreset,
    savePreset,
    updatePreset,
  };
};
