<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">TG打包下载</h2>
      <div class="header-actions">
        <button
          class="btn-secondary"
          :disabled="isScanning"
          @click="scanRecentActivity"
        >
          {{ isScanning ? "扫描中..." : "扫描讨论组" }}
        </button>
        <button
          class="btn-primary"
          :disabled="selectedFiles.length === 0 || isDownloading"
          @click="startDownload"
        >
          {{ isDownloading ? "下载中..." : `下载 (${selectedFiles.length})` }}
        </button>
      </div>
    </div>

    <!-- 排除文件设置 -->
    <div class="filter-section card">
      <div class="filter-row">
        <div class="filter-group">
          <label>排除已下载的RJ/VJ/BJ号</label>
          <div class="file-input-row">
            <input
              v-model="excludeFilePath"
              type="text"
              placeholder="选择TXT文件路径（包含已有RJ/VJ/BJ号）"
              class="file-input"
              readonly
            />
            <button class="browse-btn" @click="browseFile">浏览</button>
          </div>
        </div>

        <div class="filter-group stats">
          <div class="stat-item">
            <span class="stat-label">总文件</span>
            <span class="stat-value">{{ allFiles.length }}</span>
          </div>
          <div class="stat-item skip">
            <span class="stat-label">将跳过</span>
            <span class="stat-value">{{ skipFiles.length }}</span>
          </div>
          <div class="stat-item download">
            <span class="stat-label">将下载</span>
            <span class="stat-value">{{ selectedFiles.length }}</span>
          </div>
        </div>
      </div>

      <div class="filter-actions">
        <button class="action-link" @click="selectAll">全选</button>
        <button class="action-link" @click="deselectAll">全不选</button>
        <button class="action-link" @click="invertSelect">反选</button>
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="files-container card">
      <div v-if="isScanning" class="scanning-overlay">
        <div class="loader"></div>
        <p>正在连接 Telegram 扫描文件，请稍候...</p>
      </div>

      <div v-else-if="allFiles.length === 0" class="empty-activity">
        <span class="empty-icon">📁</span>
        <p>暂无文件，点击扫描讨论组获取</p>
        <button class="btn-primary" @click="scanRecentActivity">
          扫描讨论组
        </button>
      </div>

      <div v-else class="files-list">
        <div
          v-for="file in paginatedFiles"
          :key="file.id"
          class="file-item"
          :class="{
            selected: selectedFileIds.has(file.id),
            skipped: skipFiles.some((f) => f.id === file.id),
          }"
          @click="toggleSelect(file.id)"
        >
          <input
            type="checkbox"
            :checked="selectedFileIds.has(file.id)"
            :disabled="skipFiles.some((f) => f.id === file.id)"
            @click.stop
            @change="toggleSelect(file.id)"
          />
          <span class="file-rj">{{ file.rjCode }}</span>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-date">{{ formatDate(file.date) }}</span>
          <span class="file-size">{{ formatSize(file.size) }}</span>
          <span
            v-if="skipFiles.some((f) => f.id === file.id)"
            class="skip-badge"
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
        <!-- 并发数设置 -->
        <div class="concurrent-setting">
          <label>并发:</label>
          <input
            v-model.number="concurrentCount"
            type="number"
            min="1"
            max="10"
            class="concurrent-input"
          />
        </div>
      </div>
    </div>

    <!-- 下载进度 -->
    <div v-if="isDownloading" class="progress-section card">
      <div class="progress-header">
        <span>下载进度 ({{ concurrentCount }}个并发)</span>
        <span>{{ downloadProgress }}%</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: downloadProgress + '%' }"
        ></div>
      </div>
      <div class="progress-info">
        <span
          >{{ downloadedCount + skippedCount + failedFiles.length }} /
          {{ selectedFiles.length }}</span
        >
        <span class="current-file">{{ currentFile || "准备中..." }}</span>
      </div>
      <div class="progress-details">
        <span v-if="downloadedCount > 0" class="detail-success"
          >新下载 {{ downloadedCount }}</span
        >
        <span v-if="skippedCount > 0" class="detail-skipped"
          >已存在 {{ skippedCount }}</span
        >
        <span v-if="failedFiles.length > 0" class="detail-failed"
          >失败 {{ failedFiles.length }}</span
        >
      </div>
      <button class="cancel-btn" @click="cancelDownload">取消</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useMessage, useDialog } from "naive-ui";

// Naive UI 组件 - 必须在顶层调用
const message = useMessage();
const dialog = useDialog();

// 防抖相关
const lastScanTime = ref(0);
const SCAN_DEBOUNCE_MS = 3000; // 3秒防抖

