<template>
  <div
    class="page-container workflow-designer-theme workflow-orbit workflow-orbit-hc"
  >
    <div class="orbit-backdrop" aria-hidden="true" />

    <header class="orbit-hero">
      <div class="hero-left">
        <p class="hero-kicker">KURUHARU NODE WORKSTATION</p>
        <div class="hero-title-row">
          <input
            v-model="workflow.name"
            class="hero-title-input"
            placeholder="未命名工作流"
          />
          <span class="hero-live-badge" :class="heroModeBadge.tone">
            {{ heroModeBadge.label }}
          </span>
        </div>
        <p class="hero-summary">
          {{
            workflow.description ||
            "把翻译、打包、上传与清理节点编排成一个可复用的自动化作业。"
          }}
        </p>
        <div class="hero-chips">
          <span class="hero-chip">ID · {{ workflow.id || "草稿态" }}</span>
          <span class="hero-chip">版本 · {{ workflow.version }}</span>
          <span class="hero-chip"
            >节点 · {{ workflow.graph.nodes.length }}</span
          >
          <span class="hero-chip"
            >连线 · {{ workflow.graph.edges.length }}</span
          >
          <span class="hero-chip"
            >调度 · {{ dispatchModeLabelMap[runtimeDispatchMode] }}</span
          >
          <span class="hero-chip"
            >状态 · {{ getRunStatusLabel(activeRunStatus) }}</span
          >
        </div>
      </div>

      <div class="hero-side">
        <div class="hero-focus-card">
          <span class="hero-focus-label">当前焦点</span>
          <strong>{{
            selectedNode ? resolveNodeLabel(selectedNode) : "未选中节点"
          }}</strong>
          <small>
            {{
              selectedNode
                ? `${getNodeTypeDisplay(selectedNode.type)} · ${selectedNode.id}`
                : "从画布、节点快选或仓库中选择一个节点后即可开始配置。"
            }}
          </small>
        </div>

        <div class="hero-actions">
          <button
            type="button"
            class="hero-btn ghost"
            @click="createNewWorkflow"
          >
            新建流程
          </button>
          <button
            type="button"
            class="hero-btn ghost"
            :disabled="isValidating"
            @click="validateCurrentWorkflow"
          >
            {{ isValidating ? "校验中" : "校验" }}
          </button>
          <button
            type="button"
            class="hero-btn hot"
            :disabled="isRunInProgress"
            @click="startRun"
          >
            {{ isRunInProgress ? "运行中" : "启动" }}
          </button>
          <button
            type="button"
            class="hero-btn warning"
            :disabled="!isRunInProgress"
            @click="cancelRun"
          >
            停止
          </button>
          <button
            type="button"
            class="hero-btn cool"
            :disabled="isSaving"
            @click="saveCurrentWorkflow"
          >
            {{ isSaving ? "保存中" : "保存" }}
          </button>
        </div>
      </div>
    </header>

    <section class="orbit-overview" aria-label="工作流概览">
      <article
        v-for="card in overviewCards"
        :key="card.key"
        class="overview-card"
        :class="card.tone"
      >
        <span class="overview-kicker">{{ card.kicker }}</span>
        <strong class="overview-value">{{ card.value }}</strong>
        <p class="overview-meta">{{ card.meta }}</p>
      </article>
    </section>

    <div class="orbit-layout">
      <aside class="panel-stack workflow-left-rail">
        <WorkflowLibraryDrawer
          :pinned="!leftDockCollapsed"
          :groups="libraryDrawerGroups"
          :search-value="nodeSearchKeyword"
          :workflow-summaries="workflowSummaries"
          :active-workflow-id="workflow.id"
          @update:pinned="leftDockCollapsed = !$event"
          @update:search-value="nodeSearchKeyword = $event"
          @add-node="addNodeByType"
          @load-workflow="loadWorkflowById"
          @remove-workflow="removeWorkflowById"
          @drag-node-start="handleLibraryNodeDragStart"
        />
      </aside>

      <section class="center-hub">
        <WorkflowBridgeDrawer
          :pinned="!bridgeBarCollapsed"
          :node-count="workflow.graph.nodes.length"
          :edge-count="workflow.graph.edges.length"
          :source-node-id="sourceNodeId"
          :target-node-id="targetNodeId"
          :current-node-options="currentNodeOptions"
          :node-picker-items="bridgeNodePickerItems"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          :runtime-dispatch-mode="runtimeDispatchMode"
          :canvas-zoom-percent="canvasZoomPercent"
          :disable-zoom-in="canvasZoom >= MAX_CANVAS_ZOOM"
          :disable-zoom-out="canvasZoom <= MIN_CANVAS_ZOOM"
          :is-run-in-progress="isRunInProgress"
          @update:pinned="bridgeBarCollapsed = !$event"
          @update:source-node-id="sourceNodeId = $event"
          @update:target-node-id="targetNodeId = $event"
          @update:runtime-dispatch-mode="runtimeDispatchMode = $event"
          @focus-node="focusNodeFromPicker"
          @assign-source="assignSourceNode"
          @assign-target="assignTargetNode"
          @add-edge="addEdge"
          @remove-edge="removeSelectedEdge"
          @start-run="startRun"
          @cancel-run="cancelRun"
          @auto-arrange="autoArrangeNodes"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
        />
        <div
          ref="canvasRef"
          class="flow-canvas-shell"
          :class="{
            panning: canvasPan.active,
            'pan-ready': spacePanPressed && !canvasPan.active,
          }"
          @pointerdown="handleCanvasPanStart($event)"
          @pointermove="handleCanvasPanMove($event)"
          @pointerup="handleCanvasPanEnd($event)"
          @pointercancel="handleCanvasPanEnd($event)"
          @mousemove="handleCanvasPointerMove($event)"
          @mouseup="handleCanvasPointerUp"
          @mouseleave="handleCanvasPointerLeave"
          @scroll="handleCanvasScroll"
          @wheel="handleCanvasWheel"
          @click="handleCanvasBackgroundClick($event)"
          @dragover.prevent="handleCanvasDragOver($event)"
          @drop.prevent="handleCanvasDrop($event)"
        >
          <div class="canvas-scene" :style="canvasSceneStyle">
            <div class="canvas-content" :style="canvasContentStyle">
              <svg class="edge-layer">
                <defs>
                  <marker
                    id="workflow-arrow"
                    markerWidth="12"
                    markerHeight="8"
                    refX="11"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 12 4 L 0 8 z" class="edge-arrow" />
                  </marker>
                </defs>
                <path
                  v-if="activeConnectPath"
                  class="edge-path edge-path-temporary"
                  :d="activeConnectPath"
                />
                <path
                  v-for="edge in edgeVisualList"
                  :key="edge.id"
                  class="edge-path"
                  :class="[
                    { selected: selectedEdgeId === edge.id },
                    {
                      'edge-path-connected': connectFeedback.edgeId === edge.id,
                    },
                  ]"
                  :d="toEdgePath(edge)"
                  marker-end="url(#workflow-arrow)"
                  @click.stop="selectedEdgeId = edge.id"
                />
              </svg>

              <article
                v-for="node in workflow.graph.nodes"
                :key="node.id"
                :ref="(element) => setNodeCardRef(node.id, element)"
                :data-node-id="node.id"
                class="flow-node-card"
                :class="[
                  { active: selectedNodeId === node.id },
                  {
                    'connect-ready':
                      connectDrag.active &&
                      connectDrag.sourceNodeId &&
                      connectDrag.sourceNodeId !== node.id,
                  },
                  {
                    'connect-hover': connectHoverNodeId === node.id,
                    'connect-feedback':
                      connectFeedback.sourceNodeId === node.id ||
                      connectFeedback.targetNodeId === node.id,
                  },
                  `status-${getNodeRuntimeStatusClass(node.id)}`,
                  getNodeCategoryClass(node.type),
                ]"
                :style="getNodeCardStyle(node)"
                @click.stop="handleNodeCardClick(node.id)"
                @mousedown.left.stop.prevent="
                  startNodeDrag(node, $event, canvasZoom)
                "
                @mouseup="handleNodeCardMouseUp(node.id)"
                @mouseenter="updateConnectHoverNode(node.id)"
                @mousemove="updateConnectHoverNode(node.id)"
                @mouseleave="updateConnectHoverNode(node.id, false)"
              >
                <div class="node-port-cluster node-port-cluster-in">
                  <span class="port-tag">IN</span>
                  <span
                    class="port port-in"
                    :title="getNodePortStatusLabel(node.id, 'in')"
                    @mouseup.stop.prevent="finishEdgeConnect(node.id)"
                  />
                </div>
                <div class="node-port-cluster node-port-cluster-out">
                  <span
                    class="port port-out"
                    :title="getNodePortStatusLabel(node.id, 'out')"
                    @mousedown.stop.prevent="startEdgeConnect(node.id, $event)"
                  />
                  <span class="port-tag">OUT</span>
                </div>

                <div class="node-header">
                  <div class="node-header-main">
                    <span class="node-badge">{{
                      getNodeBadge(node.type)
                    }}</span>
                    <div class="node-header-copy">
                      <div class="node-title-row">
                        <h4 class="node-name">{{ resolveNodeLabel(node) }}</h4>
                        <span
                          v-if="shouldShowNodeFamily(node)"
                          class="node-family"
                        >
                          {{ getNodeCategoryLabel(node.type) }}
                        </span>
                      </div>
                      <p v-if="shouldShowNodeType(node)" class="node-type">
                        {{ getNodeTypeDisplay(node.type) }}
                      </p>
                    </div>
                  </div>

                  <div class="node-toolbar">
                    <span
                      class="node-status-light"
                      :class="getNodeRuntimeStatusClass(node.id)"
                    />
                    <span
                      class="node-runtime-pill"
                      :class="getNodeRuntimeStatusClass(node.id)"
                    >
                      {{ getNodeRuntimeStatusLabel(node.id) }}
                    </span>
                    <button
                      type="button"
                      class="node-remove"
                      @click.stop="removeNode(node.id)"
                    >
                      ?
                    </button>
                  </div>
                </div>

                <div class="node-subline">
                  <span class="node-id" :title="node.id">
                    {{ formatNodeIdCompact(node.id) }}
                  </span>
                  <span class="node-chip subtle">
                    {{ getNodePortStatusLabel(node.id, "in") }}
                  </span>
                </div>

                <div class="node-params">
                  <template v-if="getNodeCardSummaryEntries(node).length">
                    <div
                      v-for="entry in getNodeCardSummaryEntries(node)"
                      :key="`${node.id}-${entry.key}`"
                      class="node-param"
                      :class="{
                        'is-path': entry.isPath,
                        expandable:
                          entry.isPath && entry.fullValue !== entry.value,
                      }"
                    >
                      <span class="node-param-key">{{ entry.label }}</span>
                      <strong class="node-param-value" :title="entry.fullValue">
                        {{ entry.value }}
                      </strong>
                      <span
                        v-if="entry.isPath && entry.fullValue !== entry.value"
                        class="node-param-popover"
                      >
                        {{ entry.fullValue }}
                      </span>
                    </div>
                  </template>
                  <div v-else class="node-param node-param-empty">
                    <span class="node-param-key">参数</span>
                    <strong class="node-param-value">待配置</strong>
                  </div>
                </div>

                <div class="node-footer">
                  <span class="node-chip">
                    {{ getNodePortStatusLabel(node.id, "out") }}
                  </span>
                </div>
              </article>

              <aside
                v-if="selectedNode && nodeInlineInspectorVisible"
                class="node-inline-panel"
                :style="nodeInlineInspectorStyle"
              >
                <div
                  class="node-inline-head"
                  :class="{
                    pinned: nodeInlineInspectorPinned,
                    dragging: nodeInlineInspectorDrag.active,
                  }"
                  @mousedown.left.stop.prevent="
                    startNodeInlineInspectorDrag($event)
                  "
                >
                  <div>
                    <strong>{{ resolveNodeLabel(selectedNode) }}</strong>
                    <small>{{ selectedNode.id }}</small>
                  </div>
                  <div class="node-inline-head-actions">
                    <button
                      type="button"
                      class="inline-head-btn"
                      :title="
                        nodeInlineInspectorPinned
                          ? '取消固定，改为跟随节点'
                          : '固定当前浮层位置'
                      "
                      @mousedown.stop
                      @click="toggleNodeInlineInspectorPin"
                    >
                      {{ nodeInlineInspectorPinned ? "解除固定" : "固定浮层" }}
                    </button>
                    <button
                      type="button"
                      class="inline-head-btn"
                      @mousedown.stop
                      @click="jumpToMainInspector(nodeInlineInspectorTab)"
                    >
                      &#36319;&#38543;
                    </button>
                    <button
                      type="button"
                      class="inline-head-btn close"
                      @mousedown.stop
                      @click="nodeInlineInspectorVisible = false"
                    >
                      &#215;
                    </button>
                  </div>
                </div>

                <div class="node-inline-tabs">
                  <button
                    type="button"
                    class="tab-btn"
                    :class="{ active: nodeInlineInspectorTab === 'config' }"
                    @click="nodeInlineInspectorTab = 'config'"
                  >
                    &#37197;&#32622;
                  </button>
                  <button
                    type="button"
                    class="tab-btn"
                    :class="{ active: nodeInlineInspectorTab === 'attrs' }"
                    @click="nodeInlineInspectorTab = 'attrs'"
                  >
                    &#23646;&#24615;
                  </button>
                  <button
                    type="button"
                    class="tab-btn"
                    :class="{ active: nodeInlineInspectorTab === 'runtime' }"
                    @click="nodeInlineInspectorTab = 'runtime'"
                  >
                    &#36816;&#34892;
                  </button>
                </div>

                <div
                  v-if="nodeInlineInspectorTab === 'config'"
                  class="node-inline-body node-inline-config-body"
                >
                  <div class="node-inline-meta">
                    <span>{{ getNodeTypeDisplay(selectedNode.type) }}</span>
                    <strong>{{ summarizeNodeConfig(selectedNode) }}</strong>
                  </div>

                  <div
                    v-if="isTranslateSubtitleNodeSelected"
                    class="special-form"
                  >
                    <label class="form-label"
                      >&#23383;&#24149;&#26684;&#24335;</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedTranslateNodeConfig.exePath"
                        class="input"
                        readonly
                        placeholder="&#35831;&#36873;&#25321; whisper &#24341;&#25806;&#21487;&#25191;&#34892;&#25991;&#20214;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickTranslateExePath"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <label class="form-label"
                      >&#23186;&#20307;&#30446;&#24405;</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedTranslateNodeConfig.targetPath"
                        class="input"
                        readonly
                        placeholder="&#35831;&#36873;&#25321;&#24453;&#32763;&#35793;&#23186;&#20307;&#30446;&#24405;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickTranslateTargetPath"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <label class="form-label"
                      >&#23383;&#24149;&#26684;&#24335;</label
                    >
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
                          @change="
                            toggleTranslateSubFormat(fmt, $event.target.checked)
                          "
                        />
                        <span class="format-pill">{{ fmt.toUpperCase() }}</span>
                      </label>
                    </div>
                  </div>

                  <div
                    v-else-if="isPackSubtitleNodeSelected"
                    class="special-form"
                  >
                    <label class="form-label"
                      >&#28304;&#30446;&#24405; (targetPath)</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedPackNodeConfig.targetPath"
                        class="input"
                        readonly
                        placeholder="&#35831;&#36873;&#25321;&#23383;&#24149;&#25152;&#22312;&#30446;&#24405;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickPackTargetPath"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <label class="form-label"
                      >&#36755;&#20986;&#30446;&#24405; (outputDir)</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedPackNodeConfig.outputDir"
                        class="input"
                        readonly
                        placeholder="&#21487;&#36873;&#65292;&#19981;&#22635;&#21017;&#20351;&#29992;&#28304;&#30446;&#24405;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickPackOutputPath"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <button
                      type="button"
                      class="bridge-btn ghost"
                      @click="patchPackNodeConfig({ outputDir: '' })"
                    >
                      &#36755;&#20986;&#30446;&#24405;&#36319;&#38543;&#28304;&#30446;&#24405;
                    </button>
                  </div>

                  <div
                    v-else-if="isUploadSubtitleNodeSelected"
                    class="special-form"
                  >
                    <label class="form-label"
                      >&#25195;&#25551;&#30446;&#24405; (scanPath)</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedUploadNodeConfig.scanPath"
                        class="input"
                        readonly
                        placeholder="&#35831;&#36873;&#25321;&#24453;&#25195;&#25551;&#21387;&#32553;&#21253;&#30446;&#24405;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickUploadScanDir"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <label class="form-label"
                      >&#39057;&#36947;
                      ID&#65288;&#21487;&#36873;&#65289;</label
                    >
                    <input
                      :value="selectedUploadNodeConfig.channelId"
                      class="input"
                      placeholder="&#19981;&#22635;&#21017;&#20351;&#29992;&#20840;&#23616;&#19978;&#20256;&#39057;&#36947;&#37197;&#32622;"
                      @input="updateUploadChannelId($event.target.value)"
                    />

                    <label class="form-label"
                      >&#26631;&#39064;&#28040;&#24687;&#21518;&#24310;&#36831;
                      titleDelayMs (ms)</label
                    >
                    <input
                      :value="selectedUploadNodeConfig.titleDelayMs"
                      class="input"
                      type="number"
                      min="0"
                      step="100"
                      @input="updateUploadTitleDelay($event.target.value)"
                    />

                    <label class="form-label"
                      >&#27599;&#25991;&#20214;&#38388;&#38548; betweenDelayMs
                      (ms)</label
                    >
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
                      <span
                        >&#25195;&#25551;&#20026;&#31354;&#26102;&#25353;&#22833;&#36133;&#22788;&#29702;</span
                      >
                    </label>
                  </div>

                  <div
                    v-else-if="isCloudDeleteRecentNodeSelected"
                    class="special-form"
                  >
                    <label class="form-label"
                      >&#26368;&#36817;&#19978;&#20256;&#25968;&#37327;
                      recentLimit</label
                    >
                    <input
                      :value="selectedCloudDeleteNodeConfig.recentLimit"
                      class="input"
                      type="number"
                      min="1"
                      step="1"
                      @input="updateCloudDeleteRecentLimit($event.target.value)"
                    />

                    <label class="form-label"
                      >&#21024;&#38500;&#25209;&#27425;&#22823;&#23567;
                      batchSize</label
                    >
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
                        :checked="
                          selectedCloudDeleteNodeConfig.refreshCloudFirst
                        "
                        type="checkbox"
                        @change="
                          patchCloudDeleteNodeConfig({
                            refreshCloudFirst: $event.target.checked,
                          })
                        "
                      />
                      <span
                        >&#21024;&#38500;&#21069;&#21047;&#26032;&#20113;&#31471;&#32531;&#23384;</span
                      >
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
                      <span
                        >&#26080;&#21305;&#37197;&#26102;&#25253;&#38169;</span
                      >
                    </label>
                  </div>

                  <div
                    v-else-if="isLocalDeleteScannedNodeSelected"
                    class="special-form"
                  >
                    <label class="form-label"
                      >&#25195;&#25551;&#30446;&#24405; (scanPath)</label
                    >
                    <div class="path-picker-row">
                      <input
                        :value="selectedLocalDeleteNodeConfig.scanPath"
                        class="input"
                        readonly
                        placeholder="&#35831;&#36873;&#25321;&#24453;&#28165;&#29702;&#30446;&#24405;"
                      />
                      <button
                        type="button"
                        class="bridge-btn ghost"
                        @click="pickLocalDeleteScanDir"
                      >
                        &#36873;&#25321;
                      </button>
                    </div>

                    <label class="form-label"
                      >&#25193;&#23637;&#21517;&#36807;&#28388;
                      (extensions)</label
                    >
                    <input
                      :value="selectedLocalDeleteNodeConfig.extensions"
                      class="input"
                      placeholder="&#20363;&#22914;: .zip,.rar,.7z"
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
                      <span
                        >&#25191;&#34892;&#21024;&#38500;&#65288;&#20851;&#38381;&#21017;&#20165;&#39044;&#35272;&#65289;</span
                      >
                    </label>
                  </div>

                  <template v-else>
                    <label class="form-label">JSON &#37197;&#32622;</label>
                    <textarea
                      v-model="selectedNodeConfigDraft"
                      class="input config-textarea inline-config-editor"
                      spellcheck="false"
                    />
                    <button
                      type="button"
                      class="bridge-btn launch"
                      @click="applyNodeConfigDraft"
                    >
                      &#24212;&#29992;&#33410;&#28857;&#37197;&#32622;
                    </button>
                  </template>

                  <div v-if="translateNodeConfigError" class="error-text">
                    {{ translateNodeConfigError }}
                  </div>
                </div>

                <div
                  v-else-if="nodeInlineInspectorTab === 'attrs'"
                  class="node-inline-body node-inline-body-attrs"
                >
                  <label class="form-label"
                    >&#33410;&#28857;&#23485;&#24230;</label
                  >
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

                  <label class="form-label"
                    >&#33410;&#28857;&#39640;&#24230;</label
                  >
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

                  <label class="form-label"
                    >&#23383;&#20307;&#22823;&#23567;</label
                  >
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

                <div v-else class="node-inline-body node-inline-body-runtime">
                  <div class="inline-runtime-grid">
                    <div class="runtime-kv-item compact">
                      <span>&#29366;&#24577;</span>
                      <strong>{{
                        getRunStatusLabel(
                          selectedNodeRunState?.status || "idle",
                        )
                      }}</strong>
                    </div>
                    <div class="runtime-kv-item compact">
                      <span>&#32791;&#26102;</span>
                      <strong>{{ selectedNodeRunDuration }}</strong>
                    </div>
                    <div class="runtime-kv-item compact">
                      <span>&#24320;&#22987;</span>
                      <strong>{{
                        formatTimestampLabel(selectedNodeRunState?.startedAt)
                      }}</strong>
                    </div>
                    <div class="runtime-kv-item compact">
                      <span>&#32467;&#26463;</span>
                      <strong>{{
                        formatTimestampLabel(selectedNodeRunState?.endedAt)
                      }}</strong>
                    </div>
                  </div>

                  <div class="runtime-section">
                    <div class="runtime-section-title">
                      &#33410;&#28857;&#26085;&#24535;
                    </div>
                    <pre class="run-console compact inline-log-console">{{
                      selectedNodeLogs.join("\\n") || "暂无节点日志"
                    }}</pre>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <aside class="canvas-navigator">
            <div class="navigator-head">
              <strong>&#23548;&#33322;&#22120;</strong>
              <span>{{ canvasZoomPercent }}%</span>
            </div>
            <div
              ref="minimapRef"
              class="navigator-map"
              :class="{ dragging: minimapDrag.active }"
              @pointerdown.stop.prevent="startMinimapDrag($event)"
              @pointermove.stop.prevent="moveMinimapDrag($event)"
              @pointerup.stop.prevent="stopMinimapDrag($event)"
              @pointercancel.stop.prevent="stopMinimapDrag($event)"
            >
              <div class="navigator-grid" />
              <span
                v-for="item in minimapNodes"
                :key="`mini-${item.id}`"
                class="navigator-node"
                :class="[
                  `status-${item.status}`,
                  { selected: item.id === selectedNodeId },
                ]"
                :style="item.style"
              />
              <span class="navigator-viewport" :style="minimapViewportStyle" />
            </div>
          </aside>
        </div>

        <section class="runtime-dock" :class="{ expanded: logDockExpanded }">
          <button
            type="button"
            class="dock-toggle"
            @click="logDockExpanded = !logDockExpanded"
          >
            {{
              logDockExpanded
                ? "\u6536\u8d77\u8fd0\u884c\u65e5\u5fd7"
                : "\u5c55\u5f00\u8fd0\u884c\u65e5\u5fd7"
            }}
          </button>

          <div v-if="logDockExpanded" class="dock-body">
            <div class="dock-toolbar">
              <div class="dock-tabs">
                <button
                  type="button"
                  class="dock-tab"
                  :class="{ active: logDockScope === 'workflow' }"
                  @click="logDockScope = 'workflow'"
                >
                  &#27969;&#31243;
                </button>
                <button
                  type="button"
                  class="dock-tab"
                  :class="{ active: logDockScope === 'node' }"
                  @click="logDockScope = 'node'"
                >
                  &#33410;&#28857;
                </button>
                <button
                  type="button"
                  class="dock-tab"
                  :class="{ active: logDockScope === 'pipeline' }"
                  @click="logDockScope = 'pipeline'"
                >
                  &#27969;&#27700;&#32447;
                </button>
              </div>
              <input
                v-model="dockLogKeyword"
                class="input dock-search"
                placeholder="&#20851;&#38190;&#23383;&#36807;&#28388;"
              />
            </div>

            <pre class="dock-console">{{
              dockFilteredLogLines.join("\n") || dockLogEmptyText
            }}</pre>
          </div>
        </section>
      </section>

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
              <div v-else class="empty-hint">请选择节点后编辑配置</div>

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
                      @change="
                        toggleTranslateSubFormat(fmt, $event.target.checked)
                      "
                    />
                    <span class="format-pill">{{ fmt.toUpperCase() }}</span>
                  </label>
                </div>
              </div>

              <div v-else-if="isPackSubtitleNodeSelected" class="special-form">
                <label class="form-label">源目录 (targetPath)</label>
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

                <label class="form-label">输出目录 (outputDir)</label>
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

              <div
                v-else-if="isUploadSubtitleNodeSelected"
                class="special-form"
              >
                <label class="form-label">扫描目录 (scanPath)</label>
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

                <label class="form-label">频道 ID（可选）</label>
                <input
                  :value="selectedUploadNodeConfig.channelId"
                  class="input"
                  placeholder="不填则使用全局上传频道配置"
                  @input="updateUploadChannelId($event.target.value)"
                />

                <label class="form-label"
                  >标题消息后延迟 titleDelayMs (ms)</label
                >
                <input
                  :value="selectedUploadNodeConfig.titleDelayMs"
                  class="input"
                  type="number"
                  min="0"
                  step="100"
                  @input="updateUploadTitleDelay($event.target.value)"
                />

                <label class="form-label">每文件间隔 betweenDelayMs (ms)</label>
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

              <div
                v-else-if="isCloudDeleteRecentNodeSelected"
                class="special-form"
              >
                <label class="form-label">最近上传数量 recentLimit</label>
                <input
                  :value="selectedCloudDeleteNodeConfig.recentLimit"
                  class="input"
                  type="number"
                  min="1"
                  step="1"
                  @input="updateCloudDeleteRecentLimit($event.target.value)"
                />

                <label class="form-label">删除批次大小 batchSize</label>
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
                <label class="form-label">扫描目录 (scanPath)</label>
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

                <label class="form-label">扩展名过滤 (extensions)</label>
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
                  应用节点配置
                </button>
              </template>

              <div v-if="translateNodeConfigError" class="error-text">
                {{ translateNodeConfigError }}
              </div>
            </div>

            <div
              v-else-if="inspectorTab === 'runtime'"
              class="tab-panel form-stack"
            >
              <label class="form-label">maxParallel</label>
              <input
                v-model.number="workflow.runtime.maxParallel"
                class="input"
                type="number"
                min="1"
                max="16"
              />

              <label class="form-label">timeoutMs</label>
              <input
                v-model.number="workflow.runtime.timeoutMs"
                class="input"
                type="number"
                min="0"
                step="100"
              />

              <label class="checkbox-inline">
                <input v-model="workflow.runtime.failFast" type="checkbox" />
                <span>failFast（节点失败即中断）</span>
              </label>

              <div class="runtime-divider" />

              <label class="form-label">调度模式 dispatchMode</label>
              <select v-model="runtimeDispatchMode" class="select">
                <option value="single">逐条串行（1 部 1 部发布）</option>
                <option value="batch">批处理（例如 50 部合并发）</option>
                <option value="fanout">并行扇出（分支同时执行）</option>
              </select>

              <label class="form-label">批次大小 batchSize</label>
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

              <div
                class="validation-box"
                :class="{ invalid: !validationState.ok }"
              >
                <div class="validation-status">
                  {{ validationState.ok ? "校验通过" : "校验未通过" }}
                </div>
                <ul
                  v-if="validationState.errors.length"
                  class="validation-list"
                >
                  <li v-for="err in validationState.errors" :key="err">
                    {{ err }}
                  </li>
                </ul>
                <ul
                  v-if="validationState.warnings.length"
                  class="validation-list warning"
                >
                  <li v-for="warn in validationState.warnings" :key="warn">
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
                  <span
                    class="node-run-status"
                    :class="selectedNodeRunStatusClass"
                  >
                    {{
                      getRunStatusLabel(selectedNodeRunState.status || "idle")
                    }}
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

              <div class="log-split-grid">
                <section class="log-panel">
                  <div class="history-title">流程日志</div>
                  <pre class="run-console">{{
                    workflowLogs.join("\n") || "暂无流程日志"
                  }}</pre>
                </section>

                <section class="log-panel">
                  <div class="history-title">节点日志</div>
                  <pre class="run-console">{{
                    selectedNodeLogs.join("\n") || "请选择节点查看节点日志"
                  }}</pre>
                </section>
              </div>

              <section class="log-panel">
                <div class="history-title">流水线日志</div>
                <pre class="run-console">{{
                  pipelineLogs.join("\n") || "暂无流水线日志"
                }}</pre>
              </section>
            </div>

            <div v-else class="tab-panel form-stack">
              <div v-if="selectedNode" class="node-attr-card">
                <div class="config-meta">
                  <strong>{{ resolveNodeLabel(selectedNode) }}</strong>
                  <small>{{ selectedNode.id }}</small>
                </div>

                <div class="attr-grid">
                  <label class="form-label"
                    >&#33410;&#28857;&#23485;&#24230;</label
                  >
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

                  <label class="form-label"
                    >&#33410;&#28857;&#39640;&#24230;</label
                  >
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

                  <label class="form-label"
                    >&#23383;&#20307;&#22823;&#23567;</label
                  >
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
                  <strong
                    >&#33410;&#28857;&#21345;&#29255;&#23610;&#23544;</strong
                  >
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
                <strong
                  >&#27969;&#27700;&#32447;&#39044;&#30041;&#20301;</strong
                >
                <p>
                  &#24403;&#21069;&#24050;&#25286;&#20998;&#27969;&#31243;&#26085;&#24535;
                  / &#33410;&#28857;&#26085;&#24535; /
                  &#27969;&#27700;&#32447;&#26085;&#24535;&#65292;&#21518;&#32493;&#25509;&#20837;&#27969;&#27700;&#32447;&#32534;&#25490;&#26102;&#21487;&#30452;&#25509;&#22797;&#29992;&#12290;
                </p>
              </div>

              <div class="history-title">&#36816;&#34892;&#21382;&#21490;</div>
              <div class="run-history">
                <div
                  v-for="run in runHistory"
                  :key="run.runId"
                  class="run-item"
                >
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
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { selectFile } from "../api/dialogApi";
import WorkflowBridgeDrawer from "./workflow/WorkflowBridgeDrawer.vue";
import WorkflowLibraryDrawer from "./workflow/WorkflowLibraryDrawer.vue";
import { useWorkflowDesigner } from "../composables/useWorkflowDesigner";

