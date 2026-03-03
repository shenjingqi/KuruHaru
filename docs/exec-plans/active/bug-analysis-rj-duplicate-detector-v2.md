# RJ重复检测功能 - Bug分析文档 V2

## ⚠️ 重大业务理解修正

经过重新沟通，发现**之前的业务理解完全错误**。以下是正确的业务逻辑：

---

## 1. 正确的业务场景

### 场景描述
在 Telegram 频道中，存在以下参与者：
- **普通用户** - 发送包含 RJ 号的消息（文件或文本）
- **DLsite Info Bot** - 根据用户消息自动回复 RJ 封面信息

### 消息关联关系
```
[用户消息] "RJ123456" (消息ID: 100)
    ↓ (触发)
[DLsite Info Bot回复] "RJ123456 封面..." (消息ID: 101)
```

### 重复场景
当同一用户或其他用户再次发送相同的 RJ 号时：
```
[用户消息1] "RJ123456" (消息ID: 100)
[Bot回复1] "RJ123456 封面..." (消息ID: 101)

[用户消息2] "RJ123456" (消息ID: 200)  ← 重复！
[Bot回复2] "RJ123456 封面..." (消息ID: 201)  ← 重复！
```

---

## 2. 正确的业务逻辑需求

### 需求 1: 识别发送者身份
必须区分以下类型的发送者：
1. **普通用户** - 发送 RJ 消息的主体
2. **DLsite Info Bot** - 根据上一条消息自动回复封面的 Bot

### 需求 2: 识别消息关联关系
必须识别消息之间的关联：
- 用户消息 → Bot 回复 的对应关系
- 基于发送时间和消息上下文识别关联

### 需求 3: 智能选择删除策略
对于重复的 RJ 号，需要：
1. **保留最新的用户消息**及其对应的 Bot 回复
2. **标记旧的用户消息**及其对应的 Bot 回复为待删除
3. **支持用户手动选择**要删除的消息（允许单独选择）

### 需求 4: 支持单独删除操作
用户界面需要支持：
- 批量删除所有标记的消息（一键删除）
- **单独选择删除特定消息**（打勾选择后删除）
- 支持撤销删除操作（如果可能）

---

## 3. 当前代码存在的问题

### 🛑 根本性错误

#### 错误 1: 未识别发送者身份
```javascript
// 当前实现: tg-rj-duplicates.js:154-161
const messagesWithRJ = messages
  .map(msg => ({
    rjCode: extractRJCodeFromMessage(msg),
    messageId: msg.id,
    date: new Date(msg.date * 1000),
    type: getMessageType(msg)  // 只区分 file/cover/other，没有识别发送者
  }))
```
**问题**: 没有识别消息的发送者是否为 DLsite Info Bot

#### 错误 2: 未识别消息关联关系
```javascript
// 当前实现: tg-rj-duplicates.js:180-196
duplicateGroups.forEach(group => {
  const sortedGroup = group.sort((a, b) => b.date - a.date);
  sortedGroup.forEach((msg, index) => {
    duplicates.push({
      ...msg,
      status: index === 0 ? 'keep' : 'delete'
    });
  });
});
```
**问题**: 只根据时间排序，没有考虑用户消息和Bot回复的关联关系

#### 错误 3: 删除界面不支持单独选择
```javascript
// 当前实现: RjDuplicateDetector.vue:138-144
const duplicatesToDelete = computed(() => {
  return scanResults.value.filter(msg => msg.status === 'delete')
})

// 删除时只能删除所有标记为 delete 的消息
async function handleDelete() {
  const duplicatesToDelete = scanResults.value.filter(msg => msg.status === 'delete')
  // ... 直接删除所有
}
```
**问题**: 用户无法单独选择要删除的消息，只能批量删除所有标记为删除的消息

---

## 4. 正确的实现方案

### 4.1 数据结构重设计