// 数据
const allFiles = ref([]);
const selectedFileIds = ref(new Set());
const skipFiles = ref([]);

const excludeFilePath = ref("");
const excludeRJSet = ref(new Set());

// 状态
const isScanning = ref(false);
const isDownloading = ref(false);
const isCancelled = ref(false); // 取消标志
const downloadedCount = ref(0);
const skippedCount = ref(0); // 已存在的文件数
const downloadProgress = ref(0);
const currentFile = ref("");
const failedFiles = ref([]); // 记录失败的文件
const concurrentCount = ref(3); // 并发数

// 分页
const currentPage = ref(1);
const pageSize = 30;

// 计算属性
const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return allFiles.value.slice(start, start + pageSize);
});

const totalPages = computed(() => Math.ceil(allFiles.value.length / pageSize));

const selectedFiles = computed(() => {
  return allFiles.value.filter((f) => selectedFileIds.value.has(f.id));
});

// 加载文件列表
const loadRecentActivity = async () => {
  try {
    const result = await window.api?.tgReadRecentActivity?.();
    if (
      result &&
      result.success &&
      result.data &&
      Array.isArray(result.data.files)
    ) {
      // 1. 过滤掉大于等于2MB的文件
      const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
      const filteredFiles = result.data.files.filter((file) => {
        const fileSize = file.fileSize || file.size || 0;
        return fileSize < MAX_FILE_SIZE;
      });

      // 2. 去重（按 ID 去重，保留最新的）
      const fileMap = new Map();
      filteredFiles.forEach((file) => {
        const id = file.rjCode || file.id;
        const existing = fileMap.get(id);
        if (existing) {
          // 如果已存在，保留日期较新的
          const existingDate = new Date(existing.date).getTime();
          const newDate = new Date(file.date).getTime();
          if (newDate > existingDate) {
            fileMap.set(id, file);
          }
        } else {
          fileMap.set(id, file);
        }
      });

      // 2. 按时间降序排序
      allFiles.value = Array.from(fileMap.values()).sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      // 3. 确保每个文件都有必要的属性
      allFiles.value.forEach((file) => {
        if (!file.name) {
          file.name = file.fileName || "unknown";
          console.warn(
            `[loadRecentActivity] File missing 'name', id=${file.id}, using fallback: ${file.name}`,
          );
        }
        if (!file.id) {
          file.id = file.rjCode || Date.now().toString();
          console.warn(
            `[loadRecentActivity] File missing 'id', using fallback: ${file.id}`,
          );
        }
      });

      // 4. 默认全选
      selectedFileIds.value = new Set(allFiles.value.map((f) => f.id));
      // 5. 重新计算跳过列表
      updateSkipFiles();
    }
  } catch (e) {
    console.error("Failed to load files:", e);
  }
};

// 扫描讨论组（带防抖）
const scanRecentActivity = async () => {
  console.log("🔥 RECENT ACTIVITY BUTTON CLICKED");

  // 防抖检查：如果正在扫描中，直接返回
  if (isScanning.value) {
    console.log("正在扫描中");
    message.warning("扫描正在进行中，请稍候...");
    return;
  }

  // 防抖检查：检查时间间隔
  const now = Date.now();
  const timeSinceLastScan = now - lastScanTime.value;
  if (timeSinceLastScan < SCAN_DEBOUNCE_MS) {
    const remainingSeconds = Math.ceil(
      (SCAN_DEBOUNCE_MS - timeSinceLastScan) / 1000,
    );
    console.log(`防抖触发，剩余 ${remainingSeconds} 秒`);
    message.warning(`请等待 ${remainingSeconds} 秒后再试`);
    return;
  }

  // 更新最后扫描时间
  lastScanTime.value = now;
  isScanning.value = true;

  // 显示加载提示
  console.log("显示加载提示");
  const loadingMessage = message.loading("正在连接 Telegram 扫描文件...", {
    duration: 0,
  });

  try {
    console.log("🔥 CALLING tgScanRecentActivity FROM RECENT ACTIVITY");
    const result = await window.api?.tgScanRecentActivity?.();
    console.log("🔥 RECENT ACTIVITY RESULT:", result);

    // 关闭加载提示
    loadingMessage.destroy();

    if (result && result.success) {
      await loadRecentActivity();

      // 显示成功提示
      const fileCount = allFiles.value.length;
      console.log("显示成功弹窗，文件数:", fileCount);
      dialog.success({
        title: "扫描完成",
        content: `成功获取到 ${fileCount} 个文件`,
        positiveText: "确定",
      });
    } else {
      // 显示失败弹窗
      console.log("显示失败弹窗");
      dialog.error({
        title: "扫描失败",
        content: result?.error || "未知错误，请检查网络连接或配置",
        positiveText: "确定",
      });
    }
  } catch (error) {
    // 关闭加载提示
    loadingMessage.destroy();

    // 显示错误弹窗
    console.log("显示错误弹窗:", error);
    dialog.error({
      title: "扫描出错",
      content: error?.message || "扫描过程出错，请检查网络或控制台日志",
      positiveText: "确定",
    });
  } finally {
    isScanning.value = false;
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
    console.error("选择文件失败:", e);
  }
};

