<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">云端清理</h2>
    </div>

    <div class="action-bar">
      <button class="btn-secondary" @click="checkRecentUpload">{{ uploadButtonText }}</button>
      <button class="btn-secondary" :loading="isBusy" @click="fetchCloudWorks">刷新云端</button>

      <div v-if="displayedWorks.length > 0" class="select-actions">
        <button class="btn-secondary small" @click="selectAllDisplayed">全选</button>
        <button class="btn-secondary small" @click="clearSelection">取消</button>
      </div>

      <button
        class="btn-primary"
        :disabled="selectedCloudWorks.length === 0"
        @click="deleteSelected"
      >
        删除 ({{ selectedCloudWorks.length }})
      </button>
    </div>

    <!-- 筛选区域 -->
    <div class="filter-section card">
      <input v-model="searchText" class="input search-input" placeholder="搜索标题或编号..." />

      <!-- 标签筛选模式切换 -->
      <div class="tag-mode-switch">
        <label class="mode-label">筛选模式:</label>
        <label class="mode-option">
          <input v-model="tagMode" type="radio" value="OR" /> OR(满足任一)
        </label>
        <label class="mode-option">
          <input v-model="tagMode" type="radio" value="AND" /> AND(满足全部)
        </label>
      </div>

      <div v-if="allTags.length > 0" class="tag-filter">
        <span class="filter-label">标签筛选:</span>
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

    <div class="file-list card">
      <div
        v-for="item in displayedWorks"
        :key="item.id"
        class="file-row"
        :class="{ selected: selectedCloudWorks.includes(item.id) }"
        @click="toggleSelect(item.id)"
      >
        <input type="checkbox" :checked="selectedCloudWorks.includes(item.id)" readonly />
        <span class="code">{{ item.source_id || item.id }}</span>
        <span class="name">{{ item.title }}</span>
        <div class="item-tags">
          <span v-for="tag in getTags(item).slice(0, 3)" :key="tag" class="mini-tag">{{
            tag
          }}</span>
        </div>
      </div>
      <div v-if="displayedWorks.length === 0" class="empty">暂无数据</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const cloudWorks = ref([])
const selectedCloudWorks = ref([])
const isBusy = ref(false)
const searchText = ref('')
const selectedTags = ref([])
const tagMode = ref('OR')
const tgRJCodes = ref([])

const uploadButtonText = computed(() => {
  if (tgRJCodes.value.length === 0) {
    return '最近上传'
  }
  const overlapCount = countOverlap()
  if (overlapCount > 0) {
    return `最近上传 (${overlapCount}条重合)`
  }
  return '最近上传 (无重合)'
})

// 提取编号的数字部分（用于跨前缀匹配，如VJ123456和RJ123456）
const extractNumberPart = (code) => {
  if (!code) return ''
  const match = String(code).match(/\d+/)
  return match ? match[0] : ''
}

const countOverlap = () => {
  // 提取云端作品的所有数字编号
  const cloudNumbers = new Set(
    cloudWorks.value.map((w) => extractNumberPart(w.source_id)).filter(Boolean)
  )

  // 统计TG中数字编号与云端重合的数量
  return tgRJCodes.value.filter((code) => cloudNumbers.has(extractNumberPart(code))).length
}

const checkRecentUpload = async () => {
  const res = await window.api.tgReadRecentActivity()
  if (res.success && res.data?.files) {
    // 提取所有 RJ 号
    tgRJCodes.value = res.data.files.map((f) => f.rjCode || f.id).filter(Boolean)

    const overlap = countOverlap()
    if (overlap > 0) {
      // 自动勾选重合的作品（基于数字部分匹配）
      const overlapIds = cloudWorks.value
        .filter((w) => {
          const cloudNumber = extractNumberPart(w.source_id)
          return (
            cloudNumber && tgRJCodes.value.some((code) => extractNumberPart(code) === cloudNumber)
          )
        })
        .map((w) => w.id)
      selectedCloudWorks.value = overlapIds
      alert(`发现 ${overlap} 条重合，已自动勾选`)
    } else {
      alert('无重合数据')
    }
  }
}

const allTags = computed(() => {
  const tags = new Set()
  cloudWorks.value.forEach((work) => {
    let tagList = work.tags
    if (typeof tagList === 'string') {
      try {
        tagList = JSON.parse(tagList)
      } catch {
        tagList = []
      }
    }
    if (Array.isArray(tagList)) {
      tagList.forEach((tag) => {
        // 标签是对象，提取 name
        const name = typeof tag === 'string' ? tag : tag.name || ''
        if (name) tags.add(name)
      })
    }
  })
  return Array.from(tags).slice(0, 20)
})

// 带数量的标签列表
const allTagsWithCount = computed(() => {
  const tagCount = {}
  cloudWorks.value.forEach((work) => {
    const tags = getTags(work)
    tags.forEach((tag) => {
      tagCount[tag] = (tagCount[tag] || 0) + 1
    })
  })
  return Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
})

// 清除标签筛选
const clearTagFilter = () => {
  selectedTags.value = []
}

// 点击标签时勾选对应作品
const toggleTag = (tag) => {
  const idx = selectedTags.value.indexOf(tag)
  if (idx > -1) {
    selectedTags.value.splice(idx, 1)
  } else {
    selectedTags.value.push(tag)
  }

  // 自动勾选匹配的作品
  selectWorksByTags()
}

