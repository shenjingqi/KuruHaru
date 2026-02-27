<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header-simple">
      <div class="header-left">
        <h2 class="page-title">仪表盘</h2>
      </div>
      <div class="header-actions">
        <button
          class="btn-secondary"
          :disabled="isLoading"
          @click="handleClearCache"
        >
          删除缓存
        </button>
        <button
          class="btn-primary"
          :disabled="isLoading"
          @click="handleManualScan"
        >
          {{ isLoading ? "扫描中..." : "扫描讨论组" }}
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">⏱️</div>
        <div class="stat-content">
          <div class="stat-value">{{ daysSinceUpdate }}</div>
          <div class="stat-label">距上次更新</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">📤</div>
        <div class="stat-content">
          <div class="stat-value">{{ totalUploads }}</div>
          <div class="stat-label">最近上传</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon purple">📈</div>
        <div class="stat-content">
          <div class="stat-value">{{ todayUploads }}</div>
          <div class="stat-label">今日上传</div>
        </div>
      </div>
    </div>

    <!-- 最近发布记录 -->
    <div class="card">
      <div class="card-header">
        <h3 class="section-title">📅 最近发布记录</h3>
      </div>

      <div class="history-list">
        <div v-if="recentHistory.length > 0">
          <div
            v-for="item in recentHistory"
            :key="item.id"
            class="history-item"
          >
            <div class="item-left">
              <span class="code-badge">{{ item.id }}</span>
              <span v-if="item.name" class="file-name">{{ item.name }}</span>
            </div>
            <span class="time">{{ item.date || "未知时间" }}</span>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="empty-icon">📭</span>
          <p>暂无记录</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useMessage, useDialog } from "naive-ui";

const message = useMessage();
const dialog = useDialog();

const historyList = ref([]);
const daysSinceUpdate = ref("未知");
const isLoading = ref(false);

// 防抖相关
const lastScanTime = ref(0);
const SCAN_DEBOUNCE_MS = 3000; // 3秒防抖

const recentHistory = computed(() => {
  return historyList.value
    .filter((item) => item.rawDate) // 只保留有日期的文件
    .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)) // 按上传时间降序排序（最新的在前）
    .slice(0, 10); // 取前10条
});

const totalUploads = computed(() => {
  return historyList.value.length;
});

const todayUploads = computed(() => {
  const today = new Date().toDateString();
  return historyList.value.filter((item) => {
    if (!item.rawDate) return false;
    return new Date(item.rawDate).toDateString() === today;
  }).length;
});

const getDaysSince = (dateString) => {
  if (!dateString) return "未知";
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 0 ? "今天" : `${diffDays} 天前`;
};

const refreshData = async () => {
  isLoading.value = true;
  try {
    const recentActivity = await window.api.tgReadRecentActivity();
    if (recentActivity && recentActivity.success && recentActivity.data) {
      if (recentActivity.data.files) {
        // 映射并去重（按 ID 去重，保留最新的）
        const fileMap = new Map();
        recentActivity.data.files.forEach((file) => {
          const id = file.rjCode || file.id;
          const existing = fileMap.get(id);

          // 确保有必要的属性
          if (!file.name && file.fileName) {
            file.name = file.fileName;
          }

          // 如果已存在，保留日期较新的
          if (existing) {
            const existingDate = new Date(existing.rawDate).getTime();
            const newDate = new Date(file.date).getTime();
            if (newDate > existingDate) {
              fileMap.set(id, {
                id: id,
                date: file.date
                  ? new Date(file.date).toLocaleString("zh-CN")
                  : "未知时间",
                rawDate: file.date,
                name: file.name || file.fileName || "unknown",
              });
            }
          } else {
            fileMap.set(id, {
              id: id,
              date: file.date
                ? new Date(file.date).toLocaleString("zh-CN")
                : "未知时间",
              rawDate: file.date,
              name: file.name || file.fileName || "unknown",
            });
          }
        });
        historyList.value = Array.from(fileMap.values());
      }

      // 优先使用新的 anchor 日期，向后兼容 currentAnchor 和 referenceFile
      const metadata = recentActivity.data?.metadata;
      if (metadata?.anchor) {
        const refDate = metadata.anchor.date;
        daysSinceUpdate.value = getDaysSince(refDate);
      } else if (metadata?.currentAnchor) {
        const refDate = metadata.currentAnchor.date;
        daysSinceUpdate.value = getDaysSince(refDate);
      } else if (metadata?.referenceFile) {
        const refDate = metadata.referenceFile.date;
        daysSinceUpdate.value = getDaysSince(refDate);
      }
    }
  } catch (e) {
    console.error("刷新数据失败:", e);
  } finally {
    isLoading.value = false;
  }
};