// 加载排除文件
const loadExcludeFile = async () => {
  if (!excludeFilePath.value) return;

  try {
    const result = await window.api.invoke("read-rj-list", {
      path: excludeFilePath.value,
    });

    if (result.success) {
      excludeRJSet.value = new Set(
        result.data.map((rj) => {
          // 统一格式为纯数字
          const match = rj.match(/RJ?(\d+)/i);
          return match ? match[1] : rj;
        }),
      );
      updateSkipFiles();
    }
  } catch (e) {
    console.error("读取排除文件失败:", e);
  }
};

// 更新跳过列表
const updateSkipFiles = () => {
  skipFiles.value = allFiles.value.filter((file) => {
    if (!file.rjCode) return false;
    // 提取纯数字部分（支持 RJ/VJ/BJ）
    const rjMatch = file.rjCode.match(/(RJ|VJ|BJ)?(\d+)/i);
    const numOnly = rjMatch ? rjMatch[2] : file.rjCode;
    return excludeRJSet.value.has(numOnly);
  });

  // 从已选列表中移除跳过的文件
  skipFiles.value.forEach((file) => {
    selectedFileIds.value.delete(file.id);
  });
};

// 选择操作
const toggleSelect = (fileId) => {
  if (skipFiles.value.some((f) => f.id === fileId)) return;

  if (selectedFileIds.value.has(fileId)) {
    selectedFileIds.value.delete(fileId);
  } else {
    selectedFileIds.value.add(fileId);
  }
};

const selectAll = () => {
  allFiles.value.forEach((file) => {
    if (!skipFiles.value.some((f) => f.id === file.id)) {
      selectedFileIds.value.add(file.id);
    }
  });
};

const deselectAll = () => {
  selectedFileIds.value.clear();
};

const invertSelect = () => {
  allFiles.value.forEach((file) => {
    if (skipFiles.value.some((f) => f.id === file.id)) return;

    if (selectedFileIds.value.has(file.id)) {
      selectedFileIds.value.delete(file.id);
    } else {
      selectedFileIds.value.add(file.id);
    }
  });
};

// 开始下载（并发）
const startDownload = async () => {
  if (selectedFiles.value.length === 0 || isDownloading.value) return;

  isDownloading.value = true;
  downloadedCount.value = 0;
  skippedCount.value = 0;
  downloadProgress.value = 0;
  failedFiles.value = [];
  currentFile.value = "";
  isCancelled.value = false;

  const filesToDownload = [...selectedFiles.value]; // 复制数组
  const total = filesToDownload.length;
  const maxConcurrent = concurrentCount.value; // 最大并发数

  // 并发下载worker
  const downloadWorker = async (file) => {
    if (isCancelled.value) return { success: false, file };

    // 防御性检查：确保有必要的属性
    if (!file.name) {
      console.warn(`[downloadWorker] File missing 'name', id=${file.id}`);
      return { success: false, file, error: "文件缺少名称" };
    }

    try {
      const result = await window.api.invoke("download-tg-file", {
        fileId: file.id,
        fileName: file.name,
        tgMessageId: file.tgMessageId,
      });
      return {
        success: result.success,
        skipped: result.skipped,
        file,
        error: result.error || result.msg,
      };
    } catch (e) {
      return { success: false, file, error: e.message };
    }
  };

  try {
    // 分批并发执行
    for (let i = 0; i < total; i += maxConcurrent) {
      if (isCancelled.value) break;

      const batch = filesToDownload.slice(i, i + maxConcurrent);
      const results = await Promise.all(batch.map(downloadWorker));

      // 处理结果
      for (const result of results) {
        if (result.skipped) {
          skippedCount.value++; // 文件已存在，跳过
        } else if (result.success) {
          downloadedCount.value++; // 新下载成功
        } else {
          failedFiles.value.push({
            name: result.file.name,
            error: result.error || "下载失败",
          });
        }
      }

      // 更新进度（只计算实际下载的）
      const processed =
        downloadedCount.value + skippedCount.value + failedFiles.value.length;
      downloadProgress.value = Math.round((processed / total) * 100);
    }

    // 显示结果
    const successCount = downloadedCount.value;
    const skipCount = skippedCount.value;
    const failCount = failedFiles.value.length;

    let message = `下载完成！`;
    if (successCount > 0) message += `新下载 ${successCount} 个`;
    if (skipCount > 0) message += `，已存在跳过 ${skipCount} 个`;
    if (failCount > 0) message += `，失败 ${failCount} 个`;

    if (failCount > 0) {
      const failMsg = failedFiles.value
        .map((f) => `${f.name}: ${f.error}`)
        .join("\n");
      alert(`${message}\n\n${failMsg}`);
    } else {
      alert(message);
    }
  } catch (e) {
    alert(`下载失败: ${e.message}`);
  } finally {
    isDownloading.value = false;
    currentFile.value = "";
  }
};

