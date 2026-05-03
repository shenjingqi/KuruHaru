import { defineStore } from "pinia";
import { computed, ref } from "vue";

const toSelectionKey = (type, id) => `${type}:${id}`;

const parseSelectionKey = (key) => {
  const [type, ...idParts] = String(key || "").split(":");
  if (!type || !idParts.length) {
    return null;
  }
  return {
    type,
    id: idParts.join(":"),
  };
};

export const useWorkflowSelectionStore = defineStore(
  "workflowSelection",
  () => {
    const selectedKeys = ref([]);
    const marquee = ref({
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });

    const selectedSet = computed(() => new Set(selectedKeys.value));

    const selectedItems = computed(() =>
      selectedKeys.value
        .map(parseSelectionKey)
        .filter((item) => item && item.id),
    );

    const clearSelection = () => {
      selectedKeys.value = [];
    };

    const selectSingle = (type, id) => {
      if (!type || !id) {
        clearSelection();
        return;
      }
      selectedKeys.value = [toSelectionKey(type, id)];
    };

    const setSelection = (items = []) => {
      const nextKeys = [];
      items.forEach((item) => {
        if (!item || !item.type || !item.id) {
          return;
        }
        nextKeys.push(toSelectionKey(item.type, item.id));
      });
      selectedKeys.value = [...new Set(nextKeys)];
    };

    const addToSelection = (type, id) => {
      if (!type || !id) {
        return;
      }
      const key = toSelectionKey(type, id);
      if (selectedSet.value.has(key)) {
        return;
      }
      selectedKeys.value = [...selectedKeys.value, key];
    };

    const toggleSelection = (type, id) => {
      if (!type || !id) {
        return;
      }
      const key = toSelectionKey(type, id);
      if (selectedSet.value.has(key)) {
        selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
        return;
      }
      selectedKeys.value = [...selectedKeys.value, key];
    };

    const removeFromSelection = (type, id) => {
      const key = toSelectionKey(type, id);
      selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
    };

    const isSelected = (type, id) =>
      selectedSet.value.has(toSelectionKey(type, id));

    const beginMarquee = ({ x = 0, y = 0 } = {}) => {
      marquee.value = {
        active: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      };
    };

    const updateMarquee = ({ x = 0, y = 0 } = {}) => {
      if (!marquee.value.active) {
        return;
      }
      marquee.value = {
        ...marquee.value,
        currentX: x,
        currentY: y,
      };
    };

    const endMarquee = () => {
      marquee.value = {
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      };
    };

    const marqueeRect = computed(() => {
      const state = marquee.value;
      const left = Math.min(state.startX, state.currentX);
      const top = Math.min(state.startY, state.currentY);
      const width = Math.abs(state.currentX - state.startX);
      const height = Math.abs(state.currentY - state.startY);
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      };
    });

    return {
      selectedKeys,
      selectedSet,
      selectedItems,
      marquee,
      marqueeRect,
      clearSelection,
      selectSingle,
      setSelection,
      addToSelection,
      toggleSelection,
      removeFromSelection,
      isSelected,
      beginMarquee,
      updateMarquee,
      endMarquee,
    };
  },
);
