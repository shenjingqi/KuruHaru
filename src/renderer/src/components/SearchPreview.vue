<template>
  <div class="search-preview">
    <div class="preview-header">
      <span class="label">🔗 搜索预览</span>
      <button class="copy-btn" :disabled="!hasContent" @click="copyLink">
        {{ copySuccess ? "✅ 已复制" : "📋 复制链接" }}
      </button>
    </div>
    <div class="preview-content">
      <div v-if="hasContent" class="syntax-display">
        <span
          v-for="(item, index) in syntaxItems"
          :key="index"
          class="syntax-item"
          :class="item.type"
          >{{ item.text }}</span
        >
      </div>
      <div v-else class="empty-state">
        <span>👆 设置筛选条件后生成搜索链接</span>
      </div>
    </div>
    <div class="result-count">
      <span v-if="hasContent">共 {{ syntaxItems.length }} 个筛选条件</span>
      <span v-else>等待输入...</span>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, watch } from "vue";
const props = defineProps({
  searchParams: { type: Object, default: () => ({}) },
});
const copySuccess = ref(false);
const syntaxItems = computed(() => {
  const items = [];
  const p = props.searchParams;

  if (p.tags?.include?.length) {
    p.tags.include.forEach((t) =>
      items.push({ type: "tag-include", text: "$tag:" + t + "$" }),
    );
  }
  if (p.tags?.exclude?.length) {
    p.tags.exclude.forEach((t) =>
      items.push({ type: "tag-exclude", text: "$-tag:" + t + "$" }),
    );
  }
  if (p.duration?.value != null) {
    const suffix = p.duration.unit === "h" ? "h" : "m";
    const prefix = p.duration.mode === "less" ? "-" : "";
    items.push({
      type: "duration",
      text: "$" + prefix + "duration:" + p.duration.value + suffix + "$",
    });
  }
  if (p.rating?.value != null) {
    const prefix = p.rating.mode === "less" ? "-" : "";
    items.push({
      type: "rating",
      text: "$" + prefix + "rate:" + p.rating.value + "$",
    });
  }
  if (p.price?.value != null) {
    const prefix = p.price.mode === "less" ? "-" : "";
    items.push({
      type: "price",
      text: "$" + prefix + "price:" + p.price.value + "$",
    });
  }
  // 年龄分级
  if (p.age === "general") {
    items.push({ type: "age", text: "$age:general$" });
  } else if (p.age === "r15") {
    items.push({ type: "age", text: "$age:r15$" });
  } else if (p.age === "excludeAdult") {
    items.push({ type: "age-exclude", text: "$-age:adult$" });
  }

  return items;
});
const hasContent = computed(() => syntaxItems.value.length > 0);
const copyLink = async () => {
  const url = generateUrl();
  if (url) {
    try {
      await navigator.clipboard.writeText(url);
      copySuccess.value = true;
      setTimeout(() => (copySuccess.value = false), 2000);
    } catch {
      alert("复制失败");
    }
  }
};
const generateUrl = () => {
  if (!hasContent.value) return "";
  const query = syntaxItems.value.map((item) => item.text).join(" ");
  return "https://api.asmr-200.com/api/search/" + encodeURIComponent(query);
};
watch(
  () => props.searchParams,
  () => {
    copySuccess.value = false;
  },
  { deep: true },
);
</script>
<style scoped>
.search-preview {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.label {
  font-weight: 600;
  color: #333;
}
.copy-btn {
  padding: 6px 12px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.copy-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.preview-content {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  min-height: 60px;
}
.syntax-display {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.syntax-item {
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}
.syntax-item.tag-include {
  background: #e6f7ff;
  color: #1890ff;
}
.syntax-item.tag-exclude {
  background: #fff2f0;
  color: #ff4d4f;
}
.syntax-item.duration {
  background: #fff7e6;
  color: #fa8c16;
}
.syntax-item.rating {
  background: #f6ffed;
  color: #52c41a;
}
.syntax-item.price {
  background: #fffbe6;
  color: #faad14;
}
.syntax-item.age {
  background: #f9f0ff;
  color: #722ed1;
}
.syntax-item.age-exclude {
  background: #fff2f0;
  color: #ff4d4f;
}
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  color: #999;
}
.result-count {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  text-align: right;
}
</style>
