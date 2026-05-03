<template>
  <div
    v-if="visible"
    class="quick-palette-backdrop"
    @mousedown.self="emit('close')"
  >
    <section class="quick-palette" @mousedown.stop>
      <header class="quick-palette-head">
        <div>
          <strong>{{ title }}</strong>
          <small>{{ mode === "command" ? "命令面板" : "节点选择器" }}</small>
        </div>
        <span class="quick-palette-count">{{ items.length }}</span>
      </header>

      <input
        ref="inputRef"
        :value="keyword"
        class="quick-palette-input"
        :placeholder="placeholder"
        @input="emit('update:keyword', $event.target.value)"
        @keydown.esc.prevent="emit('close')"
        @keydown.up.prevent="emit('move-selection', -1)"
        @keydown.down.prevent="emit('move-selection', 1)"
        @keydown.enter.prevent="emit('select')"
      />

      <div
        v-if="items.length"
        class="quick-palette-list-shell"
        :class="{
          'has-scroll-top': canScrollUp,
          'has-scroll-bottom': canScrollDown,
        }"
      >
        <TransitionGroup
          ref="listRef"
          name="quick-palette"
          tag="div"
          class="quick-palette-list"
          @scroll="updateScrollState"
        >
          <button
            v-for="(item, index) in items"
            :key="resolveItemKey(item, index)"
            :ref="(el) => setItemRef(resolveItemKey(item, index), el)"
            type="button"
            class="quick-palette-item"
            :class="{
              active: index === selectedIndex,
              disabled: item.disabled,
            }"
            :disabled="item.disabled"
            @mouseenter="emit('hover-index', index)"
            @click="emit('select', item)"
          >
            <span class="quick-palette-badge">{{ item.badge || "?" }}</span>
            <span class="quick-palette-main">
              <strong>{{ item.label }}</strong>
              <small>{{ item.subtitle }}</small>
            </span>
            <span class="quick-palette-side">
              <small>{{ item.meta }}</small>
              <span v-if="item.schema" class="quick-palette-schema">{{
                item.schema
              }}</span>
              <span v-if="item.description" class="quick-palette-desc">{{
                item.description
              }}</span>
            </span>
          </button>
        </TransitionGroup>
      </div>

      <div v-if="items.length" class="quick-palette-helper">
        <span>↑↓ 切换</span>
        <span>回车选择</span>
        <span>ESC 关闭</span>
      </div>

      <div v-else class="quick-palette-empty">没有匹配项</div>
    </section>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";

const inputRef = ref(null);
const listRef = ref(null);
const canScrollUp = ref(false);
const canScrollDown = ref(false);
const itemRefMap = new Map();

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: "node",
  },
  title: {
    type: String,
    default: "快捷面板",
  },
  placeholder: {
    type: String,
    default: "输入关键词",
  },
  keyword: {
    type: String,
    default: "",
  },
  items: {
    type: Array,
    default: () => [],
  },
  selectedIndex: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits([
  "update:keyword",
  "move-selection",
  "select",
  "close",
  "hover-index",
]);

const resolveItemKey = (item, index) =>
  String(item?.id || item?.type || item?.commandId || index);

const resolveScrollElement = () => {
  if (listRef.value instanceof HTMLElement) {
    return listRef.value;
  }

  if (listRef.value?.$el instanceof HTMLElement) {
    return listRef.value.$el;
  }

  return null;
};

const setItemRef = (key, element) => {
  if (element instanceof HTMLElement) {
    itemRefMap.set(key, element);
    return;
  }

  itemRefMap.delete(key);
};

const updateScrollState = () => {
  const element = resolveScrollElement();
  if (!element) {
    canScrollUp.value = false;
    canScrollDown.value = false;
    return;
  }

  canScrollUp.value = element.scrollTop > 4;
  canScrollDown.value =
    element.scrollTop + element.clientHeight < element.scrollHeight - 4;
};

const scrollSelectedItemIntoView = (behavior = "smooth") => {
  const selectedItem = props.items[props.selectedIndex];
  if (!selectedItem) {
    return;
  }

  const key = resolveItemKey(selectedItem, props.selectedIndex);
  nextTick(() => {
    const element = itemRefMap.get(key);
    if (!(element instanceof HTMLElement)) {
      updateScrollState();
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion ? "auto" : behavior,
    });
    updateScrollState();
  });
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }
    nextTick(() => {
      inputRef.value?.focus();
      inputRef.value?.select?.();
      updateScrollState();
      scrollSelectedItemIntoView("auto");
    });
  },
  { immediate: true },
);

