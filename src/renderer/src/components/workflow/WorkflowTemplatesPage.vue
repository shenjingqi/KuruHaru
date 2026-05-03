<template>
  <section class="workflow-page-shell">
    <header class="workflow-page-hero">
      <div>
        <span class="workflow-page-kicker">工作流 / 模板</span>
        <h2>工作流模板中心</h2>
        <p>
          先从模板进入，而不是直接落到空白画布。这里集中展示模板摘要、输入要求、依赖提醒和最近编辑记录。
        </p>
      </div>
      <div class="workflow-page-actions">
        <n-button secondary @click="refreshAll">刷新</n-button>
        <n-button type="primary" @click="openBlankTemplate">新建空白工作流</n-button>
      </div>
    </header>

    <section class="workflow-page-grid">
      <article class="workflow-panel template-list-panel">
        <div class="panel-title-row">
          <strong>模板列表</strong>
          <span>{{ templates.length }} 个模板</span>
        </div>
        <div class="template-card-list">
          <button
            v-for="template in templates"
            :key="template.id"
            type="button"
            class="template-card"
            :class="{ active: template.id === selectedTemplateId }"
            @click="selectedTemplateId = template.id"
          >
            <div class="template-card-head">
              <strong>{{ template.displayName }}</strong>
              <span>{{ template.category }}</span>
            </div>
            <p>{{ template.summary || template.description }}</p>
            <div class="template-tag-row">
              <span v-for="tag in template.tags || []" :key="`${template.id}-${tag}`">{{ tag }}</span>
            </div>
          </button>
        </div>
      </article>

      <article class="workflow-panel template-detail-panel">
        <template v-if="selectedTemplate">
          <div class="panel-title-row">
            <strong>{{ selectedTemplate.displayName }}</strong>
            <span>{{ selectedTemplate.category }}</span>
          </div>
          <p class="detail-copy">{{ selectedTemplate.description }}</p>

          <div class="detail-grid">
            <section class="detail-block">
              <h3>输入要求</h3>
              <div v-if="selectedTemplate.inputRequirements?.length" class="detail-list">
                <article v-for="entry in selectedTemplate.inputRequirements" :key="entry.key" class="detail-list-item">
                  <strong>{{ entry.label }}</strong>
                  <span>{{ entry.datatype || 'ANY' }}</span>
                  <small>{{ entry.required ? '必填' : '可选' }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">该模板没有额外输入要求。</div>
            </section>

            <section class="detail-block">
              <h3>依赖提示</h3>
              <div v-if="selectedTemplate.dependencies?.length" class="detail-list">
                <article v-for="entry in selectedTemplate.dependencies" :key="entry.key" class="detail-list-item">
                  <strong>{{ entry.label }}</strong>
                  <span>{{ entry.required ? '必需' : '可选' }}</span>
                  <small>{{ entry.detail || '暂无补充说明' }}</small>
                </article>
              </div>
              <div v-else class="empty-copy">该模板没有额外依赖。</div>
            </section>
          </div>

          <section class="detail-block recent-block">
            <h3>最近工作流</h3>
            <div v-if="recentDocuments.length" class="detail-list">
              <article v-for="document in recentDocuments" :key="document.id" class="detail-list-item compact">
                <strong>{{ document.name }}</strong>
                <span>{{ document.nodeCount }} 节点 / {{ document.edgeCount }} 连线</span>
                <small>{{ document.updatedAt || '暂无更新时间' }}</small>
              </article>
            </div>
            <div v-else class="empty-copy">还没有最近工作流记录。</div>
          </section>

          <div class="template-footer-actions">
            <n-button secondary @click="openNodeDocsPage">查看节点文档</n-button>
            <n-button type="primary" @click="openInDesigner">载入到设计器</n-button>
          </div>
        </template>
        <div v-else class="empty-copy">请选择左侧模板查看详情。</div>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useWorkflowHubStore } from '../../stores/workflowHub';

const workflowHub = useWorkflowHubStore();
const selectedTemplateId = ref('');

const templates = computed(() => workflowHub.templates || []);
const recentDocuments = computed(() => workflowHub.recentDocuments || []);
const selectedTemplate = computed(() =>
  templates.value.find((template) => template.id === selectedTemplateId.value) || null,
);

watch(
  templates,
  (value) => {
    if (!selectedTemplateId.value && value.length) {
      selectedTemplateId.value = value[0].id;
    }
    if (selectedTemplateId.value && !value.some((item) => item.id === selectedTemplateId.value)) {
      selectedTemplateId.value = value[0]?.id || '';
    }
  },
  { immediate: true },
);

const refreshAll = async () => {
  await workflowHub.bootstrap(true);
  await workflowHub.refreshTemplates();
};

const openInDesigner = async () => {
  if (!selectedTemplate.value?.id) {
    return;
  }
  await workflowHub.openTemplateInDesigner(selectedTemplate.value.id);
};

const openBlankTemplate = async () => {
  await workflowHub.openTemplateInDesigner('blank-workflow');
};

const openNodeDocsPage = async () => {
  await workflowHub.openNodeDocs('whisper.translateSubtitles');
};

onMounted(async () => {
  await workflowHub.bootstrap();
  if (!templates.value.length) {
    await workflowHub.refreshTemplates();
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

.workflow-page-hero h2 {
  margin: 0;
  color: #f2f5fb;
  font-size: 26px;
}

.workflow-page-hero p,
.detail-copy,
.empty-copy,
.template-card p {
  color: #b3bfd3;
}

.workflow-page-actions {
  display: inline-flex;
  gap: 10px;
}

.workflow-page-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 18px;
}

.workflow-panel {
  padding: 18px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  color: #dfe7f5;
}

.template-card-list,
.detail-list {
  display: grid;
  gap: 12px;
}

.template-card {
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(128, 153, 196, 0.18);
  border-radius: 14px;
  background: rgba(18, 27, 41, 0.9);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.template-card.active,
.template-card:hover {
  border-color: rgba(151, 186, 255, 0.52);
  transform: translateY(-1px);
}

.template-card-head,
.detail-list-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.template-card-head strong,
.detail-list-item strong,
.detail-block h3 {
  color: #f4f7ff;
}

.template-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-tag-row span,
.detail-list-item span,
.detail-list-item small {
  color: #8fa4c5;
  font-size: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.detail-block {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(16, 24, 38, 0.88);
}

.detail-list-item.compact {
  flex-direction: column;
}

.template-footer-actions {
  display: inline-flex;
  gap: 12px;
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .workflow-page-grid,
  .detail-grid,
  .workflow-page-hero {
    grid-template-columns: minmax(0, 1fr);
    flex-direction: column;
  }
}
</style>
