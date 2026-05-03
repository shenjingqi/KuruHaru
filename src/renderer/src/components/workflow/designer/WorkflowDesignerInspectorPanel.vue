<template>
  <aside
    v-show="!(selectedNode && nodeInlineInspectorVisible)"
    class="panel-stack right"
  >
    <section class="neo-panel inspector-panel">
      <div class="inspector-head">
        <div>
          <h3>运行与属性中心</h3>
          <p>
            {{
              selectedNode
                ? `${resolveNodeLabel(selectedNode)} · ${selectedNode.id}`
                : "点击节点后可查看运行卡与节点属性"
            }}
          </p>
        </div>
        <span class="status-pill" :class="runStatusClass">
          {{ getRunStatusLabel(activeRunStatus) }}
        </span>
      </div>

      <section class="runtime-side-rail compact-runtime-rail">
        <div class="runtime-side-head">
          <div class="runtime-side-title">
            <strong>运行摘要</strong>
            <small
              >队列、历史与日志已统一收纳到底部运行台，右侧仅保留快速控制与当前状态。</small
            >
          </div>
          <button
            type="button"
            class="queue-mini-btn"
            @click="focusOutputConsole"
          >
            打开运行台
          </button>
        </div>

        <div class="runtime-side-actions">
          <button
            type="button"
            class="runtime-side-btn"
            :disabled="isValidating"
            @click="validateCurrentWorkflow"
          >
            校验
          </button>
          <button
            type="button"
            class="runtime-side-btn primary"
            :disabled="isRunInProgress || isValidating"
            @click="startRun"
          >
            运行工作流
          </button>
          <button
            type="button"
            class="runtime-side-btn"
            :disabled="isValidating"
            @click="queueRunCurrentWorkflowFront"
          >
            前插队列
          </button>
          <button
            type="button"
            class="runtime-side-btn danger"
            :disabled="!isRunInProgress"
            @click="cancelRun"
          >
            停止
          </button>
        </div>

        <div class="runtime-side-focus compact-only">
          <article class="runtime-focus-card">
            <span>当前运行</span>
            <strong>{{ activeRunDisplayLabel }}</strong>
            <small>{{ activeRunDisplayMeta }}</small>
          </article>
          <article class="runtime-focus-card">
            <span>最近校验</span>
            <strong>{{ validationState.ok ? "通过" : "待修复" }}</strong>
            <small>{{ queueUpdatedLabel || "等待更新" }}</small>
          </article>
        </div>

        <div class="empty-hint compact">
          更详细的待执行、运行中、历史与日志内容，请查看底部运行台。
        </div>
      </section>

      <div class="inspector-tabs">
        <button
          v-for="tab in inspectorTabs"
          :key="tab.value"
          type="button"
          class="tab-btn"
          :class="{ active: inspectorTab === tab.value }"
          @click="inspectorTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="inspector-body">
        <div v-if="inspectorTab === 'config'" class="tab-panel form-stack">
          <div v-if="selectedNode" class="config-meta">
            <strong>{{ resolveNodeLabel(selectedNode) }}</strong>
            <small>{{ selectedNode.id }}</small>
          </div>
          <div v-else class="empty-hint">未选择节点</div>

          <section
            v-if="
              selectedNode &&
              schemaConfigEntries.length &&
              !hasDetailedConfigInspector
            "
            class="note-box schema-config-overview"
          >
            <strong>结构配置</strong>
            <div class="schema-list">
              <div
                v-for="entry in schemaConfigEntries"
                :key="`config-${entry.key}`"
                class="schema-row"
              >
                <span class="schema-main">
                  <span>{{ entry.label }}</span>
                  <small>{{ entry.key }} / {{ entry.widgetLabel }}</small>
                </span>
                <strong>{{ entry.value }}</strong>
              </div>
            </div>
          </section>

          <div v-if="isTranslateSubtitleNodeSelected" class="special-form">
            <label class="form-label">引擎路径</label>
            <div class="path-picker-row">
              <input
                :value="selectedTranslateNodeConfig.exePath"
                class="input"
                readonly
                placeholder="请选择 whisper 引擎可执行文件"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickTranslateExePath"
              >
                选择
              </button>
            </div>

            <label class="form-label">媒体目录</label>
            <div class="path-picker-row">
              <input
                :value="selectedTranslateNodeConfig.targetPath"
                class="input"
                readonly
                placeholder="请选择待翻译媒体目录"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickTranslateTargetPath"
              >
                选择
              </button>
            </div>

            <label class="form-label">字幕格式</label>
            <div class="formats-group">
              <label
                v-for="fmt in subtitleFormatOptions"
                :key="fmt"
                class="format-checkbox"
              >
                <input
                  :checked="
                    selectedTranslateNodeConfig.subFormats.includes(fmt)
                  "
                  type="checkbox"
                  @change="toggleTranslateSubFormat(fmt, $event.target.checked)"
                />
                <span class="format-pill">{{ fmt.toUpperCase() }}</span>
              </label>
            </div>
          </div>

          <div v-else-if="isPackSubtitleNodeSelected" class="special-form">
            <label class="form-label">源目录</label>
            <div class="path-picker-row">
              <input
                :value="selectedPackNodeConfig.targetPath"
                class="input"
                readonly
                placeholder="请选择字幕所在目录"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickPackTargetPath"
              >
                选择
              </button>
            </div>

            <label class="form-label">输出目录</label>
            <div class="path-picker-row">
              <input
                :value="selectedPackNodeConfig.outputDir"
                class="input"
                readonly
                placeholder="可选，不填则使用源目录"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickPackOutputPath"
              >
                选择
              </button>
            </div>

            <button
              type="button"
              class="bridge-btn ghost"
              @click="patchPackNodeConfig({ outputDir: '' })"
            >
              输出目录跟随源目录
            </button>
          </div>

          <div v-else-if="isUploadSubtitleNodeSelected" class="special-form">
            <label class="form-label">扫描目录</label>
            <div class="path-picker-row">
              <input
                :value="selectedUploadNodeConfig.scanPath"
                class="input"
                readonly
                placeholder="请选择待扫描压缩包目录"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickUploadScanDir"
              >
                选择
              </button>
            </div>

            <label class="form-label">频道标识（可选）</label>
            <input
              :value="selectedUploadNodeConfig.channelId"
              class="input"
              placeholder="不填则使用全局上传频道配置"
              @input="updateUploadChannelId($event.target.value)"
            />

            <label class="form-label">标题消息后延迟（毫秒）</label>
            <input
              :value="selectedUploadNodeConfig.titleDelayMs"
              class="input"
              type="number"
              min="0"
              step="100"
              @input="updateUploadTitleDelay($event.target.value)"
            />

            <label class="form-label">每文件间隔（毫秒）</label>
            <input
              :value="selectedUploadNodeConfig.betweenDelayMs"
              class="input"
              type="number"
              min="0"
              step="100"
              @input="updateUploadBetweenDelay($event.target.value)"
            />

            <label class="checkbox-inline">
              <input
                :checked="selectedUploadNodeConfig.failOnEmpty"
                type="checkbox"
                @change="
                  patchUploadNodeConfig({
                    failOnEmpty: $event.target.checked,
                  })
                "
              />
              <span>扫描为空时按失败处理</span>
            </label>
          </div>

          <div v-else-if="isCloudDeleteRecentNodeSelected" class="special-form">
            <label class="form-label">最近上传数量</label>
            <input
              :value="selectedCloudDeleteNodeConfig.recentLimit"
              class="input"
              type="number"
              min="1"
              step="1"
              @input="updateCloudDeleteRecentLimit($event.target.value)"
            />

            <label class="form-label">删除批次大小</label>
            <input
              :value="selectedCloudDeleteNodeConfig.batchSize"
              class="input"
              type="number"
              min="1"
              step="1"
              @input="updateCloudDeleteBatchSize($event.target.value)"
            />

            <label class="checkbox-inline">
              <input
                :checked="selectedCloudDeleteNodeConfig.refreshCloudFirst"
                type="checkbox"
                @change="
                  patchCloudDeleteNodeConfig({
                    refreshCloudFirst: $event.target.checked,
                  })
                "
              />
              <span>删除前刷新云端缓存</span>
            </label>

            <label class="checkbox-inline">
              <input
                :checked="selectedCloudDeleteNodeConfig.failOnNoMatch"
                type="checkbox"
                @change="
                  patchCloudDeleteNodeConfig({
                    failOnNoMatch: $event.target.checked,
                  })
                "
              />
              <span>无匹配时报错</span>
            </label>
          </div>

          <div
            v-else-if="isLocalDeleteScannedNodeSelected"
            class="special-form"
          >
            <label class="form-label">扫描目录</label>
            <div class="path-picker-row">
              <input
                :value="selectedLocalDeleteNodeConfig.scanPath"
                class="input"
                readonly
                placeholder="请选择待清理目录"
              />
              <button
                type="button"
                class="bridge-btn ghost"
                @click="pickLocalDeleteScanDir"
              >
                选择
              </button>
            </div>

            <label class="form-label">扩展名过滤</label>
            <input
              :value="selectedLocalDeleteNodeConfig.extensions"
              class="input"
              placeholder="例如: .zip,.rar,.7z"
              @input="updateLocalDeleteExtensions($event.target.value)"
            />

            <label class="checkbox-inline">
              <input
                :checked="selectedLocalDeleteNodeConfig.deleteFiles"
                type="checkbox"
                @change="
                  patchLocalDeleteNodeConfig({
                    deleteFiles: $event.target.checked,
                  })
                "
              />
              <span>执行删除（关闭则仅预览）</span>
            </label>
          </div>

          <template v-else>
            <section
              v-if="safeSelectedNodeSchemaWidgets.length"
              class="schema-form-section"
            >
              <div class="note-box">
                <strong>结构控件</strong>
                <p>
                  &#30452;&#25509;&#22797;&#29992;&#33410;&#28857; schema widget
                  / Inspector &#33609;&#31295;&#37197;&#32622;
                </p>
              </div>

              <div class="schema-widget-form">
                <div
                  v-for="widget in safeSelectedNodeSchemaWidgets"
                  :key="`config-widget-${widget.key}`"
                  class="schema-widget-row"
                  :class="{ linked: widget.linked }"
                >
                  <div class="schema-widget-head">
                    <label class="form-label">{{ widget.label }}</label>
                    <small
                      >{{ widget.datatype || "ANY" }} /
                      {{ widget.widgetType }}</small
                    >
                  </div>

                  <label
                    v-if="widget.widgetType === 'toggle'"
                    class="checkbox-inline schema-widget-toggle"
                  >
                    <input
                      :checked="
                        Boolean(getSelectedNodeSchemaWidgetValue(widget.key))
                      "
                      type="checkbox"
                      :disabled="widget.linked"
                      @change="
                        patchSelectedNodeSchemaWidgetValue(
                          widget.key,
                          $event.target.checked,
                        )
                      "
                    />
                    <span>{{ widget.linked ? "已连接上游" : "可编辑" }}</span>
                  </label>

                  <input
                    v-else-if="widget.widgetType === 'number'"
                    :value="getSelectedNodeSchemaWidgetValue(widget.key)"
                    class="input"
                    type="number"
                    :disabled="widget.linked"
                    @input="
                      patchSelectedNodeSchemaWidgetValue(
                        widget.key,
                        $event.target.value,
                      )
                    "
                  />

                  <textarea
                    v-else-if="widget.widgetType === 'list'"
                    :value="formatSchemaWidgetTextareaValue(widget.key)"
                    class="input config-textarea schema-widget-textarea"
                    spellcheck="false"
                    :disabled="widget.linked"
                    @input="
                      patchSelectedNodeSchemaWidgetValue(
                        widget.key,
                        $event.target.value,
                      )
                    "
                  />

                  <input
                    v-else
                    :value="formatSchemaWidgetInputValue(widget.key)"
                    class="input"
                    type="text"
                    :disabled="widget.linked"
                    :placeholder="
                      widget.widgetType === 'path'
                        ? '输入路径或连接上游输入'
                        : ''
                    "
                    @input="
                      patchSelectedNodeSchemaWidgetValue(
                        widget.key,
                        $event.target.value,
                      )
                    "
                  />

                  <small v-if="widget.description" class="schema-widget-help">{{
                    widget.description
                  }}</small>
                  <small v-if="widget.linked" class="schema-widget-takenover"
                    >已由已连接输入接管</small
                  >
                </div>
              </div>
            </section>

            <label class="form-label">JSON 配置</label>
            <textarea
              v-model="selectedNodeConfigDraft"
              class="input config-textarea"
              spellcheck="false"
            />
            <div v-if="selectedNodeConfigError" class="error-text">
              {{ selectedNodeConfigError }}
            </div>
            <button
              type="button"
              class="bridge-btn launch"
              @click="applyNodeConfigDraft"
            >
              应用草稿
            </button>
          </template>

          <div v-if="translateNodeConfigError" class="error-text">
            {{ translateNodeConfigError }}
          </div>
        </div>

        <div v-else-if="inspectorTab === 'schema'" class="tab-panel form-stack">
          <div v-if="selectedNodeObjectInfo" class="note-box">
            <strong>{{
              selectedNodeObjectInfo.displayName ||
              resolveNodeLabel(selectedNode)
            }}</strong>
            <p>
              {{
                selectedNodeObjectInfo.description || "当前节点暂无额外说明。"
              }}
            </p>
          </div>
          <div v-else class="empty-hint">请选择节点后查看结构定义</div>

          <section v-if="selectedNodeObjectInfo" class="note-box">
            <strong>必填输入</strong>
            <div v-if="schemaRequiredInputs.length" class="schema-list">
              <div
                v-for="entry in schemaRequiredInputs"
                :key="`req-${entry.key}`"
                class="schema-row"
              >
                <span>{{ entry.label }}</span>
                <small>{{ entry.datatype || "ANY" }}</small>
              </div>
            </div>
            <p v-else>无必填输入</p>
          </section>

          <section v-if="selectedNodeObjectInfo" class="note-box">
            <strong>可选输入</strong>
            <div v-if="schemaOptionalInputs.length" class="schema-list">
              <div
                v-for="entry in schemaOptionalInputs"
                :key="`opt-${entry.key}`"
                class="schema-row"
              >
                <span>{{ entry.label }}</span>
                <small>{{ entry.datatype || "ANY" }}</small>
              </div>
            </div>
            <p v-else>无可选输入</p>
          </section>

          <section v-if="selectedNodeObjectInfo" class="note-box">
            <strong>输出</strong>
            <div v-if="schemaOutputs.length" class="schema-list">
              <div
                v-for="entry in schemaOutputs"
                :key="`out-${entry.key}`"
                class="schema-row"
              >
                <span>{{ entry.label }}</span>
                <small>{{ entry.datatype || "ANY" }}</small>
              </div>
            </div>
            <p v-else>无输出定义</p>
          </section>

          <section v-if="selectedNodeObjectInfo" class="note-box">
            <strong>配置项</strong>
            <div v-if="schemaWidgets.length" class="schema-list">
              <div
                v-for="entry in schemaWidgets"
                :key="`widget-${entry.key}`"
                class="schema-row"
              >
                <span>{{ entry.label || entry.key }}</span>
                <small>{{ entry.widget || entry.datatype || "text" }}</small>
              </div>
            </div>
            <p v-else>无 widget 定义</p>
          </section>
        </div>

        <div
          v-else-if="inspectorTab === 'runtime'"
          class="tab-panel form-stack"
        >
          <label class="form-label">最大并发</label>
          <input
            v-model.number="workflow.runtime.maxParallel"
            class="input"
            type="number"
            min="1"
            max="16"
          />

          <label class="form-label">超时时间（毫秒）</label>
          <input
            v-model.number="workflow.runtime.timeoutMs"
            class="input"
            type="number"
            min="0"
            step="100"
          />

          <label class="checkbox-inline">
            <input v-model="workflow.runtime.failFast" type="checkbox" />
            <span>快速失败（节点失败即中断）</span>
          </label>

          <div class="runtime-divider" />

          <label class="form-label">调度模式</label>
          <select v-model="runtimeDispatchMode" class="select">
            <option value="single">逐条串行（1 部 1 部发布）</option>
            <option value="batch">批处理（例如 50 部合并发）</option>
            <option value="fanout">并行扇出（分支同时执行）</option>
          </select>

          <label class="form-label">批次大小</label>
          <input
            v-model.number="runtimeBatchSize"
            class="input"
            type="number"
            min="1"
            step="1"
          />

          <label class="checkbox-inline">
            <input v-model="runtimeEmitPerItem" type="checkbox" />
            <span>批处理时同时输出逐条事件</span>
          </label>

          <label class="checkbox-inline">
            <input v-model="runtimeGuardianEnabled" type="checkbox" />
            <span>启用守护进程（防重复发布）</span>
          </label>

          <label class="checkbox-inline">
            <input v-model="runtimeAutoCleanupDuplicates" type="checkbox" />
            <span>自动清理重复发布内容</span>
          </label>

          <div class="validation-box" :class="{ invalid: !validationState.ok }">
            <div class="validation-status">
              {{ validationState.ok ? "校验通过" : "校验未通过" }}
            </div>
            <ul v-if="validationErrors.length" class="validation-list">
              <li v-for="err in validationErrors" :key="err">
                {{ err }}
              </li>
            </ul>
            <ul
              v-if="validationWarnings.length"
              class="validation-list warning"
            >
              <li v-for="warn in validationWarnings" :key="warn">
                {{ warn }}
              </li>
            </ul>
          </div>
        </div>

        <div
          v-else-if="inspectorTab === 'output'"
          class="tab-panel output-panel"
        >
          <div class="run-meta-grid">
            <div class="meta-item">
              <span>运行 ID</span>
              <strong>{{ activeRunId || "-" }}</strong>
            </div>
            <div class="meta-item">
              <span>流程状态</span>
              <strong>{{ getRunStatusLabel(activeRunStatus) }}</strong>
            </div>
            <div class="meta-item">
              <span>当前 RJ</span>
              <strong>{{ runProgress.currentRj || "-" }}</strong>
            </div>
            <div class="meta-item">
              <span>总作品</span>
              <strong>{{ totalWorksDisplay }}</strong>
            </div>
            <div class="meta-item">
              <span>已完成</span>
              <strong>{{ completedWorksDisplay }}</strong>
            </div>
            <div class="meta-item">
              <span>进行中</span>
              <strong>{{ inProgressWorksDisplay }}</strong>
            </div>
            <div class="meta-item">
              <span>待开始</span>
              <strong>{{ remainingWorksDisplay }}</strong>
            </div>
            <div class="meta-item">
              <span>文件进度</span>
              <strong
                >{{ runProgress.processedFiles }} /
                {{ runProgress.totalFiles }}</strong
              >
            </div>
          </div>

          <div v-if="selectedNodeRunState" class="runtime-card">
            <div class="runtime-card-header">
              <strong>{{
                resolveNodeLabel(selectedNode) || selectedNode?.id
              }}</strong>
              <span class="node-run-status" :class="selectedNodeRunStatusClass">
                {{ getRunStatusLabel(selectedNodeRunState.status || "idle") }}
              </span>
            </div>

            <div class="runtime-kv-grid">
              <div class="runtime-kv-item">
                <span>开始时间</span>
                <strong>{{
                  formatTimestampLabel(selectedNodeRunState.startedAt)
                }}</strong>
              </div>
              <div class="runtime-kv-item">
                <span>结束时间</span>
                <strong>{{
                  formatTimestampLabel(selectedNodeRunState.endedAt)
                }}</strong>
              </div>
              <div class="runtime-kv-item">
                <span>耗时</span>
                <strong>{{ selectedNodeRunDuration }}</strong>
              </div>
              <div class="runtime-kv-item">
                <span>重试次数</span>
                <strong>{{ selectedNodeRunState.attempt || 1 }}</strong>
              </div>
            </div>

            <div class="runtime-section">
              <div class="runtime-section-title">节点配置快照</div>
              <pre class="run-console compact">{{
                formatRuntimePreview(selectedNodeRunState.configSnapshot)
              }}</pre>
            </div>

            <div class="runtime-section">
              <div class="runtime-section-title">输入快照</div>
              <pre class="run-console compact">{{
                formatRuntimePreview(selectedNodeRunState.inputPreview)
              }}</pre>
            </div>

            <div class="runtime-section">
              <div class="runtime-section-title">输出快照</div>
              <pre class="run-console compact">{{
                formatRuntimePreview(selectedNodeRunState.outputPreview)
              }}</pre>
            </div>
          </div>
          <div v-else class="empty-hint">请先点选节点查看节点运行卡</div>

          <section class="note-box runtime-log-handoff">
            <strong>日志已统一收纳到底部运行台</strong>
            <p>
              右侧不再重复展示流程日志、节点日志、流水线日志；请使用底部运行台的“日志”标签查看详细内容。
            </p>
            <div class="runtime-log-handoff-actions">
              <button
                type="button"
                class="bridge-btn ghost"
                @click="openRuntimeDockLogs('workflow')"
              >
                查看流程日志
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="openRuntimeDockLogs('node')"
              >
                查看节点日志
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="openRuntimeDockLogs('pipeline')"
              >
                查看流水线日志
              </button>
            </div>
          </section>
        </div>

        <div v-else class="tab-panel form-stack">
          <div v-if="selectedNode" class="node-attr-card">
            <div class="config-meta">
              <strong>{{ resolveNodeLabel(selectedNode) }}</strong>
              <small>{{ selectedNode.id }}</small>
            </div>

            <div class="attr-grid">
              <label class="form-label">&#33410;&#28857;&#23485;&#24230;</label>
              <input
                v-model="selectedNodeWidthDraft"
                class="input"
                type="number"
                :min="MIN_NODE_WIDTH"
                :max="MAX_NODE_WIDTH"
                step="8"
                @blur="commitSelectedNodeSize('width')"
                @keydown.enter.prevent="commitSelectedNodeSize('width')"
              />

              <label class="form-label">&#33410;&#28857;&#39640;&#24230;</label>
              <input
                v-model="selectedNodeHeightDraft"
                class="input"
                type="number"
                :min="MIN_NODE_HEIGHT"
                :max="MAX_NODE_HEIGHT"
                step="8"
                @blur="commitSelectedNodeSize('height')"
                @keydown.enter.prevent="commitSelectedNodeSize('height')"
              />

              <label class="form-label">&#23383;&#20307;&#22823;&#23567;</label>
              <input
                v-model="selectedNodeFontSizeDraft"
                class="input"
                type="number"
                :min="MIN_NODE_FONT_SIZE"
                :max="MAX_NODE_FONT_SIZE"
                step="1"
                @blur="commitSelectedNodeFontSize"
                @keydown.enter.prevent="commitSelectedNodeFontSize"
              />
            </div>

            <div class="size-presets">
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeSizePreset(200, 112)"
              >
                &#32039;&#20945;
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeSizePreset(238, 128)"
              >
                &#40664;&#35748;
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeSizePreset(300, 156)"
              >
                &#21152;&#23485;
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeSizePreset(360, 188)"
              >
                &#23637;&#24320;
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeFontSizePreset(14)"
              >
                &#23567;&#23383;
              </button>
              <button
                type="button"
                class="bridge-btn ghost"
                @click="applyNodeFontSizePreset(18)"
              >
                &#22823;&#23383;
              </button>
            </div>

            <div class="note-box">
              <strong>&#33410;&#28857;&#21345;&#29255;&#23610;&#23544;</strong>
              <p>
                &#23485;&#39640;&#21644;&#23383;&#21495;&#20250;&#23454;&#26102;&#21516;&#27493;&#21040;&#21345;&#29255;&#12289;&#36830;&#32447;&#38170;&#28857;&#21644;&#23548;&#33322;&#32553;&#30053;&#22270;&#12290;
              </p>
            </div>
          </div>
          <div v-else class="empty-hint">
            &#35831;&#36873;&#25321;&#33410;&#28857;&#21518;&#35843;&#25972;&#21345;&#29255;&#23610;&#23544;
          </div>

          <label class="form-label">&#27969;&#31243;&#25551;&#36848;</label>
          <textarea
            v-model="workflow.description"
            class="input desc-textarea"
            placeholder="&#25551;&#36848;&#36825;&#20010;&#27969;&#31243;&#29992;&#20110;&#20160;&#20040;&#22330;&#26223;"
          />

          <div class="note-box">
            <strong>&#27969;&#27700;&#32447;&#39044;&#30041;&#20301;</strong>
            <p>
              &#24403;&#21069;&#24050;&#25286;&#20998;&#27969;&#31243;&#26085;&#24535;
              / &#33410;&#28857;&#26085;&#24535; /
              &#27969;&#27700;&#32447;&#26085;&#24535;&#65292;&#21518;&#32493;&#25509;&#20837;&#27969;&#27700;&#32447;&#32534;&#25490;&#26102;&#21487;&#30452;&#25509;&#22797;&#29992;&#12290;
            </p>
          </div>

          <div class="history-title">&#36816;&#34892;&#21382;&#21490;</div>
          <div class="run-history">
            <div v-for="run in runHistory" :key="run.runId" class="run-item">
              <div class="run-item-row">
                <strong>{{ run.runId }}</strong>
                <span
                  class="run-item-status"
                  :class="getStatusClassByValue(run.status)"
                >
                  {{ getRunStatusLabel(run.status) }}
                </span>
              </div>
              <small>{{
                run.startedAt?.slice(0, 19)?.replace("T", " ")
              }}</small>
            </div>
            <div v-if="!runHistory.length" class="empty-hint">
              &#26242;&#26080;&#36816;&#34892;&#21382;&#21490;
            </div>
          </div>
        </div>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { computed, inject } from "vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);