const TRANSLATE_SUBTITLE_NODE_TYPE = "whisper.translateSubtitles";
const PACK_SUBTITLE_NODE_TYPE = "whisper.packSubtitles";
const UPLOAD_SUBTITLE_NODE_TYPE = "tg.uploadSubtitles";
const CLOUD_DELETE_RECENT_NODE_TYPE = "asmr.cloudDeleteRecentUploads";
const LOCAL_DELETE_SCANNED_NODE_TYPE = "files.localDeleteScanned";
const subtitleFormatOptions = ["lrc", "srt", "vtt"];

const message = useMessage();

const {
  workflow,
  workflowSummaries,
  nodePaletteGroups,
  runHistory,
  activeRunId,
  activeRunStatus,
  runProgress,
  workflowLogs,
  pipelineLogs,
  selectedNodeLogs,
  selectedNodeRunState,
  runNodeStates,
  totalWorksDisplay,
  completedWorksDisplay,
  inProgressWorksDisplay,
  remainingWorksDisplay,
  isRunInProgress,
  isSaving,
  isValidating,
  selectedNodeId,
  selectedEdgeId,
  selectedNode,
  selectedNodeConfigDraft,
  selectedNodeConfigError,
  sourceNodeId,
  targetNodeId,
  currentNodeOptions,
  validationState,
  edgeVisualList,
  canvasRef,
  createNewWorkflow,
  loadWorkflowById,
  saveCurrentWorkflow,
  validateCurrentWorkflow,
  removeWorkflowById,
  addNodeByType,
  selectNode,
  removeNode,
  addEdge,
  removeSelectedEdge,
  applyNodeConfigDraft,
  startRun,
  cancelRun,
  startNodeDrag,
  handleCanvasMouseMove,
  stopNodeDrag,
} = useWorkflowDesigner({ message });

const nodeSearchKeyword = ref("");
const nodePickerKeyword = ref("");
const nodePickerStatusFilter = ref("all");
const inspectorTab = ref("config");
const MIN_CANVAS_ZOOM = 0.6;
const MAX_CANVAS_ZOOM = 1.8;
const BASE_CANVAS_WIDTH = 3200;
const BASE_CANVAS_HEIGHT = 2000;
const DEFAULT_NODE_WIDTH = 238;
const DEFAULT_NODE_HEIGHT = 128;
const DEFAULT_NODE_FONT_SIZE = 16;
const MIN_NODE_WIDTH = 160;
const MAX_NODE_WIDTH = 760;
const MIN_NODE_HEIGHT = 96;
const MAX_NODE_HEIGHT = 520;
const MIN_NODE_FONT_SIZE = 12;
const MAX_NODE_FONT_SIZE = 28;
const NODE_INLINE_PANEL_WIDTH = 308;
const NODE_INLINE_PANEL_HEIGHT = 286;
const NODE_INLINE_PANEL_RUNTIME_HEIGHT = 368;
const canvasZoom = ref(1);
const bridgeBarCollapsed = ref(false);
const leftDockCollapsed = ref(false);
const nodeInlineInspectorVisible = ref(false);
const nodeInlineInspectorTab = ref("config");
const nodeInlineInspectorPinned = ref(false);
const WIDE_CANVAS_BREAKPOINT = 1280;
const prefersInlineInspector = ref(false);
const nodeInlineInspectorManualPosition = ref({
  left: null,
  top: null,
});
const nodeInlineInspectorDrag = ref({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const nodeCardElementMap = new Map();
let nodeHeightSyncScheduled = false;
let nodeCardResizeObserver = null;

const clampNodeWidth = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_WIDTH;
  }
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Math.round(parsed)));
};

const clampNodeHeight = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_HEIGHT;
  }
  return Math.min(
    MAX_NODE_HEIGHT,
    Math.max(MIN_NODE_HEIGHT, Math.round(parsed)),
  );
};

const resolveNodeDimensions = (node) => ({
  width: clampNodeWidth(node?.size?.width),
  height: clampNodeHeight(node?.size?.height),
});

const clampNodeFontSize = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_FONT_SIZE;
  }
  return Math.min(
    MAX_NODE_FONT_SIZE,
    Math.max(MIN_NODE_FONT_SIZE, Math.round(parsed)),
  );
};

const resolveNodeFontSize = (node) =>
  clampNodeFontSize(node?.appearance?.fontSize);

const ensureNodeCardResizeObserver = () => {
  if (nodeCardResizeObserver || typeof ResizeObserver === "undefined") {
    return;
  }

  nodeCardResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const nodeId = entry.target?.dataset?.nodeId || "";
      if (!nodeId) {
        return;
      }
      syncSingleNodeDimensions(nodeId, entry.contentRect?.height);
    });
  });
};

const setNodeCardRef = (nodeId, element) => {
  if (!nodeId) {
    return;
  }

  ensureNodeCardResizeObserver();
  const previousElement = nodeCardElementMap.get(nodeId);
  if (previousElement && previousElement !== element) {
    nodeCardResizeObserver?.unobserve(previousElement);
  }

  if (element) {
    nodeCardElementMap.set(nodeId, element);
    nodeCardResizeObserver?.observe(element);
    return;
  }

  if (previousElement) {
    nodeCardResizeObserver?.unobserve(previousElement);
  }
  nodeCardElementMap.delete(nodeId);
};

const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 132;
const logDockExpanded = ref(true);
const logDockScope = ref("workflow");
const dockLogKeyword = ref("");
const spacePanPressed = ref(false);
const canvasPan = ref({
  active: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startScrollLeft: 0,
  startScrollTop: 0,
});
const connectDrag = ref({
  active: false,
  sourceNodeId: "",
  x: 0,
  y: 0,
});
const libraryDragNodeType = ref("");
const connectHoverNodeId = ref("");
const connectFeedback = ref({
  edgeId: "",
  sourceNodeId: "",
  targetNodeId: "",
});
let connectFeedbackTimer = null;
const minimapRef = ref(null);
const minimapMetrics = ref({
  width: MINIMAP_WIDTH,
  height: MINIMAP_HEIGHT,
});
const minimapDrag = ref({
  active: false,
  offsetX: 0,
  offsetY: 0,
  pointerId: null,
});
const canvasViewport = ref({
  x: 0,
  y: 0,
  width: BASE_CANVAS_WIDTH,
  height: BASE_CANVAS_HEIGHT,
});
const canvasZoomPercent = computed(() => Math.round(canvasZoom.value * 100));
const canvasSceneStyle = computed(() => ({
  width: `${Math.round(BASE_CANVAS_WIDTH * canvasZoom.value)}px`,
  height: `${Math.round(BASE_CANVAS_HEIGHT * canvasZoom.value)}px`,
}));
const canvasContentStyle = computed(() => ({
  width: `${BASE_CANVAS_WIDTH}px`,
  height: `${BASE_CANVAS_HEIGHT}px`,
  transform: `scale(${canvasZoom.value})`,
  transformOrigin: "top left",
}));

const updateResponsiveWorkflowChrome = () => {
  if (typeof window === "undefined") {
    return;
  }

  prefersInlineInspector.value = window.innerWidth >= WIDE_CANVAS_BREAKPOINT;
  if (prefersInlineInspector.value) {
    return;
  }

  nodeInlineInspectorVisible.value = false;
  nodeInlineInspectorPinned.value = false;
  nodeInlineInspectorManualPosition.value = {
    left: null,
    top: null,
  };
};