#### 消息数据结构
```javascript
// 单个消息的信息
interface MessageInfo {
  messageId: number;        // 消息ID
  rjCode: string;          // RJ号
  date: Date;              // 发送时间
  senderType: 'user' | 'bot' | 'other';  // 发送者类型
  senderId?: number;       // 发送者ID（用于识别特定Bot）
  senderName?: string;     // 发送者名称
  messageType: 'file' | 'text' | 'photo' | 'other';
  replyToMessageId?: number;  // 回复的消息ID（如果有）
}

// RJ组（包含重复的同个RJ号的所有消息）
interface RJGroup {
  rjCode: string;              // RJ号
  messages: MessageInfo[];     // 所有相关消息
  userMessages: MessageInfo[]; // 用户发送的消息
  botMessages: MessageInfo[];  // Bot回复的消息
  pairs: MessagePair[];         // 用户-Bot配对
}

// 用户消息和Bot回复的配对
interface MessagePair {
  userMessage: MessageInfo;    // 用户消息
  botMessage?: MessageInfo;     // Bot回复（可能没有）
  isDuplicate: boolean;        // 是否是重复的配对
  keepStatus: 'keep' | 'delete' | 'pending';  // 保留状态
}
```

### 4.2 核心算法重设计

#### 步骤 1: 识别Bot身份
```javascript
// DLsite Info Bot 的标识
const DLsiteInfoBot = {
  username: 'DLsite_Info_Bot',  // Bot用户名
  userId: 5870228865,            // Bot的User ID（需要实际获取）
};

function identifySender(msg) {
  const sender = msg.senderId || msg.fromId;
  const senderName = msg.sender?.username || msg.sender?.firstName;

  // 判断是否为 DLsite Info Bot
  if (sender === DLsiteInfoBot.userId ||
      senderName === DLsiteInfoBot.username) {
    return { type: 'bot', senderId: sender, name: senderName };
  }

  // 判断是否为普通用户
  if (msg.sender?.isUser) {
    return { type: 'user', senderId: sender, name: senderName };
  }

  return { type: 'other', senderId: sender, name: senderName };
}
```

#### 步骤 2: 关联用户消息和Bot回复
```javascript
function associateMessages(messages) {
  // 按时间排序
  const sortedMessages = messages.sort((a, b) => a.date - b.date);

  const pairs = [];
  const usedBotMessages = new Set();

  for (let i = 0; i < sortedMessages.length; i++) {
    const msg = sortedMessages[i];

    // 只处理用户消息
    if (msg.senderType !== 'user') continue;

    // 查找对应的Bot回复
    // 策略: 查找在用户消息之后、下一个用户消息之前的Bot消息
    let botReply = null;
    for (let j = i + 1; j < sortedMessages.length; j++) {
      const nextMsg = sortedMessages[j];

      // 如果遇到另一个用户消息，停止查找
      if (nextMsg.senderType === 'user') break;

      // 如果是Bot消息且未被使用，作为回复
      if (nextMsg.senderType === 'bot' && !usedBotMessages.has(nextMsg.messageId)) {
        botReply = nextMsg;
        usedBotMessages.add(nextMsg.messageId);
        break;
      }
    }

    pairs.push({
      userMessage: msg,
      botMessage: botReply,
      rjCode: msg.rjCode
    });
  }

  return pairs;
}
```

#### 步骤 3: 识别重复并标记保留/删除
```javascript
function analyzeDuplicates(pairs) {
  // 按 RJ 号分组
  const rjGroups = {};

  for (const pair of pairs) {
    const rjCode = pair.rjCode;
    if (!rjCode) continue;

    if (!rjGroups[rjCode]) {
      rjGroups[rjCode] = [];
    }
    rjGroups[rjCode].push(pair);
  }

  // 分析每个 RJ 号组
  const results = [];

  for (const [rjCode, group] of Object.entries(rjGroups)) {
    if (group.length === 1) {
      // 不重复，标记为保留
      results.push({
        ...group[0],
        isDuplicate: false,
        keepStatus: 'keep'
      });
    } else {
      // 有重复，按时间排序
      const sortedGroup = group.sort((a, b) =>
        b.userMessage.date - a.userMessage.date
      );

      // 最新的保留，其他的标记为删除
      sortedGroup.forEach((pair, index) => {
        results.push({
          ...pair,
          isDuplicate: true,
          keepStatus: index === 0 ? 'keep' : 'delete',
          duplicateGroup: rjCode
        });
      });
    }
  }

  return results;
}
```