const {
  workflow,
  runHistory,
  activeRunId,
  activeRunStatus,
  runProgress,
  selectedNodeRunState,
  totalWorksDisplay,
  completedWorksDisplay,
  inProgressWorksDisplay,
  remainingWorksDisplay,
  isRunInProgress,
  isValidating,
  selectedNode,
  selectedNodeObjectInfo,
  selectedNodeConfigDraft,
  selectedNodeConfigError,
  inspectorTab,
  inspectorTabs,
  runStatusClass,
  runtimeDispatchMode,
  runtimeBatchSize,
  runtimeEmitPerItem,
  runtimeGuardianEnabled,
  runtimeAutoCleanupDuplicates,
  validationState,
  selectedNodeWidthDraft,
  selectedNodeHeightDraft,
  selectedNodeFontSizeDraft,
  translateNodeConfigError,
  subtitleFormatOptions,
  selectedTranslateNodeConfig,
  selectedPackNodeConfig,
  selectedUploadNodeConfig,
  selectedCloudDeleteNodeConfig,
  selectedLocalDeleteNodeConfig,
  selectedNodeRunStatusClass,
  selectedNodeRunDuration,
  nodeInlineInspectorVisible,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MAX_NODE_HEIGHT,
  MIN_NODE_FONT_SIZE,
  MAX_NODE_FONT_SIZE,
  isTranslateSubtitleNodeSelected,
  isPackSubtitleNodeSelected,
  isUploadSubtitleNodeSelected,
  isCloudDeleteRecentNodeSelected,
  isLocalDeleteScannedNodeSelected,
  resolveNodeLabel,
  getRunStatusLabel,
  getStatusClassByValue,
  formatTimestampLabel,
  formatRuntimePreview,
  pickTranslateExePath,
  pickTranslateTargetPath,
  toggleTranslateSubFormat,
  pickPackTargetPath,
  pickPackOutputPath,
  patchPackNodeConfig,
  pickUploadScanDir,
  updateUploadChannelId,
  updateUploadTitleDelay,
  updateUploadBetweenDelay,
  patchUploadNodeConfig,
  updateCloudDeleteRecentLimit,
  updateCloudDeleteBatchSize,
  patchCloudDeleteNodeConfig,
  pickLocalDeleteScanDir,
  updateLocalDeleteExtensions,
  patchLocalDeleteNodeConfig,
  selectedNodeSchemaWidgets,
  getSelectedNodeSchemaWidgetValue,
  patchSelectedNodeSchemaWidgetValue,
  applyNodeConfigDraft,
  commitSelectedNodeSize,
  commitSelectedNodeFontSize,
  applyNodeSizePreset,
  applyNodeFontSizePreset,
  queueStore,
  logDockExpanded,
  runtimeDockTab,
  logDockScope,
  startRun,
  cancelRun,
  validateCurrentWorkflow,
  queueRunCurrentWorkflowFront,
} = context;