// 取消下载
const cancelDownload = () => {
  isCancelled.value = true;
  isDownloading.value = false;
  currentFile.value = "";
};

// 格式化
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

const formatSize = (size) => {
  if (!size) return "-";
  const num = parseInt(size);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 / 1024).toFixed(1)} MB`;
};

onMounted(() => {
  loadRecentActivity();
});
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .page-container {
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .filter-row {
    flex-direction: column;
    gap: 16px;
  }

  .filter-group {
    width: 100%;
  }

  .file-input-row {
    flex-direction: column;
  }

  .browse-btn {
    width: 100%;
  }

  .stats {
    width: 100%;
    justify-content: space-around;
  }

  .file-item {
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-name {
    width: 100%;
    order: 3;
  }

  .file-date,
  .file-size {
    min-width: 50px;
  }
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .header-actions {
    flex-direction: column;
    gap: 8px;
  }

  .header-actions .btn-secondary,
  .header-actions .btn-primary {
    width: 100%;
    text-align: center;
  }

  .filter-section {
    padding: 12px 16px;
  }

  .file-item {
    padding: 8px 12px;
    font-size: 12px;
  }

  .file-rj {
    min-width: 70px;
    font-size: 12px;
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

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  padding: 10px 18px;
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
  padding: 10px 18px;
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
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card {
  background: #fff;
  border-radius: 12px;
}

.filter-section {
  padding: 16px 20px;
}

.filter-row {
  display: flex;
  gap: 20px;
  align-items: flex-end;
}

.filter-group {
  flex: 1;
}

.filter-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #525252;
}

.file-input-row {
  display: flex;
  gap: 8px;
}

.file-input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  background: #fafafa;
}

.file-input:focus {
  border-color: #8b5cf6;
}

.browse-btn {
  padding: 10px 16px;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.browse-btn:hover {
  border-color: #8b5cf6;
  color: #8b5cf6;
}

.stats {
  display: flex;
  gap: 16px;
  flex: 0 0 auto;
}

.stat-item {
  text-align: center;
  padding: 8px 16px;
  background: #f5f5f5;
  border-radius: 8px;
}

.stat-item.skip {
  background: #fff7e6;
}

.stat-item.download {
  background: #f6ffed;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #262626;
}

.filter-actions {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.action-link {
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.action-link:hover {
  text-decoration: underline;
}

.files-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.scanning-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #8b5cf6;
}

.loader {
  border: 4px solid #f5f5f5;
  border-top: 4px solid #8b5cf6;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.empty-activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #a3a3a3;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.files-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.file-item:hover {
  background: #f0f0f0;
}

.file-item.selected {
  background: #f3e8ff;
  border: 1px solid #8b5cf6;
}

.file-item.skipped {
  opacity: 0.5;
  background: #f5f5f5;
}

.file-rj {
  font-weight: 600;
  color: #8b5cf6;
  min-width: 90px;
}

.file-name {
  flex: 1;
  color: #262626;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-date {
  color: #8c8c8c;
  font-size: 12px;
  min-width: 70px;
}

.file-size {
  color: #8c8c8c;
  font-size: 12px;
  min-width: 60px;
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
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
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
  color: #8c8c8c;
}

.concurrent-setting {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 16px;
  font-size: 13px;
  color: #8c8c8c;
}

.concurrent-input {
  width: 50px;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.concurrent-input:focus {
  outline: none;
  border-color: #8b5cf6;
}

.progress-section {
  padding: 16px 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.progress-bar {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: #8b5cf6;
  transition: width 0.3s;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #8c8c8c;
  margin-bottom: 8px;
}

.progress-details {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
}

.detail-success {
  color: #52c41a;
}

.detail-skipped {
  color: #faad14;
}

.detail-failed {
  color: #ff4d4f;
}

.current-file {
  color: #8b5cf6;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
