import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  asmrFetchCloudWorks,
  asmrDeleteWorks,
  asmrGetCachedCloudWorks,
  onCloudWorksUpdated,
  removeCloudWorksUpdatedListeners,
} from "../api/asmrApi";
import { tgReadRecentActivity } from "../api/tgApi";

export const useCloudCleaner = () => {
  const cloudWorks = ref([]);
  const selectedCloudWorks = ref([]);
  const isBusy = ref(false);
  const searchText = ref("");
  const selectedTags = ref([]);
  const tagMode = ref("OR");
  const tgRJCodes = ref([]);

  const uploadButtonText = computed(() => {
    if (tgRJCodes.value.length === 0) {
      return "最近上传";
    }
    const overlapCount = countOverlap();
    if (overlapCount > 0) {
      return `最近上传 (${overlapCount}条重合)`;
    }
    return "最近上传 (无重合)";
  });

  // 提取编号的数字部分（用于跨前缀匹配，如VJ123456和RJ123456）
  const extractNumberPart = (code) => {
    if (!code) return "";
    const match = String(code).match(/\d+/);
    return match ? match[0] : "";
  };

  const countOverlap = () => {
    // 提取云端作品的所有数字编号
    const cloudNumbers = new Set(
      cloudWorks.value
        .map((w) => extractNumberPart(w.source_id))
        .filter(Boolean),
    );

    // 统计TG中数字编号与云端重合的数量
    return tgRJCodes.value.filter((code) =>
      cloudNumbers.has(extractNumberPart(code)),
    ).length;
  };

  const checkRecentUpload = async () => {
    const res = await tgReadRecentActivity();
    if (res.success && res.data?.files) {
      // 提取所有 RJ 号
      tgRJCodes.value = res.data.files
        .map((f) => f.rjCode || f.id)
        .filter(Boolean);

      const overlap = countOverlap();
      if (overlap > 0) {
        // 自动勾选重合的作品（基于数字部分匹配）
        const overlapIds = cloudWorks.value
          .filter((w) => {
            const cloudNumber = extractNumberPart(w.source_id);
            return (
              cloudNumber &&
              tgRJCodes.value.some(
                (code) => extractNumberPart(code) === cloudNumber,
              )
            );
          })
          .map((w) => w.id);
        selectedCloudWorks.value = overlapIds;
        alert(`发现 ${overlap} 条重合，已自动勾选`);
      } else {
        alert("无重合数据");
      }
    }
  };

  const allTags = computed(() => {
    const tags = new Set();
    cloudWorks.value.forEach((work) => {
      let tagList = work.tags;
      if (typeof tagList === "string") {
        try {
          tagList = JSON.parse(tagList);
        } catch {
          tagList = [];
        }
      }
      if (Array.isArray(tagList)) {
        tagList.forEach((tag) => {
          // 标签是对象，提取 name
          const name = typeof tag === "string" ? tag : tag.name || "";
          if (name) tags.add(name);
        });
      }
    });
    return Array.from(tags).slice(0, 20);
  });

  // 带数量的标签列表
  const allTagsWithCount = computed(() => {
    const tagCount = {};
    cloudWorks.value.forEach((work) => {
      const tags = getTags(work);
      tags.forEach((tag) => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });
    return Object.entries(tagCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  });

  // 清除标签筛选
  const clearTagFilter = () => {
    selectedTags.value = [];
  };

  // 点击标签时勾选对应作品
  const toggleTag = (tag) => {
    const idx = selectedTags.value.indexOf(tag);
    if (idx > -1) {
      selectedTags.value.splice(idx, 1);
    } else {
      selectedTags.value.push(tag);
    }

    // 自动勾选匹配的作品
    selectWorksByTags();
  };

  // 根据选中的标签自动勾选作品
  const selectWorksByTags = () => {
    if (selectedTags.value.length === 0) {
      return;
    }

    const idsToSelect = cloudWorks.value
      .filter((w) => {
        const tags = getTags(w);
        if (tagMode.value === "OR") {
          return selectedTags.value.some((t) => tags.includes(t));
        }
        return selectedTags.value.every((t) => tags.includes(t));
      })
      .map((w) => w.id);

    selectedCloudWorks.value = idsToSelect;
  };

  const displayedWorks = computed(() => {
    let result = cloudWorks.value;

    if (searchText.value) {
      const key = searchText.value.toLowerCase();
      result = result.filter((w) => {
        // 只匹配标题和编号
        const matchTitle = w.title?.toLowerCase().includes(key);
        const matchId = w.source_id?.toLowerCase().includes(key);
        return matchTitle || matchId;
      });
    }

    if (selectedTags.value.length > 0) {
      result = result.filter((w) => {
        const tagList = getTags(w);
        // OR模式：满足任一标签
        if (tagMode.value === "OR") {
          return selectedTags.value.some((tag) => tagList.includes(tag));
        }
        // AND模式：满足全部标签
        return selectedTags.value.every((tag) => tagList.includes(tag));
      });
    }

    return result;
  });

  const getTags = (item) => {
    let tagList = item.tags;
    if (typeof tagList === "string") {
      try {
        tagList = JSON.parse(tagList);
      } catch {
        tagList = [];
      }
    }
    if (!Array.isArray(tagList)) return [];

    // 标签是对象，提取 name 字段
    return tagList
      .map((tag) => {
        if (typeof tag === "string") return tag;
        return tag.name || "";
      })
      .filter(Boolean);
  };

  const toggleSelect = (id) => {
    const idx = selectedCloudWorks.value.indexOf(id);
    if (idx > -1) selectedCloudWorks.value.splice(idx, 1);
    else selectedCloudWorks.value.push(id);
  };

  const selectAllDisplayed = () => {
    selectedCloudWorks.value = displayedWorks.value.map((w) => w.id);
  };

  const clearSelection = () => {
    selectedCloudWorks.value = [];
  };

  const fetchCloudWorks = async () => {
    isBusy.value = true;
    await asmrFetchCloudWorks();
    isBusy.value = false;
  };

  const deleteSelected = async () => {
    if (!confirm(`删除 ${selectedCloudWorks.value.length} 个？`)) return;
    const res = await asmrDeleteWorks(Array.from(selectedCloudWorks.value));
    if (res.success) {
      cloudWorks.value = cloudWorks.value.filter(
        (w) => !selectedCloudWorks.value.includes(w.id),
      );
      selectedCloudWorks.value = [];
      alert(`删除 ${res.deletedCount} 个`);
    }
  };

  onMounted(async () => {
    // 监听云端数据实时更新
    onCloudWorksUpdated((res) => {
      if (res.data) {
        cloudWorks.value = res.data;
      }
    });

    // 读取缓存
    const res = await asmrGetCachedCloudWorks();
    if (res.success) cloudWorks.value = res.data;
  });

  onUnmounted(() => {
    removeCloudWorksUpdatedListeners();
  });

  return {
    cloudWorks,
    selectedCloudWorks,
    isBusy,
    searchText,
    selectedTags,
    tagMode,
    uploadButtonText,
    checkRecentUpload,
    allTags,
    allTagsWithCount,
    clearTagFilter,
    toggleTag,
    displayedWorks,
    getTags,
    toggleSelect,
    selectAllDisplayed,
    clearSelection,
    fetchCloudWorks,
    deleteSelected,
  };
};