const schemaRequiredInputs = computed(() =>
  Array.isArray(selectedNodeObjectInfo?.value?.inputs?.required)
    ? selectedNodeObjectInfo.value.inputs.required
    : [],
);

const schemaOptionalInputs = computed(() =>
  Array.isArray(selectedNodeObjectInfo?.value?.inputs?.optional)
    ? selectedNodeObjectInfo.value.inputs.optional
    : [],
);

const schemaOutputs = computed(() =>
  Array.isArray(selectedNodeObjectInfo?.value?.outputs)
    ? selectedNodeObjectInfo.value.outputs
    : [],
);

const schemaWidgets = computed(() =>
  Array.isArray(selectedNodeObjectInfo?.value?.widgets)
    ? selectedNodeObjectInfo.value.widgets
    : [],
);

const safeSelectedNodeSchemaWidgets = computed(() => {
  if (Array.isArray(selectedNodeSchemaWidgets?.value)) {
    return selectedNodeSchemaWidgets.value;
  }

  if (Array.isArray(selectedNodeSchemaWidgets)) {
    return selectedNodeSchemaWidgets;
  }

  return [];
});

const validationErrors = computed(() => {
  if (Array.isArray(validationState?.value?.errors)) {
    return validationState.value.errors;
  }

  if (Array.isArray(validationState?.errors)) {
    return validationState.errors;
  }

  return [];
});

