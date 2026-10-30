<template>
  <div class="automation-page">
    <header class="automation-hero">
      <div>
        <p class="eyebrow">AUTOMATION CONTROL ROOM</p>
        <h1>自动翻译队列</h1>
        <p class="hero-copy">
          从 ASMR.ONE 发现作品，在低峰时间完成下载、翻译、打包和 Telegram 发布。
        </p>
      </div>
      <div class="hero-actions">
        <span class="status-pill" :class="statusTone">
          <i class="status-dot" />
          {{ statusLabel }}
        </span>
        <button class="primary-button" :disabled="running" @click="runNow">
          {{ running ? "执行中..." : "立即运行一轮" }}
        </button>
      </div>
    </header>

    <section class="stage-card">
      <div class="stage-card-header">
        <div>
          <p class="section-kicker">LIVE PIPELINE</p>
          <h2>{{ runtimeStatus.message }}</h2>
        </div>
        <span v-if="runtimeStatus.currentCode" class="code-badge">
          {{ runtimeStatus.currentCode }}
        </span>
      </div>

      <div class="pipeline">
        <div
          v-for="stage in stages"
          :key="stage.key"
          class="stage"
          :class="stageClass(stage.key)"
        >
          <span class="stage-index">{{ stage.number }}</span>
          <span class="stage-name">{{ stage.label }}</span>
        </div>
      </div>

      <div class="stage-detail">
        <span>当前步骤</span>
        <strong>{{ stageLabel(runtimeStatus.step) }}</strong>
        <span v-if="progressText">{{ progressText }}</span>
        <span v-if="runtimeStatus.updatedAt">
          {{ formatTime(runtimeStatus.updatedAt) }} 更新
        </span>
        <span v-if="runtimeStatus.nextProbeAt">
          下次探测 {{ formatTime(runtimeStatus.nextProbeAt) }}
        </span>
      </div>

      <section
        v-if="hasTranslationProgress"
        class="translation-progress"
        aria-label="本轮翻译清单"
      >
        <div class="translation-progress-heading">
          <div>
            <p class="section-kicker">TRANSLATION QUEUE</p>
            <h3>本轮翻译清单</h3>
          </div>
          <span class="translation-total"> {{ translationTotal }} 个作品 </span>
        </div>
        <div class="translation-columns">
          <div class="translation-column queued">
            <div class="translation-column-title">
              <span>待下载</span>
              <strong>{{
                translationProgress.queuedDownloadCodes.length
              }}</strong>
            </div>
            <div
              v-if="translationProgress.queuedDownloadCodes.length"
              class="code-list"
            >
              <span
                v-for="code in translationProgress.queuedDownloadCodes"
                :key="code"
                class="queue-code"
              >
                {{ code }}
              </span>
            </div>
            <p v-else class="empty-list">没有待下载作品</p>
          </div>
          <div class="translation-column pending">
            <div class="translation-column-title">
              <span>下载中</span>
              <strong>{{ translationProgress.downloadingCodes.length }}</strong>
            </div>
            <div
              v-if="translationProgress.downloadingCodes.length"
              class="code-list"
            >
              <span
                v-for="code in translationProgress.downloadingCodes"
                :key="code"
                class="queue-code"
              >
                {{ code }}
              </span>
            </div>
            <p v-else class="empty-list">没有下载中作品</p>
          </div>
          <div class="translation-column ready">
            <div class="translation-column-title">
              <span>准备翻译</span>
              <strong>{{
                translationProgress.readyTranslateCodes.length
              }}</strong>
            </div>
            <div
              v-if="translationProgress.readyTranslateCodes.length"
              class="code-list"
            >
              <span
                v-for="code in translationProgress.readyTranslateCodes"
                :key="code"
                class="queue-code"
                :class="{ current: code === translationProgress.currentCode }"
              >
                {{ code }}
              </span>
            </div>
            <p v-else class="empty-list">没有等待翻译的作品</p>
          </div>
          <div class="translation-column completed">
            <div class="translation-column-title">
              <span>已完成</span>
              <strong>{{ translationProgress.completedCodes.length }}</strong>
            </div>
            <div
              v-if="translationProgress.completedCodes.length"
              class="code-list"
            >
              <span
                v-for="code in translationProgress.completedCodes"
                :key="code"
                class="queue-code"
              >
                {{ code }}
              </span>
            </div>
            <p v-else class="empty-list">尚未完成作品</p>
          </div>
          <div
            v-if="translationProgress.failedCodes.length"
            class="translation-column failed"
          >
            <div class="translation-column-title">
              <span>失败保留</span>
              <strong>{{ translationProgress.failedCodes.length }}</strong>
            </div>
            <div class="code-list">
              <span
                v-for="item in translationProgress.failedItems"
                :key="item.code"
                class="queue-code"
                :title="item.reason"
              >
                {{ item.code }}
                <small v-if="item.reason">{{ item.reason }}</small>
              </span>
            </div>
          </div>
        </div>
      </section>
    </section>

    <div class="automation-grid">
      <section class="panel settings-panel">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">SCHEDULE</p>
            <h2>运行策略</h2>
          </div>
          <label class="switch">
            <input
              v-model="config.enabled"
              type="checkbox"
              @change="saveSettings"
            />
            <span />
          </label>
        </div>

        <div class="setting-list">
          <label class="setting-row">
            <span>低峰时间</span>
            <span class="time-inputs">
              <input
                v-model.number="config.startHour"
                type="number"
                min="0"
                max="23"
              />
              <b>—</b>
              <input
                v-model.number="config.endHour"
                type="number"
                min="0"
                max="23"
              />
              <em>时</em>
            </span>
          </label>
          <label class="setting-row">
            <span>扫描间隔（分钟）</span>
            <input
              class="number-input"
              type="number"
              min="1"
              max="1440"
              :value="scanIntervalMinutes"
              @input="
                config.scanIntervalMs =
                  Math.max(1, Number($event.target.value || 1)) * 60000
              "
            />
          </label>
          <label class="setting-row">
            <span>单轮处理上限</span>
            <input
              v-model.number="config.maxWorksPerCycle"
              class="number-input"
              type="number"
              min="1"
              max="20"
            />
          </label>
          <label class="setting-row">
            <span>单作品最大下载轨道数</span>
            <input
              v-model.number="config.maxDownloadTasksPerWork"
              class="number-input"
              type="number"
              min="1"
              max="1000"
            />
          </label>
          <label class="setting-row">
            <span>aria2 失败最大重启次数</span>
            <input
              v-model.number="config.aria2RestartMaxAttempts"
              class="number-input"
              type="number"
              min="0"
              max="10"
            />
          </label>
          <label class="setting-row">
            <span>aria2 重试间隔（分钟）</span>
            <input
              class="number-input"
              type="number"
              min="1"
              max="1440"
              :value="aria2RestartCooldownMinutes"
              @input="
                config.aria2RestartCooldownMs =
                  Math.max(1, Number($event.target.value || 1)) * 60000
              "
            />
          </label>
          <label class="setting-row">
            <span>下载多数轨道后重试阈值</span>
            <input
              v-model.number="config.aria2EarlyRetryPercent"
              class="number-input"
              type="number"
              min="50"
              max="99"
            />
          </label>
          <label class="setting-row">
            <span>启动时自动运行</span>
            <input
              v-model="config.runOnStartup"
              type="checkbox"
              @change="saveSettings"
            />
          </label>
          <label class="setting-row">
            <span>上传后清理本地文件</span>
            <input
              v-model="config.cleanupLocalAfterUpload"
              type="checkbox"
              @change="saveSettings"
            />
          </label>
          <label class="tag-setting">
            <span>屏蔽 Tag</span>
            <textarea
              v-model="excludeTagsText"
              rows="5"
              placeholder="每行一个 Tag，例如：百合"
            />
            <small>命中任一屏蔽 Tag 的作品不会加入待翻译队列。</small>
          </label>
        </div>
        <button
          class="secondary-button"
          :disabled="savingSettings"
          @click="saveSettings"
        >
          {{ savingSettings ? "正在保存..." : "保存运行策略" }}
        </button>
        <p
          v-if="saveFeedback.message"
          class="save-feedback"
          :class="saveFeedback.tone"
        >
          {{ saveFeedback.message }}
        </p>
      </section>

      <section class="panel summary-panel">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">LAST RUN</p>
            <h2>最近一轮</h2>
          </div>
          <span class="run-time">{{ lastRunTime }}</span>
        </div>
        <div class="metrics">
          <div>
            <strong>{{ lastRun.discovered || 0 }}</strong
            ><span>候选</span>
          </div>
          <div>
            <strong>{{ lastRun.queued || 0 }}</strong
            ><span>入队</span>
          </div>
          <div>
            <strong>{{ lastRun.processed || 0 }}</strong
            ><span>完成</span>
          </div>
          <div>
            <strong>{{ lastRun.skippedTranslated || 0 }}</strong
            ><span>已汉化跳过</span>
          </div>
          <div class="metric-danger">
            <strong>{{ lastRun.failed || 0 }}</strong
            ><span>失败</span>
          </div>
        </div>
        <p class="summary-note">
          队列检测：入队前 {{ lastRun.queueBefore || 0 }} 条，预清理后
          {{ lastRun.queueAfterCleanup || 0 }} 条，回读确认
          {{ lastRun.queueReady || 0 }} 条。
        </p>
      </section>
    </div>

    <section class="panel log-panel">
      <div class="panel-heading">
        <div>
          <p class="section-kicker">EVENT STREAM</p>
          <h2>运行日志</h2>
        </div>
        <button class="text-button" @click="logs = []">清空</button>
      </div>
      <div class="log-list">
        <div v-if="!logs.length" class="empty-log">等待自动任务事件...</div>
        <div
          v-for="(log, index) in logs"
          :key="`${log.time}-${index}`"
          class="log-line"
        >
          <time>{{ log.time }}</time>
          <span>{{ log.message }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const stages = [
  { key: "scan", label: "发现", number: "01" },
  { key: "enqueue", label: "入队", number: "02" },
  { key: "download", label: "下载", number: "03" },
  { key: "translate", label: "翻译", number: "04" },
  { key: "package", label: "打包", number: "05" },
  { key: "upload", label: "上传", number: "06" },
  { key: "cleanup", label: "清理", number: "07" },
];

const defaultConfig = {
  enabled: false,
  runOnStartup: true,
  scanIntervalMs: 30 * 60 * 1000,
  maxWorksPerCycle: 3,
  maxDownloadTasksPerWork: 200,
  aria2RestartMaxAttempts: 3,
  aria2RestartCooldownMs: 5 * 60 * 1000,
  aria2EarlyRetryPercent: 80,
  startHour: 1,
  endHour: 7,
  cleanupLocalAfterUpload: true,
};

const config = ref({ ...defaultConfig });
const excludeTagsText = ref("");
const savingSettings = ref(false);
const saveFeedback = ref({ message: "", tone: "" });
const running = ref(false);
const lastRun = ref({});
const runtimeStatus = ref({
  step: "idle",
  currentCode: "",
  message: "等待自动任务启动",
  updatedAt: "",
  nextProbeAt: "",
  translationProgress: null,
});
const logs = ref([]);
let unsubscribe = null;

const scanIntervalMinutes = computed(() =>
  Math.max(
    1,
    Math.round(Number(config.value.scanIntervalMs || 1800000) / 60000),
  ),
);
const aria2RestartCooldownMinutes = computed(() =>
  Math.max(
    1,
    Math.round(Number(config.value.aria2RestartCooldownMs || 300000) / 60000),
  ),
);

const stageLabel = (step) =>
  ({
    idle: "待机",
    scan: "扫描最近作品",
    enqueue: "加入待翻译队列",
    queue: "读取待翻译队列",
    download: "下载音声",
    translate: "Whisper 翻译",
    package: "打包字幕",
    upload: "上传 Telegram",
    cleanup: "清理云端队列",
    completed: "本轮完成",
    "waiting-window": "等待低峰时段",
    disabled: "未启用",
    error: "异常",
  })[step] || step;

const statusLabel = computed(() => stageLabel(runtimeStatus.value.step));
const statusTone = computed(() => {
  if (runtimeStatus.value.step === "error") return "danger";
  if (running.value) return "active";
  if (runtimeStatus.value.step === "completed") return "success";
  return "idle";
});
const lastRunTime = computed(() =>
  lastRun.value.at ? formatTime(lastRun.value.at) : "暂无记录",
);
const translationProgress = computed(() => {
  const progress = runtimeStatus.value.translationProgress || {};
  return {
    queuedDownloadCodes: Array.isArray(progress.queuedDownloadCodes)
      ? progress.queuedDownloadCodes
      : [],
    downloadingCodes: Array.isArray(progress.downloadingCodes)
      ? progress.downloadingCodes
      : [],
    readyTranslateCodes: Array.isArray(progress.readyTranslateCodes)
      ? progress.readyTranslateCodes
      : [],
    completedCodes: Array.isArray(progress.completedCodes)
      ? progress.completedCodes
      : [],
    failedCodes: Array.isArray(progress.failedCodes)
      ? progress.failedCodes
      : [],
    failedItems: Array.isArray(progress.failedItems)
      ? progress.failedItems
      : Array.isArray(progress.failedCodes)
        ? progress.failedCodes.map((code) => ({ code, reason: "" }))
        : [],
    currentCode: String(progress.currentCode || ""),
  };
});
const translationTotal = computed(
  () =>
    translationProgress.value.queuedDownloadCodes.length +
    translationProgress.value.downloadingCodes.length +
    translationProgress.value.readyTranslateCodes.length +
    translationProgress.value.completedCodes.length +
    translationProgress.value.failedCodes.length,
);
const hasTranslationProgress = computed(() => translationTotal.value > 0);
const progressText = computed(() => {
  const progress = runtimeStatus.value.progress;
  if (!progress) return "";
  if (Number.isFinite(progress.mediaFileCount)) {
    const aria2Text = Number.isFinite(progress.aria2TempFileCount)
      ? ` · aria2 临时 ${progress.aria2TempFileCount}`
      : "";
    return `${progress.mediaFileCount} 个媒体文件 · ${formatBytes(progress.totalBytes || 0)}${aria2Text} · 稳定 ${progress.stablePolls}/${progress.stablePollsRequired}`;
  }
  if (Number.isFinite(progress.subtitleFileCount)) {
    return `${progress.subtitleFileCount} 个字幕 · ${formatBytes(progress.totalBytes || 0)} · ${Math.floor((progress.idleMs || 0) / 1000)} 秒无活动`;
  }
  return "";
});

const formatTime = (value) => {
  try {
    return new Date(value).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const stageClass = (key) => {
  const normalizedStep =
    runtimeStatus.value.step === "queue" ? "enqueue" : runtimeStatus.value.step;
  const currentIndex = stages.findIndex(
    (stage) => stage.key === normalizedStep,
  );
  const stageIndex = stages.findIndex((stage) => stage.key === key);
  if (runtimeStatus.value.step === "completed") return "done";
  if (runtimeStatus.value.step === "error")
    return stageIndex <= currentIndex ? "error" : "";
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "current";
  return "";
};

const applyStatus = (payload = {}) => {
  const data = payload.data || payload;
  if (data.config) {
    config.value = { ...config.value, ...data.config };
    excludeTagsText.value = Array.isArray(config.value.excludeTags)
      ? config.value.excludeTags.join("\n")
      : "";
  }
  if (data.lastRun) lastRun.value = data.lastRun;
  if (data.running !== undefined) running.value = data.running;
  if (data.runtimeStatus) runtimeStatus.value = data.runtimeStatus;
  if (data.status) runtimeStatus.value = data.status;
  if (data.message) {
    logs.value = [
      { message: data.message, time: formatTime(new Date()) },
      ...logs.value,
    ].slice(0, 100);
  }
};

const loadStatus = async () => {
  const result = await window.api.translationAutomation.status();
  if (result?.success) applyStatus(result.data);
};

const saveSettings = async () => {
  if (savingSettings.value) return;
  savingSettings.value = true;
  saveFeedback.value = { message: "正在保存运行策略...", tone: "" };
  try {
    const excludeTags = excludeTagsText.value
      .split(/\r?\n/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    config.value.excludeTags = excludeTags;
    const payload = JSON.parse(
      JSON.stringify({
        ...config.value,
        includeTags: Array.from(config.value.includeTags || []),
        excludeTags,
      }),
    );
    const result = await window.api.translationAutomation.saveConfig(payload);
    if (!result?.success) {
      throw new Error(result?.error || "主进程未能写入配置文件");
    }
    applyStatus(result.data || {});
    await loadStatus();
    saveFeedback.value = {
      message: `运行策略已保存（${formatTime(new Date())}）`,
      tone: "success",
    };
  } catch (error) {
    const message = error?.message || String(error);
    saveFeedback.value = {
      message: `保存失败：${message}`,
      tone: "error",
    };
    logs.value = [
      { message: `运行策略保存失败：${message}`, time: formatTime(new Date()) },
      ...logs.value,
    ].slice(0, 100);
  } finally {
    savingSettings.value = false;
  }
};

const runNow = async () => {
  running.value = true;
  try {
    const result = await window.api.translationAutomation.run();
    applyStatus(result);
  } catch (error) {
    runtimeStatus.value = {
      ...runtimeStatus.value,
      step: "error",
      message: error.message,
    };
  } finally {
    await loadStatus();
  }
};

onMounted(async () => {
  await loadStatus();
  unsubscribe = window.api.translationAutomation.onEvent((payload) => {
    applyStatus(payload);
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>

<style scoped>
.automation-page {
  --ink: #25261f;
  --muted: #73766b;
  --line: #dedfd4;
  --paper: #f7f8f2;
  --accent: #a4ad69;
  --accent-deep: #697348;
  min-height: 100%;
  padding: clamp(1rem, 3vw, 2.5rem);
  color: var(--ink);
  background:
    radial-gradient(circle at 80% 0%, #e6edd1 0, transparent 34rem),
    var(--paper);
  box-sizing: border-box;
}

.automation-hero,
.stage-card-header,
.panel-heading,
.setting-row,
.hero-actions,
.stage-detail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.automation-hero {
  align-items: flex-end;
  margin-bottom: 1.5rem;
}

.eyebrow,
.section-kicker {
  margin: 0 0 0.45rem;
  color: var(--accent-deep);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.65rem;
  font-size: clamp(1.8rem, 4vw, 3.2rem);
  letter-spacing: -0.06em;
}

h2 {
  margin-bottom: 0;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
}

.hero-copy,
.summary-note {
  max-width: 38rem;
  margin-bottom: 0;
  color: var(--muted);
  line-height: 1.65;
}

.status-pill,
.code-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  padding: 0.45rem 0.75rem;
  background: #eceee3;
  color: var(--accent-deep);
  font-size: 0.78rem;
  font-weight: 700;
}

.status-pill.active {
  background: #e7f1d7;
  color: #587035;
}
.status-pill.success {
  background: #dcefe3;
  color: #39704e;
}
.status-pill.danger {
  background: #f8dfd9;
  color: #a3483b;
}
.status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: currentColor;
}
.active .status-dot {
  animation: pulse 1.4s infinite;
}

.primary-button,
.secondary-button,
.text-button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.primary-button,
.secondary-button {
  border-radius: 0.65rem;
  padding: 0.7rem 1rem;
  font-weight: 700;
}

.primary-button {
  background: var(--accent-deep);
  color: #fff;
  box-shadow: 0 0.6rem 1.5rem #69734826;
}
.primary-button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.secondary-button {
  width: 100%;
  margin-top: 1.2rem;
  background: #eef0e6;
  color: var(--accent-deep);
}
.secondary-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.save-feedback {
  margin: 0.65rem 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.45;
}
.save-feedback.success {
  color: #39704e;
}
.save-feedback.error {
  color: #a3483b;
}
.text-button {
  background: transparent;
  color: var(--accent-deep);
  font-size: 0.8rem;
}

.stage-card,
.panel {
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: #fffffff2;
  box-shadow: 0 1.5rem 3rem #69734812;
}

.stage-card {
  padding: clamp(1rem, 3vw, 1.5rem);
  margin-bottom: 1rem;
}
.stage-card-header {
  align-items: flex-start;
}
.code-badge {
  font-family: "IBM Plex Mono", "Cascadia Mono", monospace;
}
.pipeline {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.4rem;
  margin: 2rem 0 1rem;
}
.stage {
  position: relative;
  display: grid;
  gap: 0.5rem;
  color: #a0a49a;
  font-size: 0.72rem;
}
.stage::after {
  content: "";
  position: absolute;
  top: 0.85rem;
  left: 2rem;
  right: -0.4rem;
  height: 1px;
  background: var(--line);
}
.stage:last-child::after {
  display: none;
}
.stage-index {
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  font-size: 0.62rem;
  font-weight: 800;
}
.stage.current {
  color: var(--accent-deep);
}
.stage.current .stage-index {
  border-color: var(--accent-deep);
  background: var(--accent-deep);
  color: #fff;
}
.stage.done {
  color: #63815a;
}
.stage.done .stage-index {
  border-color: #8db28d;
  background: #e2f0df;
  color: #4a7548;
}
.stage.error .stage-index {
  border-color: #bd6559;
  color: #a3483b;
}
.stage-detail {
  justify-content: flex-start;
  color: var(--muted);
  font-size: 0.78rem;
}
.stage-detail strong {
  color: var(--ink);
}
.translation-progress {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}
.translation-progress-heading,
.translation-column-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.translation-progress-heading h3 {
  margin: 0.2rem 0 0;
  color: var(--ink);
  font-size: 1rem;
}
.translation-total {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.75rem;
}
.translation-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.7rem;
  margin-top: 0.8rem;
}
.translation-column {
  min-width: 0;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: #fbfcf8;
}
.translation-column.pending {
  border-color: #c9d9e9;
  background: #f5f9fd;
}
.translation-column.queued {
  border-color: #e6dfc1;
  background: #fffdf5;
}
.translation-column.ready {
  border-color: #d5e2d0;
}
.translation-column.completed {
  border-color: #c6ddc1;
  background: #f5faf2;
}
.translation-column.failed {
  border-color: #e7c0ba;
  background: #fff8f6;
}
.translation-column-title {
  color: var(--muted);
  font-size: 0.75rem;
}
.translation-column-title strong {
  display: inline-grid;
  min-width: 1.5rem;
  min-height: 1.5rem;
  place-items: center;
  border-radius: 99px;
  color: var(--ink);
  background: #e9eee5;
  font-size: 0.72rem;
}
.completed .translation-column-title strong {
  color: #477044;
  background: #dcecd8;
}
.ready .translation-column-title strong {
  color: #5a7543;
  background: #e4efdc;
}
.failed .translation-column-title strong {
  color: #a3483b;
  background: #f5deda;
}
.code-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
  max-height: 8rem;
  overflow: auto;
}
.queue-code {
  overflow: hidden;
  max-width: 100%;
  padding: 0.3rem 0.45rem;
  border-radius: 0.35rem;
  color: #4e6551;
  background: #edf3e9;
  font-family: "IBM Plex Mono", "Cascadia Mono", monospace;
  font-size: 0.68rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-code.current {
  color: #fff;
  background: var(--accent-deep);
  box-shadow: 0 0 0 2px rgba(87, 131, 73, 0.16);
}
.failed .queue-code {
  color: #9b493e;
  background: #fae9e5;
}
.failed .queue-code {
  align-items: flex-start;
  flex-direction: column;
  white-space: normal;
}
.failed .queue-code small {
  color: inherit;
  font-size: 0.68rem;
  line-height: 1.35;
  opacity: 0.78;
  overflow-wrap: anywhere;
}
.empty-list {
  margin: 0.65rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}
@media (min-width: 768px) {
  .translation-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .translation-column.failed {
    grid-column: span 2;
  }
}
@media (min-width: 1024px) {
  .translation-columns {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .translation-column.failed {
    grid-column: auto;
  }
}

.automation-grid {
  display: grid;
  grid-template-columns: minmax(18rem, 0.9fr) minmax(20rem, 1.1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}
.panel {
  padding: 1.2rem;
}
.panel-heading {
  align-items: flex-start;
}
.run-time {
  color: var(--muted);
  font-size: 0.75rem;
}
.setting-list {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.4rem;
}
.setting-row {
  color: var(--muted);
  font-size: 0.82rem;
}
.tag-setting {
  display: grid;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.82rem;
}
.tag-setting textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  padding: 0.6rem;
  color: var(--ink);
  background: #fff;
  font: inherit;
  line-height: 1.45;
  resize: vertical;
}
.tag-setting small {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
.setting-row input[type="number"] {
  width: 4.3rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  padding: 0.4rem;
  color: var(--ink);
  background: #fff;
  text-align: center;
}
.time-inputs {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.time-inputs em {
  font-style: normal;
}
.number-input {
  margin-left: auto;
}
.switch {
  position: relative;
  display: inline-flex;
}
.switch input {
  position: absolute;
  opacity: 0;
}
.switch span {
  width: 2.5rem;
  height: 1.35rem;
  border-radius: 99px;
  background: #d8dbd0;
  cursor: pointer;
}
.switch span::after {
  content: "";
  display: block;
  width: 1rem;
  height: 1rem;
  margin: 0.175rem;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.switch input:checked + span {
  background: var(--accent-deep);
}
.switch input:checked + span::after {
  transform: translateX(1.15rem);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.6rem;
  margin: 1.5rem 0;
}
.metrics div {
  padding: 0.8rem;
  border-radius: 0.7rem;
  background: #f1f3eb;
}
.metrics strong,
.metrics span {
  display: block;
}
.metrics strong {
  font-size: 1.4rem;
  letter-spacing: -0.05em;
}
.metrics span {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.7rem;
}
.metric-danger strong {
  color: #a3483b;
}
.log-panel {
  padding-bottom: 0.6rem;
}
.log-list {
  max-height: 15rem;
  overflow: auto;
  margin-top: 1rem;
  padding-right: 0.4rem;
}
.log-line {
  display: grid;
  grid-template-columns: 5.2rem 1fr;
  gap: 0.7rem;
  padding: 0.55rem 0;
  border-top: 1px solid #eef0e9;
  font-size: 0.78rem;
  line-height: 1.4;
}
.log-line time {
  color: var(--muted);
  font-family: "IBM Plex Mono", "Cascadia Mono", monospace;
}
.empty-log {
  padding: 1.5rem 0;
  color: var(--muted);
  font-size: 0.8rem;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
@media (max-width: 760px) {
  .automation-hero {
    align-items: flex-start;
    flex-direction: column;
  }
  .hero-actions {
    width: 100%;
    justify-content: space-between;
  }
  .pipeline {
    overflow-x: auto;
    grid-template-columns: repeat(7, 5rem);
    padding-bottom: 0.5rem;
  }
  .automation-grid {
    grid-template-columns: 1fr;
  }
  .metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