// 根据选中的标签自动勾选作品
const selectWorksByTags = () => {
  if (selectedTags.value.length === 0) {
    return
  }

  const idsToSelect = cloudWorks.value
    .filter((w) => {
      const tags = getTags(w)
      if (tagMode.value === 'OR') {
        return selectedTags.value.some((t) => tags.includes(t))
      }
      return selectedTags.value.every((t) => tags.includes(t))
    })
    .map((w) => w.id)

  selectedCloudWorks.value = idsToSelect
}

const displayedWorks = computed(() => {
  let result = cloudWorks.value

  if (searchText.value) {
    const key = searchText.value.toLowerCase()
    result = result.filter((w) => {
      // 只匹配标题和编号
      const matchTitle = w.title?.toLowerCase().includes(key)
      const matchId = w.source_id?.toLowerCase().includes(key)
      return matchTitle || matchId
    })
  }

  if (selectedTags.value.length > 0) {
    result = result.filter((w) => {
      const tagList = getTags(w)
      // OR模式：满足任一标签
      if (tagMode.value === 'OR') {
        return selectedTags.value.some((tag) => tagList.includes(tag))
      }
      // AND模式：满足全部标签
      return selectedTags.value.every((tag) => tagList.includes(tag))
    })
  }

  return result
})

const getTags = (item) => {
  let tagList = item.tags
  if (typeof tagList === 'string') {
    try {
      tagList = JSON.parse(tagList)
    } catch {
      tagList = []
    }
  }
  if (!Array.isArray(tagList)) return []

  // 标签是对象，提取 name 字段
  return tagList
    .map((tag) => {
      if (typeof tag === 'string') return tag
      return tag.name || ''
    })
    .filter(Boolean)
}

const toggleSelect = (id) => {
  const idx = selectedCloudWorks.value.indexOf(id)
  if (idx > -1) selectedCloudWorks.value.splice(idx, 1)
  else selectedCloudWorks.value.push(id)
}

const selectAllDisplayed = () => {
  selectedCloudWorks.value = displayedWorks.value.map((w) => w.id)
}

const clearSelection = () => {
  selectedCloudWorks.value = []
}

const fetchCloudWorks = async () => {
  isBusy.value = true
  await window.api.invoke('asmr-fetch-cloud-works')
  isBusy.value = false
}

const deleteSelected = async () => {
  if (!confirm(`删除 ${selectedCloudWorks.value.length} 个？`)) return
  const res = await window.api.invoke('asmr-delete-works', Array.from(selectedCloudWorks.value))
  if (res.success) {
    cloudWorks.value = cloudWorks.value.filter((w) => !selectedCloudWorks.value.includes(w.id))
    selectedCloudWorks.value = []
    alert(`删除 ${res.deletedCount} 个`)
  }
}

onMounted(async () => {
  // 监听云端数据实时更新
  window.api.onCloudWorksUpdated((res) => {
    if (res.data) {
      cloudWorks.value = res.data
    }
  })

  // 读取缓存
  const res = await window.api.asmrGetCachedCloudWorks()
  if (res.success) cloudWorks.value = res.data
})

onUnmounted(() => {
  window.api.removeAllListeners('cloud-works-updated')
})
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
}

.page-header {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.action-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .page-container {
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .action-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .action-bar .btn-secondary,
  .action-bar .btn-primary {
    width: 100%;
    text-align: center;
  }

  .select-actions {
    justify-content: center;
  }

  .tag-mode-switch {
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .name {
    width: 100%;
    order: 3;
  }

  .item-tags {
    width: 100%;
    order: 4;
    margin-top: 4px;
  }
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .file-row {
    padding: 10px;
    font-size: 13px;
  }

  .code {
    font-size: 12px;
    padding: 3px 8px;
  }

  .tag-list {
    max-height: 100px;
    overflow-y: auto;
  }

  .search-input {
    max-width: 100%;
  }
}

@media (max-width: 640px) {
  .page-title {
    font-size: 18px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 10px 16px;
    font-size: 13px;
  }
}

.select-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 8px 14px;
  font-size: 13px;
}

.btn-secondary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #525252;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #f5f5f5;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e5e5;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #8b5cf6;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-mode-switch {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.mode-label {
  font-size: 13px;
  color: #525252;
  font-weight: 500;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #525252;
  cursor: pointer;
}

.mode-option input {
  accent-color: #8b5cf6;
}

.input {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  background: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  color: #262626;
}

.input:focus {
  border-color: #8b5cf6;
}

.search-input {
  width: 100%;
  max-width: 400px;
}

.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  font-weight: 500;
  color: #525252;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  background: #f5f5f5;
  color: #737373;
  transition: all 0.2s ease;
}

.tag-item:hover {
  background: #e5e5e5;
  color: #525252;
}

.tag-item.active {
  background: #8b5cf6;
  color: #fff;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e5e5e5;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.file-row:hover {
  background: #fafafa;
}

.file-row.selected {
  background: #f0ebfc;
}

.file-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #8b5cf6;
}

.code {
  background: #eff6ff;
  color: #3b82f6;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.name {
  color: #262626;
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.mini-tag {
  padding: 3px 8px;
  background: #f5f5f5;
  color: #737373;
  border-radius: 4px;
  font-size: 11px;
}

.empty {
  text-align: center;
  color: #a3a3a3;
  padding: 60px 20px;
  font-size: 14px;
}

.card::-webkit-scrollbar {
  width: 6px;
}

.card::-webkit-scrollbar-track {
  background: transparent;
}

.card::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

.card::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}
</style>
