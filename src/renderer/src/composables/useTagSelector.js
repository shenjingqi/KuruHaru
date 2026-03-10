import { ref, onMounted, computed, watch } from "vue";
import tagsData from "../../../../config/tags.json";

export const useTagSelector = ({ props, emit }) => {
  const searchText = ref("");
  const excludeMode = ref(false);
  const selectedTags = ref([]);
  const excludedTags = ref([]);

  const syncFromModelValue = (value) => {
    selectedTags.value = Array.isArray(value?.include)
      ? [...value.include]
      : [];
    excludedTags.value = Array.isArray(value?.exclude)
      ? [...value.exclude]
      : [];
  };

  const allTags = computed(() => {
    return tagsData
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        count: tag.count,
      }))
      .sort((leftTag, rightTag) => rightTag.count - leftTag.count);
  });

  const filteredTags = computed(() => {
    // 始终只返回前 50 个，避免标签量大时列表渲染抖动。
    if (!searchText.value) return allTags.value.slice(0, 50);

    const query = searchText.value.toLowerCase();
    return allTags.value
      .filter((tag) => tag.name.toLowerCase().includes(query))
      .slice(0, 50);
  });

  const emitUpdate = () => {
    emit("update:modelValue", {
      include: [...selectedTags.value],
      exclude: [...excludedTags.value],
    });
  };

  const toggleTag = (tag) => {
    // include/exclude 互斥：加入一侧时会自动从另一侧移除。
    if (excludeMode.value) {
      if (excludedTags.value.includes(tag)) {
        excludedTags.value = excludedTags.value.filter((item) => item !== tag);
      } else {
        excludedTags.value.push(tag);
        selectedTags.value = selectedTags.value.filter((item) => item !== tag);
      }
    } else if (selectedTags.value.includes(tag)) {
      selectedTags.value = selectedTags.value.filter((item) => item !== tag);
    } else {
      selectedTags.value.push(tag);
      excludedTags.value = excludedTags.value.filter((item) => item !== tag);
    }

    emitUpdate();
  };

  const clearAllTags = () => {
    selectedTags.value = [];
    excludedTags.value = [];
    emitUpdate();
  };

  const removeSelectedTag = (tag) => {
    selectedTags.value = selectedTags.value.filter((item) => item !== tag);
    emitUpdate();
  };

  const removeExcludedTag = (tag) => {
    excludedTags.value = excludedTags.value.filter((item) => item !== tag);
    emitUpdate();
  };

  onMounted(() => {
    syncFromModelValue(props.modelValue);
  });

  watch(
    () => props.modelValue,
    (value) => {
      // 外部模型变化（回填/清空）时保持内部选择态同步。
      syncFromModelValue(value);
    },
    { deep: true },
  );

  return {
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
  };
};