### 4.3 UI界面重设计

#### 新的表格结构
```vue
<template>
  <n-data-table
    :columns="columns"
    :data="scanResults"
    :row-key="row => row.userMessage.messageId"
    @update:checked-row-keys="handleSelectionChange"
  />
</template>

<script setup>
const columns = [
  {
    type: 'selection',
    disabled: (row) => row.keepStatus === 'keep', // 保留的消息不能选择删除
  },
  {
    title: 'RJ号',
    key: 'rjCode',
    render(row) {
      return h('span', {
        style: {
          fontWeight: 'bold',
          color: row.isDuplicate ? '#ef4444' : '#10b981'
        }
      }, row.rjCode);
    }
  },
  {
    title: '用户消息',
    key: 'userMessage',
    render(row) {
      return h('div', null, [
        h('div', null, `ID: ${row.userMessage.messageId}`),
        h('div', { style: { fontSize: '12px', color: '#666' } },
          new Date(row.userMessage.date).toLocaleString()
        )
      ]);
    }
  },
  {
    title: 'Bot回复',
    key: 'botMessage',
    render(row) {
      if (!row.botMessage) {
        return h('span', { style: { color: '#999' } }, '无');
      }
      return h('div', null, [
        h('div', null, `ID: ${row.botMessage.messageId}`),
        h('div', { style: { fontSize: '12px', color: '#666' } },
          new Date(row.botMessage.date).toLocaleString()
        )
      ]);
    }
  },
  {
    title: '状态',
    key: 'keepStatus',
    render(row) {
      const statusMap = {
        keep: { text: '保留', color: '#10b981', bg: '#d1fae5' },
        delete: { text: '待删除', color: '#ef4444', bg: '#fee2e2' },
        pending: { text: '待定', color: '#f59e0b', bg: '#fef3c7' }
      };
      const status = statusMap[row.keepStatus];
      return h('span', {
        style: {
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          color: status.color,
          background: status.bg
        }
      }, status.text);
    }
  }
];

// 处理选择变化
const selectedRowKeys = ref([]);
const handleSelectionChange = (keys) => {
  selectedRowKeys.value = keys;
};

// 删除选中的消息
async function deleteSelectedMessages() {
  const selectedMessages = scanResults.value.filter(
    row => selectedRowKeys.value.includes(row.userMessage.messageId)
  );

  // 收集需要删除的消息ID（包括用户消息和对应的Bot回复）
  const messageIdsToDelete = [];
  for (const item of selectedMessages) {
    messageIdsToDelete.push(item.userMessage.messageId);
    if (item.botMessage) {
      messageIdsToDelete.push(item.botMessage.messageId);
    }
  }

  // 调用删除API
  await window.api.tgDeleteDuplicateMessages(messageIdsToDelete);
}
</script>
```

---

## 5. 修复后的完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        扫描流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 获取消息列表                                                 │
│     ↓                                                           │
│  2. 识别发送者身份                                               │
│     ├── 普通用户 (user)                                          │
│     ├── DLsite Info Bot (bot)                                    │
│     └── 其他 (other)                                             │
│     ↓                                                           │
│  3. 关联用户消息和Bot回复                                         │
│     ├── 用户消息: "RJ123456" (ID: 100)                           │
│     └── Bot回复:  "RJ123456 封面..." (ID: 101)                   │
│     ↓                                                           │
│  4. 按 RJ 号分组                                                 │
│     ├── RJ123456: [Pair1, Pair2, ...]                          │
│     └── RJ789012: [Pair1, ...]                                 │
│     ↓                                                           │
│  5. 识别重复并标记                                               │
│     ├── 最新配对: status = 'keep'                                │
│     └── 旧配对:   status = 'delete'                              │
│     ↓                                                           │
│  6. 显示结果表格                                                 │
│     ├── 显示用户消息 + Bot回复                                   │
│     ├── 标记保留/待删除状态                                     │
│     └── 支持勾选选择                                            │
│     ↓                                                           │
│  7. 用户选择删除                                                │
│     ├── 可一键删除所有标记为待删除的消息                          │
│     └── 可单独勾选特定消息后删除                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 需要修改的文件清单

