# RJ 重复检测与清理（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-17

本文档是 RJ 重复检测功能的**实现态设计文档**，用于沉淀已完成执行计划（V2/V3/Hotfix）的最终结果。

---

## 1. 目标与边界

### 1.1 功能目标

- 扫描频道内 RJ 相关消息，识别重复组。
- 保留每个 RJ 的最新配对，标记旧配对可删除。
- 支持批量删除与选中删除，并保障删除链路可观测。

### 1.2 扫描边界

- 扫描目标仅使用 `tg.channel`。
- 若配置了 `tg.discussion` 且与 `tg.channel` 不同，仅记录“忽略讨论组”日志，不参与扫描。

> 对应实现：`src/main/modules/tg-rj-duplicates.js`（`scanRjDuplicates`）

---

## 2. 模块与 IPC

### 2.1 主进程模块

- 文件：`src/main/modules/tg-rj-duplicates.js`
- IPC：
  - `tg-scan-rj-duplicates`
  - `tg-delete-duplicate-messages`

### 2.2 前端组件

- 文件：`src/renderer/src/components/RjDuplicateDetector.vue`
- 通过 `window.api` 调用扫描/删除接口，支持：
  - 一键删除重复
  - 删除选中
  - 清空选择

### 2.3 预加载桥接

- 文件：`src/preload/index.js`
- 暴露：
  - `tgScanRjDuplicates(options)`
  - `tgDeleteDuplicateMessages(messageIds)`

---

## 3. 扫描与关联算法

## 3.1 消息预处理

扫描阶段读取频道消息并提取：

- `messageId`
- `replyToMessageId`
- `senderId / fromId / peerId`
- `forwardFromPeerId / forwardChannelPostId / replyToTopId / isPost`
- `extractedRJ`

并执行发送者识别：

- `user`
- `channel`
- `bot`（支持 `dlsite-info` 特判）
- `unknown`

> 对应实现：`identifySender`, `detectResponderSenderIds`

## 3.2 原始消息定义

原始 RJ 消息（origin）定义为：

- `extractedRJ` 存在，且
- `senderInfo.type` 为 `user` 或 `channel`

> 对应实现：`isRjOriginMessage`

## 3.3 三轮关联

关联函数：`associateUserBotMessages(messages, config)`

1. **reply_to 直连**：优先找 `replyToMessageId` 指向原始消息的响应消息。
2. **RJ + 时间窗**：在 60 秒窗口内，按同 RJ 匹配响应消息。
3. **无回复兜底**：保留原始消息，`botMessage = null`。

关联结果字段：

- `associationMethod`: `reply_to | rj_match | no_reply`

## 3.4 重复分组与保留策略

- 以 `rjCode` 分组。
- 组内按 `userMessage.date` 倒序。
- 第一条标记 `keep`，其余标记 `delete`。

输出字段（行级）：

- `userMessage`
- `botMessage`
- `rjCode`
- `associationMethod`
- `isDuplicate`
- `keepStatus`
- `duplicateGroup`（仅重复组）

---

## 4. 删除链路（安全增强）

主函数：`deleteDuplicateMessages(messageIds)`

## 4.1 输入治理

- 删除前先归一化并去重消息 ID。
- 若无有效 ID，直接返回失败（不再静默 no-op）。

## 4.2 主删除与镜像删除

删除阶段会先按目标实体分组，并按每批最多 `100` 条消息执行批量删除；若某批次失败，再自动降级为逐条删除，以保留单条错误定位能力。

主删除默认先在配置实体（`tg.channel`）执行。

若检测到频道发送者映射（`forwardChannelPostId / replyToTopId / isPost`），会在主删除成功后继续按镜像频道分组批量删除：

- `mirror-channel:<chatId>`

## 4.3 回退删除

当主删除失败且存在频道映射时，会按发送者频道实体分组执行回退删除；同样遵循“先批量、失败后单条降级”的策略：

- `sender-channel:<chatId>`

## 4.4 结果语义

返回结构包含：

- `success`
- `partial`
- `deletedCount`
- `deletedMessageIds`
- `errors`（含 `code/error/attempts/meta`）
- `requestedCount`

前端按 `deletedMessageIds` 进行行移除，避免“失败也移除”。

---

## 5. 前端交互规则

## 5.1 列表展示

- 行排序规则：
  1. 重复项优先
  2. 待删除优先
  3. 时间倒序
- 表格展示用户/Bot 的 `messageId`、发送者姓名、发送者 ID、关联方式。

## 5.2 选择与删除

- `keep` 行禁用选择（防止误删最新配对）。
- 支持两种删除：
  - 删除选中
  - 一键删除重复
- 删除前统一使用 Promise 确认流，只有确认后才触发实际删除。

## 5.3 部分成功反馈

- `success=true`: 成功提示
- `partial=true`: 警告提示（成功数 + 失败数 + 首条失败原因）
- 全失败：错误提示

---

## 6. 关键日志与可观测性

### Renderer

- `[RJ重复检测] tg-scan-rj-duplicates 请求/响应`
- `[RJ重复检测] tg-delete-duplicate-messages 请求/响应`

### Main (`tg-rj-duplicates`)

- `IPC: tg-scan-rj-duplicates 请求/响应`
- `IPC: tg-delete-duplicate-messages 请求/响应`
- `[接口日志] 关联前统计/关联结果统计/删除失败详情`

---

## 7. 实现映射

| 能力           | 文件                                                  |
| -------------- | ----------------------------------------------------- |
| 扫描与关联     | `src/main/modules/tg-rj-duplicates.js`                |
| 删除链路与回退 | `src/main/modules/tg-rj-duplicates.js`                |
| UI 展示与交互  | `src/renderer/src/components/RjDuplicateDetector.vue` |
| IPC 桥接       | `src/preload/index.js`                                |

---

## 8. 来源计划

- `docs/exec-plans/completed/2026-03-03-rj-duplicate-detector-v2.md`
- `docs/exec-plans/completed/2026-03-03-rj-duplicate-detector-v3.md`
- `docs/exec-plans/completed/2026-03-03-rj-duplicate-detector-id-delete-hotfix.md`
