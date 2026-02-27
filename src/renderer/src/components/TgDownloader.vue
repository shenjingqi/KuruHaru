<template>
  <div class="tg-downloader">
    <div class="download-header">
      <h2>📦 TG打包下载</h2>
    </div>

    <div class="download-content">
      <!-- TXT比对文件选择 -->
      <div class="compare-section">
        <div class="input-group">
          <label>排除已下载（可选）</label>
          <div class="file-input-row">
            <input
              v-model="excludeFilePath"
              type="text"
              placeholder="选择包含已有RJ/VJ/BJ号的TXT文件"
              class="file-input"
              readonly
            />
            <button class="browse-btn" @click="browseFile">浏览</button>
          </div>
          <div v-if="excludeFileRJCount > 0" class="file-info">
            已加载 {{ excludeFileRJCount }} 个RJ/VJ/BJ号，将跳过这些文件
          </div>
        </div>

        <div class="filter-options">
          <label class="checkbox-option">
            <input v-model="useFilter" type="checkbox" />
            <span>启用过滤（不下载已存在的RJ/VJ/BJ号）</span>
          </label>
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="files-section">
        <div class="files-header">
          <h3>待下载文件</h3>
          <div class="files-stats">
            <span class="stat">总文件: {{ allFiles.length }}</span>
            <span v-if="useFilter" class="stat skip"
              >将跳过: {{ skipFiles.length }}</span
            >
            <span class="stat will-download"
              >将下载: {{ downloadFiles.length }}</span
            >
          </div>
        </div>

        <div class="files-actions">
          <button class="action-btn" @click="selectAll">全选</button>
          <button class="action-btn" @click="deselectAll">全不选</button>
          <button class="action-btn" @click="reloadAndScan">
            清除缓存并重新扫描
          </button>
          <button
            class="action-btn primary"
            :disabled="selectedFiles.length === 0 || isDownloading"
            @click="startDownload"
          >
            {{
              isDownloading ? "下载中..." : `开始下载 (${selectedFiles.length})`
            }}
          </button>
        </div>

        <div class="files-list">
          <div
            v-for="file in displayedFiles"
            :key="file.id"
            class="file-item"
            :class="{
              selected: selectedFiles.includes(file.id),
              skipped: skippedFileIds.has(file.id),
            }"
            @click="toggleSelect(file.id)"
          >
            <input
              type="checkbox"
              :checked="selectedFiles.includes(file.id)"
              :disabled="skippedFileIds.has(file.id)"
              @click.stop
              @change="toggleSelect(file.id)"
            />
            <span class="file-rj">{{ file.rjCode }}</span>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-date">{{ formatDate(file.date) }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
            <span v-if="skippedFileIds.has(file.id)" class="skip-badge"
              >跳过</span
            >
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            class="page-btn"
            :disabled="currentPage === 1"
            @click="currentPage--"
          >
            上一页
          </button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button
            class="page-btn"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          >
            下一页
          </button>
        </div>
      </div>

      <!-- 下载进度 -->
      <div v-if="isDownloading" class="progress-section">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div class="progress-info">
          <span>{{ downloadedCount }} / {{ selectedFiles.length }}</span>
          <span class="current-file">{{ currentFile || "准备中..." }}</span>
        </div>
        <div class="progress-actions">
          <button class="cancel-btn" @click="cancelDownload">取消</button>
        </div>
      </div>

      <!-- 日志 -->
      <div v-if="logs.length > 0" class="log-section">
        <div class="log-header">
          <h3>操作日志</h3>
          <button class="clear-log-btn" @click="logs = []">清空</button>
        </div>
        <div class="log-list">
          <div
            v-for="(log, index) in logs"
            :key="index"
            class="log-item"
            :class="log.type"
          >
            {{ log.msg }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

const allFiles = ref([]);
const selectedFiles = ref([]);
const skippedFileIds = ref(new Set());

const excludeFilePath = ref("");
const excludeFileRJCount = ref(0);
const useFilter = ref(true);

const currentPage = ref(1);
const pageSize = 50;

const isDownloading = ref(false);
const downloadedCount = ref(0);
const progressPercent = ref(0);
const currentFile = ref("");

const logs = ref([]);

const addLog = (msg, type = "info") => {
  logs.value.push({ msg, type });
  if (logs.value.length > 200) logs.value.shift();
};

// 读取 recent_activity.json 中的文件
const loadFiles = async () => {
  try {
    addLog("读取 recent_activity.json...", "info");
    const result = await window.api.invoke("get-recent-activity");

    if (result.success && result.files) {
      // 确保每个文件都有必要的属性
      allFiles.value = result.files.map((file) => {
        if (!file.name && file.fileName) {
          file.name = file.fileName;
          console.warn(
            `[loadFiles] File missing 'name', using fileName: ${file.fileName}`,
          );
        }
        if (!file.id && file.rjCode) {
          file.id = file.rjCode;
          console.warn(
            `[loadFiles] File missing 'id', using rjCode: ${file.rjCode}`,
          );
        }
        return file;
      });
      // 默认全选
      selectedFiles.value = allFiles.value.map((f) => f.id);
      addLog(`加载 ${allFiles.value.length} 个文件`, "success");
    } else {
      addLog("读取失败: " + (result.error || "未知错误"), "error");
    }
  } catch (e) {
    addLog("读取失败: " + e.message, "error");
  }
};

// 浏览选择文件
const browseFile = async () => {
  try {
    const res = await window.api.dialogOpenFile({
      filters: [{ name: "Text Files", extensions: ["txt"] }],
    });
    if (res && res.filePath) {
      excludeFilePath.value = res.filePath;
      await loadExcludeFile();
    }
  } catch (e) {
    addLog("选择文件失败: " + e.message, "error");
  }
};

// 加载排除文件
const loadExcludeFile = async () => {
  if (!excludeFilePath.value) return;

  try {
    addLog("读取排除列表...", "info");
    const result = await window.api.invoke("read-rj-list", {
      path: excludeFilePath.value,
    });

    if (result.success) {
      excludeFileRJCount.value = result.count;
      addLog(`已加载 ${result.count} 个RJ号`, "success");

      // 重新计算跳过列表
      updateSkippedFiles();
    } else {
      addLog("读取失败: " + result.error, "error");
    }
  } catch (e) {
    addLog("读取失败: " + e.message, "error");
  }
};

// 更新跳过文件列表
const updateSkippedFiles = () => {
  if (!useFilter.value) {
    skippedFileIds.value = new Set();
    return;
  }

  const skipped = new Set();
  // 获取排除列表
  const excludeRjs = new Set();

  if (excludeFilePath.value) {
    try {
      const content = require("fs").readFileSync(
        excludeFilePath.value,
        "utf-8",
      );
      const lines = content.split("\n").filter((l) => l.trim());
      lines.forEach((line) => {
        // 支持 RJ/VJ/BJ 号
        const match = line.match(/(RJ|VJ|BJ)?(\d+)/i);
        if (match) {
          excludeRjs.add(match[2]); // 提取纯数字部分
        } else if (/^\d+$/.test(line.trim())) {
          excludeRjs.add(line.trim());
        }
      });
    } catch (e) {
      console.error("读取排除文件失败:", e);
    }
  }

  // 标记需要跳过的文件
  allFiles.value.forEach((file) => {
    if (!file.rjCode) return;
    // 提取纯数字部分（支持 RJ/VJ/BJ）
    const rjMatch = file.rjCode.match(/(RJ|VJ|BJ)?(\d+)/i);
    const numOnly = rjMatch ? rjMatch[2] : file.rjCode;
    if (excludeRjs.has(numOnly)) {
      skipped.add(file.id);
      // 从已选列表中移除
      const idx = selectedFiles.value.indexOf(file.id);
      if (idx > -1) {
        selectedFiles.value.splice(idx, 1);
      }
    }
  });

  skippedFileIds.value = skipped;
  addLog(`将跳过 ${skipped.size} 个文件`, "info");
};

// 计算属性
const displayedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return allFiles.value.slice(start, start + pageSize);
});