const clampCanvasZoom = (value) =>
  Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));

const applyCanvasZoom = (nextZoom, event = null) => {
  const canvas = canvasRef.value;
  const safeNextZoom = clampCanvasZoom(nextZoom);
  if (!canvas || safeNextZoom === canvasZoom.value) {
    return;
  }

  if (!event) {
    canvasZoom.value = safeNextZoom;
    nextTick(() => {
      updateCanvasViewport();
    });
    return;
  }

  const currentZoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
  const rect = canvas.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const sceneX = (pointerX + canvas.scrollLeft) / currentZoom;
  const sceneY = (pointerY + canvas.scrollTop) / currentZoom;

  canvasZoom.value = safeNextZoom;

  nextTick(() => {
    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    canvas.scrollLeft = Math.max(0, sceneX * zoom - pointerX);
    canvas.scrollTop = Math.max(0, sceneY * zoom - pointerY);
    updateCanvasViewport();
  });
};

const zoomIn = () => {
  applyCanvasZoom(Math.round((canvasZoom.value + 0.1) * 100) / 100);
};

const zoomOut = () => {
  applyCanvasZoom(Math.round((canvasZoom.value - 0.1) * 100) / 100);
};

const handleCanvasWheel = (event) => {
  if (!event?.ctrlKey) {
    return;
  }

  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.08 : 0.92;
  const next =
    Math.round(clampCanvasZoom(canvasZoom.value * factor) * 100) / 100;
  applyCanvasZoom(next, event);
};

const isTextInputElement = (target) => {
  if (!(target instanceof Element)) {
    return false;
  }

  const tagName = target.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable === true
  );
};

const resetCanvasPanState = () => {
  const canvas = canvasRef.value;
  if (
    canvas &&
    canvasPan.value.active &&
    Number.isFinite(canvasPan.value.pointerId)
  ) {
    try {
      canvas.releasePointerCapture(canvasPan.value.pointerId);
    } catch {
      // Ignore release errors when pointer capture was already cleared.
    }
  }

  canvasPan.value = {
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  };
};

const handleGlobalKeyDown = (event) => {
  if (event?.code !== "Space" || isTextInputElement(event.target)) {
    return;
  }

  spacePanPressed.value = true;
  event.preventDefault();
};

const handleGlobalKeyUp = (event) => {
  if (event?.code !== "Space") {
    return;
  }

  spacePanPressed.value = false;
};

const handleWindowBlur = () => {
  spacePanPressed.value = false;
  resetCanvasPanState();
  stopNodeDrag();
  stopNodeInlineInspectorDrag();
  stopMinimapDrag();
};

const isPanBlockedTarget = (target) => {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      ".flow-node-card, .port, .edge-path, .canvas-navigator, .node-inline-panel, button, input, select, textarea",
    ),
  );
};

const handleCanvasPanStart = (event) => {
  const canvas = canvasRef.value;
  if (!canvas || !event || canvasPan.value.active) {
    return;
  }

  const isMiddleButton = event.button === 1;
  const isSpaceDrag = event.button === 0 && spacePanPressed.value;
  const isBackgroundDrag =
    event.button === 0 &&
    !spacePanPressed.value &&
    !isPanBlockedTarget(event.target);
  if (!isMiddleButton && !isSpaceDrag && !isBackgroundDrag) {
    return;
  }

  canvasPan.value = {
    active: true,
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: canvas.scrollLeft,
    startScrollTop: canvas.scrollTop,
  };

  if (Number.isFinite(event.pointerId) && canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture errors on unsupported environments.
    }
  }

  stopNodeDrag();
  cancelEdgeConnect();
  event.preventDefault();
};

const handleCanvasPanMove = (event) => {
  if (!canvasPan.value.active || !canvasRef.value || !event) {
    return;
  }

  if (
    Number.isFinite(canvasPan.value.pointerId) &&
    Number.isFinite(event.pointerId) &&
    event.pointerId !== canvasPan.value.pointerId
  ) {
    return;
  }

  const canvas = canvasRef.value;
  const deltaX = event.clientX - canvasPan.value.startClientX;
  const deltaY = event.clientY - canvasPan.value.startClientY;

  canvas.scrollLeft = Math.max(0, canvasPan.value.startScrollLeft - deltaX);
  canvas.scrollTop = Math.max(0, canvasPan.value.startScrollTop - deltaY);
  updateCanvasViewport();
  event.preventDefault();
};

const handleCanvasPanEnd = (event = null) => {
  if (!canvasPan.value.active) {
    return;
  }

  if (
    event &&
    Number.isFinite(canvasPan.value.pointerId) &&
    Number.isFinite(event.pointerId) &&
    event.pointerId !== canvasPan.value.pointerId
  ) {
    return;
  }

  resetCanvasPanState();
};

const inspectorTabs = [
  { label: "配置", value: "config" },
  { label: "运行", value: "runtime" },
  { label: "输出", value: "output" },
  { label: "属性", value: "attrs" },
];

const dispatchModeLabelMap = {
  single: "逐条推进",
  batch: "批次派发",
  fanout: "并行扩散",
};

const categoryLabelMap = {
  whisper: "翻译字幕",
  tg: "上传",
  clean: "清理",
  asmr: "云端",
  input: "输入",
  file: "文件",
  util: "处理",
  output: "输出",
  files: "资源",
  tools: "工具",
  other: "其他",
};

const nodeCategorySet = new Set([
  "whisper",
  "tg",
  "asmr",
  "files",
  "file",
  "tools",
  "input",
  "util",
  "output",
  "clean",
]);

const nodeCategoryAccentMap = {
  whisper: "#5fc7d6",
  tg: "#8fd18f",
  asmr: "#e18473",
  files: "#d8a85b",
  file: "#d8a85b",
  tools: "#78d7cb",
  util: "#b69ccf",
  input: "#4ec9c3",
  output: "#e8ba6e",
  clean: "#da6f79",
  other: "#d9c3a2",
};

const nodeTypeAccentMap = {
  "whisper.translateSubtitles": "#58d2cf",
  "whisper.packSubtitles": "#e0a34c",
  "tg.uploadSubtitles": "#97d48c",
  "asmr.cloudDeleteRecentUploads": "#db6d77",
  "files.localDeleteScanned": "#c6a2df",
};

const resolveNodeCategoryKey = (nodeType) => {
  const [prefix = "other"] = String(nodeType || "")
    .toLowerCase()
    .split(".");
  return nodeCategorySet.has(prefix) ? prefix : "other";
};

const getNodeCategoryAccent = (nodeType) =>
  nodeTypeAccentMap[String(nodeType || "")] ||
  nodeCategoryAccentMap[resolveNodeCategoryKey(nodeType)] ||
  nodeCategoryAccentMap.other;

const getNodeCategoryClass = (nodeType) =>
  `cat-${resolveNodeCategoryKey(nodeType)}`;

const getNodeCategoryLabel = (nodeType) =>
  getCategoryLabel(resolveNodeCategoryKey(nodeType));

const shouldShowNodeType = (node) => {
  const typeLabel = getNodeTypeDisplay(node?.type || "");
  const nodeLabel = resolveNodeLabel(node);
  return Boolean(typeLabel) && typeLabel !== nodeLabel;
};

const shouldShowNodeFamily = (node) => {
  const familyLabel = getNodeCategoryLabel(node?.type || "");
  const typeLabel = getNodeTypeDisplay(node?.type || "");
  const nodeLabel = resolveNodeLabel(node);
  return (
    Boolean(familyLabel) &&
    familyLabel !== nodeLabel &&
    familyLabel !== typeLabel
  );
};

const formatNodeIdCompact = (nodeId) => {
  const value = String(nodeId || "");
  if (!value) {
    return "未分配 ID";
  }
  if (value.length <= 20) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
};

const estimateNodeCardWidth = (node) => {
  const summaryEntries = getNodeCardSummaryEntries(node);
  const summaryWidthScore = summaryEntries.reduce((maxValue, entry) => {
    const entryScore = `${entry.label}${entry.value}`.length;
    return Math.max(maxValue, entryScore);
  }, 0);

  const textWidthScore = Math.max(
    resolveNodeLabel(node).length + getNodeCategoryLabel(node.type).length,
    getNodeTypeDisplay(node.type).length,
    formatNodeIdCompact(node.id).length,
    summaryWidthScore,
  );

  return clampNodeWidth(210 + Math.max(0, textWidthScore - 10) * 9);
};

const estimateAdaptiveNodeFontSize = (node) => {
  const baseFontSize = resolveNodeFontSize(node);
  const size = resolveNodeDimensions(node);
  const widthGrowth = Math.max(0, size.width - DEFAULT_NODE_WIDTH);
  const heightGrowth = Math.max(0, size.height - DEFAULT_NODE_HEIGHT);
  const widthBonus =
    widthGrowth > 0 ? Math.max(1, Math.round(widthGrowth / 72)) : 0;
  const heightBonus =
    heightGrowth > 0 ? Math.max(1, Math.round(heightGrowth / 110)) : 0;
  const adaptiveBonus = Math.min(6, widthBonus + heightBonus);

  return clampNodeFontSize(baseFontSize + adaptiveBonus);
};

const getNodeCardStyle = (node) => {
  const size = resolveNodeDimensions(node);
  const fontSize = estimateAdaptiveNodeFontSize(node);
  return {
    width: `${size.width}px`,
    left: `${node.position.x}px`,
    top: `${node.position.y}px`,
    "--node-width": `${size.width}px`,
    "--node-height": `${size.height}px`,
    "--node-name-size": `${fontSize}px`,
    "--node-type-size": `${Math.max(11, Math.round(fontSize * 0.72))}px`,
    "--node-config-size": `${Math.max(11, Math.round(fontSize * 0.78))}px`,
    "--node-pill-size": `${Math.max(10, Math.round(fontSize * 0.66))}px`,
    "--node-badge-size": `${Math.max(10, Math.round(fontSize * 0.7))}px`,
    "--node-accent": getNodeCategoryAccent(node.type),
  };
};

const selectedNodeDimensions = computed(() =>
  resolveNodeDimensions(selectedNode.value),
);
const selectedNodeFontSize = computed(() =>
  resolveNodeFontSize(selectedNode.value),
);
const selectedNodeWidthDraft = ref("");
const selectedNodeHeightDraft = ref("");
const selectedNodeFontSizeDraft = ref("");

const syncSelectedNodeEditorDrafts = () => {
  selectedNodeWidthDraft.value = String(selectedNodeDimensions.value.width);
  selectedNodeHeightDraft.value = String(selectedNodeDimensions.value.height);
  selectedNodeFontSizeDraft.value = String(selectedNodeFontSize.value);
};

watch(
  selectedNodeId,
  () => {
    syncSelectedNodeEditorDrafts();
    if (!nodeInlineInspectorPinned.value) {
      nodeInlineInspectorManualPosition.value = {
        left: null,
        top: null,
      };
    }
  },
  { immediate: true },
);

const updateSelectedNodeSize = (axis, rawValue) => {
  if (!selectedNode.value) {
    return;
  }

  const currentSize = resolveNodeDimensions(selectedNode.value);
  selectedNode.value.size = {
    width: axis === "width" ? clampNodeWidth(rawValue) : currentSize.width,
    height: axis === "height" ? clampNodeHeight(rawValue) : currentSize.height,
  };
};

const applyNodeSizePreset = (width, height) => {
  if (!selectedNode.value) {
    return;
  }

  selectedNode.value.size = {
    width: clampNodeWidth(width),
    height: clampNodeHeight(height),
  };
  syncSelectedNodeEditorDrafts();
};

const commitSelectedNodeSize = (axis) => {
  if (axis === "width") {
    updateSelectedNodeSize("width", selectedNodeWidthDraft.value);
  } else {
    updateSelectedNodeSize("height", selectedNodeHeightDraft.value);
  }
  syncSelectedNodeEditorDrafts();
};

const updateSelectedNodeFontSize = (rawValue) => {
  if (!selectedNode.value) {
    return;
  }

  selectedNode.value.appearance = {
    ...selectedNode.value.appearance,
    fontSize: clampNodeFontSize(rawValue),
  };
};

const commitSelectedNodeFontSize = () => {
  updateSelectedNodeFontSize(selectedNodeFontSizeDraft.value);
  syncSelectedNodeEditorDrafts();
};

const applyNodeFontSizePreset = (fontSize) => {
  updateSelectedNodeFontSize(fontSize);
  syncSelectedNodeEditorDrafts();
};

const getNodeInlineInspectorHeight = () =>
  nodeInlineInspectorTab.value === "runtime"
    ? NODE_INLINE_PANEL_RUNTIME_HEIGHT
    : nodeInlineInspectorTab.value === "attrs"
      ? NODE_INLINE_PANEL_HEIGHT
      : NODE_INLINE_PANEL_HEIGHT - 32;

const clampNodeInlineInspectorPosition = (left, top) => {
  const panelHeight = getNodeInlineInspectorHeight();
  return {
    left: Math.max(
      18,
      Math.min(
        BASE_CANVAS_WIDTH - NODE_INLINE_PANEL_WIDTH - 18,
        Math.round(left),
      ),
    ),
    top: Math.max(
      18,
      Math.min(BASE_CANVAS_HEIGHT - panelHeight - 18, Math.round(top)),
    ),
  };
};

const resolveNodeInlineInspectorAutoPosition = () => {
  if (!selectedNode.value) {
    return {
      left: 18,
      top: 18,
    };
  }

  const node = selectedNode.value;
  const size = resolveNodeDimensions(node);
  const panelHeight = getNodeInlineInspectorHeight();
  const canOpenRight =
    node.position.x + size.width + 18 + NODE_INLINE_PANEL_WIDTH <
    BASE_CANVAS_WIDTH - 24;
  const left = canOpenRight
    ? node.position.x + size.width + 18
    : node.position.x - NODE_INLINE_PANEL_WIDTH - 18;
  const top = Math.max(
    18,
    Math.min(BASE_CANVAS_HEIGHT - panelHeight - 18, node.position.y - 6),
  );

  return clampNodeInlineInspectorPosition(left, top);
};

const startNodeInlineInspectorDrag = (event) => {
  if (!selectedNode.value || event?.button !== 0) {
    return;
  }

  if (event.target instanceof Element && event.target.closest("button")) {
    return;
  }

  const pointer = resolveCanvasPointerFromEvent(event);
  const origin = nodeInlineInspectorPinned.value
    ? nodeInlineInspectorManualPosition.value.left !== null
      ? nodeInlineInspectorManualPosition.value
      : resolveNodeInlineInspectorAutoPosition()
    : resolveNodeInlineInspectorAutoPosition();

  nodeInlineInspectorPinned.value = true;
  nodeInlineInspectorManualPosition.value = {
    left: origin.left,
    top: origin.top,
  };
  nodeInlineInspectorDrag.value = {
    active: true,
    offsetX: pointer.x - origin.left,
    offsetY: pointer.y - origin.top,
  };
};

const moveNodeInlineInspectorDrag = (event) => {
  if (!nodeInlineInspectorDrag.value.active) {
    return;
  }

  const pointer = resolveCanvasPointerFromEvent(event);
  nodeInlineInspectorManualPosition.value = clampNodeInlineInspectorPosition(
    pointer.x - nodeInlineInspectorDrag.value.offsetX,
    pointer.y - nodeInlineInspectorDrag.value.offsetY,
  );
};

const stopNodeInlineInspectorDrag = () => {
  if (!nodeInlineInspectorDrag.value.active) {
    return;
  }

  nodeInlineInspectorDrag.value = {
    active: false,
    offsetX: 0,
    offsetY: 0,
  };
};

const toggleNodeInlineInspectorPin = () => {
  if (nodeInlineInspectorPinned.value) {
    nodeInlineInspectorPinned.value = false;
    nodeInlineInspectorManualPosition.value = {
      left: null,
      top: null,
    };
    return;
  }

  const autoPosition = resolveNodeInlineInspectorAutoPosition();
  nodeInlineInspectorPinned.value = true;
  nodeInlineInspectorManualPosition.value = autoPosition;
};

const nodeInlineInspectorStyle = computed(() => {
  const position =
    nodeInlineInspectorPinned.value &&
    nodeInlineInspectorManualPosition.value.left !== null &&
    nodeInlineInspectorManualPosition.value.top !== null
      ? clampNodeInlineInspectorPosition(
          nodeInlineInspectorManualPosition.value.left,
          nodeInlineInspectorManualPosition.value.top,
        )
      : resolveNodeInlineInspectorAutoPosition();

  return {
    left: `${position.left}px`,
    top: `${position.top}px`,
    width: `${NODE_INLINE_PANEL_WIDTH}px`,
  };
});

const jumpToMainInspector = (tab = "config") => {
  inspectorTab.value = tab;
  nodeInlineInspectorVisible.value = false;
};

const filteredNodePaletteGroups = computed(() => {
  const keyword = nodeSearchKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return nodePaletteGroups.value;
  }

  return nodePaletteGroups.value
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const target = `${item.label || ""} ${item.type || ""}`.toLowerCase();
        return target.includes(keyword);
      }),
    }))
    .filter((group) => group.items.length > 0);
});

const libraryDrawerGroups = computed(() =>
  filteredNodePaletteGroups.value.map((group) => ({
    ...group,
    displayLabel: getCategoryLabel(group.category),
    items: group.items.map((item) => ({
      ...item,
      badge: getNodeBadge(item.type),
    })),
  })),
);

const handleNodeCardClick = (nodeId) => {
  selectNode(nodeId);
  inspectorTab.value = "config";
  nodeInlineInspectorVisible.value = prefersInlineInspector.value;
  nodeInlineInspectorTab.value = "config";
};

const focusNodeFromPicker = (nodeId) => {
  handleNodeCardClick(nodeId);
};

const assignSourceNode = (nodeId) => {
  sourceNodeId.value = nodeId;
  if (targetNodeId.value === nodeId) {
    targetNodeId.value = "";
  }
};

const assignTargetNode = (nodeId) => {
  targetNodeId.value = nodeId;
  if (sourceNodeId.value === nodeId) {
    sourceNodeId.value = "";
  }
};

const autoArrangeNodes = () => {
  const nodes = workflow.value?.graph?.nodes || [];
  const edges = workflow.value?.graph?.edges || [];
  if (!nodes.length) {
    return;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const layerByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return;
    }
    outgoing.get(edge.source).push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue = nodes
    .filter((node) => (inDegree.get(node.id) || 0) === 0)
    .sort((left, right) => left.position.y - right.position.y)
    .map((node) => node.id);

  const visited = new Set();
  while (queue.length) {
    const nodeId = queue.shift();
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const nextLayer = layerByNodeId.get(nodeId) || 0;

    (outgoing.get(nodeId) || []).forEach((targetId) => {
      layerByNodeId.set(
        targetId,
        Math.max(layerByNodeId.get(targetId) || 0, nextLayer + 1),
      );
      inDegree.set(targetId, (inDegree.get(targetId) || 1) - 1);
      if ((inDegree.get(targetId) || 0) <= 0) {
        queue.push(targetId);
      }
    });
  }

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((left, right) => left.position.x - right.position.x)
    .forEach((node, index) => {
      layerByNodeId.set(node.id, index);
    });

  const columns = new Map();
  nodes.forEach((node) => {
    const layer = layerByNodeId.get(node.id) || 0;
    if (!columns.has(layer)) {
      columns.set(layer, []);
    }
    columns.get(layer).push(node);
  });

  const orderedLayers = Array.from(columns.keys()).sort(
    (left, right) => left - right,
  );
  const baseX = 72;
  const baseY = 88;
  const gapX = 96;
  const gapY = 56;
  let cursorX = baseX;

  orderedLayers.forEach((layer) => {
    const columnNodes = columns
      .get(layer)
      .slice()
      .sort((left, right) => left.position.y - right.position.y);
    let cursorY = baseY;
    let columnWidth = 0;

    columnNodes.forEach((node) => {
      const size = resolveNodeDimensions(node);
      node.position.x = cursorX;
      node.position.y = cursorY;
      cursorY += size.height + gapY;
      columnWidth = Math.max(columnWidth, size.width);
    });

    cursorX += columnWidth + gapX;
  });

  nextTick(() => {
    updateCanvasViewport();
    updateMinimapMetrics();
  });
};

