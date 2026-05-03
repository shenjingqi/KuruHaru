<template>
  <section class="orbit-overview" aria-label="工作流概览">
    <article
      v-for="card in overviewCards"
      :key="card.key"
      class="overview-card"
      :class="card.tone"
    >
      <span class="overview-kicker">{{ card.kicker }}</span>
      <strong class="overview-value">{{ card.value }}</strong>
      <p class="overview-meta">{{ card.meta }}</p>
    </article>
  </section>
</template>

<script setup>
import { inject } from "vue";
import {
  ensureWorkflowDesignerContext,
  workflowDesignerContextKey,
} from "./workflowDesignerContext";

const context = ensureWorkflowDesignerContext(
  inject(workflowDesignerContextKey),
);
const { overviewCards } = context;
</script>
