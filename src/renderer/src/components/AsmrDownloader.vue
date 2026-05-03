<template>
  <div class="page-container asmr-downloader-page">
    <header class="page-header card">
      <div class="header-copy">
        <p class="eyebrow">任务处理 / 音声下载</p>
        <h2 class="page-title">ASMR 音声下载任务</h2>
        <p class="page-desc">
          将批量 RJ/VJ/BJ 编号解析为音频下载任务，自动应用 Python
          脚本里的过滤、去重与路径保护逻辑。
        </p>
      </div>
      <div class="header-meta">
        <span class="meta-badge">支持 RJ / VJ / BJ</span>
        <span class="meta-badge">Aria2 RPC</span>
        <span class="meta-badge">人工复核清单</span>
      </div>
    </header>

    <section class="layout-grid">
      <article class="card panel form-panel">
        <div class="panel-head">
          <h3 class="panel-title">任务输入</h3>
          <p class="panel-hint">每行一个编号，也支持粘贴带编号的整段文本。</p>
        </div>

        <div class="action-row">
          <button class="btn-secondary import-btn" @click="importFromTxt">
            从 TXT 导入
          </button>
          <span v-if="importText" class="import-text">{{ importText }}</span>
        </div>

        <div class="stats-row">
          <span class="stats-badge">总行数 {{ inputStats.lineCount }}</span>
          <span class="stats-badge">识别到 {{ inputStats.recognizedCount }}</span>
          <span class="stats-badge">去重后 {{ inputStats.uniqueCount }}</span>
          <span v-if="inputStats.invalidLineCount > 0" class="stats-badge stats-badge-warn">
            无效 {{ inputStats.invalidLineCount }}
          </span>
        </div>

        <div class="field-group">
          <label class="field-label" for="asmr-downloader-input">编号列表</label>
          <textarea
            id="asmr-downloader-input"
            v-model="inputText"
            class="textarea"
            placeholder="RJ123456&#10;VJ7654321&#10;BJ223344"
          />
        </div>

        <div class="field-group">
          <label class="field-label">下载目录</label>
          <div class="input-wrap">
            <input
              v-model="downloadDir"
              class="input"
              readonly
              placeholder="选择下载目录"
            />
            <button class="btn-secondary" @click="selectDownloadDir">选择</button>
          </div>
        </div>

        <div class="settings-grid">
          <div class="field-group field-span-full checkbox-stack">
            <label class="checkbox-label">
              <input v-model="useAria2" type="checkbox" class="checkbox" />
              <span>推送到 Aria2 RPC（关闭时仅生成清单）</span>
            </label>
            <label class="checkbox-label">
              <input v-model="testMode" type="checkbox" class="checkbox" />
              <span>测试模式（仅生成清单，不推送）</span>
            </label>
          </div>

          <div class="field-group">
            <label class="field-label" for="asmr-rpc-url">Aria2 RPC 地址</label>
            <input
              id="asmr-rpc-url"
              v-model="rpcUrl"
              class="input"
              placeholder="http://localhost:6800/jsonrpc"
            />
          </div>

          <div class="field-group">
            <label class="field-label" for="asmr-rpc-secret">RPC Secret</label>
            <input
              id="asmr-rpc-secret"
              v-model="rpcSecret"
              class="input"
              type="password"
              placeholder="可留空"
            />
          </div>

          <div class="field-group">
            <label class="field-label" for="asmr-max-auto-tasks">单作品自动处理上限</label>
            <input
              id="asmr-max-auto-tasks"
              v-model.number="maxAutoTasksPerWork"
              class="input"
              type="number"
              min="1"
              step="1"
              placeholder="20"
            />
          </div>
        </div>

        <button class="btn-primary submit-btn" :disabled="!canSubmit" @click="runDownloader">
          {{ isSubmitting ? '处理中...' : '生成下载任务' }}
        </button>
      </article>

      <article class="card panel result-panel">
        <div class="panel-head">
          <h3 class="panel-title">处理结果</h3>
          <p class="panel-hint">
            会在下载目录内同步生成 `aria2_tasks.txt` 与 `manual_review.txt`。
          </p>
        </div>

        <div v-if="!hasResult" class="empty-state">
          <p>
            运行后会在这里显示任务摘要、预览路径、人工复核项与 Aria2 推送异常。
          </p>
        </div>

        <template v-else>
          <div v-if="summaryText" class="result-box">
            <pre>{{ summaryText }}</pre>
          </div>

          <div v-if="errorText" class="result-box result-box-error">
            <pre>{{ errorText }}</pre>
          </div>

          <div v-if="taskPreview.length" class="result-section">
            <h4 class="result-title">任务预览（前 50 条）</h4>
            <div class="result-box compact-box">
              <pre>{{ taskPreview.join('\n') }}</pre>
            </div>
          </div>

          <div v-if="manualItems.length" class="result-section">
            <h4 class="result-title">人工复核</h4>
            <div class="result-box compact-box">
              <pre>{{ manualItems.join('\n') }}</pre>
            </div>
          </div>

          <div v-if="pushErrors.length" class="result-section">
            <h4 class="result-title">Aria2 推送异常</h4>
            <div class="result-box compact-box">
              <pre>{{
                pushErrors
                  .map((item) => `${item.outPath} | ${item.message}`)
                  .join('\n')
              }}</pre>
            </div>
          </div>
        </template>
      </article>
    </section>
  </div>
