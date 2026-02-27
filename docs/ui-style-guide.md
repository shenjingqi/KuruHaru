# Vue 组件风格指南

> 状态: ✅ 稳定  
> 最后更新: 2026-02-27

本文档定义 KuruHaru 项目的 Vue 组件风格规范。

---

## 1. 组件结构

### 1.1 文件结构

```
components/
├── MyComponent.vue
```

### 1.2 模板结构

```vue
<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2 class="page-title">标题</h2>
      <div class="header-actions">
        <!-- 按钮组 -->
      </div>
    </div>

    <!-- 主要内容 -->
    <div class="content-box">
      <!-- 卡片 -->
      <div class="card">
        <div class="card-header">
          <h3 class="section-title">章节标题</h3>
        </div>
        <div class="card-body">
          <!-- 内容 -->
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMessage, useDialog } from 'naive-ui'

// 常量定义
const CONSTANT_VALUE = 1000

// 状态
const state = ref(null)

// 计算属性
const computedValue = computed(() => { ... })

// 方法
function handleClick() { ... }

// 生命周期
onMounted(() => { ... })
</script>

<style scoped>
/* 样式 */
</style>
```

---

## 2. 命名规范

### 2.1 页面容器

| 类名             | 用途             |
| ---------------- | ---------------- |
| `page-container` | 页面最外层容器   |
| `page-header`    | 页面头部区域     |
| `page-title`     | 页面标题         |
| `header-actions` | 头部操作按钮区域 |

### 2.2 卡片

| 类名             | 用途         |
| ---------------- | ------------ |
| `card`           | 通用卡片容器 |
| `card-header`    | 卡片头部     |
| `card-body`      | 卡片内容区   |
| `section-title`  | 章节标题     |
| `section-header` | 章节头部     |

### 2.3 表单元素

| 类名            | 用途         |
| --------------- | ------------ |
| `setting-row`   | 设置项行     |
| `label`         | 标签文字     |
| `input-wrap`    | 输入框包装   |
| `input`         | 输入框       |
| `btn-primary`   | 主按钮       |
| `btn-secondary` | 次按钮       |
| `btn-danger`    | 危险操作按钮 |

### 2.4 状态显示

| 类名           | 用途       |
| -------------- | ---------- |
| `status-tag`   | 状态标签   |
| `status-badge` | 状态徽章   |
| `status-card`  | 状态卡片   |
| `status-icon`  | 状态图标   |
| `online`       | 在线状态   |
| `offline`      | 离线状态   |
| `running`      | 运行中状态 |

### 2.5 列表

| 类名         | 用途       |
| ------------ | ---------- |
| `list`       | 列表容器   |
| `list-item`  | 列表项     |
| `item-left`  | 列表项左侧 |
| `item-right` | 列表项右侧 |

### 2.6 空状态

| 类名          | 用途       |
| ------------- | ---------- |
| `empty-state` | 空状态容器 |
| `empty-icon`  | 空状态图标 |

---

## 3. 按钮规范

### 3.1 主按钮 (btn-primary)

```html
<button class="btn-primary" @click="handleSubmit">确认</button>
```

### 3.2 次按钮 (btn-secondary)

```html
<button class="btn-secondary" @click="handleCancel">取消</button>
```

### 3.3 危险按钮 (btn-danger)

```html
<button class="btn-danger" @click="handleDelete">删除</button>
```

### 3.4 禁用状态

```html
<button class="btn-primary" :disabled="isLoading">
  {{ isLoading ? '处理中...' : '提交' }}
</button>
```

---

## 4. 状态徽章

### 4.1 在线状态

```html
<span class="status-badge online">已连接</span>
```

### 4.2 离线状态

```html
<span class="status-badge offline">未连接</span>
```

---

## 5. 组件通信

### 5.1 Props 定义

使用 `defineProps` 显式声明：

```javascript
const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  data: {
    type: Array,
    default: () => [],
  },
});
```

### 5.2 事件定义

使用 `defineEmits` 显式声明：

```javascript
const emit = defineEmits(["update", "delete"]);

function handleClick() {
  emit("update", newValue);
}
```

---

## 6. 状态管理

### 6.1 使用 Pinia Store

```javascript
import { useStore } from "@/stores/store";

const store = useStore();
```

### 6.2 使用 Naive UI 消息

```javascript
import { useMessage } from "naive-ui";

const message = useMessage();

message.success("操作成功");
message.error("操作失败");
```

---

## 7. 样式规范

### 7.1 使用 CSS 变量

```css
:root {
  --primary-color: #2080f0;
  --danger-color: #d03050;
  --border-radius: 8px;
}
```

### 7.2 组件样式

```vue
<style scoped>
.card {
  background: var(--bg-color);
  border-radius: var(--border-radius);
}
</style>
```

---

## 8. 常见模式

### 8.1 加载状态

```vue
<div v-if="isLoading" class="loading-wrapper">
  <n-spin />
</div>
```

### 8.2 空状态

```vue
<div v-if="list.length === 0" class="empty-state">
  <span class="empty-icon">📭</span>
  <p>暂无数据</p>
</div>
```

### 8.3 确认对话框

```javascript
import { useDialog } from "naive-ui";

const dialog = useDialog();

function handleDelete() {
  dialog.warning({
    title: "确认删除",
    content: "此操作不可恢复",
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: () => {
      // 执行删除
    },
  });
}
```

---

## 文档更新日志

| 日期       | 变更     |
| ---------- | -------- |
| 2026-02-27 | 初始版本 |
