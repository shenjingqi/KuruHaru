<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2 class="page-title">RJ重复检测与清理</h2>
    </div>

    <!-- 配置区域 -->
    <div class="config-section card">
      <div class="card-header">
        <h3 class="section-title">扫描配置</h3>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <label class="label">扫描消息条数</label>
          <div class="input-wrap">
            <n-input-number
              v-model:value="scanLimit"
              :min="100"
              :max="10000"
              :step="100"
              :style="{ width: '100%' }"
            />
          </div>
        </div>

        <div class="action-bar">
          <button
            class="btn-primary"
            :disabled="isScanning"
            @click="handleScan"
          >
            {{ isScanning ? "扫描中..." : "开始扫描" }}
          </button>

          <button
            class="btn-warning"
            :disabled="selectedRowKeys.length === 0 || isDeleting"
            @click="handleSelectedDelete"
          >
            {{
              isDeleting ? "删除中..." : `删除选中 (${selectedRowKeys.length})`
            }}
          </button>

          <button
            class="btn-danger"
            :disabled="duplicatesToDelete.length === 0 || isDeleting"
            @click="handleBatchDelete"
          >
            {{
              isDeleting
                ? "删除中..."
                : `一键删除重复 (${duplicatesToDelete.length})`
            }}
          </button>

          <button
            class="btn-secondary"
            :disabled="selectedRowKeys.length === 0"
            @click="clearSelection"
          >
            清空选择
          </button>
        </div>
      </div>
    </div>

    <!-- 扫描进度 -->
    <div v-if="isScanning" class="progress-section card">
      <div class="card-body">
        <div class="progress-wrapper">
          <n-progress
            type="line"
            :percentage="scanProgress"
            :status="scanStatus"
            :stroke-width="8"
            :show-info="true"
          />
          <p class="progress-text">{{ scanProgressText }}</p>
        </div>
      </div>
    </div>

    <!-- 扫描结果 -->
    <div v-if="scanResults.length > 0" class="results-section card">
      <div class="card-header">
        <h3 class="section-title">
          扫描结果
          <span class="status-tag" :class="getResultStatusClass()">
            {{ statistics.totalScanned }} 条消息，{{ statistics.duplicateRJs }}
            个重复RJ号
          </span>
        </h3>
      </div>

      <div class="card-body">
        <n-data-table
          :columns="columns"
          :data="sortedScanResults"
          :row-key="getRowKey"
          :checked-row-keys="selectedRowKeys"
          :row-class-name="getRowClassName"
          :pagination="{ pageSize: 20, showSizePicker: true }"
          :scroll-x="1000"
          style="width: 100%"
          @update:checked-row-keys="handleSelectionChange"
        />
      </div>

      <!-- 统计信息 -->
      <div class="statistics-section">
        <div class="stat-card">
          <div class="stat-label">总扫描消息数</div>
          <div class="stat-value">{{ statistics.totalScanned }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">重复RJ号数量</div>
          <div class="stat-value">{{ statistics.duplicateRJs }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">待删除配对数</div>
          <div class="stat-value">{{ statistics.messagesToDelete }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">已删除配对数</div>
          <div class="stat-value">{{ statistics.deletedCount }}</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-if="scanResults.length === 0 && !isScanning && hasScanned"
      class="empty-state"
    >
      <span class="empty-icon">📭</span>
      <p>暂无重复的RJ号</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from "vue";
import { useMessage, useDialog } from "naive-ui";

const message = useMessage();
const dialog = useDialog();

// 状态管理
const scanLimit = ref(1000);
const isScanning = ref(false);
const isDeleting = ref(false);
const scanResults = ref([]);
const hasScanned = ref(false);
const scanProgress = ref(0);
const scanProgressText = ref("");
const scanStatus = ref("normal");
const selectedRowKeys = ref([]);

const statistics = ref({
  totalScanned: 0,
  duplicateRJs: 0,
  messagesToDelete: 0,
  deletedCount: 0,
});

function toMessageId(rawValue) {
  const normalized = Number(rawValue);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function toPeerId(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? String(Math.trunc(rawValue)) : null;
  }

  if (typeof rawValue === "bigint") {
    return rawValue.toString();
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof rawValue === "object") {
    if ("value" in rawValue) {
      return toPeerId(rawValue.value);
    }
    if ("userId" in rawValue) {
      return toPeerId(rawValue.userId);
    }
    if ("channelId" in rawValue) {
      return toPeerId(rawValue.channelId);
    }
    if ("chatId" in rawValue) {
      return toPeerId(rawValue.chatId);
    }
  }

  return null;
}

function getMessageId(messageData) {
  if (!messageData) {
    return null;
  }
  return toMessageId(messageData.messageId ?? messageData.id);
}

function getMessageIdText(messageData) {
  const messageId = getMessageId(messageData);
  return messageId === null ? "未知" : String(messageId);
}

function getSenderId(messageData) {
  if (!messageData) {
    return null;
  }

  return toPeerId(
    messageData.senderInfo?.senderId ??
      messageData.senderId ??
      messageData.fromId,
  );
}

function getSenderIdText(messageData) {
  const senderId = getSenderId(messageData);
  return senderId === null ? "未知" : senderId;
}

function getSenderName(messageData) {
  if (!messageData) {
    return null;
  }

  const senderName =
    messageData.senderInfo?.name ||
    messageData.senderInfo?.username ||
    messageData.postAuthor;

  if (typeof senderName !== "string") {
    return null;
  }

  const normalized = senderName.trim();
  return normalized.length > 0 ? normalized : null;
}

function getSenderNameText(messageData) {
  return getSenderName(messageData) || "未知";
}

function getMessageTimestamp(messageData) {
  if (!messageData?.date) {
    return 0;
  }

  const timestamp = new Date(messageData.date).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRowKey(row) {
  const userMessageId = getMessageId(row.userMessage);
  if (userMessageId !== null) {
    return userMessageId;
  }

  const botMessageId = getMessageId(row.botMessage);
  if (botMessageId !== null) {
    return `bot-${botMessageId}`;
  }

  return `${row.rjCode || "unknown"}-${row.associationMethod || "none"}-${new Date(
    row.userMessage?.date || 0,
  ).getTime()}`;
}

function collectMessageIds(rows) {
  const messageIds = rows
    .map((row) => [getMessageId(row.userMessage), getMessageId(row.botMessage)])
    .flat()
    .filter((messageId) => messageId !== null);

  return [...new Set(messageIds)];
}

const selectedRowKeySet = computed(() => new Set(selectedRowKeys.value));

// 计算属性：标记为删除但未选中的行
const duplicatesToDelete = computed(() => {
  return scanResults.value.filter((row) => {
    const userMessageId = getMessageId(row.userMessage);
    return (
      row.keepStatus === "delete" &&
      userMessageId !== null &&
      !selectedRowKeySet.value.has(userMessageId)
    );
  });
});

const sortedScanResults = computed(() => {
  return [...scanResults.value].sort((leftRow, rightRow) => {
    const leftIsDuplicate = leftRow.isDuplicate ? 1 : 0;
    const rightIsDuplicate = rightRow.isDuplicate ? 1 : 0;
    if (leftIsDuplicate !== rightIsDuplicate) {
      return rightIsDuplicate - leftIsDuplicate;
    }

    const leftNeedsDelete = leftRow.keepStatus === "delete" ? 1 : 0;
    const rightNeedsDelete = rightRow.keepStatus === "delete" ? 1 : 0;
    if (leftNeedsDelete !== rightNeedsDelete) {
      return rightNeedsDelete - leftNeedsDelete;
    }

    const leftTime = getMessageTimestamp(leftRow.userMessage);
    const rightTime = getMessageTimestamp(rightRow.userMessage);
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return String(leftRow.rjCode || "").localeCompare(
      String(rightRow.rjCode || ""),
    );
  });
});

// 表格列配置
const columns = [
  {
    type: "selection",
    disabled: (row) => row.keepStatus === "keep",
    multiple: true,
  },
  {
    title: "RJ号",
    key: "rjCode",
    width: 120,
    render(row) {
      return h(
        "div",
        {
          style: {
            fontWeight: "bold",
            color: row.isDuplicate ? "#ef4444" : "#10b981",
          },
        },
        row.rjCode,
      );
    },
  },
  {
    title: "用户消息",
    key: "userMessage",
    width: 200,
    render(row) {
      return h("div", null, [
        h(
          "div",
          { style: { fontSize: "12px", color: "#666", fontWeight: "500" } },
          `发送者: ${getSenderNameText(row.userMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#666" } },
          `ID: ${getMessageIdText(row.userMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#999" } },
          `发送者ID: ${getSenderIdText(row.userMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#999" } },
          new Date(row.userMessage.date).toLocaleString(),
        ),
      ]);
    },
  },
  {
    title: "Bot回复",
    key: "botMessage",
    width: 200,
    render(row) {
      if (!row.botMessage) {
        return h("span", { style: { color: "#999" } }, "无");
      }
      return h("div", null, [
        h(
          "div",
          { style: { fontSize: "12px", color: "#666", fontWeight: "500" } },
          `发送者: ${getSenderNameText(row.botMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#666" } },
          `ID: ${getMessageIdText(row.botMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#999" } },
          `发送者ID: ${getSenderIdText(row.botMessage)}`,
        ),
        h(
          "div",
          { style: { fontSize: "12px", color: "#999" } },
          new Date(row.botMessage.date).toLocaleString(),
        ),
      ]);
    },
  },
  {
    title: "关联方式",
    key: "associationMethod",
    width: 120,
    render(row) {
      const methodMap = {
        reply_to: { text: "reply_to", color: "#3b82f6" },
        rj_match: { text: "RJ匹配", color: "#8b5cf6" },
        no_reply: { text: "无回复", color: "#9ca3af" },
      };
      const method = methodMap[row.associationMethod] || {
        text: row.associationMethod,
        color: "#666",
      };
      return h(
        "span",
        { style: { color: method.color, fontSize: "12px" } },
        method.text,
      );
    },
  },
  {
    title: "状态",
    key: "keepStatus",
    width: 100,
    render(row) {
      const statusMap = {
        keep: { text: "保留", color: "#10b981", bg: "#d1fae5" },
        delete: { text: "待删除", color: "#ef4444", bg: "#fee2e2" },
      };
      const status = statusMap[row.keepStatus];
      return h(
        "span",
        {
          style: {
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            color: status.color,
            background: status.bg,
          },
        },
        status.text,
      );
    },
  },
];

// 获取行样式类
function getRowClassName(row) {
  if (row.keepStatus === "keep") return "row-keep";
  if (row.keepStatus === "delete") return "row-delete";
  return "";
}

// 处理选择变化
function handleSelectionChange(keys) {
  selectedRowKeys.value = keys
    .map((key) => toMessageId(key))
    .filter((key) => key !== null);
}

// 清空选择
function clearSelection() {
  selectedRowKeys.value = [];
}

function getDeleteFailureText(result) {
  const firstError = Array.isArray(result?.errors) ? result.errors[0] : null;
  if (!firstError) {
    return result?.error || "未知错误";
  }

  const reason = firstError.error || firstError.message || "未知错误";
  const code =
    firstError.code !== undefined && firstError.code !== null
      ? ` (code=${firstError.code})`
      : "";

  return `${reason}${code}`;
}

function applyDeletedMessageIds(deletedMessageIds) {
  const deletedIds = new Set(
    (Array.isArray(deletedMessageIds) ? deletedMessageIds : [])
      .map((id) => toMessageId(id))
      .filter((id) => id !== null),
  );

  if (deletedIds.size === 0) {
    return;
  }

  scanResults.value = scanResults.value.filter((row) => {
    const userMessageId = getMessageId(row.userMessage);
    const botMessageId = getMessageId(row.botMessage);

    return (
      (userMessageId === null || !deletedIds.has(userMessageId)) &&
      (botMessageId === null || !deletedIds.has(botMessageId))
    );
  });

  selectedRowKeys.value = [];
  statistics.value.messagesToDelete = scanResults.value.filter(
    (row) => row.keepStatus === "delete",
  ).length;
}

function confirmDeleteAction(options) {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    dialog.warning({
      ...options,
      onPositiveClick: () => {
        settle(true);
        return true;
      },
      onNegativeClick: () => {
        settle(false);
        return true;
      },
      onClose: () => {
        settle(false);
      },
      onMaskClick: () => {
        settle(false);
      },
    });
  });
}

// 扫描操作
async function handleScan() {
  isScanning.value = true;
  hasScanned.value = true;
  scanProgress.value = 0;
  scanProgressText.value = "正在连接到Telegram...";
  scanStatus.value = "normal";
  selectedRowKeys.value = [];

  try {
    console.info("[RJ重复检测] tg-scan-rj-duplicates 请求", {
      limit: scanLimit.value,
    });

    const result = await window.api.tgScanRjDuplicates({
      limit: scanLimit.value,
    });

    console.info("[RJ重复检测] tg-scan-rj-duplicates 响应", {
      success: result?.success,
      duplicateCount: result?.duplicates?.length ?? 0,
      statistics: result?.statistics,
      sample: Array.isArray(result?.duplicates)
        ? result.duplicates.slice(0, 3).map((row) => ({
            rjCode: row.rjCode,
            userMessageId: getMessageId(row.userMessage),
            userSenderId: getSenderId(row.userMessage),
            userSenderName: getSenderName(row.userMessage),
            botMessageId: getMessageId(row.botMessage),
            botSenderId: getSenderId(row.botMessage),
            botSenderName: getSenderName(row.botMessage),
          }))
        : [],
    });

    if (result.success) {
      scanResults.value = Array.isArray(result.duplicates)
        ? result.duplicates
        : [];
      statistics.value = result.statistics;
      message.success(
        `扫描完成，找到 ${result.statistics.duplicateRJs} 个重复RJ号`,
      );
    } else {
      message.error(`扫描失败: ${result.error}`);
    }
  } catch (error) {
    message.error(`扫描失败: ${error.message}`);
  } finally {
    isScanning.value = false;
    scanProgress.value = 100;
    scanProgressText.value = "扫描完成";
    scanStatus.value = scanResults.value.length > 0 ? "warning" : "success";
  }
}

// 批量删除所有标记为删除的消息
async function handleBatchDelete() {
  const messageIds = collectMessageIds(duplicatesToDelete.value);

  if (messageIds.length === 0) {
    message.warning("没有需要删除的消息");
    return;
  }

  const confirmed = await confirmDeleteAction({
    title: "确认删除",
    content: `确定要删除 ${duplicatesToDelete.value.length} 个待删除配对中的所有消息吗？此操作不可恢复。`,
    positiveText: "删除",
    negativeText: "取消",
  });

  if (!confirmed) return;

  isDeleting.value = true;
  try {
    console.info("[RJ重复检测] tg-delete-duplicate-messages 请求", {
      scene: "batch",
      pairCount: duplicatesToDelete.value.length,
      messageIds,
    });

    const result = await window.api.tgDeleteDuplicateMessages(messageIds);

    console.info("[RJ重复检测] tg-delete-duplicate-messages 响应", {
      scene: "batch",
      success: result?.success,
      deletedCount: result?.deletedCount,
      errors: result?.errors,
    });

    const deletedCount = Number(result?.deletedCount || 0);
    if (deletedCount > 0) {
      statistics.value.deletedCount += deletedCount;
      applyDeletedMessageIds(result?.deletedMessageIds || []);
    }

    if (result?.success) {
      message.success(`成功删除 ${deletedCount} 条消息`);
    } else if (result?.partial) {
      message.warning(
        `部分删除成功：成功 ${deletedCount} 条，失败 ${result?.errors?.length || 0} 条。失败原因：${getDeleteFailureText(result)}`,
      );
    } else {
      message.error(`删除失败：${getDeleteFailureText(result)}`);
    }
  } catch (error) {
    message.error(`删除失败: ${error.message}`);
  } finally {
    isDeleting.value = false;
  }
}

// 删除选中的消息
async function handleSelectedDelete() {
  const selectedData = scanResults.value.filter((row) =>
    selectedRowKeySet.value.has(getMessageId(row.userMessage)),
  );

  const messageIds = collectMessageIds(selectedData);

  if (messageIds.length === 0) {
    message.warning("没有选中的消息");
    return;
  }

  const confirmed = await confirmDeleteAction({
    title: "确认删除",
    content: `确定要删除选中的 ${selectedData.length} 个配对中的所有消息吗？此操作不可恢复。`,
    positiveText: "删除",
    negativeText: "取消",
  });

  if (!confirmed) return;

  isDeleting.value = true;
  try {
    console.info("[RJ重复检测] tg-delete-duplicate-messages 请求", {
      scene: "selected",
      selectedPairs: selectedData.length,
      messageIds,
    });

    const result = await window.api.tgDeleteDuplicateMessages(messageIds);

    console.info("[RJ重复检测] tg-delete-duplicate-messages 响应", {
      scene: "selected",
      success: result?.success,
      deletedCount: result?.deletedCount,
      errors: result?.errors,
    });

    const deletedCount = Number(result?.deletedCount || 0);
    if (deletedCount > 0) {
      statistics.value.deletedCount += deletedCount;
      applyDeletedMessageIds(result?.deletedMessageIds || []);
    }

    if (result?.success) {
      message.success(`成功删除 ${deletedCount} 条消息`);
    } else if (result?.partial) {
      message.warning(
        `部分删除成功：成功 ${deletedCount} 条，失败 ${result?.errors?.length || 0} 条。失败原因：${getDeleteFailureText(result)}`,
      );
    } else {
      message.error(`删除失败：${getDeleteFailureText(result)}`);
    }
  } catch (error) {
    message.error(`删除失败: ${error.message}`);
  } finally {
    isDeleting.value = false;
  }
}

// 获取结果状态类
function getResultStatusClass() {
  if (statistics.value.duplicateRJs === 0) {
    return "status-tag online";
  } else {
    return "status-tag running";
  }
}

// 页面加载时
onMounted(() => {
  // 组件已挂载
});
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.config-section {
  margin-bottom: 24px;
}

.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.card-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-body {
  padding: 24px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #262626;
}

.setting-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 16px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.label {
  min-width: 120px;
  font-size: 14px;
  color: #525252;
}

.input-wrap {
  flex: 1;
}

.action-bar {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.btn-primary {
  padding: 10px 24px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.btn-danger {
  padding: 10px 24px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-danger:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.btn-warning {
  padding: 10px 24px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
}

.btn-warning:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 24px;
  background: #e5e7eb;
  color: #374151;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: #d1d5db;
}

.btn-secondary:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.progress-section {
  margin-bottom: 24px;
}

.progress-wrapper {
  margin: 16px 0;
}

.progress-text {
  margin-top: 8px;
  color: #666;
  font-size: 14px;
}

.results-section {
  margin-bottom: 24px;
}

.statistics-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 24px;
  padding: 0 24px 24px;
}

.stat-card {
  background: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #262626;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #64748b;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  display: block;
}

.rj-code {
  font-weight: bold;
}

.type-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

.status-tag.online {
  background: #d1fae5;
  color: #065f46;
}

.status-tag.running {
  background: #fef3c7;
  color: #92400e;
}

/* 行样式 */
:deep(.row-keep) {
  background-color: rgba(16, 185, 129, 0.05);
}

:deep(.row-delete) {
  background-color: rgba(239, 68, 68, 0.05);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-container {
    padding: 16px;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .label {
    min-width: auto;
  }

  .action-bar {
    flex-direction: column;
  }

  .action-bar button {
    width: 100%;
  }

  .statistics-section {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
