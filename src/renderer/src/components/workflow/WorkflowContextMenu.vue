<template>
  <div
    v-if="visible"
    ref="menuRef"
    class="workflow-context-menu"
    :style="{
      left: `${x}px`,
      top: `${y}px`,
    }"
    @pointerdown.stop
    @mousedown.stop
    @touchstart.stop
  >
    <template v-if="scope === 'node'">
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('copy')"
      >
        复制节点 Ctrl+C
      </button>
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('duplicate')"
      >
        复制节点副本 Ctrl+V
      </button>
      <button
        type="button"
        class="context-menu-item"
        :disabled="!canPasteWithConnect"
        @click="emit('paste-with-connect')"
      >
        粘贴并连接 Ctrl+Shift+V
      </button>
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('toggle-node-collapse')"
      >
        {{ nodeCollapsed ? "展开节点" : "折叠节点" }}
      </button>
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('toggle-node-pin')"
      >
        {{ nodePinned ? "取消置顶" : "置顶节点" }}
      </button>
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('toggle-node-mute')"
      >
        {{ nodeMuted ? "取消静音" : "静音节点" }}
      </button>
      <button
        v-if="!comfyMode"
        type="button"
        class="context-menu-item"
        @click="emit('toggle-node-bypass')"
      >
        {{ nodeBypassed ? "取消旁路" : "旁路节点" }}
      </button>
      <button
        type="button"
        class="context-menu-item"
        :disabled="!canEnterSubgraph"
        :title="nodeSubgraphId || ''"
        @click="emit('enter-subgraph')"
      >
        {{ canEnterSubgraph ? "进入子图" : "无可进入子图" }}
      </button>
      <button
        type="button"
        class="context-menu-item danger"
        @click="emit('remove')"
      >
        删除节点 Delete
      </button>
    </template>
    <template v-else-if="scope === 'edge'">
      <button
        type="button"
        class="context-menu-item"
        @click="emit('add-reroute')"
      >
        添加转接点
      </button>
      <button
        type="button"
        class="context-menu-item danger"
        @click="emit('remove-edge')"
      >
        删除连线 Delete
      </button>
    </template>
    <template v-else-if="scope === 'group'">
      <button
        type="button"
        class="context-menu-item"
        @click="emit('fit-group')"
      >
        贴合内容
      </button>
      <button
        type="button"
        class="context-menu-item danger"
        @click="emit('remove-group')"
      >
        删除分组 Delete
      </button>
    </template>
    <template v-else-if="scope === 'reroute'">
      <button
        type="button"
        class="context-menu-item danger"
        @click="emit('remove-reroute')"
      >
        删除转接点 Delete
      </button>
    </template>
    <template v-else>
      <template v-if="comfyMode">
        <button
          type="button"
          class="context-menu-item"
          @click="emit('open-node-picker')"
        >
          打开节点选择器
        </button>
        <div
          v-if="quickCreateNodeItems.length"
          class="context-menu-section context-menu-section-compact"
        >
          <p class="context-menu-section-title">快速节点</p>
          <button
            v-for="item in quickCreateNodeItems"
            :key="`quick-node-${item.type}`"
            type="button"
            class="context-menu-item context-menu-item-create"
            @click="emit('create-node', item.type)"
          >
            <span class="context-menu-item-main">{{ item.label }}</span>
            <small class="context-menu-item-sub">{{ item.type }}</small>
          </button>
        </div>
        <div class="context-menu-section context-menu-section-compact">
          <button
            type="button"
            class="context-menu-item"
            @click="emit('fit-view')"
          >
            适配视图 Ctrl+0
          </button>
          <button
            type="button"
            class="context-menu-item"
            @click="emit('reset-view')"
          >
            重置视图
          </button>
          <button
            type="button"
            class="context-menu-item"
            @click="emit('toggle-minimap')"
          >
            {{ minimapVisible ? "隐藏小地图" : "显示小地图" }}
          </button>
          <button
            v-if="canExitSubgraph"
            type="button"
            class="context-menu-item"
            @click="emit('exit-subgraph')"
          >
            退出子图
          </button>
        </div>
      </template>
      <template v-else>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('open-node-picker')"
        >
          打开节点选择器
        </button>
        <div v-if="quickCreateNodeItems.length" class="context-menu-section">
          <p class="context-menu-section-title">快速节点</p>
          <button
            v-for="item in quickCreateNodeItems"
            :key="`quick-node-${item.type}`"
            type="button"
            class="context-menu-item context-menu-item-create"
            @click="emit('create-node', item.type)"
          >
            <span class="context-menu-item-main">{{ item.label }}</span>
            <small class="context-menu-item-sub">{{ item.type }}</small>
          </button>
        </div>
        <button
          type="button"
          class="context-menu-item"
          :disabled="!canUndo"
          @click="emit('undo')"
        >
          撤销 Ctrl+Z
        </button>
        <button
          type="button"
          class="context-menu-item"
          :disabled="!canRedo"
          @click="emit('redo')"
        >
          重做 Ctrl+Y
        </button>
        <button type="button" class="context-menu-item" @click="emit('paste')">
          粘贴节点 Ctrl+V
        </button>
        <button
          type="button"
          class="context-menu-item"
          :disabled="!canPasteWithConnect"
          @click="emit('paste-with-connect')"
        >
          粘贴并连接 Ctrl+Shift+V
        </button>
        <button
          type="button"
          class="context-menu-item"
          :disabled="!canCreateGroup"
          @click="emit('create-group')"
        >
          创建分组 Ctrl+G
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('fit-view')"
        >
          适配视图 Ctrl+0
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('reset-view')"
        >
          重置视图
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('toggle-links')"
        >
          {{ linkVisible ? "隐藏连线" : "显示连线" }}
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('toggle-lock')"
        >
          {{ locked ? "解锁画布" : "锁定画布" }}
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('toggle-minimap')"
        >
          {{ minimapVisible ? "隐藏小地图" : "显示小地图" }}
        </button>
        <button
          type="button"
          class="context-menu-item"
          :disabled="!canExitSubgraph"
          @click="emit('exit-subgraph')"
        >
          退出子图
        </button>
        <button
          type="button"
          class="context-menu-item"
          @click="emit('run-front')"
        >
          前插队列
        </button>
        <button
          type="button"
          class="context-menu-item"
          :disabled="pendingCount === 0"
          @click="emit('clear-pending')"
        >
          清空待执行
        </button>
      </template>
    </template>

    <template v-if="extensionItems.length">
      <div class="context-menu-section context-menu-section-extension">
        <p class="context-menu-section-title">扩展动作</p>
        <button
          v-for="item in extensionItems"
          :key="item.key || item.id"
          type="button"
          class="context-menu-item"
          :class="{ danger: item.danger === true }"
          :disabled="item.disabled === true"
          @click="emit('extension-action', item.key || item.id)"
        >
          <span class="context-menu-item-main">{{ item.label }}</span>
          <small v-if="item.shortcut" class="context-menu-item-sub">{{
            item.shortcut
          }}</small>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";

