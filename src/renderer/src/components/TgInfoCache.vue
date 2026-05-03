<template>
  <div class="tg-info-cache tg-search-bot-theme">
    <n-card title="TG 作品信息缓存" :bordered="false" class="bot-card">
      <n-space vertical :size="16">
        <div class="bot-meta">
          <div class="meta-item">
            缓存文件：{{ statusResult?.cacheFilePath || "未生成" }}
          </div>
          <div class="meta-item">
            文件状态：{{ statusResult?.exists ? "存在" : "不存在" }}，记录数：{{
              statusResult?.records || 0
            }}
          </div>
          <div class="meta-item">
            文件大小：{{ formatBytes(statusResult?.fileSize || 0) }}
          </div>
          <div class="meta-item">
            大小上限：{{ formatBytes(statusResult?.maxFileSizeBytes || 0) }}（{{
              statusResult?.maxFileSizeMB || 0
            }}
            MB）
          </div>
          <div class="meta-item">
            热缓存：{{ hotCacheEnabledText }}，模式：{{ hotCacheModeText }}
          </div>
          <div class="meta-item">
            上次缓存检查：{{ hotCacheLastCheckedLabel }}
          </div>
          <div class="meta-item">
            One 最近检测到更新：{{ hotCacheLastChangedLabel }}
          </div>
          <div class="meta-item">
            One 持续未更新：{{ hotCacheStaleDurationLabel }}
          </div>
          <div class="meta-item">
            最近同步结果：{{ hotCacheLastResultText }}
          </div>
        </div>

        <div class="control-buttons">
          <n-button
            type="default"
            :loading="isRefreshing"
            :disabled="isBuilding"
            @click="refreshStatus"
          >
            <template #icon>
              <SyncOutlined />
            </template>
            刷新缓存状态
          </n-button>
        </div>

        <div class="search-section">
          <div class="concurrency-row">
            <span class="recent-label">并发抓取数：</span>
            <n-input-number
              v-model:value="buildConcurrency"
              :min="1"
              :max="20"
              :precision="0"
              size="small"
            />
          </div>
          <div class="search-input-group">
            <n-input
              v-model:value="inputFilePath"
              :bordered="false"
              placeholder="点击“选择TXT”后自动填入路径"
              class="search-input"
              @keyup.enter="buildCacheFromTxt"
            />
            <n-button
              type="default"
              text
              :bordered="false"
              @click="pickTxtFile"
            >
              <template #icon>
                <FolderOpenOutlined />
              </template>
              选择TXT
            </n-button>
            <n-button
              type="warning"
              text
              :bordered="false"
              :loading="isBuilding"
              @click="buildCacheFromTxt"
            >
              <template #icon>
                <SyncOutlined />
              </template>
              从 TXT 构建缓存
            </n-button>
          </div>
          <div v-if="recentTxtPaths.length" class="recent-paths">
            <span class="recent-label">最近路径：</span>
            <n-button
              v-for="path in recentTxtPaths"
              :key="path"
              size="tiny"
              quaternary
              class="recent-path-btn"
              @click="useRecentPath(path)"
            >
              {{ path }}
            </n-button>
          </div>
        </div>

        <div v-if="buildResult" class="sync-result">
          <n-card title="构建结果" size="small" :bordered="false">
            <div v-if="buildResult.success" class="success-result">
              <n-icon size="20">
                <CheckCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">{{ buildResult.message }}</div>
                <div class="result-message">
                  输入：{{ buildResult.inputFilePath || "-" }}
                </div>
                <div class="result-message">
                  输出：{{ buildResult.outputFilePath || "-" }}
                </div>
                <div v-if="buildResult.stats" class="result-message">
                  扫描 {{ buildResult.stats.scanned }}，抓取
                  {{ buildResult.stats.fetched }}，失败
                  {{ buildResult.stats.failed }}，总计
                  {{ buildResult.stats.total }}
                </div>
                <div v-if="buildResult.stats" class="result-message">
                  新增 {{ buildResult.stats.added || 0 }}，更新
                  {{ buildResult.stats.updated || 0 }}，命中
                  {{ buildResult.stats.skippedExisting || 0 }}，淘汰
                  {{ buildResult.stats.evicted || 0 }}
                </div>
                <div v-if="buildResult.stats" class="result-message">
                  并发：{{ buildResult.stats.maxConcurrency || "-" }}
                </div>
              </div>
            </div>
            <div v-else class="error-result">
              <n-icon size="20">
                <ExclamationCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">
                  {{ buildResult.error || buildResult.message || "构建失败" }}
                </div>
              </div>
            </div>
          </n-card>
        </div>

        <div class="usage-section">
          <n-card title="说明" size="small" :bordered="false">
            <ul class="usage-list">
              <li>本页仅负责读取 TXT 并构建“作品信息缓存 JSON”。</li>
              <li>该缓存供纯文本编号查询和详情查询使用。</li>
              <li>
                `/search`
                使用的是链接索引缓存（`tg-bot-history.json`），和本页缓存独立。
              </li>
            </ul>
          </n-card>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NIcon,
  NInput,
  NInputNumber,
  NSpace,
  useMessage,
} from "naive-ui";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FolderOpenOutlined,
  SyncOutlined,
} from "@vicons/antd";
import { useTgInfoCacheWorkflow } from "../composables/useTgInfoCacheWorkflow";