const totalPages = computed(() => Math.ceil(allFiles.value.length / pageSize));

const skipFiles = computed(() => {
  return allFiles.value.filter((f) => skippedFileIds.value.has(f.id));
});

const downloadFiles = computed(() => {
  return allFiles.value.filter(
    (f) =>
      selectedFiles.value.includes(f.id) && !skippedFileIds.value.has(f.id),
  );
});

// 操作方法
const toggleSelect = (fileId) => {
  if (skippedFileIds.value.has(fileId)) return;

  const idx = selectedFiles.value.indexOf(fileId);
  if (idx > -1) {
    selectedFiles.value.splice(idx, 1);
  } else {
    selectedFiles.value.push(fileId);
  }
};

const selectAll = () => {
  skippedFileIds.value.forEach((id) => {
    const idx = selectedFiles.value.indexOf(id);
    if (idx === -1) {
      selectedFiles.value.push(id);
    }
  });
};

const deselectAll = () => {
  selectedFiles.value = [];
};

// 清除缓存并重新扫描
const reloadAndScan = async () => {
  try {
    addLog("清除缓存并重新扫描...", "info");

    // 清除本地缓存文件
    const clearResult = await window.api.invoke("clear-cache", {
      cacheFile: "recent_activity.json",
    });

    if (clearResult.success) {
      addLog("缓存已清除", "success");
    } else {
      addLog("清除缓存失败: " + (clearResult.error || "未知错误"), "warn");
    }

    // 重新扫描
    addLog("开始重新扫描 TG 讨论组...", "info");
    const scanResult = await window.api.tgScanRecentActivity();

    if (scanResult && scanResult.success) {
      addLog(
        `扫描完成！文件数: ${scanResult.data?.filesCount || "未知"}, 动作: ${scanResult.data?.action || "未知"}`,
        "success",
      );

      // 重新加载文件列表
      await loadFiles();
    } else {
      addLog("扫描失败: " + (scanResult?.error || "未知错误"), "error");
    }
  } catch (e) {
    addLog("操作失败: " + e.message, "error");
  }
};