const handleLibraryNodeDragStart = (nodeType) => {
  libraryDragNodeType.value = typeof nodeType === "string" ? nodeType : "";
};

const resolveNodeTypeFromDropEvent = (event) => {
  const draggedType =
    event?.dataTransfer?.getData("application/x-workflow-node-type") ||
    libraryDragNodeType.value;
  return typeof draggedType === "string" ? draggedType : "";
};

const handleCanvasDragOver = (event) => {
  const draggedType = resolveNodeTypeFromDropEvent(event);
  if (!draggedType) {
    return;
  }

  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
};

const handleCanvasDrop = (event) => {
  const nodeType = resolveNodeTypeFromDropEvent(event);
  if (!nodeType) {
    return;
  }

  const pointer = resolveCanvasPointerFromEvent(event);
  const createdNode = addNodeByType(nodeType, {
    position: {
      x: pointer.x - DEFAULT_NODE_WIDTH / 2,
      y: pointer.y - DEFAULT_NODE_HEIGHT / 2,
    },
  });
  if (createdNode?.id) {
    handleNodeCardClick(createdNode.id);
  }
  libraryDragNodeType.value = "";
};

const resolveCanvasPointerFromEvent = (event) => {
  if (!canvasRef.value || !event) {
    return { x: 0, y: 0 };
  }

  const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left + canvasRef.value.scrollLeft) / zoom,
    y: (event.clientY - rect.top + canvasRef.value.scrollTop) / zoom,
  };
};

const connectPreviewTargetNode = computed(() => {
  if (!connectDrag.value.active || !connectHoverNodeId.value) {
    return null;
  }

  if (connectHoverNodeId.value === connectDrag.value.sourceNodeId) {
    return null;
  }

  return (
    workflow.value.graph.nodes.find(
      (node) => node.id === connectHoverNodeId.value,
    ) || null
  );
});

const connectSourcePoint = computed(() => {
  if (!connectDrag.value.active || !connectDrag.value.sourceNodeId) {
    return null;
  }

  const sourceNode = workflow.value.graph.nodes.find(
    (node) => node.id === connectDrag.value.sourceNodeId,
  );
  if (!sourceNode) {
    return null;
  }

  const sourceSize = resolveNodeDimensions(sourceNode);

  return {
    x: sourceNode.position.x + sourceSize.width,
    y: sourceNode.position.y + sourceSize.height / 2,
  };
});

const activeConnectPath = computed(() => {
  const start = connectSourcePoint.value;
  if (!start || !connectDrag.value.active) {
    return "";
  }

  const previewNode = connectPreviewTargetNode.value;
  const previewNodeSize = previewNode
    ? resolveNodeDimensions(previewNode)
    : null;
  const end = previewNode
    ? {
        x: previewNode.position.x,
        y: previewNode.position.y + previewNodeSize.height / 2,
      }
    : {
        x: connectDrag.value.x,
        y: connectDrag.value.y,
      };
  const distance = Math.max(56, Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
});

const cancelEdgeConnect = () => {
  if (!connectDrag.value.active) {
    return;
  }

  connectDrag.value = {
    active: false,
    sourceNodeId: "",
    x: 0,
    y: 0,
  };
  connectHoverNodeId.value = "";
};

const startEdgeConnect = (nodeId, event) => {
  if (!nodeId) {
    return;
  }

  const pointer = resolveCanvasPointerFromEvent(event);
  connectDrag.value = {
    active: true,
    sourceNodeId: nodeId,
    x: pointer.x,
    y: pointer.y,
  };
  connectHoverNodeId.value = "";
  selectedNodeId.value = nodeId;
};

const updateEdgeConnectPointer = (event) => {
  if (!connectDrag.value.active) {
    return;
  }

  const pointer = resolveCanvasPointerFromEvent(event);
  connectDrag.value = {
    ...connectDrag.value,
    x: pointer.x,
    y: pointer.y,
  };
};

const triggerConnectFeedback = (edgeId, sourceId, targetId) => {
  if (connectFeedbackTimer) {
    clearTimeout(connectFeedbackTimer);
    connectFeedbackTimer = null;
  }

  connectFeedback.value = {
    edgeId,
    sourceNodeId: sourceId,
    targetNodeId: targetId,
  };

  connectFeedbackTimer = setTimeout(() => {
    connectFeedback.value = {
      edgeId: "",
      sourceNodeId: "",
      targetNodeId: "",
    };
    connectFeedbackTimer = null;
  }, 900);
};

const updateConnectHoverNode = (nodeId, isInside = true) => {
  if (!connectDrag.value.active) {
    return;
  }

  if (!isInside || nodeId === connectDrag.value.sourceNodeId) {
    if (connectHoverNodeId.value === nodeId || !nodeId) {
      connectHoverNodeId.value = "";
    }
    return;
  }

  connectHoverNodeId.value = nodeId;
};

const finishEdgeConnect = (nodeId) => {
  if (!connectDrag.value.active || !nodeId) {
    return;
  }

  const sourceId = connectDrag.value.sourceNodeId;
  sourceNodeId.value = sourceId;
  targetNodeId.value = nodeId;
  const createdEdgeId = addEdge();
  if (createdEdgeId) {
    triggerConnectFeedback(createdEdgeId, sourceId, nodeId);
  }
  cancelEdgeConnect();
};

const handleNodeCardMouseUp = (nodeId) => {
  if (connectDrag.value.active) {
    finishEdgeConnect(nodeId);
    return;
  }

  stopNodeDrag();
};

const handleCanvasPointerMove = (event) => {
  if (canvasPan.value.active) {
    return;
  }

  handleCanvasMouseMove(event, canvasZoom.value);
  updateEdgeConnectPointer(event);
  if (connectDrag.value.active && isPanBlockedTarget(event.target)) {
    return;
  }
  if (connectDrag.value.active) {
    connectHoverNodeId.value = "";
  }
};

const handleCanvasPointerUp = (event) => {
  stopNodeDrag();
  handleCanvasPanEnd(event);
};

const handleCanvasPointerLeave = (event) => {
  stopNodeDrag();
  handleCanvasPanEnd(event);
};

const handleCanvasBackgroundClick = (event) => {
  if (canvasPan.value.active || connectDrag.value.active) {
    return;
  }

  if (isPanBlockedTarget(event?.target)) {
    return;
  }

  leftDockCollapsed.value = true;
  bridgeBarCollapsed.value = true;
};

const updateCanvasViewport = () => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
  canvasViewport.value = {
    x: canvas.scrollLeft / zoom,
    y: canvas.scrollTop / zoom,
    width: canvas.clientWidth / zoom,
    height: canvas.clientHeight / zoom,
  };
};

const handleCanvasScroll = () => {
  updateCanvasViewport();
  updateMinimapMetrics();
};

const updateMinimapMetrics = () => {
  const minimap = minimapRef.value;
  if (!minimap) {
    return;
  }

  minimapMetrics.value = {
    width: Math.max(1, minimap.clientWidth || MINIMAP_WIDTH),
    height: Math.max(1, minimap.clientHeight || MINIMAP_HEIGHT),
  };
};

const minimapScale = computed(() =>
  Math.min(
    minimapMetrics.value.width / BASE_CANVAS_WIDTH,
    minimapMetrics.value.height / BASE_CANVAS_HEIGHT,
  ),
);

const minimapNodes = computed(() => {
  const scale = minimapScale.value;
  return workflow.value.graph.nodes.map((node) => {
    const size = resolveNodeDimensions(node);
    return {
      id: node.id,
      status: normalizeStatusValue(runNodeStates.value?.[node.id]?.status),
      style: {
        left: `${Math.max(0, node.position.x * scale)}px`,
        top: `${Math.max(0, node.position.y * scale)}px`,
        width: `${Math.max(12, size.width * scale)}px`,
        height: `${Math.max(8, size.height * scale)}px`,
        "--mini-accent": getNodeCategoryAccent(node.type),
      },
    };
  });
});

const minimapViewportRect = computed(() => {
  const scale = minimapScale.value;
  const viewport = canvasViewport.value;
  return {
    left: Math.max(0, viewport.x * scale),
    top: Math.max(0, viewport.y * scale),
    width: Math.max(
      16,
      Math.min(minimapMetrics.value.width, viewport.width * scale),
    ),
    height: Math.max(
      10,
      Math.min(minimapMetrics.value.height, viewport.height * scale),
    ),
  };
});

const minimapViewportStyle = computed(() => ({
  left: `${minimapViewportRect.value.left}px`,
  top: `${minimapViewportRect.value.top}px`,
  width: `${minimapViewportRect.value.width}px`,
  height: `${minimapViewportRect.value.height}px`,
}));

const panCanvasToScenePoint = (sceneX, sceneY) => {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
  canvas.scrollLeft = Math.max(0, sceneX * zoom - canvas.clientWidth / 2);
  canvas.scrollTop = Math.max(0, sceneY * zoom - canvas.clientHeight / 2);
  updateCanvasViewport();
};

const resolveMinimapPointer = (event) => {
  const minimap = minimapRef.value;
  if (!minimap || !event) {
    return null;
  }

  const rect = minimap.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
};

const moveMinimapDrag = (event) => {
  if (!minimapDrag.value.active) {
    return;
  }

  if (
    Number.isFinite(minimapDrag.value.pointerId) &&
    Number.isFinite(event?.pointerId) &&
    event.pointerId !== minimapDrag.value.pointerId
  ) {
    return;
  }

  const pointer = resolveMinimapPointer(event);
  if (!pointer) {
    return;
  }

  const viewport = minimapViewportRect.value;
  const scale = minimapScale.value;
  if (!Number.isFinite(scale) || scale <= 0) {
    return;
  }

  const nextLeft = pointer.x - minimapDrag.value.offsetX;
  const nextTop = pointer.y - minimapDrag.value.offsetY;
  const centerMapX = nextLeft + viewport.width / 2;
  const centerMapY = nextTop + viewport.height / 2;

  const sceneX = Math.max(0, Math.min(BASE_CANVAS_WIDTH, centerMapX / scale));
  const sceneY = Math.max(0, Math.min(BASE_CANVAS_HEIGHT, centerMapY / scale));

  panCanvasToScenePoint(sceneX, sceneY);
};

const startMinimapDrag = (event) => {
  updateMinimapMetrics();

  const pointer = resolveMinimapPointer(event);
  if (!pointer) {
    return;
  }

  const viewport = minimapViewportRect.value;
  const isInsideViewport =
    pointer.x >= viewport.left &&
    pointer.x <= viewport.left + viewport.width &&
    pointer.y >= viewport.top &&
    pointer.y <= viewport.top + viewport.height;

  minimapDrag.value = {
    active: true,
    offsetX: isInsideViewport ? pointer.x - viewport.left : viewport.width / 2,
    offsetY: isInsideViewport ? pointer.y - viewport.top : viewport.height / 2,
    pointerId: Number.isFinite(event?.pointerId) ? event.pointerId : null,
  };

  if (
    Number.isFinite(event?.pointerId) &&
    minimapRef.value?.setPointerCapture
  ) {
    try {
      minimapRef.value.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures on unsupported environments.
    }
  }

  moveMinimapDrag(event);
};

const stopMinimapDrag = (event = null) => {
  if (!minimapDrag.value.active) {
    return;
  }

  if (
    event &&
    Number.isFinite(minimapDrag.value.pointerId) &&
    Number.isFinite(event.pointerId) &&
    event.pointerId !== minimapDrag.value.pointerId
  ) {
    return;
  }

  if (
    minimapRef.value &&
    Number.isFinite(minimapDrag.value.pointerId) &&
    minimapRef.value.releasePointerCapture
  ) {
    try {
      minimapRef.value.releasePointerCapture(minimapDrag.value.pointerId);
    } catch {
      // Ignore release errors when capture was already cleared.
    }
  }

  minimapDrag.value = {
    active: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
  };
};

const dockLogLines = computed(() => {
  if (logDockScope.value === "node") {
    return selectedNodeLogs.value;
  }
  if (logDockScope.value === "pipeline") {
    return pipelineLogs.value;
  }
  return workflowLogs.value;
});

const dockFilteredLogLines = computed(() => {
  const keyword = dockLogKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return dockLogLines.value;
  }

  return dockLogLines.value.filter((line) =>
    String(line || "")
      .toLowerCase()
      .includes(keyword),
  );
});

const dockLogEmptyText = computed(() => {
  if (dockLogKeyword.value.trim()) {
    return "\u5f53\u524d\u7b5b\u9009\u65e0\u5339\u914d\u65e5\u5fd7";
  }
  if (logDockScope.value === "node") {
    return "\u8bf7\u9009\u62e9\u8282\u70b9\u67e5\u770b\u8282\u70b9\u65e5\u5fd7";
  }
  if (logDockScope.value === "pipeline") {
    return "\u6682\u65e0\u6d41\u6c34\u7ebf\u65e5\u5fd7";
  }
  return "\u6682\u65e0\u6d41\u7a0b\u65e5\u5fd7";
});

const runStatusClass = computed(() => {
  if (activeRunStatus.value === "running") {
    return "running";
  }
  if (activeRunStatus.value === "success") {
    return "success";
  }
  if (activeRunStatus.value === "failed") {
    return "failed";
  }
  if (
    activeRunStatus.value === "cancelled" ||
    activeRunStatus.value === "cancelling"
  ) {
    return "cancelled";
  }
  return "idle";
});

const statusLabelMap = {
  idle: "\u5f85\u547d",
  running: "\u8fd0\u884c\u4e2d",
  success: "\u5df2\u5b8c\u6210",
  failed: "\u5931\u8d25",
  cancelled: "\u5df2\u53d6\u6d88",
  cancelling: "\u53d6\u6d88\u4e2d",
};

