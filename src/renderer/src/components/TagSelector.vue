<template>
  <div class="tag-selector">
    <div class="selector-header">
      <span class="label">🏷️ 标签选择</span>
      <span class="hint">(可多选)</span>
    </div>
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input v-model="searchText" type="text" placeholder="搜索标签..." />
      <button v-if="searchText" class="clear-btn" @click="searchText = ''">✕</button>
    </div>
    <div v-if="allTags.length > 0" class="tags-container">
      <div class="tags-grid">
        <label
          v-for="tag in filteredTags"
          :key="tag.id"
          class="tag-item"
          :class="{
            selected: selectedTags.includes(tag.name),
            excluded: excludedTags.includes(tag.name)
          }"
        >
          <input
            type="checkbox"
            :checked="selectedTags.includes(tag.name)"
            @change="toggleTag(tag.name)"
          />
          <span class="tag-name">{{ tag.name }}</span>
          <span class="tag-count">{{ tag.count }}</span>
        </label>
      </div>
    </div>
    <div v-if="selectedTags.length > 0 || excludedTags.length > 0" class="selected-tags">
      <div class="selected-header">
        <span class="header-text">📋 已选:</span>
        <button class="clear-all-btn" @click="clearAllTags">清除</button>
      </div>
      <div class="tag-badges">
        <span v-for="tag in selectedTags" :key="tag" class="tag-badge include"
          >{{ tag
          }}<button @click="selectedTags = selectedTags.filter((t) => t !== tag)">✕</button></span
        >
        <span v-for="tag in excludedTags" :key="tag" class="tag-badge exclude"
          >{{ tag
          }}<button @click="excludedTags = excludedTags.filter((t) => t !== tag)">✕</button></span
        >
      </div>
    </div>
    <div class="exclude-toggle">
      <span class="toggle-label">模式:</span>
      <label><input v-model="excludeMode" type="radio" :value="false" /> 包含</label>
      <label><input v-model="excludeMode" type="radio" :value="true" /> 排除</label>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, computed } from 'vue'
import tagsData from '../../../../config/tags.json'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ include: [], exclude: [] }) }
})
const emit = defineEmits(['update:modelValue'])
const searchText = ref('')
const excludeMode = ref(false)
const selectedTags = ref([])
const excludedTags = ref([])

// 从 tags.json 导入标签数据
const allTags = computed(() => {
  return tagsData
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: tag.count
    }))
    .sort((a, b) => b.count - a.count)
})

// 过滤后的标签
const filteredTags = computed(() => {
  if (!searchText.value) return allTags.value.slice(0, 50)
  const query = searchText.value.toLowerCase()
  return allTags.value.filter((tag) => tag.name.toLowerCase().includes(query)).slice(0, 50)
})

const toggleTag = (tag) => {
  if (excludeMode.value) {
    if (excludedTags.value.includes(tag))
      excludedTags.value = excludedTags.value.filter((t) => t !== tag)
    else {
      excludedTags.value.push(tag)
      selectedTags.value = selectedTags.value.filter((t) => t !== tag)
    }
  } else {
    if (selectedTags.value.includes(tag))
      selectedTags.value = selectedTags.value.filter((t) => t !== tag)
    else {
      selectedTags.value.push(tag)
      excludedTags.value = excludedTags.value.filter((t) => t !== tag)
    }
  }
  emitUpdate()
}

const clearAllTags = () => {
  selectedTags.value = []
  excludedTags.value = []
  emitUpdate()
}

const emitUpdate = () => {
  emit('update:modelValue', { include: [...selectedTags.value], exclude: [...excludedTags.value] })
}
onMounted(() => {
  if (props.modelValue) {
    selectedTags.value = props.modelValue.include || []
    excludedTags.value = props.modelValue.exclude || []
  }
})
</script>
<style scoped>
.tag-selector {
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
.tags-container {
  max-height: 300px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
}
.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f0f0f0;
  border-radius: 16px;
  cursor: pointer;
}
.tag-item.selected {
  background: #e6f7ff;
  border: 1px solid #1890ff;
}
.tag-item.excluded {
  background: #fff2f0;
  border: 1px solid #ff4d4f;
}
.tag-count {
  font-size: 11px;
  color: #999;
}
.selected-tags {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
}
.tag-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}
.tag-badge.include {
  background: #e6f7ff;
  color: #1890ff;
}
.tag-badge.exclude {
  background: #fff2f0;
  color: #ff4d4f;
}
.exclude-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}
</style>
