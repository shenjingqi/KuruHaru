<template>
  <div class="responsive-container" :class="containerClass">
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  // 约定 gap/padding/maxWidth 都走 token 值，保持布局参数在页面间可复用。
  gap: { type: String, default: "4" },
  maxWidth: { type: String, default: "7xl" },
  padding: { type: String, default: "4" },
});

const containerClass = computed(() => {
  // 统一在此拼接工具类，避免模板中散落字符串导致维护困难。
  return (
    "gap-" + props.gap + " px-" + props.padding + " max-w-" + props.maxWidth
  );
});
// 具体列数断点由 scoped CSS 控制，这里只负责外层间距与宽度约束。
</script>

<style scoped>
.responsive-container {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  width: 100%;
  margin: 0 auto;
}
@media (max-width: 1280px) {
  .responsive-container {
    grid-template-columns: repeat(8, 1fr);
  }
}
@media (max-width: 1024px) {
  .responsive-container {
    grid-template-columns: repeat(6, 1fr);
  }
}
@media (max-width: 768px) {
  .responsive-container {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 640px) {
  .responsive-container {
    grid-template-columns: repeat(2, 1fr);
  }
}
.gap-2 {
  gap: 0.5rem;
}
.gap-4 {
  gap: 1rem;
}
.gap-6 {
  gap: 1.5rem;
}
.gap-8 {
  gap: 2rem;
}
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}
.px-6 {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
}
.px-8 {
  padding-left: 2rem;
  padding-right: 2rem;
}
.max-w-5xl {
  max-width: 64rem;
}
.max-w-6xl {
  max-width: 72rem;
}
.max-w-7xl {
  max-width: 80rem;
}
.max-w-full {
  max-width: 100%;
}
</style>
