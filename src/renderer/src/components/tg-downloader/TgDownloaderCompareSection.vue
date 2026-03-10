<template>
  <div class="compare-section">
    <div class="input-group">
      <label>排除已下载（可选）</label>
      <div class="file-input-row">
        <input
          :value="excludeFilePath"
          type="text"
          placeholder="选择包含已有RJ/VJ/BJ号的TXT文件"
          class="file-input"
          readonly
        />
        <button class="browse-btn" @click="emit('browse-file')">浏览</button>
      </div>
      <div v-if="excludeFileRJCount > 0" class="file-info">
        已加载 {{ excludeFileRJCount }} 个RJ/VJ/BJ号，将跳过这些文件
      </div>
    </div>

    <div class="filter-options">
      <label class="checkbox-option">
        <input v-model="filterValue" type="checkbox" />
        <span>启用过滤（不下载已存在的RJ/VJ/BJ号）</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  // 路径与已加载编号数量由父层维护，子组件只做可视化反馈。
  excludeFilePath: {
    type: String,
    default: "",
  },
  excludeFileRJCount: {
    type: Number,
    default: 0,
  },
  useFilter: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:useFilter", "browse-file"]);

// 用 computed 包一层 v-model 适配器，避免直接修改 props 并保持双向绑定语义。
const filterValue = computed({
  get: () => props.useFilter,
  set: (value) => emit("update:useFilter", value),
});
// browse-file 仅负责触发文件选择流程，解析 TXT 与去重策略仍由父层处理。
</script>

<style scoped>
.compare-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.file-input-row {
  display: flex;
  gap: 8px;
}

.file-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

.file-input:focus {
  border-color: #adb571;
}

.browse-btn {
  padding: 12px 20px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.browse-btn:hover {
  border-color: #adb571;
  color: #adb571;
}

.file-info {
  margin-top: 8px;
  font-size: 13px;
  color: #52c41a;
}

.filter-options {
  margin-top: 12px;
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .compare-section {
    padding: 16px;
    border-radius: 8px;
  }
}

@media (max-width: 640px) {
  .file-input-row {
    flex-direction: column;
  }

  .browse-btn {
    width: 100%;
  }
}
</style>
