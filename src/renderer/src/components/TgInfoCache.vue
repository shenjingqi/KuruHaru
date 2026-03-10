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
        </div>

        <div class="control-buttons">
          <n-button
            type="default"
            :loading="isRefreshing"
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
