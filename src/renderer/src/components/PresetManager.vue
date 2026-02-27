<template>
  <div class="preset-manager">
    <div class="preset-header">
      <span class="label">💾 预设管理</span>
    </div>

    <!-- 保存/更新预设 -->
    <div class="preset-save">
      <input
        v-model="presetName"
        type="text"
        placeholder="输入预设名称"
        class="preset-input"
      />
      <button class="save-btn" :disabled="!presetName" @click="savePreset">
        保存
      </button>
    </div>

    <!-- 预设列表 -->
    <div v-if="presets.length > 0" class="preset-list">
      <div
        v-for="(preset, index) in presets"
        :key="index"
        class="preset-item"
        :class="{ active: activePresets.includes(preset.name) }"
        @click="loadPreset(preset)"
      >
        <label class="preset-checkbox">
          <input
            type="checkbox"
            :checked="activePresets.includes(preset.name)"
            @change="togglePreset(preset.name)"
          />
        </label>
        <span class="preset-name">{{ preset.name }}</span>
        <div v-if="getPresetTags(preset).length > 0" class="preset-tags">
          <span
            v-for="tag in getPresetTags(preset).slice(0, 3)"
            :key="tag"
            class="mini-tag"
            >{{ tag }}</span
          >
          <span v-if="getPresetTags(preset).length > 3" class="more-tags"
            >+{{ getPresetTags(preset).length - 3 }}</span
          >
        </div>
        <div class="preset-actions">
          <button
            class="update-btn"
            title="用当前条件更新"
            @click.stop="updatePreset(preset)"
          >
            ✏️
          </button>
          <button class="delete-btn" @click.stop="deletePreset(index)">
            ✕
          </button>
        </div>
      </div>
    </div>

    <div v-else class="preset-empty">
      <span>选择好条件后保存为预设</span>
    </div>
  </div>
</template>
<script setup>
import { ref, watch, onMounted } from "vue";
const props = defineProps({
  presetsData: { type: Array, default: () => [] },
  currentParams: {
    type: Object,
    default: () => ({
      tags: { include: [], exclude: [] },
      duration: null,
      rating: null,
      age: "all",
    }),
  },
});
const emit = defineEmits(["update:active", "apply", "save"]);

const presetName = ref("");
const presets = ref([]);
const activePresets = ref([]);

// 加载预设时通知父组件
const emitPresetsUpdate = () => {
  emit("save", { presets: presets.value });
};

// 同步presetsData：只在初始时加载
watch(
  () => props.presetsData,
  (val) => {
    if (
      val &&
      Array.isArray(val) &&
      val.length > 0 &&
      presets.value.length === 0
    ) {
      presets.value = val;
      emitPresetsUpdate();
    }
  },
  { immediate: true },
);

const getPresetTags = (preset) => {
  if (!preset?.params?.tags) return [];
  return [
    ...(preset.params.tags.include || []),
    ...(preset.params.tags.exclude || []),
  ];
};

const togglePreset = (name) => {
  const idx = activePresets.value.indexOf(name);
  if (idx >= 0) {
    activePresets.value.splice(idx, 1);
  } else {
    activePresets.value.push(name);
  }
  updateParent();
};

const loadPreset = (preset) => {
  if (preset?.params) {
    emit("apply", preset.params);
  }
};

const deletePreset = (index) => {
  const name = presets.value[index].name;
  presets.value.splice(index, 1);
  const idx = activePresets.value.indexOf(name);
  if (idx >= 0) activePresets.value.splice(idx, 1);
  saveToStorage();
  updateParent();
};

const savePreset = () => {
  if (!presetName.value.trim()) return;

  const existingIndex = presets.value.findIndex(
    (p) => p.name === presetName.value.trim(),
  );

  // 确保 age 保存为字符串
  const ageValue = props.currentParams.age;
  const ageStr =
    typeof ageValue === "string" ? ageValue : ageValue?.age || "all";

  // 深拷贝当前参数，确保保存的是完整的对象
  const newPreset = {
    name: presetName.value.trim(),
    params: {
      tags: props.currentParams.tags
        ? JSON.parse(JSON.stringify(props.currentParams.tags))
        : { include: [], exclude: [] },
      duration: props.currentParams.duration
        ? JSON.parse(JSON.stringify(props.currentParams.duration))
        : null,
      rating: props.currentParams.rating
        ? JSON.parse(JSON.stringify(props.currentParams.rating))
        : null,
      age: ageStr,
    },
  };

  if (existingIndex >= 0) {
    if (confirm(`预设"${presetName.value}"已存在，是否更新？`)) {
      presets.value[existingIndex] = newPreset;
    } else {
      return;
    }
  } else {
    presets.value.push(newPreset);
  }

  saveToStorage();
  emit("save", { presets: presets.value });
  presetName.value = "";
};

