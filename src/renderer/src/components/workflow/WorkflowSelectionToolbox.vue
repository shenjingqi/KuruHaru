<template>
  <aside v-if="visible" class="selection-toolbox" @mousedown.stop>
    <span class="toolbox-summary"
      >已选 {{ nodeCount }} 节点 / {{ edgeCount }} 连线 / {{ groupCount }} 分组
      / {{ rerouteCount }} 转接点</span
    >
    <button type="button" class="toolbox-btn" @click="emit('copy')">
      复制
    </button>
    <button type="button" class="toolbox-btn" @click="emit('paste')">
      粘贴
    </button>
    <button type="button" class="toolbox-btn" @click="emit('run')">运行</button>
    <button type="button" class="toolbox-btn danger" @click="emit('remove')">
      删除
    </button>
  </aside>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  nodeCount: {
    type: Number,
    default: 0,
  },
  edgeCount: {
    type: Number,
    default: 0,
  },
  groupCount: {
    type: Number,
    default: 0,
  },
  rerouteCount: {
    type: Number,
    default: 0,
  },
  comfyMode: {
    type: Boolean,
    default: false,
  },
  canEnterSubgraph: {
    type: Boolean,
    default: false,
  },
  canExitSubgraph: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "copy",
  "paste",
  "run",
  "remove",
  "subgraph",
  "exit-subgraph",
]);
</script>

<style scoped>
.selection-toolbox {
  position: absolute;
  z-index: 20;
  left: 50%;
  top: 0.7rem;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.5rem;
  border-radius: 0.52rem;
  border: 1px solid rgba(95, 128, 177, 0.35);
  background: rgba(15, 20, 30, 0.92);
  box-shadow: 0 0.6rem 1.4rem rgba(4, 8, 14, 0.45);
}

.toolbox-summary {
  margin-right: 0.25rem;
  font-size: 0.72rem;
  color: #a8c0e3;
  white-space: nowrap;
}

.toolbox-btn {
  padding: 0.22rem 0.5rem;
  border-radius: 0.38rem;
  border: 1px solid rgba(95, 128, 177, 0.3);
  background: rgba(255, 255, 255, 0.04);
  color: #d9e5f8;
  font-size: 0.72rem;
  cursor: pointer;
}

.toolbox-btn:hover {
  border-color: rgba(95, 128, 177, 0.6);
  background: rgba(255, 255, 255, 0.1);
}

.toolbox-btn.danger {
  border-color: rgba(239, 111, 111, 0.4);
  color: #fcb4b4;
}

.selection-toolbox-comfy {
  top: 3.45rem;
  gap: 0.24rem;
  padding: 0.28rem 0.34rem;
  border-radius: 0.42rem;
  border-color: rgba(92, 96, 105, 0.78);
  background: rgba(32, 33, 38, 0.94);
}

.selection-toolbox-comfy .toolbox-btn {
  min-width: 0;
  padding: 0.18rem 0.42rem;
  border-radius: 0.3rem;
  font-size: 0.66rem;
}
</style>
