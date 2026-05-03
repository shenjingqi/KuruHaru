<template>
  <div
    ref="canvasRef"
    class="flow-canvas-shell"
    :class="{
      panning: canvasPan.active,
      'pan-ready':
        (spacePanPressed || canvasStore.navigationMode === 'pan') &&
        !canvasPan.active,
      'canvas-pan-mode': canvasStore.navigationMode === 'pan',
      'canvas-locked': canvasStore.locked,
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
    @click="
      handleCanvasBackgroundClick($event);
      closeFloatingNodeToolbarMenu();
    "
    @dblclick="handleCanvasBackgroundDoubleClick($event)"
    @contextmenu.prevent="openCanvasContextMenu($event)"
    @dragover.prevent="handleCanvasDragOver($event)"
    @drop.prevent="handleCanvasDrop($event)"
  >
    <header v-if="comfyParityMode" class="comfy-canvas-topbar">
      <div class="comfy-canvas-topbar-main">
        <span class="comfy-canvas-title">工作流</span>
        <span class="comfy-canvas-badge" :class="heroModeBadge.tone">
          {{ heroModeBadge.label }}
        </span>
        <span class="comfy-canvas-subgraph">
          {{ activeSubgraphId ? `子图 · ${activeSubgraphId}` : "根图" }}
        </span>
      </div>
      <div class="comfy-canvas-topbar-actions">
        <div class="comfy-topbar-shell">
          <div class="comfy-topbar-ops">
            <button
              type="button"
              class="comfy-topbar-btn"
              @click="saveCurrentWorkflow"
            >
              保存
            </button>
            <button
              type="button"
              class="comfy-topbar-btn"
              :disabled="isValidating"
              @click="validateCurrentWorkflow"
            >
              校验
            </button>
            <button
              v-if="canExitActiveSubgraph"
              type="button"
              class="comfy-topbar-btn"
              @click="exitSubgraph"
            >
              返回上级
            </button>
          </div>

          <span class="comfy-topbar-divider" aria-hidden="true" />

          <div class="comfy-run-control">
            <button
              type="button"
              class="comfy-run-control-btn comfy-run-control-btn-primary"
              :disabled="isValidating"
              @click="handleTopbarRun"
            >
              <svg
                class="comfy-run-control-icon"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
              </svg>
              <span>运行</span>
              <svg
                class="comfy-run-control-caret"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5 6.5l3 3 3-3" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-run-control-btn comfy-run-control-btn-secondary"
              :disabled="isValidating"
              title="前插到队列最前"
              @click="handleTopbarRunFront"
            >
              前插
            </button>

            <button
              type="button"
              class="comfy-run-control-btn comfy-run-control-btn-count"
              :class="{ active: runtimeDockTab === 'queue' && logDockExpanded }"
              :title="`待执行 ${pendingQueueCount} / 运行中 ${runningQueueCount}`"
              @click="openQueueDock"
            >
              {{ pendingQueueCount }}
            </button>

            <button
              type="button"
              class="comfy-run-control-btn comfy-run-control-btn-danger"
              :disabled="!canStopOrClearQueue"
              :title="isRunInProgress ? '停止当前运行' : '清空待执行队列'"
              @click="handleTopbarStopOrClear"
            >
              <svg
                class="comfy-run-control-icon comfy-run-control-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5 5h6v6H5z" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-run-control-btn"
              :class="{ active: runtimeDockTab === 'queue' && logDockExpanded }"
              title="查看队列"
              @click="openQueueDock"
            >
              <svg
                class="comfy-run-control-icon comfy-run-control-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M4 4.5h8" />
                <path d="M4 8h8" />
                <path d="M4 11.5h8" />
              </svg>
              <span class="comfy-run-control-badge">{{
                pendingQueueCount
              }}</span>
            </button>

            <button
              type="button"
              class="comfy-run-control-btn"
              :class="{
                active: runtimeDockTab === 'history' && logDockExpanded,
              }"
              title="查看历史"
              @click="openHistoryDock"
            >
              <svg
                class="comfy-run-control-icon comfy-run-control-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="5.5" />
                <path d="M8 5v3.2l2 1.3" />
              </svg>
              <span class="comfy-run-control-badge muted">{{
                historyCount
              }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
    <div class="canvas-scene" :style="canvasSceneStyle">
      <div class="canvas-content" :style="canvasContentStyle">
        <div class="group-layer">
          <article
            v-for="group in visibleGroupVisualList"
            :key="group.id"
            class="canvas-group-card"
            :class="[
              { active: isGroupSelected(group.id) },
              {
                dragging:
                  groupDragState.active && groupDragState.groupId === group.id,
              },
              {
                resizing:
                  groupResizeState.active &&
                  groupResizeState.groupId === group.id,
              },
            ]"
            :style="getGroupCardStyle(group)"
            @click.stop="handleGroupCardClick(group.id, $event)"
            @mousedown.left.stop.prevent="startGroupDrag(group, $event)"
            @contextmenu.prevent.stop="openGroupContextMenu(group.id, $event)"
          >
            <header class="canvas-group-head">
              <span class="canvas-group-title">{{ group.label }}</span>
              <small class="canvas-group-count"
                >{{ group.nodes.length }} 个节点</small
              >
            </header>
            <span
              class="canvas-group-resize-handle canvas-group-resize-handle-nw"
              @pointerdown.stop.prevent="startGroupResize(group, 'NW', $event)"
            />
            <span
              class="canvas-group-resize-handle canvas-group-resize-handle-ne"
              @pointerdown.stop.prevent="startGroupResize(group, 'NE', $event)"
            />
            <span
              class="canvas-group-resize-handle canvas-group-resize-handle-sw"
              @pointerdown.stop.prevent="startGroupResize(group, 'SW', $event)"
            />
            <span
              class="canvas-group-resize-handle canvas-group-resize-handle-se"
              @pointerdown.stop.prevent="startGroupResize(group, 'SE', $event)"
            />
          </article>
        </div>
        <svg class="edge-layer">
          <defs v-if="!comfyParityMode">
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
            v-for="edge in visibleEdgeVisualList"
            :key="edge.id"
            class="edge-path"
            :class="[
              { selected: selectedEdgeId === edge.id },
              {
                'edge-path-connected': connectFeedback.edgeId === edge.id,
              },
            ]"
            :d="toEdgePath(edge)"
            :style="getEdgePathStyle(edge)"
            :marker-end="comfyParityMode ? null : 'url(#workflow-arrow)'"
            @click.stop="handleEdgePathClick(edge.id, $event)"
            @dblclick.stop.prevent="handleEdgePathDoubleClick(edge.id, $event)"
            @contextmenu.prevent.stop="openEdgeContextMenu(edge.id, $event)"
          />
        </svg>
        <button
          v-for="reroute in visibleRerouteVisualList"
          :key="reroute.id"
          type="button"
          class="edge-reroute-handle"
          :class="{ active: isRerouteSelected(reroute.id) }"
          :style="getRerouteHandleStyle(reroute)"
          @click.stop="handleRerouteHandleClick(reroute.id, $event)"
          @pointerdown.stop.prevent="startRerouteDrag(reroute, $event)"
          @contextmenu.prevent.stop="openRerouteContextMenu(reroute.id, $event)"
        />

        <article
          v-for="node in visibleNodeVisualList"
          :key="node.id"
          :ref="(element) => setNodeCardRef(node.id, element)"
          :data-node-id="node.id"
          class="flow-node-card lg-node"
          :class="[
            { active: isNodeSelected(node.id) },
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
            {
              'role-input-node': isInputBoundaryNode(node.id),
              'role-output-node': isOutputBoundaryNode(node.id),
            },
            {
              'is-resizing':
                nodeResizeState.active && nodeResizeState.nodeId === node.id,
            },
            {
              'is-dragging': isNodeBatchDragging(node.id),
            },
            getNodeCardStateClass(node),
            `status-${getNodeRuntimeStatusClass(node.id)}`,
            getNodeCategoryClass(node.type),
          ]"
          :style="getNodeCardStyle(node)"
          @click.stop="handleNodeCardClick(node.id, $event)"
          @mousedown.left.stop.prevent="handleNodeDragStart(node, $event)"
          @mouseup="handleNodeCardMouseUp"
          @contextmenu.prevent.stop="openNodeContextMenu(node.id, $event)"
        >
          <div
            class="node-port-cluster node-port-cluster-in"
            :class="{
              linked: hasNodePortLinked(node.id, 'in'),
              boundary: isInputBoundaryNode(node.id),
            }"
            :title="`入参：${getNodePortDetailLabel(node, 'in')}`"
          >
            <div
              v-for="port in getNodePortSlots(node, 'in')"
              :key="`${node.id}-in-${port.key}`"
              class="node-port-slot-row lg-slot lg-slot--input"
              :style="getNodePortSlotStyle(node, 'in', port)"
              :class="{
                linked: isNodePortSlotLinked(node.id, 'in', port.key),
                hover:
                  connectHoverNodeId === node.id &&
                  connectHoverPortKey === port.key,
                'connect-compatible': isNodePortConnectable(node.id, port.key),
                'connect-blocked': isNodePortConnectBlocked(node.id, port.key),
              }"
            >
              <span
                class="port port-in slot-dot"
                :title="`${getNodePortSlotStatusLabel(node.id, 'in', port.key)} · ${port.label} · ${getNodePortSlotTypeLabel(port)} · ${port.key}`"
                @mouseenter.stop="updateConnectHoverNode(node.id, port.key)"
                @mousemove.stop="updateConnectHoverNode(node.id, port.key)"
                @mouseleave.stop="
                  updateConnectHoverNode(node.id, port.key, false)
                "
                @mouseup.stop.prevent="finishEdgeConnect(node.id, port.key)"
              />
              <span class="port-slot-label port-slot-label-in">
                <span class="port-slot-main">{{ port.label }}</span>
                <span
                  v-if="shouldShowNodePortSlotType(port)"
                  class="port-slot-type"
                >
                  {{ getNodePortSlotTypeLabel(port) }}
                </span>
              </span>
            </div>
          </div>
          <div
            class="node-port-cluster node-port-cluster-out"
            :class="{
              linked: hasNodePortLinked(node.id, 'out'),
              boundary: isOutputBoundaryNode(node.id),
            }"
            :title="`出参：${getNodePortDetailLabel(node, 'out')}`"
          >
            <div
              v-for="port in getNodePortSlots(node, 'out')"
              :key="`${node.id}-out-${port.key}`"
              class="node-port-slot-row lg-slot lg-slot--output"
              :style="getNodePortSlotStyle(node, 'out', port)"
              :class="{
                linked: isNodePortSlotLinked(node.id, 'out', port.key),
                'active-source':
                  connectDrag.active &&
                  connectDrag.sourceNodeId === node.id &&
                  connectDrag.sourcePortKey === port.key,
              }"
            >
              <span class="port-slot-label port-slot-label-out">
                <span class="port-slot-main">{{ port.label }}</span>
                <span
                  v-if="shouldShowNodePortSlotType(port)"
                  class="port-slot-type"
                >
                  {{ getNodePortSlotTypeLabel(port) }}
                </span>
              </span>
              <span
                class="port port-out slot-dot"
                :title="`${getNodePortSlotStatusLabel(node.id, 'out', port.key)} · ${port.label} · ${getNodePortSlotTypeLabel(port)} · ${port.key}`"
                @mousedown.stop.prevent="
                  startEdgeConnect(node.id, port.key, $event)
                "
              />
            </div>
          </div>

          <div class="node-header">
            <div
              class="node-header-main"
              @dblclick.stop.prevent="startNodeTitleEdit(node, $event)"
            >
              <span v-if="comfyParityMode" class="node-header-dot" />
              <input
                v-if="isNodeTitleEditing(node.id)"
                :value="nodeTitleEditState.draft"
                class="node-title-input"
                maxlength="80"
                @mousedown.stop
                @input="updateNodeTitleDraft($event.target.value)"
                @keydown.enter.stop.prevent="commitNodeTitleEdit"
                @keydown.esc.stop.prevent="cancelNodeTitleEdit"
                @blur="commitNodeTitleEdit"
              />
              <h4 v-else class="node-name">{{ resolveNodeLabel(node) }}</h4>
            </div>

            <div v-if="comfyParityMode" class="node-header-status">
              <span
                class="node-status-light node-status-light-compact"
                :class="getNodeRuntimeStatusClass(node.id)"
                :title="getNodeRuntimeStatusLabel(node.id)"
              />
            </div>

            <div v-if="!comfyParityMode" class="node-toolbar">
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
                class="node-action-btn"
                :class="{ active: isNodePinned(node) }"
                title="置顶节点"
                :disabled="canvasStore.locked"
                @click.stop="toggleNodePin(node.id)"
              >
                顶
              </button>
              <button
                type="button"
                class="node-action-btn"
                :class="{ active: isNodeMuted(node) }"
                title="静音节点"
                :disabled="canvasStore.locked"
                @click.stop="toggleNodeMute(node.id)"
              >
                静
              </button>
              <button
                type="button"
                class="node-action-btn"
                :class="{ active: isNodeBypassed(node) }"
                title="旁路节点"
                :disabled="canvasStore.locked"
                @click.stop="toggleNodeBypass(node.id)"
              >
                旁
              </button>
              <button
                type="button"
                class="node-action-btn"
                :class="{ active: isNodeCollapsed(node) }"
                title="折叠节点"
                :disabled="canvasStore.locked"
                @click.stop="toggleNodeCollapse(node.id)"
              >
                折
              </button>
              <button
                type="button"
                class="node-remove"
                title="删除节点"
                :disabled="canvasStore.locked"
                @click.stop="removeNode(node.id)"
              >
                删
              </button>
            </div>
          </div>

          <div v-if="!comfyParityMode" class="node-subline">
            <span class="node-id" :title="node.id">
              {{ formatNodeIdCompact(node.id) }}
            </span>
            <span class="node-chip subtle">
              {{ getNodePortStatusLabel(node.id, "in") }}
            </span>
          </div>

          <div v-if="comfyParityMode" class="node-widget-strip">
            <template v-if="getNodeCardSummaryEntries(node).length">
              <div
                v-for="entry in getNodeCardSummaryEntries(node)"
                :key="`${node.id}-${entry.key}`"
                class="node-widget-row"
                :class="[
                  `widget-${entry.widgetType || 'text'}`,
                  {
                    active: entry.widgetActive === true,
                    error: entry.widgetError === true,
                  },
                ]"
              >
                <span class="node-widget-label">{{ entry.label }}</span>
                <strong class="node-widget-value" :title="entry.fullValue">
                  {{ entry.value }}
                </strong>
                <span
                  v-if="entry.widgetError"
                  class="node-widget-error"
                  title="参数值异常"
                >
                  !
                </span>
              </div>
            </template>
          </div>

          <div
            v-if="shouldShowNodeRuntimeProgress(node.id)"
            class="node-runtime-progress"
            :title="`运行进度 ${getNodeRuntimeProgressLabel(node.id)}`"
          >
            <span
              class="node-runtime-progress-fill"
              :style="getNodeRuntimeProgressStyle(node.id)"
            />
          </div>

          <div v-if="!comfyParityMode" class="node-params">
            <template v-if="getNodeCardSummaryEntries(node).length">
              <div
                v-for="entry in getNodeCardSummaryEntries(node)"
                :key="`${node.id}-${entry.key}`"
                class="node-param"
                :class="{
                  'is-path': entry.isPath,
                  expandable: entry.isPath && entry.fullValue !== entry.value,
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

          <div v-if="!comfyParityMode" class="node-footer">
            <span class="node-chip">
              {{ getNodePortStatusLabel(node.id, "out") }}
            </span>
          </div>

          <span
            class="node-resize-handle node-resize-handle-nw"
            title="从左上角缩放"
            @pointerdown.stop.prevent="startNodeResize(node, 'NW', $event)"
          />
          <span
            class="node-resize-handle node-resize-handle-ne"
            title="从右上角缩放"
            @pointerdown.stop.prevent="startNodeResize(node, 'NE', $event)"
          />
          <span
            class="node-resize-handle node-resize-handle-sw"
            title="从左下角缩放"
            @pointerdown.stop.prevent="startNodeResize(node, 'SW', $event)"
          />
          <span
            class="node-resize-handle node-resize-handle-se"
            title="从右下角缩放"
            @pointerdown.stop.prevent="startNodeResize(node, 'SE', $event)"
          />
        </article>

        <div
          v-if="comfyParityMode && selectedNode && selectedNodeToolbarStyle"
          class="comfy-node-toolbar-shell"
          :style="selectedNodeToolbarStyle"
          @mousedown.stop
          @pointerdown.stop
          @click.stop
        >
          <div class="comfy-node-toolbar-group">
            <button
              type="button"
              class="comfy-node-toolbar-btn comfy-node-toolbar-btn-help"
              title="节点文档"
              @click.stop="openNodeDocsForNode(selectedNode)"
            >
              <svg
                class="comfy-node-toolbar-icon comfy-node-toolbar-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <rect x="4" y="3.35" width="6.8" height="9.3" rx="1.1" />
                <path d="M6.15 5.8h2.5" />
                <path d="M6.15 8h2.1" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-node-toolbar-btn comfy-node-toolbar-btn-run"
              :class="{ accent: canPartialExecuteNode(selectedNode) }"
              title="单节点执行"
              :disabled="
                canvasStore.locked ||
                isRunInProgress ||
                !canPartialExecuteNode(selectedNode)
              "
              @click.stop="runNodePartialExecution(selectedNode)"
            >
              <svg
                class="comfy-node-toolbar-icon"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5.25 3.5v9l6.4-4.5z" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-node-toolbar-btn comfy-node-toolbar-btn-status"
              :title="`运行状态：${getNodeRuntimeStatusLabel(selectedNode.id)}`"
              @click.stop="openSelectedNodeInspector('runtime')"
            >
              <span
                class="comfy-node-toolbar-status-dot"
                :class="getNodeRuntimeStatusClass(selectedNode.id)"
              />
              <svg
                class="comfy-node-toolbar-caret comfy-node-toolbar-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5.1 6.4l2.9 2.9 2.9-2.9" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-node-toolbar-btn"
              :class="{ active: isNodePinned(selectedNode) }"
              title="置顶节点"
              :disabled="canvasStore.locked"
              @click.stop="toggleSelectedNodePinFromToolbar"
            >
              <svg
                class="comfy-node-toolbar-icon comfy-node-toolbar-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M5.1 3.75h5.8" />
                <path d="M6.15 3.75v3.2l-1.55 1.6h6.8l-1.55-1.6v-3.2" />
                <path d="M8 8.55v4.05" />
                <path d="M6.85 12.6h2.3" />
              </svg>
            </button>

            <button
              type="button"
              class="comfy-node-toolbar-btn"
              :class="{ active: isNodeBypassed(selectedNode) }"
              title="旁路节点"
              :disabled="canvasStore.locked"
              @click.stop="toggleSelectedNodeBypassFromToolbar"
            >
              <svg
                class="comfy-node-toolbar-icon comfy-node-toolbar-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="4.25" cy="11.75" r="1.15" />
                <circle cx="11.75" cy="4.25" r="1.15" />
                <path d="M5.25 10.75l5.5-5.5" />
                <path d="M3.25 4.25l8.5 8.5" />
              </svg>
            </button>

            <div class="comfy-node-toolbar-menu-anchor">
              <button
                type="button"
                class="comfy-node-toolbar-btn"
                :class="{ active: floatingNodeToolbarMenuOpen }"
                title="更多操作"
                @click.stop="toggleFloatingNodeToolbarMenu"
              >
                <svg
                  class="comfy-node-toolbar-icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <circle cx="4" cy="8" r="1.1" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.1" fill="currentColor" />
                  <circle cx="12" cy="8" r="1.1" fill="currentColor" />
                </svg>
              </button>

              <div
                v-if="floatingNodeToolbarMenuOpen"
                class="comfy-node-toolbar-menu"
                @mousedown.stop
                @pointerdown.stop
                @click.stop
              >
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="renameSelectedNodeFromToolbar"
                >
                  重命名
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="copySelectedNodeFromToolbar"
                >
                  复制节点
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="duplicateSelectedNodeFromToolbar"
                >
                  复制节点副本
                </button>

                <span class="comfy-node-toolbar-menu-sep" />

                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="openSelectedNodeInspector('config')"
                >
                  节点信息
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="openSelectedNodeInspector('attrs')"
                >
                  调整尺寸
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="toggleSelectedNodeCollapseFromToolbar"
                >
                  {{ isNodeCollapsed(selectedNode) ? "展开节点" : "折叠节点" }}
                </button>

                <span class="comfy-node-toolbar-menu-sep" />

                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="toggleSelectedNodePinFromToolbar"
                >
                  {{ isNodePinned(selectedNode) ? "取消置顶" : "置顶节点" }}
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="toggleSelectedNodeMuteFromToolbar"
                >
                  {{ isNodeMuted(selectedNode) ? "取消静音" : "静音节点" }}
                </button>
                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item"
                  @click.stop="toggleSelectedNodeBypassFromToolbar"
                >
                  {{ isNodeBypassed(selectedNode) ? "取消旁路" : "旁路节点" }}
                </button>

                <span class="comfy-node-toolbar-menu-sep" />

                <button
                  type="button"
                  class="comfy-node-toolbar-menu-item danger"
                  @click.stop="removeSelectedNodeFromToolbar"
                >
                  删除节点
                </button>
              </div>
            </div>

            <button
              type="button"
              class="comfy-node-toolbar-btn danger"
              title="删除节点"
              :disabled="canvasStore.locked"
              @click.stop="removeSelectedNodeFromToolbar"
            >
              <svg
                class="comfy-node-toolbar-icon comfy-node-toolbar-icon-stroke"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M3.5 4.5h9" />
                <path d="M6 4.5v-1h4v1" />
                <path d="M5.7 6.35v5.05" />
                <path d="M8 6.35v5.05" />
                <path d="M10.3 6.35v5.05" />
                <path
                  d="M4.5 4.5l.55 7.2a1 1 0 0 0 1 .8h3.9a1 1 0 0 0 1-.8l.55-7.2"
                />
              </svg>
            </button>
          </div>
        </div>

        <div
          v-if="selectionStore.marquee.active"
          class="canvas-marquee"
          :style="marqueeStyle"
        />
        <WorkflowSelectionToolbox
          :visible="
            !comfyParityMode &&
            selectedNodeIds.length +
              selectedEdgeIds.length +
              selectedGroupIds.length +
              selectedRerouteIds.length >
              0
          "
          :node-count="selectedNodeIds.length"
          :edge-count="selectedEdgeIds.length"
          :group-count="selectedGroupIds.length"
          :reroute-count="selectedRerouteIds.length"
          :comfy-mode="comfyParityMode"
          :can-enter-subgraph="canEnterSelectedNodeSubgraph"
          :can-exit-subgraph="canExitActiveSubgraph"
          @copy="copyPrimarySelectedNode"
          @paste="pasteCopiedNode"
          @run="startRun"
          @subgraph="enterSelectedNodeSubgraph"
          @exit-subgraph="exitSubgraph"
          @remove="deleteCurrentSelection"
        />

        <aside
          v-if="!comfyParityMode && selectedNode && nodeInlineInspectorVisible"
          class="node-inline-panel"
          :style="nodeInlineInspectorStyle"
        >
          <div
            class="node-inline-head"
            :class="{
              pinned: nodeInlineInspectorPinned,
              dragging: nodeInlineInspectorDrag.active,
            }"
            @mousedown.left.stop.prevent="startNodeInlineInspectorDrag($event)"
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

            <div v-if="isTranslateSubtitleNodeSelected" class="special-form">
              <label class="form-label">&#23383;&#24149;&#26684;&#24335;</label>
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

              <label class="form-label">&#23186;&#20307;&#30446;&#24405;</label>
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

              <label class="form-label">&#23383;&#24149;&#26684;&#24335;</label>
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

            <div v-else-if="isUploadSubtitleNodeSelected" class="special-form">
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
                >&#39057;&#36947; ID&#65288;&#21487;&#36873;&#65289;</label
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
                  :checked="selectedCloudDeleteNodeConfig.refreshCloudFirst"
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
                <span>&#26080;&#21305;&#37197;&#26102;&#25253;&#38169;</span>
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
                >&#25193;&#23637;&#21517;&#36807;&#28388; (extensions)</label
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

          <div v-else class="node-inline-body node-inline-body-runtime">
            <div class="inline-runtime-grid">
              <div class="runtime-kv-item compact">
                <span>&#29366;&#24577;</span>
                <strong>{{
                  getRunStatusLabel(selectedNodeRunState?.status || "idle")
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

    <footer v-if="comfyParityMode" class="comfy-canvas-bottombar">
      <button
        type="button"
        class="comfy-bottom-btn"
        :class="{ active: runtimeDockTab === 'queue' }"
        @click="
          logDockExpanded = true;
          runtimeDockTab = 'queue';
        "
      >
        Queue {{ queueStore.pending.length }}
      </button>
      <button
        type="button"
        class="comfy-bottom-btn"
        :class="{ active: runtimeDockTab === 'history' }"
        @click="
          logDockExpanded = true;
          runtimeDockTab = 'history';
        "
      >
        History {{ runHistory.length }}
      </button>
      <button
        type="button"
        class="comfy-bottom-btn"
        :class="{ active: runtimeDockTab === 'selected' }"
        @click="
          logDockExpanded = true;
          runtimeDockTab = 'selected';
        "
      >
        Selected {{ selectedNode ? 1 : 0 }}
      </button>
    </footer>

    <WorkflowContextMenu
      :visible="contextMenuState.visible"
      :x="contextMenuRenderPosition.x"
      :y="contextMenuRenderPosition.y"
      :scope="contextMenuState.scope"
      :link-visible="canvasStore.linkVisible"
      :locked="canvasStore.locked"
      :minimap-visible="canvasStore.minimapVisible"
      :can-create-group="canCreateGroupFromSelection"
      :node-muted="contextMenuNodeVisualState.muted"
      :node-bypassed="contextMenuNodeVisualState.bypassed"
      :node-pinned="contextMenuNodeVisualState.pinned"
      :node-collapsed="contextMenuNodeVisualState.collapsed"
      :node-subgraph-id="contextMenuNodeSubgraphId"
      :can-enter-subgraph="canContextMenuEnterSubgraph"
      :can-exit-subgraph="canExitActiveSubgraph"
      :can-undo="canUndoGraphHistory"
      :can-redo="canRedoGraphHistory"
      :can-paste-with-connect="
        hasNodeClipboardPayload && selectedNodeIds.length > 0
      "
      :comfy-mode="comfyParityMode"
      :quick-create-node-items="contextMenuQuickNodeItems"
      :extension-items="contextMenuExtensionItems"
      :pending-count="queueStore.pending.length"
      @create-node="createNodeFromCanvasContext"
      @open-node-picker="openNodeCreationPaletteFromContextMenu"
      @copy="copySelectedNode"
      @duplicate="duplicateSelectedNode"
      @remove="removeContextNode"
      @toggle-node-mute="toggleContextNodeMute"
      @toggle-node-bypass="toggleContextNodeBypass"
      @toggle-node-pin="toggleContextNodePin"
      @toggle-node-collapse="toggleContextNodeCollapse"
      @enter-subgraph="enterContextNodeSubgraph"
      @remove-edge="removeContextEdge"
      @remove-group="removeContextGroup"
      @fit-group="fitContextGroup"
      @remove-reroute="removeContextReroute"
      @add-reroute="addRerouteFromContextEdge"
      @paste="pasteCopiedNode"
      @paste-with-connect="pasteCopiedNodeWithConnect"
      @create-group="createGroupFromSelection"
      @fit-view="fitCanvasView"
      @reset-view="resetCanvasView"
      @toggle-links="toggleCanvasLinks"
      @toggle-lock="toggleCanvasLock"
      @toggle-minimap="toggleCanvasMinimap"
      @exit-subgraph="exitContextSubgraph"
      @undo="executeUndoGraphHistory"
      @redo="executeRedoGraphHistory"
      @run-front="queueRunCurrentWorkflowFront"
      @clear-pending="clearPendingQueue"
      @measure="updateContextMenuMetrics"
      @extension-action="executeContextMenuExtensionAction"
    />

    <WorkflowQuickPalette
      :visible="quickPaletteVisible"
      :mode="quickPaletteMode"
      :title="quickPaletteTitle"
      :placeholder="quickPalettePlaceholder"
      :keyword="quickPaletteKeyword"
      :items="quickPaletteItems"
      :selected-index="quickPaletteSelectedIndex"
      @update:keyword="setQuickPaletteKeyword"
      @move-selection="moveQuickPaletteSelection"
      @select="commitQuickPaletteSelection"
      @close="closeQuickPalette"
      @hover-index="setQuickPaletteSelectionIndex"
    />

    <div v-if="comfyParityMode" class="comfy-canvas-nav-shell">
      <div class="comfy-canvas-nav-tools">
        <button
          type="button"
          class="comfy-canvas-nav-btn"
          :class="{ active: canvasStore.navigationMode === 'move' }"
          title="Move Mode"
          @click.stop="setCanvasNavigationMode('move')"
        >
          <svg
            class="comfy-canvas-nav-icon comfy-node-toolbar-icon-stroke"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M8 2.5v11" />
            <path d="M8 2.5l-1.8 1.8" />
            <path d="M8 2.5l1.8 1.8" />
            <path d="M8 13.5l-1.8-1.8" />
            <path d="M8 13.5l1.8-1.8" />
            <path d="M2.5 8h11" />
            <path d="M2.5 8l1.8-1.8" />
            <path d="M2.5 8l1.8 1.8" />
            <path d="M13.5 8l-1.8-1.8" />
            <path d="M13.5 8l-1.8 1.8" />
          </svg>
        </button>
        <button
          type="button"
          class="comfy-canvas-nav-btn"
          :class="{ active: canvasStore.navigationMode === 'pan' }"
          title="Pan Mode"
          @click.stop="setCanvasNavigationMode('pan')"
        >
          <svg
            class="comfy-canvas-nav-icon comfy-node-toolbar-icon-stroke"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M4.8 7.1V4.9a1 1 0 0 1 2 0v1.2" />
            <path d="M6.8 6.1V4a1 1 0 0 1 2 0v2.1" />
            <path d="M8.8 6.2V4.4a1 1 0 0 1 2 0v2.3" />
            <path
              d="M10.8 7.1V5.8a1 1 0 0 1 2 0v3.1a4.2 4.2 0 0 1-4.2 4.2H7.9A3.9 3.9 0 0 1 4 9.2V7.8a1 1 0 0 1 2 0v1.1"
            />
          </svg>
        </button>

        <span class="comfy-canvas-nav-sep" />

        <button
          type="button"
          class="comfy-canvas-nav-btn"
          :class="{ active: canvasStore.minimapVisible }"
          title="Toggle Minimap"
          @click.stop="toggleCanvasMinimap"
        >
          <svg
            class="comfy-canvas-nav-icon comfy-node-toolbar-icon-stroke"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="10" rx="1.6" />
            <path d="M6.2 3v10" />
            <path d="M9.8 3v10" />
          </svg>
        </button>
        <button
          type="button"
          class="comfy-canvas-nav-btn"
          :class="{ active: canvasStore.linkVisible }"
          title="Toggle Links"
          @click.stop="toggleCanvasLinks"
        >
          <svg
            class="comfy-canvas-nav-icon comfy-node-toolbar-icon-stroke"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <path d="M5.2 4.8c1.6 0 2.5.8 3.7 2.1" />
            <path d="M5.2 11.2c1.6 0 2.5-.8 3.7-2.1" />
          </svg>
        </button>
      </div>

      <aside v-if="canvasStore.minimapVisible" class="canvas-navigator">
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

    <aside v-else-if="canvasStore.minimapVisible" class="canvas-navigator">
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
</template>

<script setup>
import { computed, inject, ref, watch } from "vue";
import WorkflowContextMenu from "../WorkflowContextMenu.vue";
import WorkflowQuickPalette from "../WorkflowQuickPalette.vue";
import WorkflowSelectionToolbox from "../WorkflowSelectionToolbox.vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);

const {
  canvasRef,
  canvasPan,
  spacePanPressed,
  handleCanvasPanStart,
  handleCanvasPanMove,
  handleCanvasPanEnd,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
  handleCanvasPointerLeave,
  handleCanvasScroll,
  handleCanvasWheel,
  handleCanvasBackgroundClick,
  handleCanvasBackgroundDoubleClick,
  openCanvasContextMenu,
  handleCanvasDragOver,
  handleCanvasDrop,
  canvasSceneStyle,
  canvasContentStyle,
  activeConnectPath,
  visibleNodeVisualList,
  visibleGroupVisualList,
  visibleEdgeVisualList,
  visibleRerouteVisualList,
  selectedNodeId,
  selectedEdgeId,
  connectFeedback,
  toEdgePath,
  getEdgePathStyle,
  handleEdgePathClick,
  handleEdgePathDoubleClick,
  setNodeCardRef,
  isNodeSelected,
  isGroupSelected,
  isRerouteSelected,
  getGroupCardStyle,
  getRerouteHandleStyle,
  connectDrag,
  connectHoverNodeId,
  connectHoverPortKey,
  isInputBoundaryNode,
  isOutputBoundaryNode,
  nodeResizeState,
  getNodeRuntimeStatusClass,
  shouldShowNodeRuntimeProgress,
  getNodeRuntimeProgressLabel,
  getNodeRuntimeProgressStyle,
  getNodeCategoryClass,
  getNodeCardStateClass,
  isNodeBatchDragging,
  getNodeCardStyle,
  handleNodeCardClick,
  handleNodeDragStart,
  handleNodeCardMouseUp,
  isNodeTitleEditing,
  nodeTitleEditState,
  startNodeTitleEdit,
  updateNodeTitleDraft,
  commitNodeTitleEdit,
  cancelNodeTitleEdit,
  isNodeMuted,
  isNodeBypassed,
  isNodePinned,
  isNodeCollapsed,
  toggleNodeMute,
  toggleNodeBypass,
  toggleNodePin,
  toggleNodeCollapse,
  handleGroupCardClick,
  startGroupDrag,
  startGroupResize,
  groupDragState,
  groupResizeState,
  handleRerouteHandleClick,
  startRerouteDrag,
  openNodeContextMenu,
  openEdgeContextMenu,
  openGroupContextMenu,
  openRerouteContextMenu,
  hasNodePortLinked,
  getNodePortDetailLabel,
  getNodePortSlots,
  getNodePortSlotStyle,
  isNodePortSlotLinked,
  isNodePortConnectable,
  isNodePortConnectBlocked,
  updateConnectHoverNode,
  finishEdgeConnect,
  getNodePortSlotStatusLabel,
  getNodePortSlotTypeLabel,
  shouldShowNodePortSlotType,
  startEdgeConnect,
  resolveNodeLabel,
  getNodeTypeDisplay,
  getNodeRuntimeStatusLabel,
  removeNode,
  canPartialExecuteNode,
  runNodePartialExecution,
  openNodeDocsForNode,
  formatNodeIdCompact,
  getNodePortStatusLabel,
  getNodeCardSummaryEntries,
  startNodeResize,
  selectionStore,
  marqueeStyle,
  selectedNodeIds,
  selectedEdgeIds,
  selectedGroupIds,
  selectedRerouteIds,
  canCreateGroupFromSelection,
  copyPrimarySelectedNode,
  pasteCopiedNode,
  pasteCopiedNodeWithConnect,
  saveCurrentWorkflow,
  validateCurrentWorkflow,
  isValidating,
  heroModeBadge,
  startRun,
  cancelRun,
  isRunInProgress,
  deleteCurrentSelection,
  selectedNode,
  nodeInlineInspectorVisible,
  nodeInlineInspectorStyle,
  nodeInlineInspectorPinned,
  nodeInlineInspectorDrag,
  startNodeInlineInspectorDrag,
  toggleNodeInlineInspectorPin,
  jumpToMainInspector,
  nodeInlineInspectorTab,
  summarizeNodeConfig,
  isTranslateSubtitleNodeSelected,
  selectedTranslateNodeConfig,
  pickTranslateExePath,
  pickTranslateTargetPath,
  subtitleFormatOptions,
  toggleTranslateSubFormat,
  isPackSubtitleNodeSelected,
  selectedPackNodeConfig,
  pickPackTargetPath,
  pickPackOutputPath,
  patchPackNodeConfig,
  isUploadSubtitleNodeSelected,
  selectedUploadNodeConfig,
  pickUploadScanDir,
  updateUploadChannelId,
  updateUploadTitleDelay,
  updateUploadBetweenDelay,
  patchUploadNodeConfig,
  isCloudDeleteRecentNodeSelected,
  selectedCloudDeleteNodeConfig,
  updateCloudDeleteRecentLimit,
  updateCloudDeleteBatchSize,
  patchCloudDeleteNodeConfig,
  isLocalDeleteScannedNodeSelected,
  selectedLocalDeleteNodeConfig,
  pickLocalDeleteScanDir,
  updateLocalDeleteExtensions,
  patchLocalDeleteNodeConfig,
  selectedNodeConfigDraft,
  applyNodeConfigDraft,
  translateNodeConfigError,
  selectedNodeWidthDraft,
  selectedNodeHeightDraft,
  selectedNodeFontSizeDraft,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MAX_NODE_HEIGHT,
  MIN_NODE_FONT_SIZE,
  MAX_NODE_FONT_SIZE,
  commitSelectedNodeSize,
  commitSelectedNodeFontSize,
  selectedNodeRunState,
  getRunStatusLabel,
  selectedNodeRunDuration,
  formatTimestampLabel,
  selectedNodeLogs,
  contextMenuState,
  contextMenuRenderPosition,
  updateContextMenuMetrics,
  contextMenuQuickNodeItems,
  contextMenuExtensionItems,
  contextMenuNodeVisualState,
  contextMenuNodeSubgraphId,
  canContextMenuEnterSubgraph,
  canExitActiveSubgraph,
  canEnterSelectedNodeSubgraph,
  enterSelectedNodeSubgraph,
  canUndoGraphHistory,
  canRedoGraphHistory,
  hasNodeClipboardPayload,
  canvasStore,
  canvasZoomPercent,
  queueStore,
  runHistory,
  logDockExpanded,
  runtimeDockTab,
  activeSubgraphId,
  copySelectedNode,
  createNodeFromCanvasContext,
  openNodeCreationPaletteFromContextMenu,
  duplicateSelectedNode,
  removeContextNode,
  toggleContextNodeMute,
  toggleContextNodeBypass,
  toggleContextNodePin,
  toggleContextNodeCollapse,
  enterContextNodeSubgraph,
  removeContextEdge,
  removeContextGroup,
  fitContextGroup,
  removeContextReroute,
  addRerouteFromContextEdge,
  createGroupFromSelection,
  fitCanvasView,
  resetCanvasView,
  toggleCanvasLinks,
  toggleCanvasLock,
  toggleCanvasMinimap,
  setCanvasNavigationMode,
  exitContextSubgraph,
  executeUndoGraphHistory,
  executeRedoGraphHistory,
  queueRunCurrentWorkflowFront,
  clearPendingQueue,
  exitSubgraph,
  executeContextMenuExtensionAction,
  quickPaletteVisible,
  quickPaletteMode,
  quickPaletteTitle,
  quickPalettePlaceholder,
  quickPaletteKeyword,
  quickPaletteItems,
  quickPaletteSelectedIndex,
  setQuickPaletteKeyword,
  setQuickPaletteSelectionIndex,
  moveQuickPaletteSelection,
  commitQuickPaletteSelection,
  closeQuickPalette,
  comfyParityMode,
  minimapRef,
  minimapDrag,
  startMinimapDrag,
  moveMinimapDrag,
  stopMinimapDrag,
  minimapNodes,
  minimapViewportStyle,
} = context;

const parsePixelValue = (value) => {
  const parsed = Number.parseFloat(String(value || "0").replace("px", ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const pendingQueueCount = computed(() =>
  Array.isArray(queueStore.pending) ? queueStore.pending.length : 0,
);

const runningQueueCount = computed(() =>
  Array.isArray(queueStore.running) ? queueStore.running.length : 0,
);

const historyCount = computed(() =>
  Array.isArray(runHistory.value) ? runHistory.value.length : 0,
);

const canStopOrClearQueue = computed(
  () => isRunInProgress.value || pendingQueueCount.value > 0,
);

const openQueueDock = () => {
  logDockExpanded.value = true;
  runtimeDockTab.value = "queue";
};

const openHistoryDock = () => {
  logDockExpanded.value = true;
  runtimeDockTab.value = "history";
};

const handleTopbarRun = async () => {
  openQueueDock();
  await startRun();
};

const handleTopbarRunFront = async () => {
  openQueueDock();
  await queueRunCurrentWorkflowFront();
};

const handleTopbarStopOrClear = async () => {
  if (isRunInProgress.value) {
    await cancelRun();
  } else if (pendingQueueCount.value > 0) {
    await clearPendingQueue();
  }
  openQueueDock();
};

const selectedNodeCardStyle = computed(() => {
  if (!selectedNode.value) {
    return null;
  }
  return getNodeCardStyle(selectedNode.value);
});

const selectedNodeToolbarStyle = computed(() => {
  if (
    !comfyParityMode.value ||
    !selectedNode.value ||
    !selectedNodeCardStyle.value
  ) {
    return null;
  }

  const left = parsePixelValue(selectedNodeCardStyle.value.left);
  const top = parsePixelValue(selectedNodeCardStyle.value.top);
  const width = parsePixelValue(selectedNodeCardStyle.value.width);
  const anchorX = Math.max(180, left + width / 2);

  return {
    left: `${anchorX}px`,
    top: `${Math.max(14, top - 42)}px`,
  };
});

const floatingNodeToolbarMenuOpen = ref(false);

const closeFloatingNodeToolbarMenu = () => {
  floatingNodeToolbarMenuOpen.value = false;
};

const toggleFloatingNodeToolbarMenu = () => {
  if (!selectedNode.value) {
    return;
  }
  floatingNodeToolbarMenuOpen.value = !floatingNodeToolbarMenuOpen.value;
};

const openSelectedNodeInspector = (tab = "config") => {
  jumpToMainInspector(tab);
  closeFloatingNodeToolbarMenu();
};

const renameSelectedNodeFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  startNodeTitleEdit(selectedNode.value);
  closeFloatingNodeToolbarMenu();
};

const toggleSelectedNodePinFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  toggleNodePin(selectedNode.value.id);
  closeFloatingNodeToolbarMenu();
};

const toggleSelectedNodeBypassFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  toggleNodeBypass(selectedNode.value.id);
  closeFloatingNodeToolbarMenu();
};

const removeSelectedNodeFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  removeNode(selectedNode.value.id);
  closeFloatingNodeToolbarMenu();
};

const copySelectedNodeFromToolbar = () => {
  copySelectedNode();
  closeFloatingNodeToolbarMenu();
};

const duplicateSelectedNodeFromToolbar = () => {
  duplicateSelectedNode();
  closeFloatingNodeToolbarMenu();
};

const toggleSelectedNodeMuteFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  toggleNodeMute(selectedNode.value.id);
  closeFloatingNodeToolbarMenu();
};

const toggleSelectedNodeCollapseFromToolbar = () => {
  if (!selectedNode.value) {
    return;
  }
  toggleNodeCollapse(selectedNode.value.id);
  closeFloatingNodeToolbarMenu();
};

watch(selectedNodeId, () => {
  closeFloatingNodeToolbarMenu();
});
</script>