const normalizeStatusValue = (status) => {
  const normalized = String(status || "idle").toLowerCase();
  if (normalized === "cancelling") {
    return "cancelled";
  }
  if (["running", "success", "failed", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "idle";
};

const getRunStatusLabel = (status) => {
  const normalized = String(status || "idle").toLowerCase();
  return statusLabelMap[normalized] || statusLabelMap.idle;
};

const getStatusClassByValue = (status) => normalizeStatusValue(status);

const formatTimestampLabel = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const formatDurationLabel = (startedAt, endedAt = null) => {
  if (!startedAt) {
    return "-";
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
};

const formatRuntimePreview = (value) => {
  if (value === null || value === undefined || value === "") {
    return "????";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const selectedNodeRunStatusClass = computed(() =>
  normalizeStatusValue(selectedNodeRunState.value?.status),
);

const selectedNodeRunDuration = computed(() =>
  formatDurationLabel(
    selectedNodeRunState.value?.startedAt,
    selectedNodeRunState.value?.endedAt,
  ),
);

const formatRunStartedAt = (value) => {
  if (!value) {
    return "暂无历史执行";
  }
  return String(value).slice(0, 19).replace("T", " ");
};

const progressValueLabel = computed(() => {
  if (runProgress.value.totalWorks > 0) {
    return `${runProgress.value.completedWorks}/${runProgress.value.totalWorks}`;
  }
  if (runProgress.value.totalFiles > 0) {
    return `${runProgress.value.processedFiles}/${runProgress.value.totalFiles}`;
  }
  return getRunStatusLabel(activeRunStatus.value);
});

const progressMetaLabel = computed(() => {
  if (runProgress.value.currentRj) {
    return `当前条目：${runProgress.value.currentRj}`;
  }
  const remainingWorks = Number(runProgress.value.remainingWorks || 0);
  if (remainingWorks > 0) {
    return `剩余任务：${remainingWorks}`;
  }
  return `最近执行：${formatRunStartedAt(runHistory.value?.[0]?.startedAt)}`;
});

const heroModeBadge = computed(() => {
  const errorCount = validationState.value?.errors?.length || 0;
  if (isRunInProgress.value) {
    return { label: "运行中", tone: "tone-hot" };
  }
  if (!workflow.value?.id) {
    return { label: "草稿", tone: "tone-warning" };
  }
  if (errorCount > 0) {
    return { label: "待修复", tone: "tone-danger" };
  }
  if (validationState.value?.ok) {
    return { label: "就绪", tone: "tone-cool" };
  }
  return { label: "已保存", tone: "tone-neutral" };
});

const overviewCards = computed(() => {
  const nodeCount = workflow.value?.graph?.nodes?.length || 0;
  const edgeCount = workflow.value?.graph?.edges?.length || 0;
  const categoryCount = new Set(
    (workflow.value?.graph?.nodes || []).map((node) =>
      resolveNodeCategoryKey(node.type),
    ),
  ).size;
  const errorCount = validationState.value?.errors?.length || 0;
  const warningCount = validationState.value?.warnings?.length || 0;
  const activeSelection = selectedNode.value
    ? `${resolveNodeLabel(selectedNode.value)} · ${getNodeTypeDisplay(selectedNode.value.type)}`
    : selectedEdgeId.value
      ? `已选中连线 · ${selectedEdgeId.value}`
      : "尚未选中节点或连线";

  return [
    {
      key: "graph",
      kicker: "图谱规模",
      value: `${nodeCount} 节点 / ${edgeCount} 连线`,
      meta: `${Math.max(categoryCount, 1)} 个能力分区已接入画布`,
      tone: "tone-cool",
    },
    {
      key: "validation",
      kicker: "校验健康",
      value:
        errorCount > 0
          ? `${errorCount} 个阻塞项`
          : validationState.value?.ok
            ? "检查通过"
            : "待触发校验",
      meta: warningCount > 0 ? `提示 ${warningCount} 条` : "当前没有额外预警",
      tone: errorCount > 0 ? "tone-danger" : "tone-neutral",
    },
    {
      key: "progress",
      kicker: "运行进度",
      value: progressValueLabel.value,
      meta: progressMetaLabel.value,
      tone: isRunInProgress.value ? "tone-hot" : "tone-warning",
    },
    {
      key: "selection",
      kicker: "焦点上下文",
      value: selectedNode.value
        ? resolveNodeLabel(selectedNode.value)
        : "等待选择",
      meta: activeSelection,
      tone: selectedNode.value ? "tone-cool" : "tone-neutral",
    },
  ];
});

const getNodeRuntimeStatusClass = (nodeId) => {
  if (!nodeId) {
    return "idle";
  }
  return normalizeStatusValue(runNodeStates.value?.[nodeId]?.status);
};

const getNodeRuntimeStatusLabel = (nodeId) =>
  getRunStatusLabel(runNodeStates.value?.[nodeId]?.status || "idle");

const bridgeNodePickerAllItems = computed(() =>
  workflow.value.graph.nodes.map((node) => {
    const categoryKey = resolveNodeCategoryKey(node.type);
    return {
      id: node.id,
      label: node.label || node.type || node.id,
      type: String(node.type || ""),
      status: normalizeStatusValue(runNodeStates.value?.[node.id]?.status),
      categoryKey,
      accent: nodeCategoryAccentMap[categoryKey] || nodeCategoryAccentMap.other,
    };
  }),
);

const bridgeNodePickerItems = computed(() => {
  const keyword = nodePickerKeyword.value.trim().toLowerCase();
  const statusFilter = nodePickerStatusFilter.value;

  return bridgeNodePickerAllItems.value.filter((item) => {
    const statusMatched =
      statusFilter === "all" || item.status === statusFilter;
    if (!statusMatched) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    const target =
      `${item.label || ""} ${item.type || ""} ${item.id || ""}`.toLowerCase();
    return target.includes(keyword);
  });
});

const getCategoryLabel = (rawCategory) =>
  categoryLabelMap[rawCategory] || rawCategory;

const getNodeBadge = (nodeType) => {
  const [prefix = "N"] = String(nodeType || "N").split(".");
  return prefix.slice(0, 2).toUpperCase();
};

const nodeTypeDisplayMap = {
  "whisper.translateSubtitles": "翻译字幕",
  "whisper.packSubtitles": "打包字幕",
  "tg.uploadSubtitles": "上传字幕",
  "asmr.cloudDeleteRecentUploads": "云端清理",
  "files.localDeleteScanned": "本地删除",
  "files.scanArchives": "扫描压缩包",
  "tools.extractFileNames": "提取文件名",
  "tools.cleanData": "数据清洗",
  "input.manual": "手动输入",
  "file.readText": "读取文本文件",
  "file.writeText": "写入文本文件",
  "util.delay": "延时节点",
  "output.inspect": "调试输出",
};

const configKeyLabelMap = {
  exePath: "引擎路径",
  targetPath: "媒体目录",
  subFormats: "字幕格式",
  outputDir: "输出目录",
  scanPath: "扫描目录",
  scanDir: "扫描目录",
  path: "路径",
  channelId: "频道ID",
  titleDelayMs: "标题延迟",
  betweenDelayMs: "文件间隔",
  perFileDelayMs: "文件间隔",
  failOnEmpty: "扫描为空失败",
  recentLimit: "最近上传数",
  batchSize: "批次大小",
  refreshCloudFirst: "刷新云端",
  failOnNoMatch: "无匹配报错",
  extensions: "扩展名",
  previewOnly: "仅预览",
  deleteFiles: "执行删除",
  sourceDir: "源目录",
  mainFile: "主文件",
  compareDir: "比对目录",
};

const getNodeTypeDisplay = (nodeType) =>
  nodeTypeDisplayMap[nodeType] || nodeType;

const resolveNodeLabel = (node) => {
  if (!node || typeof node !== "object") {
    return "";
  }

  const nodeType = typeof node.type === "string" ? node.type : "";
  const rawLabel = typeof node.label === "string" ? node.label.trim() : "";
  if (rawLabel && rawLabel !== nodeType) {
    return rawLabel;
  }

  const matchedDef = nodePaletteGroups.value
    .flatMap((group) => group.items || [])
    .find((item) => item.type === nodeType);
  if (matchedDef?.label) {
    return matchedDef.label;
  }

  return rawLabel || getNodeTypeDisplay(nodeType);
};

const translateNodeConfigError = ref("");

const sanitizePath = (value) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  if (typeof value.filePath === "string") {
    return value.filePath;
  }
  if (Array.isArray(value.filePaths) && value.filePaths.length > 0) {
    return value.filePaths[0];
  }
  return "";
};

const sanitizeIntegerInput = (rawValue, fallbackValue, minimum = 0) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(minimum, parsed);
};

const runtimeDispatchMode = computed({
  get: () => {
    const rawMode = String(workflow.value?.runtime?.dispatchMode || "single");
    return ["single", "batch", "fanout"].includes(rawMode) ? rawMode : "single";
  },
  set: (value) => {
    workflow.value.runtime.dispatchMode = value || "single";
  },
});

const runtimeBatchSize = computed({
  get: () => sanitizeIntegerInput(workflow.value?.runtime?.batchSize, 50, 1),
  set: (value) => {
    workflow.value.runtime.batchSize = sanitizeIntegerInput(
      value,
      runtimeBatchSize.value,
      1,
    );
  },
});

const runtimeEmitPerItem = computed({
  get: () => workflow.value?.runtime?.emitPerItem === true,
  set: (value) => {
    workflow.value.runtime.emitPerItem = value === true;
  },
});

const runtimeGuardianEnabled = computed({
  get: () => workflow.value?.runtime?.guardianEnabled !== false,
  set: (value) => {
    workflow.value.runtime.guardianEnabled = value !== false;
  },
});

const runtimeAutoCleanupDuplicates = computed({
  get: () => workflow.value?.runtime?.autoCleanupDuplicates !== false,
  set: (value) => {
    workflow.value.runtime.autoCleanupDuplicates = value !== false;
  },
});

const isTranslateSubtitleNodeSelected = computed(
  () => selectedNode.value?.type === TRANSLATE_SUBTITLE_NODE_TYPE,
);

const isPackSubtitleNodeSelected = computed(
  () => selectedNode.value?.type === PACK_SUBTITLE_NODE_TYPE,
);

const isUploadSubtitleNodeSelected = computed(
  () => selectedNode.value?.type === UPLOAD_SUBTITLE_NODE_TYPE,
);

const isCloudDeleteRecentNodeSelected = computed(
  () => selectedNode.value?.type === CLOUD_DELETE_RECENT_NODE_TYPE,
);

const isLocalDeleteScannedNodeSelected = computed(
  () => selectedNode.value?.type === LOCAL_DELETE_SCANNED_NODE_TYPE,
);

const selectedTranslateNodeConfig = computed(() => {
  const config = selectedNode.value?.config || {};
  const selectedFormats = Array.isArray(config.subFormats)
    ? config.subFormats.filter((item) => subtitleFormatOptions.includes(item))
    : [];

  return {
    exePath: typeof config.exePath === "string" ? config.exePath : "",
    targetPath: typeof config.targetPath === "string" ? config.targetPath : "",
    subFormats: selectedFormats.length > 0 ? selectedFormats : ["srt"],
  };
});

const selectedPackNodeConfig = computed(() => {
  const config = selectedNode.value?.config || {};
  return {
    targetPath: typeof config.targetPath === "string" ? config.targetPath : "",
    outputDir: typeof config.outputDir === "string" ? config.outputDir : "",
  };
});

const selectedUploadNodeConfig = computed(() => {
  const config = selectedNode.value?.config || {};
  const scanPathRaw =
    typeof config.scanPath === "string"
      ? config.scanPath
      : typeof config.scanDir === "string"
        ? config.scanDir
        : typeof config.path === "string"
          ? config.path
          : "";

  return {
    scanPath: scanPathRaw,
    channelId: typeof config.channelId === "string" ? config.channelId : "",
    titleDelayMs: sanitizeIntegerInput(config.titleDelayMs, 3500, 0),
    betweenDelayMs: sanitizeIntegerInput(
      config.betweenDelayMs,
      sanitizeIntegerInput(config.perFileDelayMs, 1000, 0),
      0,
    ),
    failOnEmpty: config.failOnEmpty !== false,
  };
});

const selectedCloudDeleteNodeConfig = computed(() => {
  const config = selectedNode.value?.config || {};
  return {
    recentLimit: sanitizeIntegerInput(config.recentLimit, 200, 1),
    batchSize: sanitizeIntegerInput(config.batchSize, 50, 1),
    refreshCloudFirst: config.refreshCloudFirst !== false,
    failOnNoMatch: config.failOnNoMatch === true,
  };
});

const selectedLocalDeleteNodeConfig = computed(() => {
  const config = selectedNode.value?.config || {};
  const scanPathRaw =
    typeof config.scanPath === "string"
      ? config.scanPath
      : typeof config.scanDir === "string"
        ? config.scanDir
        : typeof config.path === "string"
          ? config.path
          : "";

  const defaultExtensions = ".zip,.rar,.7z";
  const extensionsRaw = Array.isArray(config.extensions)
    ? config.extensions.join(",")
    : typeof config.extensions === "string"
      ? config.extensions
      : defaultExtensions;

  const deleteFiles =
    typeof config.deleteFiles === "boolean"
      ? config.deleteFiles
      : typeof config.previewOnly === "boolean"
        ? !config.previewOnly
        : false;

  return {
    scanPath: scanPathRaw,
    extensions: extensionsRaw,
    deleteFiles,
  };
});

const syncSelectedNodeDraft = () => {
  if (!selectedNode.value) {
    return;
  }
  selectedNodeConfigDraft.value = JSON.stringify(
    selectedNode.value.config || {},
    null,
    2,
  );
};

const applySpecialNodeConfigPatch = (nextConfig) => {
  if (!selectedNode.value) {
    return;
  }

  selectedNode.value.config = nextConfig;
  syncSelectedNodeDraft();
  translateNodeConfigError.value = "";
};

const patchTranslateNodeConfig = (patch) => {
  if (!selectedNode.value || !isTranslateSubtitleNodeSelected.value) {
    return;
  }

  applySpecialNodeConfigPatch({
    ...selectedTranslateNodeConfig.value,
    ...patch,
  });
};

const patchPackNodeConfig = (patch) => {
  if (!selectedNode.value || !isPackSubtitleNodeSelected.value) {
    return;
  }

  applySpecialNodeConfigPatch({
    ...selectedPackNodeConfig.value,
    ...patch,
  });
};

const patchUploadNodeConfig = (patch) => {
  if (!selectedNode.value || !isUploadSubtitleNodeSelected.value) {
    return;
  }

  const next = {
    ...selectedUploadNodeConfig.value,
    ...patch,
  };

  applySpecialNodeConfigPatch({
    ...next,
    scanPath: next.scanPath,
    scanDir: next.scanPath,
    betweenDelayMs: next.betweenDelayMs,
    perFileDelayMs: next.betweenDelayMs,
  });
};

const patchCloudDeleteNodeConfig = (patch) => {
  if (!selectedNode.value || !isCloudDeleteRecentNodeSelected.value) {
    return;
  }

  applySpecialNodeConfigPatch({
    ...selectedCloudDeleteNodeConfig.value,
    ...patch,
  });
};

const patchLocalDeleteNodeConfig = (patch) => {
  if (!selectedNode.value || !isLocalDeleteScannedNodeSelected.value) {
    return;
  }

  const next = {
    ...selectedLocalDeleteNodeConfig.value,
    ...patch,
  };

  applySpecialNodeConfigPatch({
    ...next,
    scanPath: next.scanPath,
    scanDir: next.scanPath,
    path: next.scanPath,
    previewOnly: !next.deleteFiles,
    deleteFiles: next.deleteFiles === true,
  });
};

const pickDirectoryValue = async () => {
  const selected = await selectFile("dir");
  return sanitizePath(selected);
};

const pickTranslateExePath = async () => {
  const selected = await selectFile("exe");
  const nextPath = sanitizePath(selected);
  if (!nextPath) {
    return;
  }
  patchTranslateNodeConfig({ exePath: nextPath });
};

const pickTranslateTargetPath = async () => {
  const nextPath = await pickDirectoryValue();
  if (!nextPath) {
    return;
  }
  patchTranslateNodeConfig({ targetPath: nextPath });
};

const pickPackTargetPath = async () => {
  const nextPath = await pickDirectoryValue();
  if (!nextPath) {
    return;
  }
  patchPackNodeConfig({ targetPath: nextPath });
};

const pickPackOutputPath = async () => {
  const nextPath = await pickDirectoryValue();
  if (!nextPath) {
    return;
  }
  patchPackNodeConfig({ outputDir: nextPath });
};

const pickUploadScanDir = async () => {
  const nextPath = await pickDirectoryValue();
  if (!nextPath) {
    return;
  }
  patchUploadNodeConfig({ scanPath: nextPath });
};

const pickLocalDeleteScanDir = async () => {
  const nextPath = await pickDirectoryValue();
  if (!nextPath) {
    return;
  }
  patchLocalDeleteNodeConfig({ scanPath: nextPath });
};

const updateUploadChannelId = (value) => {
  patchUploadNodeConfig({ channelId: typeof value === "string" ? value : "" });
};

const updateUploadTitleDelay = (value) => {
  patchUploadNodeConfig({
    titleDelayMs: sanitizeIntegerInput(
      value,
      selectedUploadNodeConfig.value.titleDelayMs,
      0,
    ),
  });
};

const updateUploadBetweenDelay = (value) => {
  patchUploadNodeConfig({
    betweenDelayMs: sanitizeIntegerInput(
      value,
      selectedUploadNodeConfig.value.betweenDelayMs,
      0,
    ),
  });
};

const updateLocalDeleteExtensions = (value) => {
  patchLocalDeleteNodeConfig({
    extensions: typeof value === "string" ? value : "",
  });
};

const updateCloudDeleteRecentLimit = (value) => {
  patchCloudDeleteNodeConfig({
    recentLimit: sanitizeIntegerInput(
      value,
      selectedCloudDeleteNodeConfig.value.recentLimit,
      1,
    ),
  });
};

const updateCloudDeleteBatchSize = (value) => {
  patchCloudDeleteNodeConfig({
    batchSize: sanitizeIntegerInput(
      value,
      selectedCloudDeleteNodeConfig.value.batchSize,
      1,
    ),
  });
};

const toggleTranslateSubFormat = (format, checked) => {
  const current = new Set(selectedTranslateNodeConfig.value.subFormats);
  if (checked) {
    current.add(format);
  } else {
    current.delete(format);
  }

  if (current.size === 0) {
    translateNodeConfigError.value = "至少选择一种字幕格式";
    return;
  }

  translateNodeConfigError.value = "";
  patchTranslateNodeConfig({
    subFormats: subtitleFormatOptions.filter((item) => current.has(item)),
  });
};

const summaryPathKeyPattern = /(path|dir|file|exe)/i;
const summaryPreferredKeys = [
  "exePath",
  "targetPath",
  "outputDir",
  "scanPath",
  "scanDir",
  "path",
];

const shortenPathForNode = (rawValue, maxLength = 30) => {
  const value = String(rawValue || "");
  if (value.length <= maxLength) {
    return value;
  }

  const normalized = value.replace(/\//g, "\\");
  const segments = normalized.split(/\\+/).filter(Boolean);
  if (segments.length >= 2) {
    const tail = `${segments[segments.length - 2]}\\${segments[segments.length - 1]}`;
    if (tail.length <= maxLength - 4) {
      return `...\\${tail}`;
    }
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const shortenTextForNode = (value, maxLength = 26) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
};

const summarizeConfigValue = (key, rawValue, { compact = true } = {}) => {
  if (rawValue === null || rawValue === undefined) {
    return "";
  }

  if (Array.isArray(rawValue)) {
    if (rawValue.length === 0) {
      return "";
    }
    const rendered = rawValue.join(", ");
    return compact ? shortenTextForNode(rendered, 30) : rendered;
  }

  if (typeof rawValue === "boolean") {
    return rawValue ? "是" : "否";
  }

  if (typeof rawValue === "number") {
    return String(rawValue);
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return "";
    }

    if (summaryPathKeyPattern.test(String(key || ""))) {
      return compact ? shortenPathForNode(trimmed) : trimmed;
    }

    return compact ? shortenTextForNode(trimmed) : trimmed;
  }

  return "";
};

const buildNodeSummaryEntries = (node, { full = false } = {}) => {
  const config =
    node?.config && typeof node.config === "object" ? node.config : {};

  return Object.entries(config)
    .map(([key, value]) => {
      const preferredOrder = summaryPreferredKeys.indexOf(key);
      const priority =
        preferredOrder >= 0
          ? preferredOrder
          : summaryPathKeyPattern.test(key)
            ? 90
            : 100;
      return {
        key,
        label: configKeyLabelMap[key] || key,
        value: summarizeConfigValue(key, value, { compact: !full }),
        fullValue: summarizeConfigValue(key, value, { compact: false }),
        isPath: summaryPathKeyPattern.test(key),
        priority,
      };
    })
    .filter((item) => item.value)
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.key.localeCompare(b.key, "zh-Hans-CN");
    });
};

const getNodeCardSummaryEntries = (node) =>
  buildNodeSummaryEntries(node).slice(0, 3);

const getNodePortStatusLabel = (nodeId, direction = "in") => {
  const edges = workflow.value?.graph?.edges || [];
  const linked = edges.some((edge) =>
    direction === "in" ? edge.target === nodeId : edge.source === nodeId,
  );

  if (direction === "in") {
    return linked ? "输入已连" : "待接输入";
  }

  return linked ? "输出已连" : "待接输出";
};

const summarizeNodeConfig = (node, { full = false } = {}) => {
  const entries = buildNodeSummaryEntries(node, { full });

  if (!entries.length) {
    return "未配置";
  }

  const limit = full ? 4 : 2;
  const separator = full ? "\n" : " | ";
  return entries
    .slice(0, limit)
    .map((item) => `${item.label}: ${item.value}`)
    .join(separator);
};

const syncSingleNodeDimensions = (nodeId, measuredHeight = null) => {
  const node = workflow.value?.graph?.nodes?.find((item) => item.id === nodeId);
  const element = nodeCardElementMap.get(nodeId);
  if (!node || !element) {
    return;
  }

  const currentSize = resolveNodeDimensions(node);
  const safeMeasuredHeight = Number.isFinite(measuredHeight)
    ? Math.ceil(measuredHeight + 6)
    : Math.ceil(element.scrollHeight + 6);
  const nextHeight = clampNodeHeight(
    Math.max(currentSize.height, DEFAULT_NODE_HEIGHT, safeMeasuredHeight),
  );
  const nextWidth = clampNodeWidth(
    Math.max(currentSize.width, estimateNodeCardWidth(node)),
  );

  if (nextHeight === currentSize.height && nextWidth === currentSize.width) {
    return;
  }

  node.size = {
    width: nextWidth,
    height: nextHeight,
  };
};

const syncAutoNodeHeights = () => {
  nodeHeightSyncScheduled = false;

  const nodes = workflow.value?.graph?.nodes || [];
  nodes.forEach((node) => {
    syncSingleNodeDimensions(node.id);
  });
};

const scheduleAutoNodeHeightSync = () => {
  if (nodeHeightSyncScheduled) {
    return;
  }

  nodeHeightSyncScheduled = true;
  nextTick(() => {
    syncAutoNodeHeights();
  });
};

watch(
  () =>
    workflow.value.graph.nodes
      .map((node) => {
        const summarySignature = getNodeCardSummaryEntries(node)
          .map((entry) => `${entry.key}:${entry.value}`)
          .join("|");
        return [
          node.id,
          resolveNodeLabel(node),
          node.type,
          summarySignature,
          resolveNodeDimensions(node).width,
          resolveNodeFontSize(node),
        ].join("::");
      })
      .join("||"),
  () => {
    scheduleAutoNodeHeightSync();
  },
  { flush: "post" },
);

onMounted(() => {
  updateResponsiveWorkflowChrome();
  nextTick(() => {
    updateCanvasViewport();
    updateMinimapMetrics();
    scheduleAutoNodeHeightSync();
  });
  window.addEventListener("resize", updateResponsiveWorkflowChrome);
  window.addEventListener("resize", updateCanvasViewport);
  window.addEventListener("resize", updateMinimapMetrics);
  window.addEventListener("resize", scheduleAutoNodeHeightSync);
  window.addEventListener("mouseup", cancelEdgeConnect);
  window.addEventListener("mouseup", stopNodeDrag);
  window.addEventListener("mousemove", moveNodeInlineInspectorDrag);
  window.addEventListener("mouseup", stopNodeInlineInspectorDrag);
  window.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("keyup", handleGlobalKeyUp);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("pointermove", moveMinimapDrag);
  window.addEventListener("pointerup", stopMinimapDrag);
  window.addEventListener("pointercancel", stopMinimapDrag);
  window.addEventListener("pointerup", handleCanvasPanEnd);
  window.addEventListener("pointercancel", handleCanvasPanEnd);
});

onUnmounted(() => {
  if (connectFeedbackTimer) {
    clearTimeout(connectFeedbackTimer);
  }
  nodeCardResizeObserver?.disconnect();
  nodeCardResizeObserver = null;
  window.removeEventListener("resize", updateResponsiveWorkflowChrome);
  window.removeEventListener("resize", updateCanvasViewport);
  window.removeEventListener("resize", updateMinimapMetrics);
  window.removeEventListener("resize", scheduleAutoNodeHeightSync);
  window.removeEventListener("mouseup", cancelEdgeConnect);
  window.removeEventListener("mouseup", stopNodeDrag);
  window.removeEventListener("mousemove", moveNodeInlineInspectorDrag);
  window.removeEventListener("mouseup", stopNodeInlineInspectorDrag);
  window.removeEventListener("keydown", handleGlobalKeyDown);
  window.removeEventListener("keyup", handleGlobalKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("pointermove", moveMinimapDrag);
  window.removeEventListener("pointerup", stopMinimapDrag);
  window.removeEventListener("pointercancel", stopMinimapDrag);
  window.removeEventListener("pointerup", handleCanvasPanEnd);
  window.removeEventListener("pointercancel", handleCanvasPanEnd);
});

const toEdgePath = (edge) => {
  const x1 = Number(edge?.x1 || 0);
  const y1 = Number(edge?.y1 || 0);
  const x2 = Number(edge?.x2 || 0);
  const y2 = Number(edge?.y2 || 0);
  const distance = Math.max(56, Math.abs(x2 - x1) * 0.45);

  return `M ${x1} ${y1} C ${x1 + distance} ${y1}, ${x2 - distance} ${y2}, ${x2} ${y2}`;
};
</script>

<style scoped>
.workflow-orbit {
  --wf-color-coal-980: #09080b;
  --wf-color-coal-940: #121116;
  --wf-color-coal-880: #1b1a20;
  --wf-color-coal-820: #25232a;
  --wf-color-ivory-050: #f7f0e4;
  --wf-color-ivory-180: #dfd1bd;
  --wf-color-cyan-420: #2fd0cb;
  --wf-color-cyan-280: #8ae6df;
  --wf-color-amber-420: #d98a37;
  --wf-color-amber-280: #f4c56b;
  --wf-color-rose-420: #dd6976;
  --wf-color-rose-260: #efb2ad;
  --wf-color-sage-320: #9cbf9d;
  --wf-font-display:
    "Bahnschrift", "Aptos Display", "Microsoft YaHei UI", sans-serif;
  --wf-font-body: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
  --wf-font-mono: "Cascadia Mono", "Consolas", "Aptos Mono", monospace;
  --wf-surface-panel: rgba(17, 15, 18, 0.88);
  --wf-surface-elevated: rgba(25, 22, 27, 0.94);
  --wf-surface-strong: rgba(33, 29, 35, 0.97);
  --wf-border-soft: rgba(223, 195, 151, 0.16);
  --wf-border-strong: rgba(244, 197, 107, 0.32);
  --wf-text-strong: var(--wf-color-ivory-050);
  --wf-text-muted: #bcae99;
  --wf-text-soft: #887a67;
  --wf-accent-cool: var(--wf-color-cyan-420);
  --wf-accent-warm: var(--wf-color-amber-420);
  --wf-accent-danger: var(--wf-color-rose-420);
  --wf-shadow-panel: 0 1.5rem 3.2rem rgba(6, 5, 8, 0.42);
  --wf-shadow-soft: 0 1rem 2.4rem rgba(8, 7, 10, 0.28);
  --orbit-bg: var(--wf-color-coal-980);
  --orbit-bg-deep: #050508;
  --orbit-surface: var(--wf-surface-panel);
  --orbit-surface-strong: var(--wf-surface-strong);
  --orbit-border: var(--wf-border-soft);
  --orbit-border-strong: var(--wf-border-strong);
  --orbit-text: var(--wf-text-strong);
  --orbit-muted: var(--wf-text-muted);
  --orbit-hot: var(--wf-color-amber-420);
  --orbit-hot-2: var(--wf-color-amber-280);
  --orbit-cool: var(--wf-color-cyan-420);
  --orbit-danger: var(--wf-color-rose-420);
  --orbit-warning: var(--wf-color-sage-320);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: calc(100vh - 7rem);
  padding: 0.5rem 0 0.25rem;
  color: var(--wf-text-strong);
  font-family: var(--wf-font-body);
}

.orbit-backdrop {
  position: absolute;
  inset: -1rem;
  border-radius: 1.75rem;
  pointer-events: none;
  background:
    radial-gradient(
      circle at 12% 18%,
      rgba(217, 138, 55, 0.12),
      transparent 26%
    ),
    radial-gradient(
      circle at 84% 14%,
      rgba(47, 208, 203, 0.1),
      transparent 24%
    ),
    linear-gradient(180deg, rgba(12, 11, 14, 0.98) 0%, rgba(8, 8, 10, 1) 100%);
  z-index: 0;
}

.orbit-hero,
.neo-panel,
.flow-canvas-shell,
.orbit-overview {
  position: relative;
  z-index: 1;
}

.orbit-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 0.8rem;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(244, 197, 107, 0.24);
  border-radius: 1rem;
  background:
    linear-gradient(
      140deg,
      rgba(63, 36, 18, 0.94) 0%,
      rgba(25, 23, 27, 0.92) 48%
    ),
    linear-gradient(320deg, rgba(10, 41, 42, 0.68), transparent 38%);
  box-shadow:
    0 1.9rem 3.6rem rgba(6, 5, 8, 0.46),
    inset 0 1px 0 rgba(255, 245, 230, 0.08);
  backdrop-filter: blur(16px);
}

.orbit-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, rgba(244, 197, 107, 0.12), transparent 30%),
    linear-gradient(300deg, rgba(47, 208, 203, 0.1), transparent 34%),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.02) 0,
      rgba(255, 255, 255, 0.02) 1px,
      transparent 1px,
      transparent 48px
    );
  pointer-events: none;
}

