<template>
  <div class="tg-info-error-recover tg-search-bot-theme">
    <n-card title="TG 信息报错恢复" :bordered="false" class="bot-card">
      <n-space vertical :size="16">
        <div class="bot-meta">
          <div class="meta-item">
            在讨论组中搜索关键词（默认“获取作品信息失败”），自动匹配附近上下消息并定位目标。
          </div>
          <div class="meta-item">
            支持下载 ZIP、定位频道原帖并删除（测试模式下仅预览，不执行删除）。
          </div>
          <div v-if="lastRunAt" class="meta-item">
            最近执行：{{ lastRunAt }}
          </div>
        </div>

        <n-form label-placement="left" :label-width="108" class="recover-form">
          <n-grid :x-gap="12" :y-gap="6" :cols="24">
            <n-form-item-gi :span="12" label="讨论组 ID">
              <n-input
                v-model:value="form.groupId"
                :bordered="false"
                placeholder="-100xxxxxxxxxx"
              />
            </n-form-item-gi>
            <n-form-item-gi :span="12" label="频道 ID">
              <n-input
                v-model:value="form.channelId"
                :bordered="false"
                placeholder="-100xxxxxxxxxx"
              />
            </n-form-item-gi>

            <n-form-item-gi :span="24" label="关键词">
              <n-input
                v-model:value="form.keyword"
                :bordered="false"
                placeholder="获取作品信息失败"
              />
            </n-form-item-gi>

            <n-form-item-gi :span="24" label="下载目录">
              <div class="search-input-group">
                <n-input
                  v-model:value="form.downloadDir"
                  :bordered="false"
                  placeholder="选择下载目录"
                />
                <n-button text :bordered="false" @click="pickDownloadDir">
                  <template #icon>
                    <FolderOpenOutlined />
                  </template>
                  选择目录
                </n-button>
              </div>
            </n-form-item-gi>

            <n-form-item-gi :span="8" label="扫描上方条数">
              <n-input-number
                v-model:value="form.searchBeforeLimit"
                :min="1"
                :max="50"
                :precision="0"
                style="width: 100%"
              />
            </n-form-item-gi>
            <n-form-item-gi :span="8" label="扫描下方条数">
              <n-input-number
                v-model:value="form.searchAfterLimit"
                :min="1"
                :max="50"
                :precision="0"
                style="width: 100%"
              />
            </n-form-item-gi>
            <n-form-item-gi :span="8" label="候选探测条数">
              <n-input-number
                v-model:value="form.candidateProbeLimit"
                :min="1"
                :max="20"
                :precision="0"
                style="width: 100%"
              />
            </n-form-item-gi>

            <n-form-item-gi :span="8" label="报错扫描上限">
              <n-input-number
                v-model:value="form.scanLimit"
                :min="0"
                :max="50000"
                :precision="0"
                style="width: 100%"
              />
            </n-form-item-gi>
            <n-form-item-gi :span="8" label="回帖扫描上限">
              <n-input-number
                v-model:value="form.replyScanLimit"
                :min="10"
                :max="2000"
                :precision="0"
                style="width: 100%"
              />
            </n-form-item-gi>
            <n-form-item-gi :span="8" label="下载 ZIP">
              <n-switch v-model:value="form.downloadZip" />
            </n-form-item-gi>

            <n-form-item-gi :span="8" label="测试模式">
              <n-switch v-model:value="form.safetyMode" />
            </n-form-item-gi>
          </n-grid>
        </n-form>

        <div class="control-buttons">
          <n-button type="primary" :loading="isRunning" @click="handleRun">
            <template #icon>
              <PlayCircleOutlined />
            </template>
            {{ isRunning ? "执行中..." : "执行恢复" }}
          </n-button>
          <n-button :disabled="isRunning" @click="resetOptions">
            恢复默认参数
          </n-button>
          <n-button :disabled="isRunning" @click="loadDefaultsFromConfig">
            从配置载入 ID
          </n-button>
        </div>

        <div v-if="summary" class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">处理报错</div>
            <div class="summary-value">{{ summary.processedCount || 0 }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">找到 ZIP</div>
            <div class="summary-value">{{ summary.zipFoundCount || 0 }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">下载 ZIP</div>
            <div class="summary-value">
              {{ summary.zipDownloadedCount || 0 }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">删除消息</div>
            <div class="summary-value">
              {{ summary.deletedMessageCount || 0 }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">预览跳过删除</div>
            <div class="summary-value">
              {{ summary.deleteSkippedCount || 0 }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">错误数</div>
            <div class="summary-value">{{ summary.errorCount || 0 }}</div>
          </div>
        </div>

        <div v-if="tableRows.length" class="table-wrap">
          <n-data-table
            :columns="columns"
            :data="tableRows"
            :row-key="(row) => row.key"
            :pagination="{ pageSize: 20, showSizePicker: true }"
            :scroll-x="1960"
          />
        </div>

        <div v-else-if="result && !isRunning" class="empty-state">
          本次执行没有返回可展示记录。
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItemGi,
  NGrid,
  NInput,
  NInputNumber,
  NSpace,
  NSwitch,
  useMessage,
} from "naive-ui";
import { FolderOpenOutlined, PlayCircleOutlined } from "@vicons/antd";
import { tgInfoErrorRecover } from "../api/tgApi";
import { loadConfig } from "../api/configApi";
import { openDirectory } from "../api/dialogApi";

const message = useMessage();

const createDefaultForm = () => ({
  groupId: "",
  channelId: "",
  keyword: "获取作品信息失败",
  safetyMode: true,
  downloadZip: true,
  downloadDir: "",
  scanLimit: 0,
  replyScanLimit: 200,
  searchBeforeLimit: 6,
  searchAfterLimit: 4,
  candidateProbeLimit: 5,
});

const form = ref(createDefaultForm());
const isRunning = ref(false);
const result = ref(null);
const lastRunAt = ref("");

const summary = computed(() => result.value?.summary || null);

const tableRows = computed(() => {
  const records = Array.isArray(result.value?.records)
    ? result.value.records
    : [];

  return records.map((row, index) => {
    const candidateMessageIds = Array.isArray(row?.candidateMessageIds)
      ? row.candidateMessageIds
      : [];
    const channelMessageIds = Array.isArray(row?.channelMessageIds)
      ? row.channelMessageIds
      : [];

    const zipStatus = row?.zipDownloaded
      ? `已下载${row?.zipFileName ? ` (${row.zipFileName})` : ""}`
      : row?.zipReplyMessageId
        ? `已找到${row?.zipFileName ? ` (${row.zipFileName})` : ""}`
        : "未找到";

    const deleteStatus = row?.deleted
      ? "已删除"
      : channelMessageIds.length > 0
        ? row?.safetyMode
          ? "预览未删除"
          : "未删除"
        : "无删除目标";

    return {
      ...row,
      key: `${row?.errorMessageId || "unknown"}-${index}`,
      candidateMessageIdsText: candidateMessageIds.length
        ? candidateMessageIds.slice(0, 12).join(",")
        : "-",
      channelMessageIdsText: channelMessageIds.length
        ? channelMessageIds.join(",")
        : "-",
      zipStatus,
      deleteStatus,
      matchScoreText:
        row?.matchScore === null || row?.matchScore === undefined
          ? "-"
          : String(row.matchScore),
      matchDistanceText:
        row?.matchDistance === null || row?.matchDistance === undefined
          ? "-"
          : String(row.matchDistance),
      errorText: row?.error || "",
    };
  });
});

const columns = [
  { title: "报错ID", key: "errorMessageId", width: 92 },
  { title: "报错编号", key: "errorWorkCode", width: 110 },
  { title: "目标ID", key: "targetMessageId", width: 92 },
  { title: "目标编号", key: "targetWorkCode", width: 110 },
  { title: "匹配方式", key: "matchedBy", width: 150 },
  { title: "匹配分数", key: "matchScoreText", width: 98 },
  { title: "消息距离", key: "matchDistanceText", width: 98 },
  {
    title: "候选消息ID",
    key: "candidateMessageIdsText",
    minWidth: 220,
    ellipsis: { tooltip: true },
  },
  {
    title: "ZIP状态",
    key: "zipStatus",
    minWidth: 190,
    ellipsis: { tooltip: true },
  },
  {
    title: "频道消息ID",
    key: "channelMessageIdsText",
    minWidth: 200,
    ellipsis: { tooltip: true },
  },
  { title: "删除状态", key: "deleteStatus", width: 122 },
  {
    title: "异常",
    key: "errorText",
    minWidth: 240,
    ellipsis: { tooltip: true },
  },
];

const toSafeString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
};

const loadDefaultsFromConfig = async () => {
  try {
    const config = await loadConfig();
    const tgConfig = config?.tg || {};
    const pathsConfig = config?.paths || {};

    if (!form.value.groupId) {
      form.value.groupId = toSafeString(tgConfig.discussion);
    }
    if (!form.value.channelId) {
      form.value.channelId = toSafeString(tgConfig.channel);
    }
    if (!form.value.downloadDir) {
      form.value.downloadDir = toSafeString(pathsConfig.tgDownloadDir);
    }
  } catch (error) {
    message.warning(`读取配置失败：${error.message}`);
  }
};

const pickDownloadDir = async () => {
  try {
    const result = await openDirectory();
    if (result?.canceled || !result?.filePath) {
      return;
    }

    form.value.downloadDir = result.filePath;
  } catch (error) {
    message.error(`打开目录选择器失败：${error.message}`);
  }
};

const resetOptions = () => {
  const { groupId, channelId, downloadDir } = form.value;
  form.value = {
    ...createDefaultForm(),
    groupId,
    channelId,
    downloadDir,
  };
};

const buildPayload = () => ({
  groupId: toSafeString(form.value.groupId),
  channelId: toSafeString(form.value.channelId),
  keyword: toSafeString(form.value.keyword) || "获取作品信息失败",
  safetyMode: Boolean(form.value.safetyMode),
  downloadZip: Boolean(form.value.downloadZip),
  downloadDir: toSafeString(form.value.downloadDir),
  scanLimit: Number(form.value.scanLimit) || 0,
  replyScanLimit: Number(form.value.replyScanLimit) || 200,
  searchBeforeLimit: Number(form.value.searchBeforeLimit) || 6,
  searchAfterLimit: Number(form.value.searchAfterLimit) || 4,
  candidateProbeLimit: Number(form.value.candidateProbeLimit) || 5,
});

const handleRun = async () => {
  if (
    !toSafeString(form.value.groupId) ||
    !toSafeString(form.value.channelId)
  ) {
    message.warning("请先填写讨论组 ID 和频道 ID");
    return;
  }

  isRunning.value = true;
  try {
    const runResult = await tgInfoErrorRecover(buildPayload());
    result.value = runResult || null;
    lastRunAt.value = new Date().toLocaleString();

    if (runResult?.success) {
      const runSummary = runResult?.summary || {};
      const modeText = form.value.safetyMode ? "测试模式" : "执行模式";
      message.success(
        `${modeText}完成：处理 ${runSummary.processedCount || 0} 条，下载 ${runSummary.zipDownloadedCount || 0} 个，删除 ${runSummary.deletedMessageCount || 0} 条`,
      );
      return;
    }

    message.error(runResult?.error || "执行失败");
  } catch (error) {
    message.error(`执行失败：${error.message}`);
  } finally {
    isRunning.value = false;
  }
};

onMounted(() => {
  loadDefaultsFromConfig();
});
</script>

<style scoped>
.tg-info-error-recover {
  max-width: 1180px;
  margin: 0 auto;
}

.bot-card {
  margin-bottom: 20px;
}

.bot-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-item {
  font-size: 13px;
  color: var(--comp-muted, #667085);
  line-height: 1.6;
}

.recover-form :deep(.n-form-item) {
  margin-bottom: 4px;
}

.control-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-item {
  border: 1px solid var(--comp-border, #d8dee8);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--comp-surface-2, #f3f6fb);
}

.summary-label {
  font-size: 12px;
  color: var(--comp-muted, #667085);
  margin-bottom: 6px;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: var(--comp-text, #2d2c22);
}

.table-wrap {
  border: 1px solid var(--comp-border, #d8dee8);
  border-radius: 10px;
  overflow: hidden;
}

.empty-state {
  padding: 20px 14px;
  border: 1px dashed var(--comp-border, #d8dee8);
  border-radius: 10px;
  color: var(--comp-muted, #667085);
  text-align: center;
  background: color-mix(
    in srgb,
    var(--comp-surface-2, #f3f6fb) 76%,
    transparent
  );
}
</style>
