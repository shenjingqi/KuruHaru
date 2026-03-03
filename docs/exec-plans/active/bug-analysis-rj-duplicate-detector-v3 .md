RJ 重复检测与 Bot 关联功能技术方案 (V3)
1. 业务逻辑与场景定义
在 Telegram 频道中，存在“用户发送 RJ 号”与“Bot 自动回复封面”的配对关系。重复检测的目标是识别并清理旧的重复配对，同时保留最新的信息。

1.1 核心挑战
身份识别：频道消息由于 Peer 类型的多样性，发送者容易被误判为“未知”。

松散关联：Bot 回复可能没有 reply_to 字段，需通过时间轴和内容特征强行关联。

批量风险：直接删除大量消息会导致 Telegram 账号被限流或封禁。

2. 后端核心逻辑实现 (tg-rj-duplicates.js)
该部分负责从原始消息流中提取、识别并分组数据。

2.1 发送者识别函数
通过全路径探测，解决“未知发送者”问题。

JavaScript
/**
 * 识别发送者身份：支持频道、用户及特定 Bot
 */
function identifySender(msg, config) {
  // 1. 提取原始 ID (兼容多种 API 框架)
  const rawId = msg.senderId || msg.fromId || msg.peerId?.userId || msg.peerId?.channelId;
  const senderId = rawId ? String(rawId) : null;

  // 2. 获取元数据
  const senderObj = msg.sender || msg.from || msg._sender;
  const username = (senderObj?.username || "").toLowerCase();
  const displayName = senderObj?.firstName || senderObj?.title || username;

  // 3. 匹配 DLsite Info Bot
  const botConfig = config?.tg?.dlsiteInfoBot || {};
  const isTargetBot = 
    senderId === String(botConfig.userId) || 
    username === "dlsite_info_bot" ||
    (senderObj?.bot && username.includes("dlsite"));

  if (isTargetBot) {
    return { type: 'bot', senderId, name: 'DLsite Info Bot' };
  }

  // 4. 返回识别结果，若无名称则回退至 ID
  return { 
    type: 'user', 
    senderId, 
    name: displayName || (senderId ? `ID:${senderId}` : "未知发送者") 
  };
}
2.2 消息配对与去重算法
将散乱的消息流转化为“Pair（配对）”结构。

JavaScript
/**
 * 执行扫描与重复分析
 */
async function analyzeRjMessages(messages, config) {
  // 预处理：提取 RJ 号并识别身份
  const enriched = messages.map(m => ({
    id: m.id,
    date: m.date,
    senderInfo: identifySender(m, config),
    rjCode: (m.message || "").match(/RJ\d{6,8}/i)?.[0]?.toUpperCase() || null
  }));

  // 顺序排列，由旧到新
  const sorted = enriched.sort((a, b) => a.date - b.date);
  const pairs = [];
  const usedBotIds = new Set();

  // 关联逻辑：寻找用户消息对应的 Bot 回复
  for (const uMsg of sorted) {
    if (uMsg.senderInfo.type !== 'user') continue;

    const botReply = sorted.find(b => {
      if (b.senderInfo.type !== 'bot' || usedBotIds.has(b.id)) return false;
      // 匹配条件：显式回复 OR (相同 RJ 号且在 60s 内回复)
      const isReply = String(b.replyToMessageId) === String(uMsg.id);
      const isTimeMatch = b.rjCode === uMsg.rjCode && (b.date - uMsg.date < 60);
      return isReply || isTimeMatch;
    });

    if (botReply) usedBotIds.add(botReply.id);

    pairs.push({
      pairId: `p-${uMsg.id}`,
      rjCode: uMsg.rjCode,
      userMessage: uMsg,
      botMessage: botReply || null
    });
  }

  // 重复标记逻辑：按 RJ 分组，保留最新
  const rjGroups = {};
  pairs.forEach(p => {
    if (!p.rjCode) return;
    rjGroups[p.rjCode] = rjGroups[p.rjCode] || [];
    rjGroups[p.rjCode].push(p);
  });

  return Object.values(rjGroups).flatMap(group => {
    group.sort((a, b) => b.userMessage.date - a.userMessage.date); // 时间倒序
    return group.map((p, idx) => ({
      ...p,
      keepStatus: idx === 0 ? 'keep' : 'delete', // 索引 0 为最新
      isDuplicate: group.length > 1
    }));
  });
}
3. 前端交互实现 (RjDuplicateDetector.vue)
提供配对化的表格显示，支持手动勾选与一键清理。

代码段
<template>
  <div class="p-4">
    <div class="mb-4 flex gap-2">
      <n-button type="error" @click="handleDelete" :disabled="!selectedKeys.length">
        删除选中 ({{ selectedKeys.length }})
      </n-button>
      <n-button @click="autoSelect">全选重复项</n-button>
    </div>

    <n-data-table
      :columns="columns"
      :data="scanResults"
      :row-key="row => row.pairId"
      v-model:checked-row-keys="selectedKeys"
    />
  </div>
</template>

<script setup>
import { ref, h } from 'vue';
import { NTag, NDataTable } from 'naive-ui';

const selectedKeys = ref([]);
const scanResults = ref([]);

const columns = [
  { type: 'selection', disabled: (row) => row.keepStatus === 'keep' }, // 保护最新消息
  { title: 'RJ号', key: 'rjCode' },
  { 
    title: '发送人', 
    render: (row) => h(NTag, { type: 'info' }, () => row.userMessage.senderInfo.name) 
  },
  { 
    title: 'Bot回复', 
    render: (row) => row.botMessage ? '✅ 已关联' : '❌ 未发现' 
  },
  { 
    title: '处理建议', 
    render: (row) => row.keepStatus === 'keep' 
      ? h(NTag, { type: 'success' }, () => '保留最新') 
      : h(NTag, { type: 'error' }, () => '重复待删')
  }
];

// 自动勾选逻辑
const autoSelect = () => {
  selectedKeys.value = scanResults.value
    .filter(r => r.keepStatus === 'delete')
    .map(r => r.pairId);
};

// 执行删除
const handleDelete = async () => {
  const selectedData = scanResults.value.filter(r => selectedKeys.value.includes(r.pairId));
  const ids = selectedData.flatMap(p => [p.userMessage.id, p.botMessage?.id].filter(Boolean));
  
  await window.api.tgDeleteMessages(ids); // 调用后端带延迟的删除接口
};
</script>
4. 维护与调试说明
数据流监控：若再次出现“未知发送者”，请在 identifySender 中打印 msg 的完整 JSON 结构，重点查看 peerId 字段。

关联调优：目前的关联时间窗为 60 秒，若 Bot 响应极慢，可适度调大此阈值。

安全删除：后端 tgDeleteMessages 必须实现分批处理（建议每 10 条间隔 800ms），否则会被 Telegram 暂时禁言。

