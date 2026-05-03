<template>
  <section class="workflow-page-shell">
    <header class="workflow-page-hero">
      <div>
        <span class="workflow-page-kicker">工作流 / 节点文档</span>
        <h2>节点目录 / 文档</h2>
        <p>
          节点卡片、Inspector、搜索面板和文档页共用同一份目录数据，方便对齐
          Comfy 的节点信息流。
        </p>
      </div>
      <div class="workflow-page-actions">
        <n-input
          v-model:value="keyword"
          clearable
          placeholder="搜索节点名 / 类型 / 分类"
        />
        <n-button secondary @click="refreshCatalog">刷新</n-button>
      </div>
    </header>

    <section class="workflow-docs-grid">
      <article class="workflow-panel docs-list-panel">
        <div class="panel-title-row">
          <strong>节点目录</strong>
          <span
            >{{ filteredEntries.length }} / {{ catalogEntries.length }}</span
          >
        </div>
        <div class="category-chip-row">
          <button
            v-for="category in categoryOptions"
            :key="category.key"
            type="button"
            class="category-chip"
            :class="{ active: category.key === activeCategory }"
            @click="activeCategory = category.key"
          >
            {{ category.label }}
          </button>
        </div>
        <div class="docs-entry-list">
          <button
            v-for="entry in filteredEntries"
            :key="entry.type"
            type="button"
            class="docs-entry"
            :class="{ active: entry.type === activeNodeType }"
            @click="activeNodeType = entry.type"
          >
            <strong>{{ entry.displayName }}</strong>
            <span>{{ entry.category }}</span>
            <small>{{ entry.type }}</small>
          </button>
        </div>
      </article>

      <article class="workflow-panel docs-detail-panel">
        <template v-if="activeEntry">
          <div class="panel-title-row">
            <strong>{{ activeEntry.displayName }}</strong>
            <span>{{ activeEntry.category }}</span>
          </div>
          <p class="detail-copy">
            {{ activeEntry.description || "暂无节点描述。" }}
          </p>

          <section class="detail-grid">
            <div class="detail-block">
              <h3>必填输入</h3>
              <div
                v-if="activeEntry.inputs?.required?.length"
                class="detail-list"
              >
                <article
                  v-for="item in activeEntry.inputs.required"
                  :key="item.key"
                  class="detail-list-item compact"
                >
                  <strong>{{ item.label || item.key }}</strong>
                  <span>{{ formatValueKind(item.datatype) }}</span>
                  <small>{{ item.key }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">没有必填输入。</div>
            </div>

            <div class="detail-block">
              <h3>可选输入</h3>
              <div
                v-if="activeEntry.inputs?.optional?.length"
                class="detail-list"
              >
                <article
                  v-for="item in activeEntry.inputs.optional"
                  :key="item.key"
                  class="detail-list-item compact"
                >
                  <strong>{{ item.label || item.key }}</strong>
                  <span>{{ formatValueKind(item.datatype) }}</span>
                  <small>{{ item.key }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">没有可选输入。</div>
            </div>
          </section>

          <section class="detail-grid">
            <div class="detail-block">
              <h3>输出</h3>
              <div v-if="activeEntry.outputs?.length" class="detail-list">
                <article
                  v-for="item in activeEntry.outputs"
                  :key="item.key"
                  class="detail-list-item compact"
                >
                  <strong>{{ item.label || item.key }}</strong>
                  <span>{{ formatValueKind(item.datatype) }}</span>
                  <small>{{ item.key }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">没有输出端口。</div>
            </div>

            <div class="detail-block">
              <h3>配置项</h3>
              <div v-if="activeEntry.widgets?.length" class="detail-list">
                <article
                  v-for="item in activeEntry.widgets"
                  :key="item.key || item.label"
                  class="detail-list-item compact"
                >
                  <strong>{{ item.label || item.key }}</strong>
                  <span>{{
                    formatValueKind(item.widget || item.type || "text")
                  }}</span>
                  <small>{{ item.key }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">该节点没有内联配置项。</div>
            </div>
          </section>

          <section class="detail-block markdown-block">
            <h3>自动文档</h3>
            <pre>{{ activeEntry.docs?.markdown || "暂无节点文档。" }}</pre>
          </section>
        </template>
        <div v-else class="empty-copy">请选择左侧节点查看文档详情。</div>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useWorkflowHubStore } from "../../stores/workflowHub";

const workflowHub = useWorkflowHubStore();
const keyword = ref("");
const activeCategory = ref("all");
const activeNodeType = ref("");

const catalogEntries = computed(() => workflowHub.catalogEntries || []);
const categoryOptions = computed(() => [
  { key: "all", label: "全部" },
  ...(workflowHub.catalogCategories || []).map((entry) => ({
    key: entry.key,
    label: `${entry.label} (${entry.count})`,
  })),
]);
const filteredEntries = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return catalogEntries.value.filter((entry) => {
    if (
      activeCategory.value !== "all" &&
      entry.category !== activeCategory.value
    ) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack = [
      entry.displayName,
      entry.type,
      entry.category,
      ...(entry.searchAliases || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
});

const formatValueKind = (rawValue = "") => {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  const labels = {
    path: "路径",
    text: "文本",
    number: "数字",
    list: "列表",
    files: "文件集",
    boolean: "布尔",
    json: "JSON",
    select: "下拉",
    "multi-select": "多选",
  };

  return labels[normalized] || String(rawValue || "").trim() || "文本";
};
const activeEntry = computed(
  () =>
    filteredEntries.value.find(
      (entry) => entry.type === activeNodeType.value,
    ) ||
    catalogEntries.value.find((entry) => entry.type === activeNodeType.value) ||
    null,
);

watch(
  filteredEntries,
  (value) => {
    if (!activeNodeType.value && value.length) {
      activeNodeType.value = value[0].type;
      return;
    }
    if (
      activeNodeType.value &&
      !catalogEntries.value.some((entry) => entry.type === activeNodeType.value)
    ) {
      activeNodeType.value = value[0]?.type || "";
    }
  },
  { immediate: true },
);

const refreshCatalog = async () => {
  await workflowHub.bootstrap();
  await workflowHub.refreshCatalog();
};

onMounted(async () => {
  await refreshCatalog();
  const pendingNodeType = workflowHub.readPendingDocsNodeType();
  if (pendingNodeType) {
    activeNodeType.value = pendingNodeType;
  }
});
</script>

<style scoped>
.workflow-page-shell {
  display: grid;
  gap: 18px;
}

.workflow-page-hero,
.workflow-panel {
  border: 1px solid rgba(112, 136, 176, 0.18);
  border-radius: 18px;
  background: rgba(12, 18, 28, 0.82);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.workflow-page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
}

.workflow-page-kicker {
  display: inline-flex;
  margin-bottom: 8px;
  color: #9fb2d4;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workflow-page-hero h2,
.detail-block h3,
.docs-entry strong {
  color: #f4f7ff;
}

.workflow-page-hero p,
.detail-copy,
.empty-copy,
.docs-entry span,
.docs-entry small,
.detail-list-item span,
.detail-list-item small,
.markdown-block pre {
  color: #9db0cf;
}

.workflow-page-actions {
  display: inline-flex;
  gap: 10px;
}

.workflow-docs-grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 18px;
}

.workflow-panel {
  padding: 18px;
}

.panel-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  color: #dfe7f5;
}

.category-chip-row,
.docs-entry-list,
.detail-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.docs-entry-list,
.detail-list {
  flex-direction: column;
}

.category-chip,
.docs-entry {
  border: 1px solid rgba(120, 144, 188, 0.18);
  border-radius: 12px;
  background: rgba(16, 24, 38, 0.88);
}

.category-chip {
  padding: 8px 12px;
  color: #b7c6df;
}

.category-chip.active,
.docs-entry.active,
.docs-entry:hover {
  border-color: rgba(151, 186, 255, 0.52);
}

.docs-entry {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  text-align: left;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.detail-block {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(16, 24, 38, 0.88);
}

.detail-list-item.compact {
  display: grid;
  gap: 4px;
}

.markdown-block pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: "Cascadia Mono", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 1100px) {
  .workflow-docs-grid,
  .detail-grid,
  .workflow-page-hero {
    grid-template-columns: minmax(0, 1fr);
    flex-direction: column;
  }
}
</style>