| 文件 | 修改类型 | 修改内容 |
|------|----------|----------|
| `src/main/modules/tg-rj-duplicates.js` | 重写 | 1. 添加发送者识别逻辑<br>2. 添加消息关联逻辑<br>3. 重设计返回数据结构 |
| `src/renderer/src/components/RjDuplicateDetector.vue` | 重写 | 1. 新表格设计（显示配对）<br>2. 添加选择功能<br>3. 支持单独删除 |
| `src/preload/index.js` | 修改 | 确保 IPC 接口与新数据结构兼容 |

---

## 7. 关键代码示例

### 7.1 发送者识别

```javascript
function identifySender(msg, config) {
  const sender = msg.senderId || msg.fromId;
  const senderInfo = msg.sender || msg.from;
  const senderName = senderInfo?.username || senderInfo?.firstName || 'Unknown';

  // 检查是否是配置的 DLsite Info Bot
  const botConfig = config.tg?.dlsiteInfoBot;
  if (botConfig) {
    if (sender === botConfig.userId || senderName === botConfig.username) {
      return {
        type: 'bot',
        botType: 'dlsite-info',
        senderId: sender,
        name: senderName
      };
    }
  }

  // 通过启发式规则识别 DLsite Info Bot
  // DLsite Info Bot 的典型特征
  const botSignatures = [
    { username: 'DLsite_Info_Bot' },
    { username: 'dlsite_info_bot' },
    { namePattern: /DLsite.*Bot/i }
  ];

  for (const sig of botSignatures) {
    if (sig.username && senderName === sig.username) {
      return { type: 'bot', botType: 'dlsite-info', senderId: sender, name: senderName };
    }
    if (sig.namePattern && sig.namePattern.test(senderName)) {
      return { type: 'bot', botType: 'dlsite-info', senderId: sender, name: senderName };
    }
  }

  // 检查是否是普通用户
  if (senderInfo?.isUser || (!senderInfo?.isBot && !senderInfo?.bot)) {
    return { type: 'user', senderId: sender, name: senderName };
  }

  // 其他Bot
  if (senderInfo?.isBot || senderInfo?.bot) {
    return { type: 'bot', botType: 'other', senderId: sender, name: senderName };
  }

  return { type: 'unknown', senderId: sender, name: senderName };
}
```

### 7.2 消息关联算法

```javascript
function associateUserBotMessages(messages, config) {
  // 首先识别所有消息的发送者
  const identifiedMessages = messages.map(msg => ({
    ...msg,
    senderInfo: identifySender(msg, config),
    extractedRJ: extractRJCodeFromMessage(msg)
  }));

  // 按时间排序
  const sortedMessages = identifiedMessages.sort((a, b) => a.date - b.date);

  const pairs = [];
  const usedBotMessages = new Set();
  const usedUserMessages = new Set();

  // 第一轮：直接 reply_to 关联
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== 'user') continue;
    if (usedUserMessages.has(msg.id)) continue;

    // 查找这个用户消息的 Bot 回复
    // 策略1: 查找 reply_to 指向此消息的消息
    const botReply = sortedMessages.find(m =>
      m.senderInfo.type === 'bot' &&
      m.replyToMessageId === msg.id &&
      !usedBotMessages.has(m.id)
    );

    if (botReply) {
      pairs.push({
        userMessage: msg,
        botMessage: botReply,
        rjCode: msg.extractedRJ,
        associationMethod: 'reply_to'
      });
      usedUserMessages.add(msg.id);
      usedBotMessages.add(botReply.id);
    }
  }

  // 第二轮：时间邻近 + RJ号匹配关联
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== 'user') continue;
    if (usedUserMessages.has(msg.id)) continue;
    if (!msg.extractedRJ) continue;

    // 查找在用户消息之后的 Bot 消息
    const msgIndex = sortedMessages.indexOf(msg);
    const timeWindow = 60000; // 60秒时间窗口

    for (let i = msgIndex + 1; i < sortedMessages.length; i++) {
      const candidate = sortedMessages[i];

      // 时间超出窗口，停止查找
      if (candidate.date - msg.date > timeWindow) break;

      // 遇到另一个用户消息，停止查找
      if (candidate.senderInfo.type === 'user') break;

      // 检查是否是未使用的Bot消息
      if (candidate.senderInfo.type === 'bot' &&
          !usedBotMessages.has(candidate.id)) {

        // 检查RJ号是否匹配
        if (candidate.extractedRJ === msg.extractedRJ) {
          pairs.push({
            userMessage: msg,
            botMessage: candidate,
            rjCode: msg.extractedRJ,
            associationMethod: 'rj_match'
          });
          usedUserMessages.add(msg.id);
          usedBotMessages.add(candidate.id);
          break;
        }
      }
    }
  }

  // 第三轮：处理没有 Bot 回复的用户消息
  for (const msg of sortedMessages) {
    if (msg.senderInfo.type !== 'user') continue;
    if (usedUserMessages.has(msg.id)) continue;

    pairs.push({
      userMessage: msg,
      botMessage: null,
      rjCode: msg.extractedRJ,
      associationMethod: 'no_reply'
    });
    usedUserMessages.add(msg.id);
  }

  return pairs;
}
```

