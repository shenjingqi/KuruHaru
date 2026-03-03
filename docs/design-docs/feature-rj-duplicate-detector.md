# RJ重复检测与清理功能技术方案

## 1. 功能概述

该功能实现一个页面，用于扫描Telegram频道内出现重复的RJ号以及对应的bot发出的RJ重复封面消息。用户可以设置扫描消息条数，系统会找到重复的RJ号，保留最新的消息，删除旧的RJ号以及对应的bot发出的RJ重复封面技能消息。

## 2. 架构设计

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer (Vue 3)                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ RJDuplicateDetector.vue - 主页面组件                     │ │
│  │ ├── 扫描参数配置（消息条数、频道选择）                   │ │
│  │ ├── 扫描进度显示                                         │ │
│  │ ├── 重复结果展示（表格形式，显示RJ号、消息ID、时间）      │ │
│  │ ├── 操作按钮（扫描、删除、保留最新）                     │ │
│  │ └── 结果统计（总扫描数、重复数、删除数）                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                    window.api.tgScanRjDuplicates                 │
│                     (IPC Bridge)                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Preload (Bridge)                             │
│              ipcRenderer.invoke() / send()                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Main Process (Node.js)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                IPC Handlers - tg-scan-rj-duplicates         ││
│  └────────────────────────────┬────────────────────────────────┘│
│                               │                                  │
│  ┌────────────┐  ┌───────────┴───────────┐  ┌──────────────┐ │
│  │ Modules    │  │  tg-rj-duplicates.js  │  │    Config    │ │
│  │            │  │  - 核心业务逻辑       │  │              │ │
│  │            │  │  - 消息扫描与分析     │  │              │ │
│  │            │  │  - 重复检测算法       │  │              │ │
│  │            │  │  - 消息删除功能       │  │              │ │
│  └────────────┘  └────────────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 功能模块设计

### 3.1 主进程模块 (src/main/modules/tg-rj-duplicates.js)

#### 3.1.1 核心功能函数

```javascript
// 1. 初始化函数
export function setupRjDuplicatesIPC() {
  ipcMain.handle('tg-scan-rj-duplicates', scanRjDuplicates);
  ipcMain.handle('tg-delete-duplicate-messages', deleteDuplicateMessages);
}

// 2. 扫描重复RJ号函数
async function scanRjDuplicates(event, options) {
  // 参数：{ limit: 扫描条数, channelId: 频道ID }
  // 返回：{ success, duplicates, statistics }
}

// 3. 删除重复消息函数
async function deleteDuplicateMessages(event, messageIds) {
  // 参数：[messageId1, messageId2, ...]
  // 返回：{ success, deletedCount, errors }
}
```

#### 3.1.2 辅助工具函数

```javascript
// 1. 从消息中提取RJ号
function extractRJCodeFromMessage(msg) {
  // 使用现有的 extractRJCode 函数
}

// 2. 检测重复RJ号
function findDuplicateRJs(messages) {
  // 按RJ号分组，找到重复的消息
}

// 3. 选择最新的消息
function getLatestMessage(group) {
  // 返回该RJ号的最新消息
}

// 4. 标记需要删除的旧消息
function markMessagesForDeletion(groups) {
  // 保留最新的，标记其他为删除
}
```

### 3.2 预加载脚本 (src/preload/index.js)

```javascript
const api = {
  // RJ重复检测
  tgScanRjDuplicates: (options) =>
    ipcRenderer.invoke('tg-scan-rj-duplicates', options),
  tgDeleteDuplicateMessages: (messageIds) =>
    ipcRenderer.invoke('tg-delete-duplicate-messages', messageIds),
};
```

### 3.3 Vue组件 (src/renderer/src/components/RjDuplicateDetector.vue)

#### 3.3.1 页面结构

