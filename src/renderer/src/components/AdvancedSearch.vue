<template>
  <div class="advanced-search advanced-search-theme">
    <div class="search-header">
      <h2>高级搜索</h2>
      <button class="reset-btn" @click="resetAll">重置</button>
    </div>
    <div class="search-content">
      <div class="main-panel">
        <TagSelector v-model="params.tags" />
        <TagSelector
          v-model="params.tagw"
          title="包含低愿力标签"
          hint="($tagw: / $-tagw:)"
          search-placeholder="搜索低愿力标签..."
        />
        <LanguageSelector v-model="params.lang" />
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
        立即搜索
      </button>
    </div>
  </div>
</template>
<script setup>
import TagSelector from "./TagSelector.vue";
import DurationPicker from "./DurationPicker.vue";
import RatingPicker from "./RatingPicker.vue";
import PricePicker from "./PricePicker.vue";
import AgeSelector from "./AgeSelector.vue";
import LanguageSelector from "./LanguageSelector.vue";
import PresetManager from "./PresetManager.vue";
import SearchPreview from "./SearchPreview.vue";
import { useAdvancedSearchWorkflow } from "../composables/useAdvancedSearchWorkflow";

// 该页面负责组织多个筛选子组件与预设面板，形成统一搜索参数入口。
const {
  params,
  presets,
  mergedParams,
  resetAll,
  onPresetUpdate,
  onApplyPreset,
  onSavePreset,
  executeSearch,
} = useAdvancedSearchWorkflow();
// mergedParams 是预览与执行搜索共用的归一化结果，避免两套拼参逻辑分叉。
</script>
<style scoped>
.advanced-search {
  max-width: 1320px;
  margin: 0 auto;
  padding: 8px 0 24px;
  color: var(--page-text-strong);
}

.search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.search-header h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--page-text-strong);
}

.reset-btn {
  min-height: 40px;
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid var(--page-control-border);
  background: color-mix(
    in srgb,
    var(--page-control-bg) 92%,
    rgba(255, 253, 245, 0.08) 8%
  );
  color: var(--page-text-strong);
  cursor: pointer;
  transition: all 0.18s ease;
}

.reset-btn:hover {
  background: color-mix(
    in srgb,
    var(--accent) 10%,
    var(--page-control-hover) 90%
  );
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  transform: translateY(-1px);
}

.search-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
  margin-bottom: 20px;
}

.main-panel,
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-actions {
  display: flex;
  justify-content: center;
  margin-top: 6px;
}

.search-btn {
  min-height: 44px;
  padding: 12px 32px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 56%, transparent);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.search-btn.primary {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--accent) 72%, #7f8750 28%)
  );
  color: #fffdf4;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--accent) 18%, transparent);
}

.search-btn.primary:hover {
  transform: translateY(-1px);
}

@media (max-width: 1100px) {
  .search-content {
    grid-template-columns: 1fr;
  }
}
</style>
