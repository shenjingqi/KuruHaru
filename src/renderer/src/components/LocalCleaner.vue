<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">本地清理</h2>
    </div>

    <div class="action-bar">
      <button class="btn-secondary" :disabled="isBusy" @click="scanFolder">
        扫描文件夹
      </button>
      <button class="btn-secondary" :disabled="isBusy" @click="loadFromTxt">
        从TXT导入
      </button>
      <button
        v-if="txtRJCodes.length > 0"
        class="btn-secondary"
        @click="clearTxt"
      >
        清空
      </button>

      <!-- 扫描后的云端删除 -->
      <template v-if="localItems.length > 0">
        <button
          class="btn-primary"
          :disabled="selectedPaths.length === 0"
          @click="executeDelete"
        >
          云端删除 ({{ selectedPaths.length }})
        </button>
        <div class="select-actions">
          <button class="btn-secondary small" @click="selectAll">全选</button>
          <button class="btn-secondary small" @click="clearSelection">
            取消
          </button>
        </div>
      </template>
    </div>

    <!-- TXT导入的云端删除列表 -->
    <div v-if="txtRJCodes.length > 0" class="txt-panel card">
      <div class="txt-header">
        <span class="txt-title"
          >📄 TXT导入 - 云端删除 ({{ txtRJCodes.length }})</span
        >
        <div class="txt-actions">
          <button class="btn-secondary small" @click="copyRJCodes">复制</button>
          <button
            class="btn-primary small"
            :disabled="isBusy"
            @click="executeCloudDelete"
          >
            删除云端
          </button>
        </div>
      </div>
      <div class="txt-list">
        <span v-for="code in txtRJCodes" :key="code" class="rj-tag">{{
          code
        }}</span>
      </div>
    </div>

    <!-- 本地文件列表 -->
    <div class="file-list card">
      <div
        v-for="item in localItems"
        :key="item.path"
        class="file-row"
        :class="{ selected: selectedPaths.includes(item.path) }"
        @click="toggleSelect(item.path)"
      >
        <input
          type="checkbox"
          :checked="selectedPaths.includes(item.path)"
          readonly
        />
        <span class="code">{{ item.code || "?" }}</span>
        <span class="name">{{ item.name }}</span>
        <span class="size">{{ formatSize(item.size) }}</span>
      </div>
      <div v-if="localItems.length === 0" class="empty">
        点击"扫描文件夹"选择要清理的目录，或"从TXT导入"删除云端数据
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const localItems = ref([]);
const selectedPaths = ref([]);
const isBusy = ref(false);
const txtRJCodes = ref([]);

const scanFolder = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    isBusy.value = true;
    try {
      const scanRes = await window.api.invoke(
        "scan-local-archives",
        res.filePath,
      );
      localItems.value = scanRes || [];
      selectedPaths.value = [];
    } catch (e) {
      alert("扫描出错: " + e.message);
    }
    isBusy.value = false;
  }
};

const loadFromTxt = async () => {
  const res = await window.api.dialogOpenFile({
    type: "file",
    filters: [{ name: "TXT", extensions: ["txt"] }],
  });
  if (res && res.filePath) {
    try {
      const content = await window.api.invoke("fs-read-file", res.filePath);
      if (content) {
        // 支持 RJ/VJ/BJ 号
        const codes = content.match(/(RJ|VJ|BJ)\d+/gi);
        txtRJCodes.value = codes
          ? [...new Set(codes.map((c) => c.toUpperCase()))]
          : [];
        alert(`导入 ${txtRJCodes.value.length} 个RJ/VJ/BJ号`);
      }
    } catch (e) {
      alert("读取文件失败: " + e.message);
    }
  }
};

const clearTxt = () => {
  txtRJCodes.value = [];
};

const copyRJCodes = () => {
  const text = txtRJCodes.value.join("\n");
  navigator.clipboard.writeText(text).then(() => {
    alert("已复制到剪贴板");
  });
};

const selectAll = () => {
  selectedPaths.value = localItems.value.map((item) => item.path);
};

const clearSelection = () => {
  selectedPaths.value = [];
};

const toggleSelect = (path) => {
  const idx = selectedPaths.value.indexOf(path);
  if (idx > -1) selectedPaths.value.splice(idx, 1);
  else selectedPaths.value.push(path);
};

const formatSize = (bytes) => {
  if (!bytes) return "-";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
};

// 扫描文件夹后的云端删除
const executeDelete = async () => {
  if (!confirm(`确认云端删除 ${selectedPaths.value.length} 个？`)) return;

  isBusy.value = true;
  try {
    const selectedItems = localItems.value.filter((i) =>
      selectedPaths.value.includes(i.path),
    );
    const rjCodes = selectedItems.map((i) => i.code).filter(Boolean);

    if (rjCodes.length > 0) {
      const cloudRes = await window.api.asmrDeleteByRJ(rjCodes);
      if (cloudRes.success) {
        alert(`云端删除 ${cloudRes.deletedCount || 0} 个作品`);
      } else {
        alert("删除失败: " + (cloudRes.error || "未知错误"));
      }
    }

    localItems.value = localItems.value.filter(
      (i) => !selectedPaths.value.includes(i.path),
    );
    selectedPaths.value = [];
  } finally {
    isBusy.value = false;
  }
};

// TXT导入后的云端删除
const executeCloudDelete = async () => {
  if (!confirm(`确认删除云端 ${txtRJCodes.value.length} 个作品？`)) return;

  isBusy.value = true;
  try {
    const rjList = JSON.parse(JSON.stringify(txtRJCodes.value));
    const result = await window.api.asmrDeleteByRJ(rjList);
    if (result.success) {
      alert(`云端删除 ${result.deletedCount} 个作品`);
      txtRJCodes.value = [];
    }
  } finally {
    isBusy.value = false;
  }
};
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
    margin-left: 0;
    justify-content: center;
  }

  .file-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .name {
    width: 100%;
    order: 3;
  }

  .size {
    margin-left: auto;
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

  .txt-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .txt-actions {
    width: 100%;
    justify-content: flex-end;
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

.btn-small {
  padding: 8px 14px;
  font-size: 13px;
}

.select-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
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

.file-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #8b5cf6;
}

.code {
  background: #f0ebfc;
  color: #7c3aed;
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

.size {
  color: #737373;
  font-size: 13px;
  font-family: monospace;
}

.empty {
  text-align: center;
  color: #a3a3a3;
  padding: 60px 20px;
  font-size: 14px;
}

/* TXT面板样式 */
.txt-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.txt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.txt-title {
  font-size: 14px;
  font-weight: 500;
  color: #525252;
}

.txt-actions {
  display: flex;
  gap: 8px;
}

.txt-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.rj-tag {
  background: #f0ebfc;
  color: #7c3aed;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  font-weight: 500;
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