const menuRef = ref(null);

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  x: {
    type: Number,
    default: 0,
  },
  y: {
    type: Number,
    default: 0,
  },
  scope: {
    type: String,
    default: "canvas",
  },
  comfyMode: {
    type: Boolean,
    default: false,
  },
  linkVisible: {
    type: Boolean,
    default: true,
  },
  pendingCount: {
    type: Number,
    default: 0,
  },
  locked: {
    type: Boolean,
    default: false,
  },
  minimapVisible: {
    type: Boolean,
    default: true,
  },
  canCreateGroup: {
    type: Boolean,
    default: false,
  },
  nodeMuted: {
    type: Boolean,
    default: false,
  },
  nodeBypassed: {
    type: Boolean,
    default: false,
  },
  nodePinned: {
    type: Boolean,
    default: false,
  },
  nodeCollapsed: {
    type: Boolean,
    default: false,
  },
  nodeSubgraphId: {
    type: String,
    default: "",
  },
  canEnterSubgraph: {
    type: Boolean,
    default: false,
  },
  canExitSubgraph: {
    type: Boolean,
    default: false,
  },
  canUndo: {
    type: Boolean,
    default: false,
  },
  canRedo: {
    type: Boolean,
    default: false,
  },
  canPasteWithConnect: {
    type: Boolean,
    default: false,
  },
  quickCreateNodeItems: {
    type: Array,
    default: () => [],
  },
  extensionItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "create-node",
  "open-node-picker",
  "undo",
  "redo",
  "copy",
  "duplicate",
  "toggle-node-collapse",
  "toggle-node-pin",
  "toggle-node-mute",
  "toggle-node-bypass",
  "enter-subgraph",
  "remove",
  "remove-edge",
  "remove-group",
  "fit-group",
  "remove-reroute",
  "add-reroute",
  "paste",
  "paste-with-connect",
  "create-group",
  "fit-view",
  "reset-view",
  "toggle-links",
  "toggle-lock",
  "toggle-minimap",
  "exit-subgraph",
  "run-front",
  "clear-pending",
  "extension-action",
  "measure",
]);

