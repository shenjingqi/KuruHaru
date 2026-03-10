<template>
  <div class="log-section">
    <div class="log-header">
      <h3>操作日志</h3>
      <button class="clear-log-btn" @click="emit('clear')">清空</button>
    </div>
    <div class="log-list">
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="log-item"
        :class="log.type"
      >
        {{ log.msg }}
      </div>
    </div>
  </div>
</template>

<script setup>
// 日志项约定为 { msg, type }，其中 type 直接映射到不同语义色。
defineProps({
  logs: {
    type: Array,
    default: () => [],
  },
});

// 清空行为由父层决定（仅清 UI 或同时清持久化日志）。
const emit = defineEmits(["clear"]);
</script>

<style scoped>
.log-section {
  background: #1e1e1e;
  border-radius: 12px;
  padding: 20px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.log-header h3 {
  margin: 0;
  font-size: 14px;
  color: #fff;
}

.clear-log-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 12px;
}

.clear-log-btn:hover {
  color: #fff;
}

.log-list {
  font-family: "Consolas", monospace;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.log-item {
  padding: 2px 0;
  color: #ccc;
}

.log-item.success {
  color: #52c41a;
}

.log-item.error {
  color: #ff4d4f;
}

.log-item.warn {
  color: #faad14;
}

@media (max-width: 768px) {
  .log-section {
    padding: 16px;
    border-radius: 8px;
  }
}
</style>