const validationWarnings = computed(() => {
  if (Array.isArray(validationState?.value?.warnings)) {
    return validationState.value.warnings;
  }

  if (Array.isArray(validationState?.warnings)) {
    return validationState.warnings;
  }

  return [];
});

const hasDetailedConfigInspector = computed(() => {
  return Boolean(
    isTranslateSubtitleNodeSelected?.value ||
    isPackSubtitleNodeSelected?.value ||
    isUploadSubtitleNodeSelected?.value ||
    isCloudDeleteRecentNodeSelected?.value ||
    isLocalDeleteScannedNodeSelected?.value ||
    (Array.isArray(selectedNodeSchemaWidgets?.value)
      ? selectedNodeSchemaWidgets.value.length
      : 0) > 0,
  );
});

const runningQueueItems = computed(() =>
  Array.isArray(queueStore?.running) ? queueStore.running.slice(0, 2) : [],
);
const queuePrimaryRunningItem = computed(
  () => runningQueueItems.value[0] || null,
);
const queueUpdatedLabel = computed(() =>
  formatTimestampLabel(queueStore?.lastUpdatedAt || ""),
);
const activeRunDisplayLabel = computed(() => {
  const item = queuePrimaryRunningItem.value;
  if (item?.workflowName || item?.workflowId) {
    return item.workflowName || item.workflowId;
  }
  if (activeRunId?.value) {
    return activeRunId.value;
  }
  return "暂无运行";
});
const activeRunDisplayMeta = computed(() => {
  const item = queuePrimaryRunningItem.value;
  if (item) {
    return resolveRunItemTime(item);
  }
  return getRunStatusLabel(activeRunStatus?.value || "idle");
});