const updatePreset = (preset) => {
  const index = presets.value.findIndex((p) => p.name === preset.name);
  if (index >= 0) {
    // 确保 age 保存为字符串
    const ageValue = props.currentParams.age;
    const ageStr =
      typeof ageValue === "string" ? ageValue : ageValue?.age || "all";

    presets.value[index] = {
      name: preset.name,
      params: {
        tags: props.currentParams.tags
          ? JSON.parse(JSON.stringify(props.currentParams.tags))
          : { include: [], exclude: [] },
        duration: props.currentParams.duration
          ? JSON.parse(JSON.stringify(props.currentParams.duration))
          : null,
        rating: props.currentParams.rating
          ? JSON.parse(JSON.stringify(props.currentParams.rating))
          : null,
        age: ageStr,
      },
    };
    saveToStorage();
    emit("save", { presets: presets.value });
  }
};

const updateParent = () => {
  const merged = mergePresets();
  emit("update:active", {
    presets: [...activePresets.value],
    params: merged,
  });
};

const mergePresets = () => {
  const result = {
    tags: { include: [], exclude: [] },
    duration: null,
    rating: null,
    age: "all",
  };

  activePresets.value.forEach((name) => {
    const preset = presets.value.find((p) => p.name === name);
    if (!preset?.params) return;

    const p = preset.params;

    if (p.tags?.include?.length) {
      p.tags.include.forEach((t) => {
        if (!result.tags.include.includes(t)) result.tags.include.push(t);
      });
    }
    if (p.tags?.exclude?.length) {
      p.tags.exclude.forEach((t) => {
        if (!result.tags.exclude.includes(t)) result.tags.exclude.push(t);
      });
    }
    if (p.duration?.value != null) result.duration = { ...p.duration };
    if (p.rating?.value != null) result.rating = { ...p.rating };
    if (p.age && p.age !== "all") result.age = p.age;
  });

  return result;
};

const saveToStorage = () => {
  try {
    const data = JSON.stringify(presets.value);
    localStorage.setItem("searchPresets", data);
  } catch (e) {
    console.error("保存失败", e);
  }
};

onMounted(() => {
  // 优先从localStorage加载
  try {
    const saved = localStorage.getItem("searchPresets");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 清理旧数据格式
        parsed.forEach((preset) => {
          if (preset.params?.age && typeof preset.params.age !== "string") {
            preset.params.age = preset.params.age?.age || "all";
          }
        });
        presets.value = parsed;
        emitPresetsUpdate();
        return;
      }
    }
  } catch (e) {
    console.error("加载失败", e);
  }
  // localStorage没有数据，从父组件加载
  if (props.presetsData && props.presetsData.length > 0) {
    presets.value = props.presetsData;
    emitPresetsUpdate();
  }
});
</script>
<style scoped>
.preset-manager {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px;
}
.preset-header {
  margin-bottom: 12px;
}
.label {
  font-weight: 600;
  color: #333;
}
.preset-save {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.preset-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  outline: none;
  font-size: 13px;
}
.save-btn {
  padding: 8px 16px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.preset-list {
  max-height: 200px;
  overflow-y: auto;
}
.preset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 8px;
  margin-bottom: 4px;
}
.preset-item.active {
  background: #e6f7ff;
  border: 1px solid #1890ff;
}
.preset-checkbox {
  display: flex;
  align-items: center;
}
.preset-name {
  flex: 1;
  font-size: 14px;
  color: #333;
  cursor: pointer;
}
.preset-name:hover {
  color: #1890ff;
}
.preset-tags {
  display: flex;
  gap: 4px;
  max-width: 100px;
  overflow: hidden;
}
.mini-tag {
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 10px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
}
.more-tags {
  font-size: 10px;
  color: #999;
}
.preset-actions {
  display: flex;
  gap: 4px;
}
.update-btn,
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
}
.update-btn:hover {
  background: #e6f7ff;
}
.delete-btn:hover {
  background: #fff2f0;
}
.preset-empty {
  text-align: center;
  color: #999;
  padding: 20px 0;
  font-size: 13px;
}
</style>