</template>

<script setup>
import { useAsmrDownloaderPage } from '../composables/useAsmrDownloaderPage';

const {
  inputText,
  downloadDir,
  rpcUrl,
  rpcSecret,
  useAria2,
  testMode,
  maxAutoTasksPerWork,
  isSubmitting,
  summaryText,
  errorText,
  importText,
  taskPreview,
  manualItems,
  pushErrors,
  inputStats,
  canSubmit,
  hasResult,
  selectDownloadDir,
  importFromTxt,
  runDownloader,
} = useAsmrDownloaderPage();
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  box-sizing: border-box;
}

.card {
  background: #fff;
  border: 1px solid #d8d0bb;
  border-radius: 0.875rem;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.125rem;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #8c865f;
}

.page-title {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.2;
  color: #26251f;
}

.page-desc {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #66614f;
  max-width: 70ch;
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.5rem 0.75rem;
  border-radius: 999px;
  background: #f7f2e8;
  color: #6d674f;
  font-size: 0.8125rem;
}

.layout-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  min-height: 0;
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.panel-title {
  margin: 0;
  font-size: 1.0625rem;
  color: #26251f;
}

.panel-hint {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #7b7665;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.import-btn {
  align-self: flex-start;
}

.import-text {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #7b7665;
  word-break: break-word;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stats-badge {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  background: #f7f2e8;
  color: #6d674f;
  font-size: 0.8125rem;
  font-weight: 600;
}

.stats-badge-warn {
  background: #fff3db;
  color: #9a6a00;
}

.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #66614f;
}

.input-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input,
.textarea {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.75rem 0.875rem;
  border-radius: 0.75rem;
  border: 1px solid #d8d0bb;
  background: #fff;
  color: #26251f;
  font-size: 0.9375rem;
  box-sizing: border-box;
  outline: none;
}

.input:focus,
.textarea:focus {
  border-color: #adb571;
}

.input:readonly {
  background: #f7f2e8;
  color: #86806f;
}

.textarea {
  min-height: 14rem;
  resize: vertical;
  line-height: 1.6;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.field-span-full {
  grid-column: 1 / -1;
}

.checkbox-stack {
  gap: 0.75rem;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  min-height: 2.75rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #66614f;
}

.checkbox {
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.15rem;
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  min-height: 2.75rem;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.btn-primary {
  padding: 0.75rem 1rem;
  background: #adb571;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #94a25b;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.75rem 1rem;
  background: #f2ede0;
  color: #66614f;
}

.btn-secondary:hover {
  background: #e5decc;
}

.submit-btn {
  width: 100%;
}

.result-panel {
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 14rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #f7f2e8;
  color: #7b7665;
  text-align: center;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-title {
  margin: 0;
  font-size: 0.9375rem;
  color: #37342a;
}

.result-box {
  padding: 0.875rem;
  border-radius: 0.75rem;
  background: #f7f2e8;
  color: #66614f;
  max-height: 18rem;
  overflow: auto;
}

.compact-box {
  max-height: 13rem;
}

.result-box-error {
  background: #fff0f0;
  color: #8f3030;
}

.result-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Cascadia Mono', 'Consolas', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
}

@media (min-width: 768px) {
  .page-container {
    padding: 1.25rem;
  }

  .page-header {
    padding: 1.25rem;
  }

  .input-wrap {
    flex-direction: row;
    align-items: stretch;
  }

  .action-row {
    flex-direction: row;
    align-items: center;
  }

  .btn-secondary {
    min-width: 5.5rem;
  }

  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .layout-grid {
    grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
    align-items: start;
  }

  .result-panel {
    max-height: calc(100vh - 13rem);
  }
}
</style>
