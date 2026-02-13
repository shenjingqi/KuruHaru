<template>
  <div class="advanced-search">
    <div class="search-header">
      <h2>🔍 高级搜索</h2>
      <button class="reset-btn" @click="resetAll">🔄 重置</button>
    </div>
    <div class="search-content">
      <div class="main-panel">
        <TagSelector v-model="params.tags" />
        <DurationPicker v-model="params.duration" />
        <RatingPicker v-model="params.rating" />
        <PricePicker v-model="params.price" />
        <AgeSelector v-model="params.age" />
      </div>
      <div class="side-panel">
        <PresetManager
          :presets-data="presets"
          :current-params="params"
          @update:active="onPresetUpdate"
          @apply="onApplyPreset"
          @save="onSavePreset"
        />
        <SearchPreview :search-params="mergedParams" />
      </div>
    </div>
    <div class="search-actions">
      <button class="search-btn primary" @click="executeSearch">
        🚀 立即搜索
      </button>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed } from "vue";
import TagSelector from "./TagSelector.vue";
import DurationPicker from "./DurationPicker.vue";
import RatingPicker from "./RatingPicker.vue";
import PricePicker from "./PricePicker.vue";
import AgeSelector from "./AgeSelector.vue";
import PresetManager from "./PresetManager.vue";
import SearchPreview from "./SearchPreview.vue";

const params = reactive({
  tags: { include: [], exclude: [] },
  duration: { value: null, unit: "m", mode: "greater" },
  rating: { value: null, mode: "greater" },
  price: { value: null, mode: "greater" },
  age: "all",
});

// 预设的 tags（勾选预设时更新）
const presetTags = reactive({
  include: [],
  exclude: [],
});

const presets = ref([]);

// mergedParams 直接从 params 计算
const mergedParams = computed(() => {
  // 合并：用户选的 + 预设的（去重）
  const include = new Set([...params.tags.include, ...presetTags.include]);
  const exclude = new Set([...params.tags.exclude, ...presetTags.exclude]);

  return {
    tags: {
      include: Array.from(include),
      exclude: Array.from(exclude),
    },
    duration: params.duration,
    rating: params.rating,
    price: params.price,
    age: params.age,
  };
});

const resetAll = () => {
  params.tags = { include: [], exclude: [] };
  presetTags.include = [];
  presetTags.exclude = [];
  params.duration = { value: null, unit: "m", mode: "greater" };
  params.rating = { value: null, mode: "greater" };
  params.price = { value: null, mode: "greater" };
  params.age = "all";
};

// 勾选预设时：只更新预设的 tags（不覆盖用户选的）
const onPresetUpdate = (data) => {
  if (!data.presets || data.presets.length === 0) {
    // 没有勾选任何预设
    presetTags.include = [];
    presetTags.exclude = [];
    params.duration = { value: null, unit: "m", mode: "greater" };
    params.rating = { value: null, mode: "greater" };
    params.age = "all";
    return;
  }

  // 收集所有预设的 tags
  const allInclude = new Set();
  const allExclude = new Set();

  data.presets.forEach((name) => {
    const preset = presets.value.find((p) => p.name === name);
    if (!preset?.params) return;

    const p = preset.params;
    if (p.tags?.include?.length)
      p.tags.include.forEach((t) => allInclude.add(t));
    if (p.tags?.exclude?.length)
      p.tags.exclude.forEach((t) => allExclude.add(t));
  });

  presetTags.include = Array.from(allInclude);
  presetTags.exclude = Array.from(allExclude);

  // 取最后一个勾选预设的 duration/rating/age
  const lastPreset = data.presets
    .map((name) => presets.value.find((p) => p.name === name))
    .filter((p) => p?.params)
    .pop();
  if (lastPreset?.params) {
    if (lastPreset.params.duration?.value != null)
      params.duration = { ...lastPreset.params.duration };
    if (lastPreset.params.rating?.value != null)
      params.rating = { ...lastPreset.params.rating };
    if (lastPreset.params.age) params.age = lastPreset.params.age;
  }
};

// 点击预设名称时：加载预设的全部条件
const onApplyPreset = (presetParams) => {
  if (presetParams.tags) params.tags = { ...presetParams.tags };
  if (presetParams.duration) params.duration = { ...presetParams.duration };
  if (presetParams.rating) params.rating = { ...presetParams.rating };
  if (presetParams.age) params.age = presetParams.age;
  // 清空预设的标签（因为已经加载到用户标签里了）
  presetTags.include = [];
  presetTags.exclude = [];
};

const onSavePreset = (data) => {
  presets.value = data.presets;
};

const executeSearch = () => {
  const parts = [];
  const p = mergedParams.value;

  if (p.tags?.include?.length) {
    p.tags.include.forEach((t) => parts.push("$tag:" + t + "$"));
  }
  if (p.tags?.exclude?.length) {
    p.tags.exclude.forEach((t) => parts.push("$-tag:" + t + "$"));
  }
  if (p.duration?.value != null) {
    const suffix = p.duration.unit === "h" ? "h" : "m";
    const prefix = p.duration.mode === "less" ? "-" : "";
    parts.push("$" + prefix + "duration:" + p.duration.value + suffix + "$");
  }
  if (p.rating?.value != null) {
    const prefix = p.rating.mode === "less" ? "-" : "";
    parts.push("$" + prefix + "rate:" + p.rating.value + "$");
  }
  if (p.price?.value != null) {
    const prefix = p.price.mode === "less" ? "-" : "";
    parts.push("$" + prefix + "price:" + p.price.value + "$");
  }
  // 年龄分级
  if (p.age === "general") {
    parts.push("$age:general$");
  } else if (p.age === "r15") {
    parts.push("$age:r15$");
  } else if (p.age === "excludeAdult") {
    parts.push("$-age:adult$");
  }

  const query = parts.join(" ");
  const url =
    "https://api.asmr-200.com/api/search/" + encodeURIComponent(query);
  window.open(url, "_blank");
};
</script>
<style scoped>
.advanced-search {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.search-header h2 {
  margin: 0;
  font-size: 24px;
  color: #333;
}
.reset-btn {
  padding: 8px 16px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
}
.reset-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}
.search-content {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 20px;
  margin-bottom: 20px;
}
.main-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.search-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.search-btn {
  padding: 12px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}
.search-btn.primary {
  background: #1890ff;
  color: #fff;
}
.search-btn.primary:hover {
  background: #40a9ff;
}
</style>
