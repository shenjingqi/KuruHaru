<template>
  <div class="pagination">
    <button class="page-btn" :disabled="currentPage <= 1" @click="goPrev">
      上一页
    </button>
    <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
    <button
      class="page-btn"
      :disabled="currentPage >= totalPages"
      @click="goNext"
    >
      下一页
    </button>
  </div>
</template>

<script setup>
// 纯分页控制组件：不维护内部页码状态，完全依赖父层传入 currentPage/totalPages。
const props = defineProps({
  currentPage: {
    type: Number,
    default: 1,
  },
  totalPages: {
    type: Number,
    default: 1,
  },
});

// 通过 update:currentPage 对外同步翻页意图，父层决定是否触发数据请求。
const emit = defineEmits(["update:currentPage"]);

const goPrev = () => {
  // 边界保护：到达第一页时不再继续向前，避免发出无效更新事件。
  if (props.currentPage <= 1) return;
  emit("update:currentPage", props.currentPage - 1);
};

const goNext = () => {
  // 边界保护：到达最后一页时停止推进，确保页码始终落在有效区间。
  if (props.currentPage >= props.totalPages) return;
  emit("update:currentPage", props.currentPage + 1);
};
</script>

<style scoped>
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.page-btn {
  padding: 6px 16px;
  border: 1px solid #cfc6ad;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: #666;
}
</style>