```vue
<template>
  <div class="page-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2 class="page-title">RJ重复检测与清理</h2>
    </div>

    <!-- 配置区域 -->
    <div class="config-section card">
      <div class="card-header">
        <h3 class="section-title">扫描配置</h3>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <label class="label">扫描消息条数</label>
          <div class="input-wrap">
            <n-input-number
              v-model:value="scanLimit"
              :min="100"
              :max="10000"
              :step="100"
            />
          </div>
        </div>

        <div class="action-bar">
          <button
            class="btn-primary"
            @click="handleScan"
            :disabled="isScanning"
          >
            {{ isScanning ? '扫描中...' : '开始扫描' }}
          </button>

          <button
            class="btn-danger"
            @click="handleDelete"
            :disabled="!canDelete || isDeleting"
          >
            {{ isDeleting ? '删除中...' : `删除重复消息 (${duplicatesToDelete.length})` }}
          </button>
        </div>
      </div>
    </div>

    <!-- 扫描结果 -->
    <div v-if="scanResults.length > 0" class="results-section card">
      <div class="card-header">
        <h3 class="section-title">
          扫描结果
          <span class="status-tag" :class="getResultStatusClass()">
            {{ statistics.totalScanned }} 条消息，{{ statistics.duplicateRJs }} 个重复RJ号
          </span>
        </h3>
      </div>

      <div class="card-body">
        <n-data-table
          :columns="columns"
          :data="scanResults"
          :pagination="pagination"
          :scroll-x="800"
        />
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="scanResults.length === 0 && !isScanning && hasScanned" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>暂无重复的RJ号</p>
    </div>
  </div>
</template>
```

#### 3.3.2 主要功能逻辑

