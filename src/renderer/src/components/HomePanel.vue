<template>
  <div class="page-container home-theme">
    <div class="page-header-simple dashboard-header">
      <div class="header-copy">
        <span class="page-eyebrow">System Overview</span>
        <h2 class="page-title">仪表盘</h2>
        <p class="page-header-subtitle">
          主系统的上传节奏、最近活动与日常维护入口。
        </p>
      </div>

      <div class="header-right">
        <div class="page-header-meta">
          <span class="header-chip">{{ recentHistory.length }} 条最近记录</span>
          <span class="header-chip accent">{{
            isLoading ? "正在扫描讨论组" : "主系统待机中"
          }}</span>
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
    </div>

    <div class="stats-grid">
      <div class="stat-card stat-card-emphasis">
        <div class="stat-icon blue">
          <n-icon :size="22">
            <Timer24Regular />
          </n-icon>
        </div>
        <div class="stat-content full-width">
          <div class="stat-kicker">同步节奏</div>
          <div class="stat-value">
            <span class="stat-number">
              {{ daysSinceUpdateDisplay.number }}
            </span>
            <span v-if="daysSinceUpdateDisplay.suffix" class="stat-suffix">
              {{ daysSinceUpdateDisplay.suffix }}
            </span>
          </div>
          <div class="stat-label">距上次更新</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">
          <n-icon :size="22">
            <ArrowUpload24Regular />
          </n-icon>
        </div>
        <div class="stat-content">
          <div class="stat-kicker">工作量</div>
          <div class="stat-value">
            <span class="stat-number">
              {{ totalUploadsDisplay.number }}
            </span>
            <span v-if="totalUploadsDisplay.suffix" class="stat-suffix">
              {{ totalUploadsDisplay.suffix }}
            </span>
          </div>
          <div class="stat-label">最近上传</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon purple">
          <n-icon :size="22">
            <ArrowTrending24Regular />
          </n-icon>
        </div>
        <div class="stat-content">
          <div class="stat-kicker">今日动态</div>
          <div class="stat-value">
            <span class="stat-number">
              {{ todayUploadsDisplay.number }}
            </span>
            <span v-if="todayUploadsDisplay.suffix" class="stat-suffix">
              {{ todayUploadsDisplay.suffix }}
            </span>
          </div>
          <div class="stat-label">今日上传</div>
        </div>
      </div>
    </div>

    <div class="card history-card">
      <div class="card-header history-card-header">
        <div class="section-head-copy">
          <h3 class="section-title">
            <n-icon class="section-title-icon" :size="18">
              <CalendarLtr24Regular />
            </n-icon>
            <span>最近发布记录</span>
          </h3>
          <p class="card-caption">用于快速回顾近期处理的条目与发布时间。</p>
        </div>

        <div class="card-toolbar">
          <span class="summary-chip">{{ recentHistory.length }} 条记录</span>
        </div>
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
          <span class="empty-icon">
            <n-icon :size="36">
              <MailInbox24Regular />
            </n-icon>
          </span>
          <p>暂无记录</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NIcon, useMessage, useDialog } from "naive-ui";
import {
  ArrowTrending24Regular,
  ArrowUpload24Regular,
  CalendarLtr24Regular,
  MailInbox24Regular,
  Timer24Regular,
} from "@vicons/fluent";
import { useHomePanelWorkflow } from "../composables/useHomePanelWorkflow";

const message = useMessage();
const dialog = useDialog();

const {
  daysSinceUpdate,
  isLoading,
  recentHistory,
  totalUploads,
  todayUploads,
  handleManualScan,
  handleClearCache,
} = useHomePanelWorkflow({ message, dialog });

const normalizeStatValue = (value) => {
  const text = String(value ?? "").trim();
  const matched = text.match(/^([0-9][0-9,]*)(.*)$/u);
  if (!matched) {
    return {
      number: text || "-",
      suffix: "",
    };
  }

  return {
    number: matched[1],
    suffix: matched[2].trim(),
  };
};