const message = useMessage();
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const RELATIVE_TIME_REFRESH_MS = 60 * 1000;

const nowTick = ref(Date.now());
let relativeTimeTimer = null;

const formatBytes = (rawValue) => {
  const bytes = Number(rawValue);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 ? 0 : 2;
  return `${value.toFixed(fractionDigits)} ${BYTE_UNITS[unitIndex]}`;
};

const formatAbsoluteTime = (rawValue) => {
  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
};

const formatRelativeDuration = (rawValue, options = {}) => {
  const timestamp = Number(rawValue);
  const fallbackText = options.fallbackText || "暂无";
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return fallbackText;
  }

  const diffMs = Math.max(0, nowTick.value - timestamp);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes <= 0) {
    return options.withSuffix === false ? "不到 1 分钟" : "刚刚";
  }

  if (diffMinutes < 60) {
    return options.withSuffix === false
      ? `${diffMinutes} 分钟`
      : `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return options.withSuffix === false
      ? `${diffHours} 小时`
      : `${diffHours} 小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return options.withSuffix === false ? `${diffDays} 天` : `${diffDays} 天前`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return options.withSuffix === false
    ? `${diffMonths} 个月`
    : `${diffMonths} 个月前`;
};

const formatTimeWithRelative = (rawValue, options = {}) => {
  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return options.fallbackText || "暂无";
  }

  return `${formatAbsoluteTime(timestamp)}（${formatRelativeDuration(timestamp)}）`;
};

const HOT_CACHE_MODE_MAP = {
  active: "高频",
  normal: "常规",
  cool: "降频",
};

const HOT_CACHE_RESULT_MAP = {
  idle: "等待首次同步",
  disabled: "已关闭",
  failed: "同步失败",
  not_modified: "页面未变化（304）",
  updated: "检测到页面更新并已写入缓存",
  changed_skipped: "检测到页面更新，但因已有记录而跳过写入",
  unchanged_payload: "接口返回成功，但页面内容未变",
};

const {
  isBuilding,
  isRefreshing,
  inputFilePath,
  buildConcurrency,
  statusResult,
  buildResult,
  recentTxtPaths,
  refreshStatus,
  pickTxtFile,
  buildCacheFromTxt,
  useRecentPath,
} = useTgInfoCacheWorkflow({ message });

const hotCacheEnabledText = computed(() =>
  statusResult.value?.hotCache?.enabled === false ? "关闭" : "开启",
);

const hotCacheModeText = computed(() => {
  const mode = String(statusResult.value?.hotCache?.mode || "").trim();
  return HOT_CACHE_MODE_MAP[mode] || "未开始";
});

const hotCacheLastCheckedLabel = computed(() =>
  formatTimeWithRelative(statusResult.value?.hotCache?.lastCheckedAt, {
    fallbackText: "暂无检查记录",
  }),
);

const hotCacheLastChangedLabel = computed(() =>
  formatTimeWithRelative(statusResult.value?.hotCache?.lastChangedAt, {
    fallbackText: "暂无更新记录",
  }),
);

const hotCacheStaleDurationLabel = computed(() =>
  formatRelativeDuration(statusResult.value?.hotCache?.lastChangedAt, {
    fallbackText: "暂无更新记录",
    withSuffix: false,
  }),
);

const hotCacheLastResultText = computed(() => {
  const hotCache = statusResult.value?.hotCache || {};
  const resultText =
    HOT_CACHE_RESULT_MAP[String(hotCache.lastResult || "").trim()] ||
    hotCache.lastResult ||
    "暂无";
  const summaryText = String(hotCache.lastSyncSummary || "").trim();
  return summaryText ? `${resultText}；${summaryText}` : resultText;
});

onMounted(() => {
  relativeTimeTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, RELATIVE_TIME_REFRESH_MS);
});

onBeforeUnmount(() => {
  if (relativeTimeTimer) {
    window.clearInterval(relativeTimeTimer);
    relativeTimeTimer = null;
  }
});
</script>

<style scoped>
.tg-info-cache {
  max-width: 760px;
  margin: 0 auto;
}

.bot-card {
  margin-bottom: 20px;
}

.bot-meta {
  margin-bottom: 16px;
}

.meta-item {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  word-break: break-all;
}

.control-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-section {
  margin-bottom: 16px;
}

.concurrency-row {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
}

.recent-paths {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.recent-label {
  color: #666;
  font-size: 12px;
}

.recent-path-btn {
  max-width: 100%;
}

.sync-result {
  margin-top: 8px;
}

.success-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #00b42a;
}

.error-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #f53f3f;
}

.result-content {
  flex: 1;
}

.result-message {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.usage-section {
  margin-top: 8px;
}

.usage-list {
  list-style-type: disc;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.8;
  color: #666;
}

.usage-list li {
  margin-bottom: 6px;
}
</style>