const scanInBackground = async () => {
  try {
    await window.api.tgScanRecentActivity();
    await refreshData();
  } catch (e) {
    console.error("后台扫描失败:", e);
  }
};

const handleManualScan = async () => {
  console.log("🔥 HOME PANEL BUTTON CLICKED");

  // 防抖检查：如果正在扫描中，直接返回
  if (isLoading.value) {
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
    message.warning(`请等待 ${remainingSeconds} 秒后再试`);
    return;
  }

  // 更新最后扫描时间
  lastScanTime.value = now;
  isLoading.value = true;

  // 显示加载提示
  const loadingMessage = message.loading("正在连接 Telegram 扫描文件...", {
    duration: 0,
  });

  try {
    // FIX: Show cached data immediately first (like startup behavior)
    console.log("🔥 SHOWING CACHED DATA FIRST");
    await refreshData();

    // FIX: Run scan in background, don't block UI
    console.log("🔥 RUNNING SCAN IN BACKGROUND");
    const result = await window.api.tgScanRecentActivity();
    await refreshData();

    // 关闭加载提示
    loadingMessage.destroy();

    if (result && result.success) {
      // 显示成功提示
      const fileCount = historyList.value.length;
      dialog.success({
        title: "扫描完成",
        content: `成功获取到 ${fileCount} 个文件`,
        positiveText: "确定",
      });
    } else {
      // 显示失败弹窗
      dialog.error({
        title: "扫描失败",
        content: result?.error || "未知错误，请检查网络连接或配置",
        positiveText: "确定",
      });
    }
  } catch (e) {
    // 关闭加载提示
    loadingMessage.destroy();

    console.error("手动扫描失败:", e);
    dialog.error({
      title: "扫描出错",
      content: e?.message || "扫描过程出错，请检查网络或控制台日志",
      positiveText: "确定",
    });
  } finally {
    isLoading.value = false;
  }
};

// 删除缓存
const handleClearCache = async () => {
  dialog.warning({
    title: "确认删除缓存",
    content: "确定要删除最近上传的缓存数据吗？删除后将重新扫描。",
    positiveText: "确定删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        isLoading.value = true;
        message.info("正在删除缓存...");

        // 清除本地缓存文件
        const clearResult = await window.api.invoke("clear-cache", {
          cacheFile: "recent_activity.json",
        });

        if (clearResult.success) {
          message.success("缓存已删除");
          // 重新加载数据
          await refreshData();
        } else {
          message.error("删除缓存失败: " + (clearResult.error || "未知错误"));
        }
      } catch (e) {
        console.error("删除缓存失败:", e);
        message.error("删除缓存失败: " + e.message);
      } finally {
        isLoading.value = false;
      }
    },
  });
};

onMounted(async () => {
  await refreshData();
  scanInBackground();
});
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1200px;
}

.page-header-simple {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-primary {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: #8b5cf6;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #d4d4d4;
  background: #fff;
  color: #525252;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid #e5e5e5;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.blue {
  background: #eff6ff;
}

.stat-icon.green {
  background: #f0fdf4;
}

.stat-icon.purple {
  background: #f0ebfc;
}

.stat-card:last-child {
  padding: 16px 20px;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-content.full-width {
  width: 100%;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.blue {
  background: #eff6ff;
}

.stat-icon.green {
  background: #f0fdf4;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #262626;
}

.stat-label {
  font-size: 13px;
  color: #737373;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e5e5e5;
}

.card-header {
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #262626;
}

.history-list {
  max-height: 400px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid #f5f5f5;
}

.history-item:last-child {
  border-bottom: none;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.code-badge {
  background: #eff6ff;
  color: #3b82f6;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.file-name {
  color: #525252;
  font-size: 14px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  color: #a3a3a3;
  font-size: 13px;
  font-family: monospace;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #a3a3a3;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.history-list::-webkit-scrollbar {
  width: 6px;
}

.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.history-list::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
