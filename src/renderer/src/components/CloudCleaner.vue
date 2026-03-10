<template>
  <div class="page-container cloud-cleaner-theme">
    <div class="page-header cleaner-header">
      <div class="page-header-main">
        <span class="page-eyebrow">Cloud Maintenance</span>
        <h2 class="page-title">云端清理</h2>
        <p class="page-header-subtitle">
          筛选、批量选择并清理云端作品，保持库内内容干净可控。
        </p>
      </div>
      <div class="page-header-meta">
        <span class="summary-chip">{{ displayedWorks.length }} 条结果</span>
        <span class="summary-chip accent"
          >已选 {{ selectedCloudWorks.length }}</span
        >
      </div>
    </div>

    <div class="action-bar card">
      <div class="action-group primary-actions">
        <button class="btn-secondary" @click="checkRecentUpload">
          {{ uploadButtonText }}
        </button>
        <button class="btn-secondary" @click="fetchCloudWorks">刷新云端</button>
        <button
          class="btn-primary"
          :disabled="selectedCloudWorks.length === 0"
          @click="deleteSelected"
        >
          删除 ({{ selectedCloudWorks.length }})
        </button>
      </div>

      <div v-if="displayedWorks.length > 0" class="action-group select-actions">
        <button class="btn-secondary small" @click="selectAllDisplayed">
          全选
        </button>
        <button class="btn-secondary small" @click="clearSelection">
          取消
        </button>
      </div>
    </div>

    <div class="filter-section card">
      <div class="section-head-copy">
        <h3 class="section-title">筛选与标签</h3>
        <p class="card-caption">通过搜索、匹配模式和标签快速定位待清理作品。</p>
      </div>

      <input
        v-model="searchText"
        class="input search-input"
        placeholder="搜索标题或编号..."
      />

      <div class="tag-mode-switch">
        <label class="mode-label">筛选模式</label>
        <label class="mode-option">
          <input v-model="tagMode" type="radio" value="OR" /> OR(满足任一)
        </label>
        <label class="mode-option">
          <input v-model="tagMode" type="radio" value="AND" /> AND(满足全部)
        </label>
      </div>

      <div v-if="allTags.length > 0" class="tag-filter">
        <span class="filter-label">标签筛选</span>
        <div class="tag-list">
          <span
            class="tag-item"
            :class="{ active: selectedTags.length === 0 }"
            @click="clearTagFilter"
          >
            全部
          </span>
          <span
            v-for="tag in allTagsWithCount"
            :key="tag.name"
            class="tag-item"
            :class="{ active: selectedTags.includes(tag.name) }"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }} ({{ tag.count }})
          </span>
        </div>
      </div>
    </div>

    <div class="config-section card source-card">
      <div class="section-head-copy">
        <h3 class="section-title">数据源概览</h3>
        <p class="card-caption">
          当前页主要使用云端结果和标签索引进行筛选与批量删除。
        </p>
      </div>
      <div class="source-list">
        <div class="source-item">
          <div class="source-header">
            <span class="source-icon">☁</span>
            <span class="source-label">云端作品</span>
            <span v-if="displayedWorks.length > 0" class="badge-info"
              >{{ displayedWorks.length }} 条</span
            >
            <span v-else class="badge-warning">暂无结果</span>
          </div>
          <p class="source-desc">
            当前结果会根据搜索词、筛选模式和标签组合实时变化。
          </p>
        </div>
      </div>
    </div>

    <div class="file-list card">
      <div class="list-head">
        <div class="section-head-copy">
          <h3 class="section-title">云端作品列表</h3>
          <p class="card-caption">
            点击整行即可选择，右侧标签用于快速识别作品类别。
          </p>
        </div>
        <div class="list-meta">
          <span class="summary-chip"
            >{{ selectedCloudWorks.length }} 已选择</span
          >
        </div>
      </div>

      <div class="file-rows">
        <div
          v-for="item in displayedWorks"
          :key="item.id"
          class="file-row"
          :class="{ selected: selectedCloudWorks.includes(item.id) }"
          @click="toggleSelect(item.id)"
        >
          <input
            type="checkbox"
            :checked="selectedCloudWorks.includes(item.id)"
            readonly
          />
          <span class="code">{{ item.source_id || item.id }}</span>
          <span class="name">{{ item.title }}</span>
          <div class="item-tags">
            <span
              v-for="tag in getTags(item).slice(0, 3)"
              :key="tag"
              class="mini-tag"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>

      <div v-if="displayedWorks.length === 0" class="empty">暂无数据</div>
    </div>
  </div>
</template>

<script setup>
import { useCloudCleaner } from "../composables/useCloudCleaner";