const resolveRunItemTime = (item) =>
  formatTimestampLabel(
    item?.startedAt || item?.requestedAt || item?.endedAt || "",
  );
const focusOutputConsole = () => {
  inspectorTab.value = "output";
};

const openRuntimeDockLogs = (scope = "workflow") => {
  logDockExpanded.value = true;
  runtimeDockTab.value = "logs";
  logDockScope.value = scope;
};

const formatSchemaWidgetInputValue = (widgetKey = "") => {
  const value = getSelectedNodeSchemaWidgetValue(widgetKey);
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return typeof value === "string" ? value : String(value);
};

const formatSchemaWidgetTextareaValue = (widgetKey = "") => {
  const value = getSelectedNodeSchemaWidgetValue(widgetKey);
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
};

const formatSchemaConfigValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "未设置";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "未设置";
  }
  if (typeof value === "boolean") {
    return value ? "开启" : "关闭";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[对象]";
    }
  }
  return String(value);
};

const formatSchemaWidgetLabel = (rawValue = "") => {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  const labels = {
    text: "文本",
    path: "路径",
    number: "数字",
    boolean: "布尔",
    checkbox: "复选框",
    select: "下拉",
    "multi-select": "多选",
    textarea: "多行文本",
    json: "JSON",
    config: "配置",
  };

  return labels[normalized] || String(rawValue || "").trim() || "文本";
};