.orbit-hero::after {
  content: "";
  position: absolute;
  right: -3rem;
  top: -3rem;
  width: 13rem;
  height: 13rem;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    rgba(47, 208, 203, 0.18),
    transparent 68%
  );
  filter: blur(10px);
  pointer-events: none;
}

.hero-left,
.hero-side {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.65rem;
  min-width: 0;
}

.hero-side {
  align-content: start;
  padding: 0.75rem;
  border: 1px solid rgba(244, 197, 107, 0.14);
  border-radius: 0.95rem;
  background: linear-gradient(
    180deg,
    rgba(12, 11, 14, 0.46),
    rgba(17, 27, 29, 0.26)
  );
  box-shadow: inset 0 1px 0 rgba(255, 245, 230, 0.05);
}

.hero-kicker,
.overview-kicker {
  margin: 0;
  font-family: var(--wf-font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-focus-label {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.hero-kicker,
.overview-kicker {
  color: color-mix(
    in srgb,
    var(--wf-accent-cool) 52%,
    var(--wf-accent-warm) 48%
  );
}

.hero-title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
  flex-wrap: wrap;
}

.hero-title-input {
  width: min(100%, 28rem);
  border: 1px solid transparent;
  border-radius: 0.7rem;
  background: transparent;
  color: #fff5e8;
  font-family: var(--wf-font-display);
  font-size: clamp(1.45rem, 3vw, 1.95rem);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.02em;
  text-shadow: 0 0 1.25rem rgba(217, 138, 55, 0.12);
  padding: 0.125rem 0.25rem;
}

.hero-title-input:focus {
  outline: none;
  border-color: rgba(244, 197, 107, 0.34);
  background: rgba(14, 11, 12, 0.34);
}

.hero-summary {
  max-width: 72ch;
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #c7b79e;
}

.hero-live-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid rgba(244, 197, 107, 0.28);
  background: rgba(20, 16, 18, 0.76);
  color: var(--wf-text-strong);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.hero-live-badge.tone-cool {
  border-color: rgba(47, 208, 203, 0.46);
  background: rgba(47, 208, 203, 0.16);
  color: #d9fffb;
}

.hero-live-badge.tone-hot {
  border-color: rgba(217, 138, 55, 0.52);
  background: rgba(217, 138, 55, 0.18);
  color: #ffe8d2;
}

.hero-live-badge.tone-warning {
  border-color: rgba(156, 191, 157, 0.48);
  background: rgba(156, 191, 157, 0.16);
  color: #edf8eb;
}

.hero-live-badge.tone-danger {
  border-color: rgba(221, 105, 118, 0.52);
  background: rgba(221, 105, 118, 0.16);
  color: #ffe1e5;
}

.hero-live-badge.tone-neutral {
  border-color: rgba(223, 195, 151, 0.28);
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.7rem;
  padding: 0 0.62rem;
  border: 1px solid rgba(217, 138, 55, 0.16);
  border-radius: 999px;
  background: rgba(16, 16, 19, 0.96);
  font-size: 0.83rem;
  color: #eadfcf;
}

.hero-focus-card {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem 0.8rem;
  border: 1px solid rgba(47, 208, 203, 0.22);
  border-radius: 1.15rem;
  background: linear-gradient(
    160deg,
    rgba(7, 35, 37, 0.72),
    rgba(15, 16, 19, 0.84)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.hero-focus-label {
  color: color-mix(in srgb, var(--wf-accent-cool) 80%, #ffffff 20%);
}

.hero-focus-card strong {
  font-family: var(--wf-font-display);
  font-size: 0.92rem;
  line-height: 1.3;
  color: #f7f1e6;
}

.hero-focus-card small {
  font-size: 0.75rem;
  line-height: 1.45;
  color: #bdc7bc;
}

.hero-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid rgba(244, 197, 107, 0.12);
  border-radius: 1.2rem;
  background: rgba(9, 8, 11, 0.3);
}

.hero-btn {
  min-height: 2.45rem;
  border: 1px solid rgba(223, 195, 151, 0.24);
  border-radius: 1rem;
  background: linear-gradient(
    180deg,
    rgba(27, 22, 26, 0.96),
    rgba(14, 13, 16, 0.92)
  );
  color: #efe7d9;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    filter 0.15s ease;
}

.hero-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 1rem 2rem rgba(6, 5, 8, 0.38);
  filter: saturate(1.08);
}

.hero-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hero-btn.hot {
  border-color: rgba(217, 138, 55, 0.44);
  background: linear-gradient(
    135deg,
    rgba(217, 138, 55, 0.92),
    rgba(244, 197, 107, 0.78)
  );
  color: #18110d;
}

.hero-btn.cool {
  border-color: rgba(47, 208, 203, 0.44);
  background: linear-gradient(
    135deg,
    rgba(47, 208, 203, 0.84),
    rgba(138, 230, 223, 0.7)
  );
  color: #0d1515;
}

.hero-btn.warning {
  border-color: rgba(221, 105, 118, 0.44);
  background: linear-gradient(
    135deg,
    rgba(126, 45, 57, 0.88),
    rgba(221, 105, 118, 0.66)
  );
  color: #fff1f2;
}

.orbit-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.55rem;
}

.overview-card {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 0.2rem;
  min-height: 4.8rem;
  padding: 0.7rem 0.85rem 0.72rem;
  border: 1px solid rgba(223, 195, 151, 0.16);
  border-radius: 1.28rem;
  background: linear-gradient(
    160deg,
    rgba(21, 18, 21, 0.96),
    rgba(12, 12, 16, 0.9)
  );
  box-shadow: var(--wf-shadow-soft);
}

.overview-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 0.24rem;
  background: rgba(223, 195, 151, 0.4);
}

.overview-card::after {
  content: "";
  position: absolute;
  right: -8%;
  bottom: -30%;
  width: 42%;
  height: 88%;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.08),
    transparent 70%
  );
  pointer-events: none;
}

.overview-card.tone-cool {
  border-color: rgba(47, 208, 203, 0.2);
  background: linear-gradient(
    160deg,
    rgba(7, 33, 35, 0.92),
    rgba(15, 16, 19, 0.92)
  );
}

.overview-card.tone-cool::before {
  background: linear-gradient(
    90deg,
    var(--wf-accent-cool),
    rgba(138, 230, 223, 0.7)
  );
}

.overview-card.tone-hot,
.overview-card.tone-warning {
  border-color: rgba(217, 138, 55, 0.2);
  background: linear-gradient(
    160deg,
    rgba(54, 31, 17, 0.92),
    rgba(18, 16, 19, 0.92)
  );
}

.overview-card.tone-hot::before,
.overview-card.tone-warning::before {
  background: linear-gradient(
    90deg,
    var(--wf-accent-warm),
    rgba(244, 197, 107, 0.76)
  );
}

.overview-card.tone-danger {
  border-color: rgba(221, 105, 118, 0.22);
  background: linear-gradient(
    160deg,
    rgba(49, 23, 30, 0.94),
    rgba(19, 16, 18, 0.92)
  );
}

.overview-card.tone-danger::before {
  background: linear-gradient(
    90deg,
    var(--wf-accent-danger),
    rgba(239, 178, 173, 0.72)
  );
}

.overview-card.tone-neutral {
  background: linear-gradient(
    160deg,
    rgba(31, 28, 31, 0.96),
    rgba(17, 16, 19, 0.9)
  );
}

.overview-card.tone-neutral::before {
  background: linear-gradient(
    90deg,
    rgba(223, 195, 151, 0.72),
    rgba(188, 174, 153, 0.52)
  );
}

.overview-value {
  font-family: var(--wf-font-display);
  font-size: clamp(1.02rem, 2.2vw, 1.38rem);
  line-height: 1.04;
  color: #fff3e1;
}

.overview-meta {
  max-width: 48ch;
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #d7c8b4;
}

.workflow-left-rail {
  grid-area: left;
  --wf-panel-accent: var(--wf-accent-cool);
  --wf-panel-outline: rgba(47, 208, 203, 0.18);
  --wf-panel-outline-strong: rgba(47, 208, 203, 0.32);
  --wf-panel-surface: linear-gradient(
    180deg,
    rgba(12, 14, 16, 0.98),
    rgba(10, 11, 13, 0.98)
  );
  --wf-panel-surface-2: linear-gradient(
    180deg,
    rgba(15, 17, 19, 0.98),
    rgba(12, 13, 15, 0.98)
  );
  --wf-panel-chip-bg: rgba(10, 18, 18, 0.92);
  --wf-panel-shadow: 0 1.2rem 2.4rem rgba(5, 8, 9, 0.24);
  --wf-panel-muted: #c4d6d2;
}

.panel-stack.right {
  grid-area: right;
  --wf-panel-accent: var(--wf-accent-danger);
  --wf-panel-outline: rgba(221, 105, 118, 0.16);
  --wf-panel-outline-strong: rgba(221, 105, 118, 0.3);
  --wf-panel-surface: linear-gradient(
    180deg,
    rgba(18, 13, 15, 0.98),
    rgba(12, 11, 13, 0.98)
  );
  --wf-panel-surface-2: linear-gradient(
    180deg,
    rgba(20, 14, 17, 0.98),
    rgba(14, 12, 14, 0.98)
  );
  --wf-panel-chip-bg: rgba(27, 16, 18, 0.9);
  --wf-panel-shadow: 0 1.2rem 2.4rem rgba(11, 5, 7, 0.22);
  --wf-panel-muted: #dcc5c9;
}

.orbit-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "left"
    "center"
    "right";
  gap: 0.7rem;
  align-items: start;
}

.workflow-left-rail {
  grid-area: left;
}

.panel-stack.right {
  grid-area: right;
}