// 开始下载
const startDownload = async () => {
  if (selectedFiles.value.length === 0) return;

  isDownloading.value = true;
  downloadedCount.value = 0;
  progressPercent.value = 0;

  const filesToDownload = allFiles.value.filter(
    (f) =>
      selectedFiles.value.includes(f.id) && !skippedFileIds.value.has(f.id),
  );

  addLog(`开始下载 ${filesToDownload.length} 个文件...`, "info");

  try {
    for (let i = 0; i < filesToDownload.length; i++) {
      const file = filesToDownload[i];

      // 防御性检查：确保有 name 属性
      if (!file.name) {
        addLog(`文件 ${file.id} 缺少名称，跳过`, "error");
        continue;
      }

      currentFile.value = file.name;

      addLog(`下载中 ${i + 1}/${filesToDownload.length}: ${file.name}`, "info");

      // 调用下载 API
      const result = await window.api.invoke("download-tg-file", {
        fileId: file.id,
        fileName: file.name,
        tgMessageId: file.tgMessageId,
      });

      // 显示下载结果
      if (result.success) {
        if (result.skipped) {
          addLog(`文件已存在，跳过: ${file.name}`, "warn");
        } else if (result.path) {
          addLog(`下载成功: ${file.name}`, "success");
        }
      } else {
        addLog(`下载失败: ${file.name} - ${result.error}`, "error");
      }

      downloadedCount.value++;
      progressPercent.value = Math.round(
        (downloadedCount.value / filesToDownload.length) * 100,
      );
    }

    // 获取并显示下载目录
    try {
      const config = await window.api.loadConfig();
      const downloadDir = config.paths?.tgDownloadDir || "未知位置";
      addLog(`下载完成！成功 ${filesToDownload.length} 个`, "success");
      addLog(`文件保存位置: ${downloadDir}`, "info");
    } catch (e) {
      addLog(`下载完成！成功 ${filesToDownload.length} 个`, "success");
      addLog(`无法获取下载路径: ${e.message}`, "warn");
    }
  } catch (e) {
    addLog(`下载失败: ${e.message}`, "error");
  } finally {
    isDownloading.value = false;
    currentFile.value = "";
  }
};

