<template>
  <div class="grid-col" :class="colClass">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  cols: { type: [String, Number], default: 'auto' },
  span: { type: [String, Number], default: null },
  offset: { type: [String, Number], default: 0 },
  lg: { type: [String, Number], default: null },
  md: { type: [String, Number], default: null },
  sm: { type: [String, Number], default: null }
})

const colClass = computed(() => {
  const classes = []
  if (typeof props.cols === 'number') {
    classes.push('col-span-' + props.cols)
  } else if (props.cols == 'auto') {
    classes.push('col-auto')
  }
  if (props.span) classes.push('col-span-' + props.span)
  if (props.offset) classes.push('col-offset-' + props.offset)
  if (props.lg) classes.push('lg:col-span-' + props.lg)
  if (props.md) classes.push('md:col-span-' + props.md)
  if (props.sm) classes.push('sm:col-span-' + props.sm)
  return classes.join(' ')
})
</script>

<style scoped>
.grid-col {
  min-width: 0;
}
.col-auto {
  grid-column: auto;
}
.col-span-1 {
  grid-column: span 1 / span 1;
}
.col-span-2 {
  grid-column: span 2 / span 2;
}
.col-span-3 {
  grid-column: span 3 / span 3;
}
.col-span-4 {
  grid-column: span 4 / span 4;
}
.col-span-5 {
  grid-column: span 5 / span 5;
}
.col-span-6 {
  grid-column: span 6 / span 6;
}
.col-span-8 {
  grid-column: span 8 / span 8;
}
.col-span-12 {
  grid-column: span 12 / span 12;
}
.col-offset-1 {
  grid-column-start: 2;
}
.col-offset-2 {
  grid-column-start: 3;
}
.col-offset-3 {
  grid-column-start: 4;
}
@media (min-width: 640px) {
  .sm\:col-span-1 {
    grid-column: span 1 / span 1;
  }
  .sm\:col-span-2 {
    grid-column: span 2 / span 2;
  }
  .sm\:col-span-3 {
    grid-column: span 3 / span 3;
  }
  .sm\:col-span-4 {
    grid-column: span 4 / span 4;
  }
}
@media (min-width: 768px) {
  .md\:col-span-2 {
    grid-column: span 2 / span 2;
  }
  .md\:col-span-3 {
    grid-column: span 3 / span 3;
  }
  .md\:col-span-4 {
    grid-column: span 4 / span 4;
  }
  .md\:col-span-6 {
    grid-column: span 6 / span 6;
  }
}
@media (min-width: 1024px) {
  .lg\:col-span-3 {
    grid-column: span 3 / span 3;
  }
  .lg\:col-span-4 {
    grid-column: span 4 / span 4;
  }
  .lg\:col-span-6 {
    grid-column: span 6 / span 6;
  }
  .lg\:col-span-8 {
    grid-column: span 8 / span 8;
  }
}
</style>