.panel-stack {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.left-dock {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  overflow: visible;
  z-index: 6;
}

.left-dock-content {
  position: absolute;
  top: 0;
  left: 44px;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-12px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.left-dock:hover .left-dock-content,
.left-dock.pinned .left-dock-content {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.left-dock:hover .left-dock-content .neo-panel,
.left-dock.pinned .left-dock-content .neo-panel {
  box-shadow:
    0 18px 32px rgba(3, 8, 20, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.left-dock-toggle {
  position: absolute;
  top: 164px;
  left: 0;
  width: 36px;
  min-height: 104px;
  border: 1px solid rgba(124, 160, 219, 0.32);
  border-radius: 0 12px 12px 0;
  background: rgba(10, 20, 36, 0.92);
  color: var(--orbit-text);
  font-size: 12px;
  font-weight: 700;
  padding: 10px 0;
  cursor: pointer;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  pointer-events: auto;
}

.left-dock.pinned .left-dock-toggle {
  top: 0;
  left: 44px;
  width: auto;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  writing-mode: initial;
}

.left-dock-summary {
  display: none;
}

.neo-panel {
  border: 1px solid rgba(223, 195, 151, 0.18);
  border-radius: 16px;
  background: linear-gradient(
    155deg,
    rgba(27, 23, 28, 0.94),
    rgba(14, 13, 16, 0.94)
  );
  box-shadow:
    0 16px 28px rgba(6, 5, 8, 0.34),
    inset 0 1px 0 rgba(255, 245, 230, 0.05);
  padding: 10px;
}

.panel-stack.right .neo-panel {
  border-color: var(--wf-panel-outline);
  background: var(--wf-panel-surface);
  box-shadow: var(--wf-panel-shadow);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.panel-head span {
  font-size: 12px;
  color: var(--orbit-muted);
}

.search-box {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(124, 160, 219, 0.32);
  border-radius: 10px;
  background: rgba(9, 18, 33, 0.62);
  padding: 6px 10px;
  font-size: 12px;
  color: var(--orbit-muted);
  margin-bottom: 10px;
}

.palette-scroll,
.saved-list,
.inspector-body,
.run-history {
  min-height: 0;
  overflow: auto;
}

.palette-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 360px);
}

.palette-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--orbit-muted);
}

.group-title small {
  border: 1px solid rgba(124, 160, 219, 0.26);
  border-radius: 999px;
  padding: 1px 8px;
}

.palette-node {
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(124, 160, 219, 0.26);
  border-radius: 10px;
  background: rgba(10, 20, 36, 0.6);
  color: var(--orbit-text);
  text-align: left;
  padding: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.palette-node:hover {
  border-color: rgba(255, 138, 83, 0.62);
  transform: translateX(2px);
}

.node-badge {
  height: 22px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    145deg,
    rgba(44, 212, 196, 0.2),
    rgba(255, 138, 83, 0.24)
  );
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: var(--orbit-text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.node-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-meta strong {
  font-size: 13px;
}

.node-meta small {
  font-size: 11px;
  color: var(--orbit-muted);
}

.saved-panel {
  display: flex;
  flex-direction: column;
  min-height: 220px;
}

.saved-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.saved-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(124, 160, 219, 0.26);
  border-radius: 10px;
  background: rgba(10, 20, 36, 0.6);
  padding: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.saved-item.active {
  border-color: rgba(44, 212, 196, 0.72);
  box-shadow: 0 0 0 1px rgba(44, 212, 196, 0.26);
}

.saved-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.saved-item-main strong {
  font-size: 13px;
}

.saved-item-main small {
  font-size: 11px;
  color: var(--orbit-muted);
}

.saved-delete {
  border: 1px solid rgba(255, 109, 115, 0.36);
  border-radius: 8px;
  background: rgba(255, 109, 115, 0.14);
  color: #ffd8da;
  font-size: 11px;
  min-width: 46px;
  height: 28px;
  cursor: pointer;
}

.center-hub {
  grid-area: center;
  --wf-panel-accent: var(--wf-accent-warm);
  --wf-panel-outline: rgba(217, 138, 55, 0.16);
  --wf-panel-outline-strong: rgba(244, 197, 107, 0.3);
  --wf-panel-surface: linear-gradient(
    180deg,
    rgba(18, 14, 12, 0.98),
    rgba(11, 11, 12, 0.98)
  );
  --wf-panel-surface-2: linear-gradient(
    180deg,
    rgba(20, 15, 13, 0.98),
    rgba(13, 12, 13, 0.98)
  );
  --wf-panel-chip-bg: rgba(30, 20, 12, 0.9);
  --wf-panel-shadow: 0 1.2rem 2.4rem rgba(11, 8, 5, 0.22);
  --wf-panel-muted: #dfccb3;
  position: relative;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.bridge-bar {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 104px;
  padding: 0;
}

.bridge-bar:hover,
.bridge-bar.pinned {
  left: 0;
  min-width: 0;
  border: 1px solid var(--orbit-border);
  border-radius: 14px;
  background: var(--orbit-surface-strong);
  box-shadow:
    0 16px 28px rgba(3, 8, 20, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  padding: 12px;
}

.bridge-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.bridge-meta,
.bridge-body {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  pointer-events: none;
  transform: translateY(-6px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    max-height 0.18s ease;
}

.bridge-bar:hover .bridge-header,
.bridge-bar.pinned .bridge-header {
  justify-content: space-between;
}

.bridge-bar:hover .bridge-meta,
.bridge-bar:hover .bridge-body,
.bridge-bar.pinned .bridge-meta,
.bridge-bar.pinned .bridge-body {
  opacity: 1;
  max-height: 480px;
  pointer-events: auto;
  transform: translateY(0);
}

.bridge-header strong {
  display: block;
  font-size: 13px;
}

.bridge-header small {
  font-size: 11px;
  color: var(--orbit-muted);
}

.bridge-toggle {
  border: 1px solid rgba(124, 160, 219, 0.32);
  border-radius: 999px;
  background: rgba(10, 20, 36, 0.92);
  color: var(--orbit-text);
  font-size: 12px;
  font-weight: 700;
  min-height: 34px;
  padding: 0 14px;
  cursor: pointer;
}

.bridge-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
}

.bridge-line {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.bridge-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--orbit-muted);
}

.bridge-select {
  min-height: 34px;
}

.bridge-node-picker {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--orbit-muted);
}

.picker-head small {
  border: 1px solid rgba(124, 160, 219, 0.28);
  border-radius: 999px;
  padding: 1px 8px;
}

.picker-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.picker-search {
  min-height: 30px;
  font-size: 12px;
}

.picker-filters {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 1px;
}

.picker-filter {
  border: 1px solid rgba(124, 160, 219, 0.28);
  border-radius: 999px;
  background: rgba(10, 20, 36, 0.7);
  color: var(--orbit-muted);
  min-height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  cursor: pointer;
  flex: 0 0 auto;
}

.picker-filter small {
  font-size: 10px;
  color: color-mix(in srgb, var(--orbit-muted) 70%, #ffffff 30%);
}

.picker-filter.active {
  border-color: rgba(255, 138, 83, 0.7);
  color: #fff1dd;
  background: rgba(255, 138, 83, 0.2);
}

.picker-list {
  display: flex;
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.picker-node {
  --picker-accent: #8eb2f4;
  flex: 0 0 auto;
  width: 212px;
  border: 1px solid
    color-mix(in srgb, var(--picker-accent) 42%, rgba(124, 160, 219, 0.26));
  border-radius: 9px;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--picker-accent) 14%, rgba(8, 18, 33, 0.82)),
    rgba(8, 18, 33, 0.62)
  );
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: stretch;
}

.picker-node.status-running {
  box-shadow: 0 0 0 1px rgba(44, 212, 196, 0.26) inset;
}

.picker-node.status-success {
  box-shadow: 0 0 0 1px rgba(118, 225, 149, 0.24) inset;
}

.picker-node.status-failed {
  box-shadow: 0 0 0 1px rgba(255, 109, 115, 0.24) inset;
}

.picker-node.status-cancelled {
  box-shadow: 0 0 0 1px rgba(242, 192, 98, 0.24) inset;
}

.picker-node.selected {
  border-color: rgba(44, 212, 196, 0.68);
  box-shadow:
    0 0 0 1px rgba(44, 212, 196, 0.22),
    0 10px 20px rgba(5, 11, 23, 0.28);
}

.picker-node.as-source {
  border-color: rgba(255, 138, 83, 0.78);
}

.picker-node.as-target {
  border-color: rgba(120, 224, 164, 0.76);
}

.picker-main {
  border: 0;
  background: transparent;
  color: var(--orbit-text);
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.picker-main strong {
  font-size: 12px;
  line-height: 1.2;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.picker-main small {
  font-size: 10px;
  color: var(--orbit-muted);
  white-space: normal;
  overflow-wrap: anywhere;
}

.picker-actions {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 4px 4px 0;
}

.picker-assign {
  width: 28px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(124, 160, 219, 0.35);
  background: rgba(10, 20, 36, 0.78);
  color: var(--orbit-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.picker-assign.source:hover {
  border-color: rgba(255, 138, 83, 0.72);
  color: #ffe8d8;
}

.picker-assign.target:hover {
  border-color: rgba(120, 224, 164, 0.72);
  color: #dffff0;
}

.picker-empty {
  font-size: 12px;
  padding: 2px 2px 0;
}

.bridge-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bridge-btn {
  border: 1px solid rgba(124, 160, 219, 0.32);
  border-radius: 9px;
  background: rgba(10, 20, 36, 0.76);
  color: var(--orbit-text);
  font-size: 12px;
  font-weight: 600;
  height: 32px;
  padding: 0 10px;
  cursor: pointer;
}

.bridge-btn:hover:not(:disabled) {
  border-color: rgba(255, 138, 83, 0.62);
}

.bridge-btn:disabled,
.zoom-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bridge-btn.ghost {
  background: rgba(9, 19, 35, 0.52);
}

.bridge-btn.launch {
  border-color: rgba(255, 138, 83, 0.68);
  background: linear-gradient(
    135deg,
    rgba(255, 138, 83, 0.26),
    rgba(255, 194, 102, 0.18)
  );
}

.bridge-btn.stop {
  border-color: rgba(255, 109, 115, 0.56);
  background: rgba(255, 109, 115, 0.2);
}

.dispatch-presets {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 9px;
  background: rgba(8, 17, 31, 0.7);
  padding: 3px;
}

.preset-btn {
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--orbit-muted);
  font-size: 11px;
  height: 24px;
  padding: 0 8px;
  cursor: pointer;
}

.preset-btn.active {
  border-color: rgba(255, 138, 83, 0.58);
  background: rgba(255, 138, 83, 0.2);
  color: #fff2df;
}

.zoom-cluster {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 9px;
  background: rgba(8, 17, 31, 0.72);
  padding: 3px 8px;
  font-size: 12px;
  color: var(--orbit-muted);
}

.zoom-btn {
  border: 1px solid rgba(124, 160, 219, 0.36);
  border-radius: 7px;
  width: 24px;
  height: 24px;
  background: rgba(10, 20, 36, 0.86);
  color: var(--orbit-text);
  cursor: pointer;
}

.canvas-gesture-hint {
  font-size: 11px;
  color: color-mix(in srgb, var(--orbit-muted) 78%, #ffffff 22%);
}

.flow-canvas-shell {
  position: relative;
  overflow: auto;
  min-height: clamp(28rem, 62vh, 42rem);
  border: 1px solid rgba(223, 195, 151, 0.18);
  border-radius: 1.25rem;
  background:
    radial-gradient(
      circle at 15% 14%,
      rgba(217, 138, 55, 0.12),
      transparent 34%
    ),
    radial-gradient(
      circle at 86% 18%,
      rgba(47, 208, 203, 0.12),
      transparent 30%
    ),
    linear-gradient(180deg, rgba(24, 18, 16, 0.98), rgba(8, 10, 12, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 245, 230, 0.04),
    0 1.2rem 2.4rem rgba(7, 6, 8, 0.36);
}

.flow-canvas-shell.pan-ready {
  cursor: grab;
}

.flow-canvas-shell.panning {
  cursor: grabbing;
}

.flow-canvas-shell.panning :is(.flow-node-card, .port, .edge-path) {
  pointer-events: none;
}

.flow-canvas-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(87, 161, 154, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(87, 161, 154, 0.1) 1px, transparent 1px),
    linear-gradient(rgba(217, 138, 55, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(217, 138, 55, 0.12) 1px, transparent 1px);
  background-size:
    26px 26px,
    26px 26px,
    104px 104px,
    104px 104px;
  background-position:
    -1px -1px,
    -1px -1px,
    -1px -1px,
    -1px -1px;
}

.canvas-scene {
  position: relative;
  width: 1320px;
  height: 760px;
}

.canvas-content {
  position: relative;
  width: 1320px;
  height: 760px;
  transform-origin: top left;
}

.edge-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.edge-path {
  fill: none;
  stroke: color-mix(
    in srgb,
    rgba(138, 230, 223, 0.7) 48%,
    rgba(244, 197, 107, 0.78) 52%
  );
  stroke-width: 2.3;
  pointer-events: auto;
  cursor: pointer;
  opacity: 0.82;
  filter: drop-shadow(0 0 0.2rem rgba(9, 9, 12, 0.48));
}

.edge-path.selected {
  stroke: #fff3d4;
  stroke-width: 3.2;
  filter: drop-shadow(0 0 0.35rem rgba(244, 197, 107, 0.34))
    drop-shadow(0 0 0.2rem rgba(138, 230, 223, 0.18));
}

.edge-path-temporary {
  stroke: rgba(255, 245, 230, 0.92);
  stroke-width: 2.2;
  stroke-dasharray: 7 5;
  opacity: 0.94;
  pointer-events: none;
}

.edge-path-connected {
  stroke: #ffe29a;
  stroke-width: 3.8;
  filter: drop-shadow(0 0 0.55rem rgba(255, 226, 154, 0.42));
  animation: edge-connect-flash 0.9s ease;
}

.edge-arrow {
  fill: color-mix(
    in srgb,
    rgba(138, 230, 223, 0.72) 44%,
    rgba(244, 197, 107, 0.84) 56%
  );
}

.flow-node-card {
  --node-accent: #d9c3a2;
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
  width: var(--node-width, 238px);
  min-height: var(--node-height, 128px);
  height: auto;
  box-sizing: border-box;
  overflow: visible;
  border-radius: 0.85rem;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 42%, rgba(255, 245, 230, 0.08));
  background: linear-gradient(
    180deg,
    rgba(12, 12, 15, 0.98),
    rgba(28, 22, 20, 0.94)
  );
  box-shadow:
    0 14px 26px rgba(6, 5, 8, 0.38),
    inset 0 1px 0 rgba(255, 245, 230, 0.07);
  padding: 0.62rem 0.68rem 0.55rem;
  cursor: move;
  user-select: none;
}

.flow-node-card.cat-whisper {
  --node-accent: #58d2cf;
}

.flow-node-card.cat-tg {
  --node-accent: #97d48c;
}

.flow-node-card.cat-asmr {
  --node-accent: #db6d77;
}

.flow-node-card.cat-files,
.flow-node-card.cat-file {
  --node-accent: #c6a2df;
}

.flow-node-card.cat-tools,
.flow-node-card.cat-util {
  --node-accent: #78d7cb;
}

.flow-node-card.cat-input,
.flow-node-card.cat-output,
.flow-node-card.cat-clean {
  --node-accent: #e0a34c;
}

.flow-node-card.cat-other {
  --node-accent: #d9c3a2;
}

.flow-node-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 0.22rem;
  border-radius: 0.85rem 0.85rem 0 0;
  background: linear-gradient(90deg, var(--node-accent), transparent 78%);
  pointer-events: none;
}

.flow-node-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 245, 230, 0.04);
  pointer-events: none;
}

.flow-node-card.active {
  border-color: color-mix(
    in srgb,
    var(--node-accent) 72%,
    rgba(255, 255, 255, 0.18)
  );
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--node-accent) 32%, transparent),
    0 18px 30px rgba(6, 5, 8, 0.42);
}

.flow-node-card.connect-ready,
.flow-node-card.connect-hover {
  box-shadow:
    0 0 0 1px
      color-mix(in srgb, var(--node-accent) 26%, rgba(255, 255, 255, 0.08)),
    0 0 0 3px color-mix(in srgb, var(--node-accent) 12%, transparent),
    0 18px 30px rgba(6, 5, 8, 0.42);
}

.flow-node-card.connect-feedback {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.12),
    0 0 0 3px
      color-mix(in srgb, var(--node-accent) 28%, rgba(255, 245, 230, 0.08)),
    0 20px 32px rgba(6, 5, 8, 0.46);
}

.node-port-cluster {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  pointer-events: none;
  z-index: 3;
}

.node-port-cluster-in {
  left: -0.92rem;
  flex-direction: row-reverse;
}

.node-port-cluster-out {
  right: -0.92rem;
}

.port-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 26%, rgba(255, 245, 230, 0.08));
  background: rgba(9, 9, 12, 0.9);
  color: color-mix(in srgb, var(--node-accent) 72%, #ffffff 28%);
  font-family: var(--wf-font-mono);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.port {
  position: static;
  width: 0.84rem;
  height: 0.84rem;
  border-radius: 999px;
  border: 2px solid rgba(9, 9, 12, 0.96);
  transform: none;
  background: color-mix(in srgb, var(--node-accent) 78%, #ffffff 22%);
  box-shadow:
    0 0 0 1px
      color-mix(in srgb, var(--node-accent) 52%, rgba(255, 245, 230, 0.18)),
    0 0 0.85rem color-mix(in srgb, var(--node-accent) 22%, transparent);
  pointer-events: auto;
}

.node-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4rem;
  padding-bottom: 0.38rem;
  border-bottom: 1px solid
    color-mix(in srgb, var(--node-accent) 18%, rgba(255, 245, 230, 0.06));
}

.node-header-main {
  display: flex;
  gap: 0.48rem;
  min-width: 0;
  flex: 1;
}

.flow-node-card .node-badge {
  flex-shrink: 0;
  min-width: 1.55rem;
  height: 1.35rem;
  border-radius: 0.42rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 40%, rgba(255, 245, 230, 0.08));
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--node-accent) 30%, rgba(255, 245, 230, 0.08)),
    rgba(19, 16, 17, 0.78)
  );
  font-family: var(--wf-font-mono);
  font-size: var(--node-badge-size, 0.55rem);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.node-header-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 0.18rem;
}

.node-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.35rem;
}

.node-name {
  min-width: 0;
  margin: 0;
  font-size: var(--node-name-size, 0.96rem);
  line-height: 1.16;
  white-space: normal;
  overflow-wrap: anywhere;
}