### 7.3 UI 选择删除功能

```vue
<template>
  <div class="delete-actions">
    <!-- 批量删除按钮 -->
    <button
      class="btn-danger"
      @click="handleBatchDelete"
      :disabled="duplicatesToDelete.length === 0"
    >
      一键删除所有标记消息 ({{ duplicatesToDelete.length }})
    </button>

    <!-- 单独删除按钮 -->
    <button
      class="btn-warning"
      @click="handleSelectedDelete"
      :disabled="selectedRows.length === 0"
    >
      删除选中消息 ({{ selectedRows.length }})
    </button>

    <!-- 清空选择 -->
    <button
      class="btn-secondary"
      @click="clearSelection"
      :disabled="selectedRows.length === 0"
    >
      清空选择
    </button>
  </div>

  <!-- 表格 -->
  <n-data-table
    :columns="columns"
    :data="scanResults"
    :row-key="row => row.userMessage.messageId"
    :checked-row-keys="selectedRows"
    @update:checked-row-keys="handleSelectionChange"
    :row-class-name="getRowClassName"
  />
</template>

<script setup>
import { ref, computed } from 'vue'

// 选中的行
const selectedRows = ref([])

// 计算标记为删除但未被选中的行
const duplicatesToDelete = computed(() => {
  return scanResults.value.filter(
    row => row.keepStatus === 'delete' &&
    !selectedRows.value.includes(row.userMessage.messageId)
  )
})

// 处理选择变化
function handleSelectionChange(keys) {
  selectedRows.value = keys
}

// 清空选择
function clearSelection() {
  selectedRows.value = []
}

// 批量删除所有标记为删除的消息
async function handleBatchDelete() {
  const messageIds = duplicatesToDelete.value.map(row => [
    row.userMessage.messageId,
    row.botMessage?.messageId
  ].filter(Boolean)).flat()

  await deleteMessages(messageIds)
}

// 删除选中的消息
async function handleSelectedDelete() {
  const selectedData = scanResults.value.filter(
    row => selectedRows.value.includes(row.userMessage.messageId)
  )

  const messageIds = selectedData.map(row => [
    row.userMessage.messageId,
    row.botMessage?.messageId
  ].filter(Boolean)).flat()

  await deleteMessages(messageIds)
}

// 获取行样式类
function getRowClassName(row) {
  if (row.keepStatus === 'keep') return 'row-keep'
  if (row.keepStatus === 'delete') return 'row-delete'
  return ''
}
</script>

<style scoped>
.row-keep {
  background-color: rgba(16, 185, 129, 0.05);
}

.row-delete {
  background-color: rgba(239, 68, 68, 0.05);
}

.delete-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn-warning {
  padding: 10px 24px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary {
  padding: 10px 24px;
  background: #e5e7eb;
  color: #374151;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
</style>
</content>
</argument>