const daysSinceUpdateDisplay = computed(() =>
  normalizeStatValue(daysSinceUpdate.value),
);
const totalUploadsDisplay = computed(() =>
  normalizeStatValue(totalUploads.value),
);
const todayUploadsDisplay = computed(() =>
  normalizeStatValue(todayUploads.value),
);
</script>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  min-width: 0;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  padding: 18px 22px;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 30px;
  font-weight: 650;
  letter-spacing: -0.03em;
  color: var(--text-strong, #26251f);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-primary,
.btn-secondary {
  min-height: 40px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.btn-primary {
  border: none;
  background: var(--accent, #adb571);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent, #adb571), #000000 16%);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  background: color-mix(in srgb, var(--divider, #d4d4d4) 78%, #ffffff 22%);
  cursor: not-allowed;
}

.btn-secondary {
  border: 1px solid var(--page-control-border, #d4d4d4);
  background: var(--page-control-bg, #fff);
  color: var(--text-muted, #66614f);
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--accent, #adb571);
  color: var(--accent, #adb571);
  background: var(--page-control-hover, #f2ede0);
  transform: translateY(-1px);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.stat-card {
  min-height: 132px;
  border-radius: 16px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--page-surface-border, #d9dee8);
  background: var(--comp-surface-1, var(--page-panel-bg, #fff));
  box-shadow: var(--page-shadow-subtle, none);
}

.stat-card-emphasis {
  background: linear-gradient(
    135deg,
    color-mix(
        in srgb,
        var(--accent, #adb571) 10%,
        var(--comp-surface-1, #fff) 90%
      )
      0%,
    var(--comp-surface-1, #fff) 100%
  );
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.stat-icon.blue {
  background: color-mix(in srgb, var(--accent, #adb571) 24%, transparent);
  color: #f0f4cf;
  border-color: color-mix(in srgb, var(--accent, #adb571) 36%, transparent);
}

.stat-icon.green {
  background: color-mix(in srgb, #969f5f 20%, transparent);
  color: #dde4b5;
  border-color: color-mix(in srgb, #969f5f 32%, transparent);
}

.stat-icon.purple {
  background: color-mix(in srgb, #b8c17b 18%, transparent);
  color: #f6f7de;
  border-color: color-mix(in srgb, #b8c17b 30%, transparent);
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.stat-content.full-width {
  width: 100%;
}

.stat-kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-text-muted, #7d8898);
}

.stat-value {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.stat-number {
  font-size: clamp(36px, 2.9vw, 50px);
  font-weight: 700;
  color: var(--text-strong, #29281f);
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat-suffix {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted, #686550);
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted, #7d7862);
  font-weight: 500;
}

.history-card {
  padding: 18px;
}

.history-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.card-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong, #26251f);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-title-icon {
  color: var(--text-muted, #6e6b58);
}

.history-list {
  max-height: 520px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 54px;
  padding: 12px 0;
  border-bottom: 1px solid var(--page-divider, #f2ede0);
}

.history-item:last-child {
  border-bottom: none;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.code-badge {
  background: color-mix(in srgb, var(--accent, #adb571) 16%, transparent);
  color: var(--accent, #adb571);
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  border: 1px solid color-mix(in srgb, var(--accent, #adb571) 24%, transparent);
}

.file-name {
  color: var(--text-muted, #66614f);
  font-size: 14px;
  max-width: 460px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  color: var(--page-text-muted, #a3a3a3);
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 42px 20px;
  color: var(--page-text-muted, #a3a3a3);
}

.empty-icon {
  color: var(--page-text-muted, #94a3b8);
  margin-bottom: 10px;
  display: block;
}

@media (max-width: 1024px) {
  .dashboard-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-right {
    align-items: stretch;
  }

  .page-header-meta {
    justify-content: flex-start;
  }
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .history-card-header {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .header-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions .btn-primary,
  .header-actions .btn-secondary {
    width: 100%;
  }

  .page-title {
    font-size: 26px;
  }

  .history-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-name {
    max-width: 100%;
  }
}
</style>