const schemaConfigEntries = computed(() => {
  const node = selectedNode?.value;
  const objectInfo = selectedNodeObjectInfo?.value;
  if (!node || !objectInfo) {
    return [];
  }

  const config =
    node?.config && typeof node.config === "object" ? node.config : {};
  const widgets = Array.isArray(objectInfo.widgets) ? objectInfo.widgets : [];
  const seenKeys = new Set();
  const entries = [];

  widgets.forEach((entry) => {
    const key = String(entry?.key || "").trim();
    if (!key || seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    const hasOwnValue = Object.prototype.hasOwnProperty.call(config, key);
    const value = hasOwnValue ? config[key] : entry?.defaultValue;
    entries.push({
      key,
      label: String(entry?.label || key).trim() || key,
      widgetLabel: formatSchemaWidgetLabel(
        entry?.widget || entry?.datatype || "text",
      ),
      value: formatSchemaConfigValue(value),
    });
  });

  Object.entries(config).forEach(([key, value]) => {
    if (seenKeys.has(key)) {
      return;
    }
    entries.push({
      key,
      label: key,
      widgetLabel: "配置",
      value: formatSchemaConfigValue(value),
    });
  });

  return entries;
});
</script>

<style scoped>
.schema-list {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.schema-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.55rem;
  background: rgba(255, 255, 255, 0.04);
}

.schema-row small {
  color: rgba(220, 224, 233, 0.72);
}

.schema-form-section {
  display: grid;
  gap: 0.7rem;
}

.schema-widget-form {
  display: grid;
  gap: 0.7rem;
}

.schema-widget-row {
  display: grid;
  gap: 0.45rem;
  padding: 0.7rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.schema-widget-row.linked {
  border-color: rgba(130, 182, 255, 0.18);
  background: rgba(77, 105, 150, 0.12);
}

.schema-widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.schema-widget-head small,
.schema-widget-help,
.schema-widget-takenover {
  color: rgba(220, 224, 233, 0.72);
}

.schema-widget-toggle {
  margin: 0;
}

.schema-widget-textarea {
  min-height: 5.5rem;
}

.schema-widget-takenover {
  color: rgba(150, 196, 255, 0.88);
}

.schema-config-overview {
  display: grid;
  gap: 0.55rem;
}

.schema-main {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}

.schema-row strong {
  color: #f4f6fb;
  font-size: 0.78rem;
  max-width: 14rem;
  text-align: right;
}

.runtime-side-rail {
  display: grid;
  gap: 0.55rem;
  padding: 0.68rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(88, 78, 84, 0.9);
  background: linear-gradient(
    180deg,
    rgba(24, 22, 27, 0.96),
    rgba(16, 15, 18, 0.96)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.runtime-side-head,
.runtime-side-list-head,
.runtime-side-history-actions,
.runtime-side-inline-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.runtime-side-title {
  display: grid;
  gap: 0.16rem;
}

.runtime-side-title strong,
.runtime-side-list-head strong,
.runtime-side-item-main strong,
.runtime-focus-card strong,
.runtime-metric-card strong {
  color: #f6f0e5;
}

.runtime-side-title small,
.runtime-side-list-head small,
.runtime-side-item-main small,
.runtime-side-item-meta,
.runtime-focus-card small,
.runtime-metric-card small {
  color: rgba(213, 205, 195, 0.72);
}

.runtime-side-actions,
.runtime-side-metrics,
.runtime-side-focus {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.runtime-side-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.runtime-side-btn,
.queue-mini-btn {
  min-height: 2rem;
  border: 1px solid rgba(110, 97, 102, 0.92);
  border-radius: 0.72rem;
  background: linear-gradient(
    180deg,
    rgba(39, 36, 42, 0.98),
    rgba(26, 24, 29, 0.98)
  );
  color: #efe7da;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;
}

.runtime-side-btn:hover,
.queue-mini-btn:hover {
  border-color: rgba(218, 186, 121, 0.52);
  transform: translateY(-1px);
}

.runtime-side-btn:disabled,
.queue-mini-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}

.runtime-side-btn.primary {
  border-color: rgba(88, 137, 242, 0.54);
  background: linear-gradient(
    180deg,
    rgba(71, 114, 222, 0.92),
    rgba(48, 87, 179, 0.92)
  );
  color: #f8fbff;
}

.runtime-side-btn.danger {
  border-color: rgba(198, 92, 106, 0.52);
  color: #ffd7db;
}

.queue-mini-btn {
  min-height: 1.65rem;
  padding: 0 0.55rem;
  font-size: 0.66rem;
}

.queue-mini-btn.accent {
  border-color: rgba(88, 137, 242, 0.46);
  color: #d8e5ff;
}

.runtime-metric-card,
.runtime-focus-card,
.runtime-side-item,
.runtime-side-history {
  display: grid;
  gap: 0.18rem;
  padding: 0.58rem 0.62rem;
  border-radius: 0.78rem;
  border: 1px solid rgba(86, 75, 80, 0.9);
  background: rgba(27, 24, 29, 0.92);
}

.runtime-metric-card span,
.runtime-focus-card span {
  color: rgba(195, 188, 178, 0.72);
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.runtime-metric-card strong {
  font-size: 1rem;
}

.runtime-metric-card.active {
  border-color: rgba(86, 209, 172, 0.42);
}

.runtime-focus-card strong {
  font-size: 0.8rem;
}

.runtime-side-list {
  display: grid;
  gap: 0.42rem;
}

.runtime-side-item {
  width: 100%;
  text-align: left;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.runtime-side-item.active {
  border-color: rgba(86, 209, 172, 0.36);
}

.runtime-side-item-main {
  min-width: 0;
  display: grid;
  gap: 0.16rem;
}

.runtime-side-item-main strong,
.runtime-side-item-main small,
.runtime-side-item-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-side-item-meta {
  font-size: 0.64rem;
}

.runtime-side-history {
  gap: 0.45rem;
}

.empty-hint.compact {
  padding: 0.5rem 0.1rem 0;
  font-size: 0.68rem;
}

@media (max-width: 1400px) {
  .runtime-side-actions,
  .runtime-side-focus {
    grid-template-columns: minmax(0, 1fr);
  }

  .runtime-side-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