const emitMenuMetrics = () => {
  const menuElement = menuRef.value;
  if (!menuElement) {
    return;
  }

  const width = Number(menuElement.offsetWidth || 0);
  const height = Number(menuElement.offsetHeight || 0);
  if (width <= 0 || height <= 0) {
    return;
  }

  emit("measure", {
    width,
    height,
  });
};

watch(
  () => [
    props.visible,
    props.scope,
    props.x,
    props.y,
    props.quickCreateNodeItems.length,
    props.extensionItems.length,
  ],
  () => {
    if (!props.visible) {
      return;
    }
    nextTick(() => {
      emitMenuMetrics();
    });
  },
  {
    immediate: true,
  },
);
</script>

<style scoped>
.workflow-context-menu {
  position: absolute;
  z-index: 24;
  min-width: 208px;
  max-width: 248px;
  max-height: 72vh;
  overflow: auto;
  display: grid;
  gap: 0.2rem;
  padding: 0.34rem;
  border: 1px solid rgba(112, 122, 141, 0.6);
  border-radius: 0.55rem;
  background: rgba(16, 19, 24, 0.95);
  box-shadow: 0 0.7rem 1.6rem rgba(5, 9, 15, 0.56);
  backdrop-filter: blur(8px);
}

.context-menu-item {
  padding: 0.34rem 0.46rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(112, 122, 141, 0.24);
  background: rgba(255, 255, 255, 0.02);
  color: #dce6f5;
  text-align: left;
  font-size: 0.74rem;
  line-height: 1.15;
  cursor: pointer;
}

.context-menu-item:hover:not(:disabled) {
  border-color: rgba(112, 122, 141, 0.46);
  background: rgba(255, 255, 255, 0.07);
}

.context-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.context-menu-item.danger {
  color: #fca9a9;
  border-color: rgba(252, 169, 169, 0.36);
}

.context-menu-section {
  display: grid;
  gap: 0.18rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgba(112, 122, 141, 0.22);
  margin-bottom: 0.2rem;
}

.context-menu-section-compact {
  gap: 0.14rem;
}

.context-menu-section-title {
  margin: 0;
  padding: 0.08rem 0.24rem;
  color: rgba(192, 203, 221, 0.86);
  font-size: 0.68rem;
}

.context-menu-item-create {
  display: grid;
  gap: 0.04rem;
}

.context-menu-item-main {
  font-size: 0.74rem;
  line-height: 1.1;
}

.context-menu-item-sub {
  font-size: 0.62rem;
  color: rgba(151, 166, 194, 0.92);
  line-height: 1.05;
}
</style>