```javascript
// 状态管理
const scanLimit = ref(1000);
const isScanning = ref(false);
const isDeleting = ref(false);
const scanResults = ref([]);
const hasScanned = ref(false);
const statistics = ref({
  totalScanned: 0,
  duplicateRJs: 0,
  messagesToDelete: 0
});

// 表格列配置
const columns = [
  { title: 'RJ号', key: 'rjCode', width: 120 },
  { title: '消息ID', key: 'messageId', width: 100 },
  { title: '发送时间', key: 'date', width: 180 },
  { title: '消息类型', key: 'type', width: 120 },
  { title: '状态', key: 'status', width: 100 }
];

// 扫描操作
async function handleScan() {
  isScanning.value = true;
  hasScanned.value = true;

  try {
    const result = await window.api.tgScanRjDuplicates({
      limit: scanLimit.value
    });

    if (result.success) {
      scanResults.value = result.duplicates;
      statistics.value = result.statistics;
      message.success(`扫描完成，找到 ${result.statistics.duplicateRJs} 个重复RJ号`);
    } else {
      message.error(`扫描失败: ${result.error}`);
    }
  } catch (error) {
    message.error(`扫描失败: ${error.message}`);
  } finally {
    isScanning.value = false;
  }
}

// 删除操作
async function handleDelete() {
  const duplicatesToDelete = scanResults.value.filter(msg => msg.status === 'delete');
  if (duplicatesToDelete.length === 0) {
    message.warning('没有需要删除的重复消息');
    return;
  }

  const confirmed = await dialog.warning({
    title: '确认删除',
    content: `确定要删除选中的 ${duplicatesToDelete.length} 条重复消息吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消'
  });

  if (confirmed) {
    isDeleting.value = true;
    try {
      const messageIds = duplicatesToDelete.map(msg => msg.messageId);
      const result = await window.api.tgDeleteDuplicateMessages(messageIds);

      if (result.success) {
        message.success(`成功删除 ${result.deletedCount} 条消息`);
        // 重新扫描以更新结果
        await handleScan();
      } else {
        message.error(`删除失败: ${result.error}`);
      }
    } catch (error) {
      message.error(`删除失败: ${error.message}`);
    } finally {
      isDeleting.value = false;
    }
  }
}
```

## 4. 数据库与数据结构

### 4.1 扫描结果数据结构

```javascript
{
  rjCode: 'RJ123456',
  messageId: 123456789,
  date: '2024-02-27T10:30:00Z',
  type: 'file' | 'cover',
  status: 'keep' | 'delete'  // keep表示保留最新，delete表示删除
}
```

### 4.2 统计信息结构

```javascript
{
  totalScanned: 1000,       // 总扫描消息数
  duplicateRJs: 15,        // 重复RJ号数量
  messagesToDelete: 25,    // 待删除消息数
  deletedCount: 0         // 已删除消息数
}
```

## 5. 核心算法

### 5.1 重复检测算法

```javascript
function findDuplicateRJs(messages) {
  // 1. 从消息中提取RJ号
  const messagesWithRJ = messages
    .map(msg => ({
      rjCode: extractRJCodeFromMessage(msg),
      messageId: msg.id,
      date: new Date(msg.date * 1000),
      type: getMessageType(msg)
    }))
    .filter(msg => msg.rjCode);

  // 2. 按RJ号分组
  const rjGroups = {};
  messagesWithRJ.forEach(msg => {
    if (!rjGroups[msg.rjCode]) {
      rjGroups[msg.rjCode] = [];
    }
    rjGroups[msg.rjCode].push(msg);
  });

  // 3. 找到重复的RJ号组（包含多条消息的组）
  const duplicateGroups = Object.values(rjGroups).filter(group => group.length > 1);

  // 4. 为每组确定保留和删除的消息
  const duplicates = [];
  duplicateGroups.forEach(group => {
    // 按时间降序排序（最新的在前）
    const sortedGroup = group.sort((a, b) => b.date - a.date);

    // 第一条为保留，其余为删除
    sortedGroup.forEach((msg, index) => {
      duplicates.push({
        ...msg,
        status: index === 0 ? 'keep' : 'delete'
      });
    });
  });

  return duplicates;
}
```

### 5.2 消息类型识别

```javascript
function getMessageType(msg) {
  // 判断消息是否为文件消息（包含文档）
  if (msg.document) {
    return 'file';
  }

  // 判断消息是否为封面技能消息（包含特定文本或图片）
  if (msg.text && (
    msg.text.includes('重复封面') ||
    msg.text.includes('RJ封面') ||
    msg.text.includes('封面技能')
  )) {
    return 'cover';
  }

  return 'other';
}
```

## 6. 界面设计

### 6.1 页面布局

| 区域 | 功能描述 | 组件 |
|------|----------|------|
| 页面头部 | 显示功能标题和操作按钮 | 标题栏、刷新按钮 |
| 配置区域 | 扫描参数配置 | 输入框、滑块、按钮 |
| 扫描进度 | 实时显示扫描进度 | 进度条、文字提示 |
| 结果展示 | 显示重复的RJ号信息 | 表格、筛选器 |
| 操作区域 | 删除和保留最新消息操作 | 按钮、确认对话框 |
| 统计区域 | 显示扫描统计信息 | 数字卡片、图表 |

### 6.2 样式设计

遵循项目UI风格指南：
- 使用蓝色主题配色（#8b5cf6）
- 卡片式布局，白色背景
- 响应式设计，支持不同屏幕尺寸
- 状态标签使用不同颜色（绿色：保留，红色：删除）
- 按钮使用主按钮、次按钮、危险按钮样式

## 7. 测试策略

### 7.1 功能测试

1. 扫描功能测试
2. 重复检测准确性测试
3. 删除操作测试
4. 边界情况测试（无重复、大量消息、网络异常）

### 7.2 性能测试

1. 扫描速度测试（不同消息条数）
2. 内存使用测试
3. 响应式测试

### 7.3 安全测试

1. 消息删除权限验证
2. 错误处理测试
3. 数据完整性验证

## 8. 部署与发布

### 8.1 依赖更新

需要确保以下依赖项已安装：
- `telegram` - GramJS 库
- `naive-ui` - UI 组件库
- `vue` - 框架

### 8.2 构建命令

```bash
# 开发模式
npm run dev

# 生产构建
npm run build:win
```

### 8.3 发布说明

- 包含新功能的完整版本
- 说明新增功能的使用方法
- 列出任何已知限制或待改进的地方

## 9. 风险评估

| 风险类型 | 风险描述 | 影响程度 | 缓解措施 |
|----------|----------|----------|----------|
| 数据丢失风险 | 删除错误的消息 | 高 | 增加确认步骤和预览功能 |
| 性能风险 | 大量消息扫描导致应用卡顿 | 中 | 实现分页加载和进度反馈 |
| 网络风险 | Telegram API 限制 | 中 | 实现重试机制和错误处理 |
| 兼容性风险 | 不同频道消息格式差异 | 低 | 增强消息解析的鲁棒性 |
```