.node-family {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 1rem;
  padding: 0 0.32rem;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 28%, rgba(255, 245, 230, 0.08));
  background: rgba(17, 16, 19, 0.84);
  color: color-mix(in srgb, var(--node-accent) 72%, #ffffff 28%);
  font-family: var(--wf-font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.node-type {
  margin: 0;
  color: #c5b8a8;
  font-size: var(--node-type-size, 0.66rem);
  letter-spacing: 0.03em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.node-toolbar {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.node-status-light {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #8f8577;
  box-shadow: 0 0 0.55rem rgba(143, 133, 119, 0.32);
}

.node-status-light.running {
  background: #58d2cf;
  box-shadow: 0 0 0.7rem rgba(88, 210, 207, 0.42);
}

.node-status-light.success {
  background: #97d48c;
  box-shadow: 0 0 0.7rem rgba(151, 212, 140, 0.42);
}

.node-status-light.failed {
  background: #db6d77;
  box-shadow: 0 0 0.7rem rgba(219, 109, 119, 0.42);
}

.node-status-light.cancelled {
  background: #e0a34c;
  box-shadow: 0 0 0.7rem rgba(224, 163, 76, 0.42);
}

.node-runtime-pill {
  margin-left: 0;
  display: inline-flex;
  align-items: center;
  min-height: 1.15rem;
  padding: 0 0.38rem;
  border: 1px solid rgba(223, 195, 151, 0.24);
  border-radius: 999px;
  font-family: var(--wf-font-mono);
  font-size: var(--node-pill-size, 0.52rem);
  letter-spacing: 0.05em;
  color: #c9bba7;
  background: rgba(14, 13, 16, 0.82);
}

.node-runtime-pill.running {
  border-color: rgba(88, 210, 207, 0.48);
  color: #cffffa;
}

.node-runtime-pill.success {
  border-color: rgba(151, 212, 140, 0.48);
  color: #e4ffe0;
}

.node-runtime-pill.failed {
  border-color: rgba(219, 109, 119, 0.48);
  color: #ffe0e3;
}

.node-runtime-pill.cancelled {
  border-color: rgba(224, 163, 76, 0.48);
  color: #ffefcf;
}

.node-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.22rem;
  height: 1.22rem;
  border: 1px solid rgba(221, 105, 118, 0.3);
  border-radius: 0.36rem;
  background: rgba(76, 23, 31, 0.52);
  color: #ffe6e7;
  font-size: 0.82rem;
  line-height: 1;
  cursor: pointer;
}

.node-subline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
}

.node-id {
  min-width: 0;
  flex: 1;
  color: #8f8272;
  font-family: var(--wf-font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1rem;
  max-width: 100%;
  padding: 0 0.32rem;
  border-radius: 999px;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 22%, rgba(255, 245, 230, 0.06));
  background: rgba(18, 16, 18, 0.86);
  color: #eadac2;
  font-family: var(--wf-font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-chip.subtle {
  color: #aa9f91;
  white-space: normal;
  overflow-wrap: anywhere;
}

.node-params {
  display: grid;
  gap: 0.28rem;
  min-height: 0;
}

.node-param {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.28rem 0.45rem;
  min-height: 1.4rem;
  padding: 0.22rem 0.38rem;
  border-radius: 0.55rem;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 14%, rgba(255, 245, 230, 0.05));
  background: rgba(11, 11, 14, 0.72);
}

.node-param-key {
  color: color-mix(in srgb, var(--node-accent) 56%, #ffffff 44%);
  font-family: var(--wf-font-mono);
  font-size: 0.48rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.node-param-value {
  display: block;
  min-width: 0;
  font-size: var(--node-config-size, 0.68rem);
  font-weight: 600;
  line-height: 1.28;
  color: #f0e5d4;
  white-space: normal;
  overflow-wrap: anywhere;
}

.node-param.is-path .node-param-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-param-popover {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 0.24rem);
  z-index: 5;
  display: none;
  padding: 0.42rem 0.5rem;
  border: 1px solid
    color-mix(in srgb, var(--node-accent) 22%, rgba(255, 245, 230, 0.08));
  border-radius: 0.5rem;
  background: rgba(8, 8, 10, 0.96);
  box-shadow: 0 0.75rem 1.4rem rgba(6, 5, 8, 0.34);
  font-size: 0.64rem;
  font-weight: 500;
  line-height: 1.32;
  color: #f7ecdc;
  white-space: normal;
  overflow-wrap: anywhere;
  pointer-events: none;
}

.node-param.expandable:hover .node-param-popover,
.node-param.expandable:focus-within .node-param-popover {
  display: block;
}

.node-param-empty .node-param-value {
  color: #a79a88;
}

.node-footer {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  padding-top: 0.12rem;
  border-top: 1px dashed
    color-mix(in srgb, var(--node-accent) 18%, rgba(255, 245, 230, 0.06));
}

.node-inline-panel {
  position: absolute;
  z-index: 4;
  max-height: 420px;
  overflow: hidden;
  border: 1px solid rgba(217, 138, 55, 0.28);
  border-radius: 14px;
  background: linear-gradient(
    160deg,
    rgba(43, 27, 18, 0.96),
    rgba(15, 13, 16, 0.95)
  );
  box-shadow: 0 20px 38px rgba(22, 10, 5, 0.42);
  padding: 12px;
}

.node-inline-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  cursor: grab;
}

.node-inline-head.dragging {
  cursor: grabbing;
}

.node-inline-head strong {
  display: block;
  font-size: 14px;
}

.node-inline-head small {
  font-size: 11px;
  color: var(--orbit-muted);
}

.node-inline-head-actions {
  display: inline-flex;
  gap: 6px;
}

.inline-head-btn {
  border: 1px solid rgba(217, 138, 55, 0.24);
  border-radius: 8px;
  background: rgba(20, 15, 17, 0.82);
  color: var(--orbit-text);
  font-size: 11px;
  min-width: 36px;
  height: 28px;
  cursor: pointer;
}

.inline-head-btn.close {
  color: #ffd8da;
  border-color: rgba(255, 109, 115, 0.36);
}

.node-inline-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.node-inline-tabs .tab-btn {
  flex: 1;
}

.node-inline-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.node-inline-body-runtime {
  gap: 10px;
}

.node-inline-config-body {
  max-height: 420px;
  padding-right: 4px;
}

.node-inline-body-attrs {
  gap: 6px;
}

.node-inline-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--orbit-muted);
}

.node-inline-meta strong {
  color: var(--orbit-text);
  font-size: 13px;
}

.inline-config-editor {
  min-height: 160px;
}

.inline-runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.runtime-kv-item.compact {
  min-height: 0;
}

.inline-log-console {
  min-height: 144px;
  max-height: 220px;
}

.canvas-navigator {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 238px;
  border: 1px solid rgba(217, 138, 55, 0.28);
  border-radius: 10px;
  background: linear-gradient(
    160deg,
    rgba(36, 24, 17, 0.92),
    rgba(12, 12, 15, 0.92)
  );
  box-shadow: 0 10px 24px rgba(20, 9, 4, 0.36);
  padding: 8px;
  z-index: 3;
}

.navigator-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 11px;
  color: #e1cfb2;
}

.navigator-head strong {
  letter-spacing: 0.03em;
}

.navigator-map {
  position: relative;
  width: 220px;
  height: 132px;
  border-radius: 8px;
  border: 1px solid rgba(217, 138, 55, 0.22);
  background: rgba(15, 12, 14, 0.96);
  overflow: hidden;
  cursor: grab;
}

.navigator-map.dragging {
  cursor: grabbing;
}

.navigator-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(76, 165, 159, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(217, 138, 55, 0.14) 1px, transparent 1px);
  background-size: 18px 18px;
}

.navigator-node {
  --mini-accent: #8eb2f4;
  position: absolute;
  border-radius: 4px;
  border: 1px solid
    color-mix(in srgb, var(--mini-accent) 58%, rgba(121, 169, 243, 0.4));
  background: color-mix(in srgb, var(--mini-accent) 26%, rgba(8, 17, 31, 0.8));
  z-index: 1;
}

.navigator-node.status-running {
  border-color: rgba(44, 212, 196, 0.78);
}

.navigator-node.status-success {
  border-color: rgba(118, 225, 149, 0.78);
}

.navigator-node.status-failed {
  border-color: rgba(255, 109, 115, 0.78);
}

.navigator-node.status-cancelled {
  border-color: rgba(242, 192, 98, 0.76);
}

.navigator-node.selected {
  border-color: rgba(255, 138, 83, 0.82);
  background: rgba(255, 138, 83, 0.32);
}

.navigator-viewport {
  position: absolute;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(10, 19, 34, 0.62) inset;
  pointer-events: none;
  z-index: 2;
}

.runtime-dock {
  border: 1px solid rgba(217, 138, 55, 0.24);
  border-radius: 12px;
  background: linear-gradient(
    160deg,
    rgba(33, 22, 16, 0.88),
    rgba(11, 11, 14, 0.9)
  );
  box-shadow: 0 8px 22px rgba(20, 9, 4, 0.3);
  overflow: hidden;
}

.dock-toggle {
  width: 100%;
  border: 0;
  border-bottom: 1px solid rgba(217, 138, 55, 0.18);
  background: linear-gradient(
    180deg,
    rgba(52, 31, 18, 0.78),
    rgba(16, 14, 16, 0.92)
  );
  color: #f5e3c8;
  font-size: 12px;
  font-weight: 700;
  height: 32px;
  cursor: pointer;
}

.dock-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dock-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dock-tab {
  border: 1px solid rgba(217, 138, 55, 0.22);
  border-radius: 0.55rem;
  background: rgba(16, 14, 16, 0.78);
  color: #d0bca1;
  font-size: 10px;
  height: 22px;
  padding: 0 0.72rem;
  cursor: pointer;
}

.dock-tab.active {
  border-color: rgba(244, 197, 107, 0.42);
  background: rgba(217, 138, 55, 0.22);
  color: #fff4e2;
}

.dock-console {
  margin: 0;
  min-height: 110px;
  max-height: 180px;
  overflow: auto;
  border: 1px solid rgba(217, 138, 55, 0.18);
  border-radius: 0.65rem;
  background: rgba(9, 9, 12, 0.96);
  color: #efe1cb;
  font-family: var(--wf-font-mono);
  font-size: 11px;
  line-height: 1.42;
  padding: 0.6rem 0.65rem;
}

.inspector-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.65rem;
}

.inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--wf-panel-outline, rgba(223, 195, 151, 0.12));
}

.inspector-head h3 {
  margin: 0;
  font-size: 0.96rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-family: var(--wf-font-mono);
}

.inspector-head p {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: var(--wf-panel-muted, var(--orbit-muted));
}

.status-pill {
  border: 1px solid var(--wf-panel-outline, rgba(223, 195, 151, 0.24));
  border-radius: 999px;
  padding: 0.28rem 0.65rem;
  font-size: 10px;
  color: var(--wf-panel-muted, var(--orbit-muted));
  white-space: nowrap;
}

.status-pill.running,
.node-run-status.running,
.run-item-status.running {
  border-color: rgba(44, 212, 196, 0.58);
  color: #b3fff5;
}

.status-pill.success,
.node-run-status.success,
.run-item-status.success {
  border-color: rgba(118, 225, 149, 0.58);
  color: #d4ffe0;
}

.status-pill.failed,
.node-run-status.failed,
.run-item-status.failed {
  border-color: rgba(255, 109, 115, 0.58);
  color: #ffd7d9;
}

.status-pill.cancelled,
.node-run-status.cancelled,
.run-item-status.cancelled {
  border-color: rgba(242, 192, 98, 0.58);
  color: #ffe8be;
}

.inspector-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.tab-btn {
  border: 1px solid var(--wf-panel-outline, rgba(223, 195, 151, 0.18));
  border-radius: 0.65rem;
  background: rgba(12, 12, 15, 0.78);
  color: var(--wf-panel-muted, var(--orbit-muted));
  font-size: 11px;
  height: 30px;
  cursor: pointer;
}

.tab-btn.active {
  border-color: var(--wf-panel-outline-strong, rgba(244, 197, 107, 0.36));
  background: color-mix(
    in srgb,
    var(--wf-panel-accent, var(--orbit-hot)) 18%,
    rgba(15, 15, 18, 0.94)
  );
  color: var(--orbit-text);
}

.inspector-body {
  display: flex;
  flex-direction: column;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.form-stack {
  padding-right: 2px;
}

.config-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-meta small {
  font-size: 12px;
  color: var(--orbit-muted);
}

.special-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-picker-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.path-picker-row .input {
  flex: 1;
}

.form-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--wf-panel-muted, var(--orbit-muted));
}

.formats-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.format-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.format-checkbox input {
  display: none;
}

.format-pill {
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 11px;
  color: var(--orbit-muted);
  background: rgba(9, 19, 35, 0.65);
}

.format-checkbox input:checked + .format-pill {
  border-color: rgba(44, 212, 196, 0.6);
  background: rgba(44, 212, 196, 0.2);
  color: #c8fff8;
}

.checkbox-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--orbit-muted);
}

.runtime-divider {
  border-top: 1px dashed rgba(124, 160, 219, 0.3);
  margin-top: 4px;
}

.validation-box {
  border: 1px solid var(--wf-panel-outline, rgba(223, 195, 151, 0.22));
  border-radius: 0.75rem;
  background: rgba(11, 11, 14, 0.7);
  padding: 0.7rem;
}

.validation-box.invalid {
  border-color: rgba(255, 109, 115, 0.52);
}

.validation-status {
  font-size: 13px;
  font-weight: 600;
}

.validation-list {
  margin: 8px 0 0;
  padding-left: 16px;
  font-size: 12px;
}

.validation-list.warning {
  color: #ffe2ac;
}

.output-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.run-meta-grid,
.runtime-kv-grid,
.log-split-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

.meta-item,
.runtime-kv-item,
.progress-item,
.run-item,
.note-box {
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 10px;
  background: rgba(9, 19, 35, 0.62);
  padding: 8px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.meta-item span,
.runtime-kv-item span,
.progress-item span {
  font-size: 11px;
  color: var(--orbit-muted);
}

.meta-item strong,
.runtime-kv-item strong,
.progress-item strong {
  font-size: 12px;
}

.runtime-card {
  border: 1px solid rgba(124, 160, 219, 0.32);
  border-radius: 11px;
  background: rgba(10, 20, 36, 0.7);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.runtime-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.node-run-status {
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--orbit-muted);
}

.runtime-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.runtime-section-title,
.history-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--orbit-muted);
}

.log-panel {
  min-width: 0;
}

.run-console {
  margin: 0;
  min-height: 150px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 10px;
  background: rgba(6, 13, 24, 0.9);
  padding: 10px;
  color: #d6e2f6;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  line-height: 1.42;
}

.run-console.compact {
  min-height: 90px;
  max-height: 170px;
}

.desc-textarea,
.config-textarea {
  resize: vertical;
}

.config-textarea {
  min-height: 220px;
}

.desc-textarea {
  min-height: 90px;
}

.note-box strong {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
}

.note-box p {
  margin: 0;
  font-size: 12px;
  color: var(--orbit-muted);
  line-height: 1.4;
}

.node-attr-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.attr-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px 10px;
  align-items: end;
}

.size-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.run-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 250px;
}

.run-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.run-item-status {
  border: 1px solid rgba(124, 160, 219, 0.3);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--orbit-muted);
}

.run-item small,
.empty-hint,
.error-text {
  font-size: 12px;
}

.run-item small,
.empty-hint {
  color: var(--orbit-muted);
}

.error-text {
  color: #ffd1d4;
}

.workflow-orbit.workflow-orbit-hc {
  --orbit-text: #f7fbff;
  --orbit-muted: #b7cae5;
}

.workflow-orbit.workflow-orbit-hc .orbit-hero {
  border: 1px solid rgba(121, 169, 243, 0.62) !important;
  background: linear-gradient(
    118deg,
    rgba(7, 16, 31, 0.96) 0%,
    rgba(11, 24, 46, 0.95) 54%,
    rgba(23, 20, 37, 0.93) 100%
  ) !important;
}

.workflow-orbit.workflow-orbit-hc .bridge-bar {
  border: 1px solid rgba(121, 169, 243, 0.54) !important;
  background: linear-gradient(
    140deg,
    rgba(9, 19, 35, 0.96),
    rgba(7, 16, 30, 0.95)
  ) !important;
}

.workflow-orbit.workflow-orbit-hc .flow-canvas-shell {
  border: 1px solid rgba(121, 169, 243, 0.54) !important;
  background:
    radial-gradient(
      circle at 12% 14%,
      rgba(44, 212, 196, 0.12),
      transparent 42%
    ),
    radial-gradient(
      circle at 90% 86%,
      rgba(255, 138, 83, 0.16),
      transparent 36%
    ),
    linear-gradient(145deg, rgba(4, 10, 20, 0.98), rgba(6, 14, 25, 0.99)) !important;
}

.workflow-orbit.workflow-orbit-hc .flow-canvas-shell::before {
  background-image:
    linear-gradient(rgba(135, 171, 227, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(135, 171, 227, 0.12) 1px, transparent 1px),
    linear-gradient(rgba(135, 171, 227, 0.24) 1px, transparent 1px),
    linear-gradient(90deg, rgba(135, 171, 227, 0.24) 1px, transparent 1px);
}

.workflow-orbit.workflow-orbit-hc .hero-kicker {
  color: #8af8ea !important;
  font-size: 12px;
  font-weight: 700;
}

.workflow-orbit.workflow-orbit-hc .hero-title-input {
  font-size: 36px !important;
  font-weight: 800 !important;
  color: #f4f8ff !important;
}

.workflow-orbit.workflow-orbit-hc .hero-title-input::placeholder {
  color: rgba(214, 229, 247, 0.74) !important;
}

.workflow-orbit.workflow-orbit-hc .hero-chip {
  border-color: rgba(143, 181, 240, 0.55);
  background: rgba(6, 15, 29, 0.72);
  color: #e6f0ff;
  font-size: 13px;
}

.workflow-orbit.workflow-orbit-hc .node-meta strong,
.workflow-orbit.workflow-orbit-hc .saved-item-main strong,
.workflow-orbit.workflow-orbit-hc .form-label,
.workflow-orbit.workflow-orbit-hc .status-pill,
.workflow-orbit.workflow-orbit-hc .tab-btn,
.workflow-orbit.workflow-orbit-hc .bridge-field,
.workflow-orbit.workflow-orbit-hc .node-type,
.workflow-orbit.workflow-orbit-hc .node-config,
.workflow-orbit.workflow-orbit-hc .inspector-head p,
.workflow-orbit.workflow-orbit-hc .history-title,
.workflow-orbit.workflow-orbit-hc .empty-hint {
  color: #d7e6fb;
}

.workflow-orbit.workflow-orbit-hc .tab-btn {
  font-size: 13px;
  font-weight: 600;
}

.workflow-orbit.workflow-orbit-hc .tab-btn.active {
  color: #ffffff;
}

.workflow-orbit.workflow-orbit-hc .run-console {
  background: rgba(3, 10, 20, 0.98);
  border-color: rgba(121, 169, 243, 0.46);
  color: #e5efff;
  font-size: 13px;
  line-height: 1.52;
}

.workflow-orbit.workflow-orbit-hc :is(.input, .select, select, textarea) {
  border: 1px solid rgba(121, 169, 243, 0.56) !important;
  background: rgba(5, 13, 25, 0.95) !important;
  color: #f3f8ff !important;
  font-size: 13px;
}

.workflow-orbit.workflow-orbit-hc
  :is(.input, .select, select, textarea)::placeholder {
  color: rgba(196, 214, 238, 0.72);
}

.workflow-orbit.workflow-orbit-hc .flow-node-card {
  border-color: color-mix(
    in srgb,
    var(--node-accent) 46%,
    rgba(121, 169, 243, 0.4)
  );
  background:
    radial-gradient(
      circle at 10% 10%,
      color-mix(in srgb, var(--node-accent) 20%, rgba(8, 16, 28, 0)) 0%,
      rgba(8, 16, 28, 0) 48%
    ),
    linear-gradient(154deg, rgba(11, 24, 44, 0.98), rgba(7, 17, 33, 0.98));
}

.workflow-orbit.workflow-orbit-hc .node-name {
  font-size: 17px;
}

.workflow-orbit :is(.input, .select, select, textarea) {
  width: 100%;
  border: 1px solid rgba(124, 160, 219, 0.34);
  border-radius: 9px;
  background: rgba(8, 17, 31, 0.82);
  color: var(--orbit-text);
  min-height: 34px;
  padding: 7px 10px;
  box-sizing: border-box;
}

.workflow-orbit :is(.input, .select, select, textarea):focus {
  outline: none;
  border-color: rgba(44, 212, 196, 0.68);
  box-shadow: 0 0 0 2px rgba(44, 212, 196, 0.16);
}

.workflow-orbit input[type="checkbox"] {
  accent-color: var(--orbit-cool);
}

@keyframes edge-connect-flash {
  0% {
    stroke-dasharray: 10 8;
    opacity: 0.3;
  }

  35% {
    opacity: 1;
  }

  100% {
    stroke-dasharray: 0 0;
    opacity: 1;
  }
}

@keyframes node-connect-pulse {
  0% {
    transform: scale(0.98);
  }

  40% {
    transform: scale(1.02);
  }

  100% {
    transform: scale(1);
  }
}

@media (min-width: 768px) {
  .orbit-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .path-picker-row {
    flex-direction: row;
    align-items: center;
  }

  .run-meta-grid,
  .runtime-kv-grid,
  .log-split-grid,
  .attr-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inspector-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .orbit-hero {
    grid-template-columns: minmax(0, 1.5fr) minmax(24rem, 34rem);
    align-items: start;
  }

  .hero-actions {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .orbit-overview {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .orbit-layout {
    grid-template-columns: minmax(18rem, 20rem) minmax(0, 1fr);
    grid-template-areas:
      "left center"
      "right right";
  }

  .canvas-navigator {
    width: 13rem;
    right: 1rem;
    bottom: 1rem;
  }

  .navigator-map {
    width: 11.5rem;
    height: 7rem;
  }
}

@media (min-width: 1440px) {
  .orbit-overview {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .orbit-layout {
    grid-template-columns: minmax(18rem, 20rem) minmax(0, 1fr) minmax(
        20rem,
        23rem
      );
    grid-template-areas: "left center right";
  }

  .flow-canvas-shell {
    min-height: clamp(34rem, 68vh, 50rem);
  }
}
</style>