// 取消下载
const cancelDownload = () => {
  isDownloading.value = false;
  addLog("下载已取消", "warn");
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

// 格式化大小
const formatSize = (size) => {
  if (!size) return "-";
  const num = parseInt(size);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 / 1024).toFixed(1)} MB`;
};

onMounted(() => {
  loadFiles();
});
</script>

<style scoped>
.tg-downloader {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.download-header {
  margin-bottom: 24px;
}

.download-header h2 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.download-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.compare-section,
.files-section,
.progress-section,
.log-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .tg-downloader {
    max-width: 100%;
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .files-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .files-stats {
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-item {
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-rj {
    min-width: 70px;
  }

  .file-date,
  .file-size {
    min-width: 50px;
  }
}

@media (max-width: 768px) {
  .tg-downloader {
    padding: 12px;
  }

  .compare-section,
  .files-section,
  .progress-section,
  .log-section {
    padding: 16px;
    border-radius: 8px;
  }

  .download-header h2 {
    font-size: 20px;
  }

  .files-actions {
    flex-wrap: wrap;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    min-width: 80px;
    text-align: center;
  }

  .file-item {
    padding: 8px 12px;
    font-size: 12px;
  }

  .file-name {
    width: 100%;
    order: 3;
  }
}

@media (max-width: 640px) {
  .files-stats {
    font-size: 12px;
  }

  .file-input-row {
    flex-direction: column;
  }

  .browse-btn {
    width: 100%;
  }
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
  border-color: #1890ff;
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
  border-color: #1890ff;
  color: #1890ff;
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

.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.files-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.files-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.stat.skip {
  color: #faad14;
}

.stat.will-download {
  color: #52c41a;
}

.files-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.action-btn {
  padding: 8px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.action-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.action-btn.primary {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}

.action-btn.primary:hover:not(:disabled) {
  background: #40a9ff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.file-item:hover {
  background: #f0f0f0;
}

.file-item.selected {
  background: #e6f7ff;
  border: 1px solid #1890ff;
}

.file-item.skipped {
  opacity: 0.5;
  background: #f5f5f5;
}

.file-rj {
  font-weight: 600;
  color: #1890ff;
  min-width: 90px;
}

.file-name {
  flex: 1;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-date {
  color: #999;
  font-size: 12px;
  min-width: 70px;
}

.file-size {
  color: #999;
  font-size: 12px;
  min-width: 70px;
  text-align: right;
}

.skip-badge {
  padding: 2px 8px;
  background: #faad14;
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.page-btn {
  padding: 6px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: #666;
}

.progress-section {
  background: #f0f0f0;
}

.progress-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #1890ff;
  transition: width 0.3s;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.current-file {
  color: #1890ff;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-actions {
  text-align: center;
}

.cancel-btn {
  padding: 6px 16px;
  border: 1px solid #ff4d4f;
  border-radius: 4px;
  background: #fff;
  color: #ff4d4f;
  cursor: pointer;
  font-size: 13px;
}

.log-section {
  background: #1e1e1e;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.log-header h3 {
  margin: 0;
  font-size: 14px;
  color: #fff;
}

.clear-log-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
}

.clear-log-btn:hover {
  color: #fff;
}

.log-list {
  font-family: "Consolas", monospace;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.log-item {
  padding: 2px 0;
  color: #ccc;
}

.log-item.success {
  color: #52c41a;
}

.log-item.error {
  color: #ff4d4f;
}

.log-item.warn {
  color: #faad14;
}
</style>