watch(
  () => props.selectedIndex,
  () => {
    if (!props.visible) {
      return;
    }

    scrollSelectedItemIntoView();
  },
);

watch(
  () => props.items,
  () => {
    if (!props.visible) {
      return;
    }

    nextTick(() => {
      updateScrollState();
      scrollSelectedItemIntoView("auto");
    });
  },
  { deep: false },
);
</script>

<style scoped>
.quick-palette-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: clamp(3rem, 12vh, 8rem);
  background: rgba(7, 8, 10, 0.28);
  backdrop-filter: blur(4px);
}

.quick-palette {
  width: min(40rem, calc(100vw - 2rem));
  max-height: min(36rem, calc(100vh - 6rem));
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border: 1px solid rgba(79, 79, 82, 0.92);
  border-radius: 0.75rem;
  background: rgba(24, 24, 26, 0.98);
  box-shadow: 0 1.1rem 2.2rem rgba(0, 0, 0, 0.46);
}

.quick-palette-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.quick-palette-head strong {
  display: block;
  color: #f2f3f6;
  font-size: 0.95rem;
}

.quick-palette-head small,
.quick-palette-count,
.quick-palette-main small,
.quick-palette-side small,
.quick-palette-schema,
.quick-palette-desc,
.quick-palette-empty {
  color: #a4a8b1;
  font-size: 0.72rem;
}

.quick-palette-count {
  min-width: 2rem;
  min-height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.quick-palette-input {
  width: 100%;
  min-height: 2.7rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(89, 89, 94, 0.92);
  border-radius: 0.6rem;
  background: #111214;
  color: #f5f6f8;
}

.quick-palette-list {
  min-height: 0;
  max-height: min(27rem, calc(100vh - 15rem));
  overflow: auto;
  display: grid;
  gap: 0.45rem;
  padding-right: 0.16rem;
  scroll-behavior: smooth;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.quick-palette-list-shell {
  position: relative;
}

.quick-palette-list-shell::before,
.quick-palette-list-shell::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0.18rem;
  height: 1.1rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
  z-index: 1;
}

.quick-palette-list-shell::before {
  top: 0;
  background: linear-gradient(
    180deg,
    rgba(24, 24, 26, 0.96),
    rgba(24, 24, 26, 0)
  );
}

.quick-palette-list-shell::after {
  bottom: 0;
  background: linear-gradient(
    0deg,
    rgba(24, 24, 26, 0.96),
    rgba(24, 24, 26, 0)
  );
}

.quick-palette-list-shell.has-scroll-top::before,
.quick-palette-list-shell.has-scroll-bottom::after {
  opacity: 1;
}

.quick-palette-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: center;
  width: 100%;
  padding: 0.75rem 0.8rem;
  border: 1px solid rgba(78, 78, 84, 0.84);
  border-radius: 0.65rem;
  background: rgba(36, 36, 39, 0.96);
  color: #f0f2f5;
  text-align: left;
  cursor: pointer;
  transition:
    transform 140ms ease,
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 180ms ease;
}

.quick-palette-item.active {
  border-color: rgba(186, 186, 188, 0.94);
  background: rgba(58, 58, 62, 0.98);
  box-shadow: 0 0.55rem 1.4rem rgba(0, 0, 0, 0.28);
  transform: translateY(-1px);
}

.quick-palette-item.disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.quick-palette-badge {
  width: 1.85rem;
  height: 1.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  background: rgba(255, 255, 255, 0.08);
  color: #f2f3f6;
  font-size: 0.78rem;
  font-weight: 700;
}

.quick-palette-main,
.quick-palette-side {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}

.quick-palette-main strong,
.quick-palette-side {
  overflow: hidden;
}

.quick-palette-main strong,
.quick-palette-main small,
.quick-palette-side small,
.quick-palette-schema,
.quick-palette-desc {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.quick-palette-side {
  max-width: 14rem;
  justify-items: end;
}

.quick-palette-schema {
  color: #d4d8e0;
}

.quick-palette-empty {
  padding: 1.1rem 0.25rem 0.4rem;
}

.quick-palette-helper {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
  padding-inline: 0.15rem;
  color: #979ca6;
  font-size: 0.72rem;
}

.quick-palette-helper span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.quick-palette-enter-active,
.quick-palette-move {
  transition:
    transform 160ms ease,
    opacity 140ms ease;
}

.quick-palette-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