const {
  selectedCloudWorks,
  searchText,
  selectedTags,
  tagMode,
  uploadButtonText,
  checkRecentUpload,
  allTags,
  allTagsWithCount,
  clearTagFilter,
  toggleTag,
  displayedWorks,
  getTags,
  toggleSelect,
  selectAllDisplayed,
  clearSelection,
  fetchCloudWorks,
  deleteSelected,
} = useCloudCleaner();
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  box-sizing: border-box;
  min-height: 0;
}

.cleaner-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding: 18px 22px;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  flex-wrap: wrap;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  min-height: 40px;
}

.small {
  min-height: 36px;
  padding: 8px 14px;
  font-size: 13px;
}

.filter-section,
.source-card,
.file-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-item {
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--page-control-border);
  background: color-mix(
    in srgb,
    var(--page-control-bg) 84%,
    rgba(255, 253, 245, 0.08)
  );
}

.source-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.source-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: color-mix(in srgb, var(--accent) 88%, #d8dfab 12%);
  font-size: 14px;
}

.source-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--page-text-strong);
}

.source-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--page-text-muted);
  margin: 0;
}

.search-input {
  width: 100%;
  max-width: 420px;
}

.tag-mode-switch {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.mode-label,
.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-text-muted);
}

.mode-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--page-text-strong);
  cursor: pointer;
}

.mode-option input {
  accent-color: var(--accent);
}

.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: color-mix(
    in srgb,
    var(--page-control-bg) 88%,
    rgba(255, 253, 245, 0.08)
  );
  border: 1px solid var(--page-control-border);
  color: var(--page-text-muted);
  transition: all 0.18s ease;
}

.tag-item:hover {
  background: color-mix(
    in srgb,
    var(--accent) 10%,
    var(--page-control-hover) 90%
  );
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--page-text-strong);
}

.tag-item.active {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--accent) 72%, #7f8750 28%)
  );
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  color: #fffdf4;
  box-shadow: 0 10px 20px color-mix(in srgb, var(--accent) 18%, transparent);
}

.badge-info,
.badge-warning {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.badge-info {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--accent) 72%, #7f8750 28%)
  );
  border: 1px solid color-mix(in srgb, var(--accent) 58%, transparent);
  color: #fffdf4;
}

.badge-warning {
  background: color-mix(
    in srgb,
    var(--page-control-bg) 88%,
    rgba(255, 253, 245, 0.12)
  );
  border: 1px solid
    color-mix(in srgb, var(--page-surface-border) 76%, transparent);
  color: var(--page-text-strong);
}

.file-list {
  flex: 1;
  overflow: hidden;
  padding: 16px;
}

.list-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--page-divider);
}

.file-rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}

.file-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  background: color-mix(
    in srgb,
    var(--page-control-bg) 84%,
    rgba(255, 253, 245, 0.08)
  );
  transition: all 0.18s ease;
}

.file-row:hover {
  background: color-mix(
    in srgb,
    var(--accent) 8%,
    var(--page-control-hover) 92%
  );
  border-color: color-mix(in srgb, var(--accent) 24%, transparent);
  transform: translateY(-1px);
}

.file-row.selected {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 24%, var(--page-panel-bg) 76%),
    color-mix(in srgb, var(--accent) 12%, rgba(0, 0, 0, 0.06))
  );
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 12px 22px color-mix(in srgb, var(--accent) 16%, transparent);
}

.file-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 92%, #cbd39c 8%),
    color-mix(in srgb, var(--accent) 72%, #7f8750 28%)
  );
  border: 1px solid color-mix(in srgb, var(--accent) 58%, transparent);
  color: #fffdf4;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
}

.name {
  min-width: 0;
  color: var(--page-text-strong);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mini-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(
    in srgb,
    var(--page-control-bg) 88%,
    rgba(255, 253, 245, 0.1)
  );
  border: 1px solid
    color-mix(in srgb, var(--page-surface-border) 76%, transparent);
  color: var(--page-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.empty {
  text-align: center;
  color: var(--page-text-muted);
  padding: 60px 20px;
  font-size: 14px;
}

@media (max-width: 1024px) {
  .cleaner-header,
  .list-head {
    flex-direction: column;
    align-items: stretch;
  }

  .action-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .action-group {
    width: 100%;
    justify-content: flex-start;
  }

  .action-group .btn-secondary,
  .action-group .btn-primary {
    width: 100%;
  }

  .file-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .code,
  .item-tags {
    grid-column: 2;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .tag-mode-switch {
    gap: 10px;
  }

  .tag-list {
    max-height: 110px;
    overflow-y: auto;
  }
}
</style>
