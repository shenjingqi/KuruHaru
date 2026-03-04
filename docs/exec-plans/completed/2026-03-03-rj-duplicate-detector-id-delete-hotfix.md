# RJ重复检测 ID映射与删除链路热修复

> 状态: ✅ 已完成  
> 完成时间: 2026-03-03

## 背景

- RJ重复检测结果页出现 `ID: undefined`
- 删除操作在部分场景下无法成功执行
- 需要补充接口日志便于后续排查

## 修复内容

- 统一消息 ID 读取规则：前后端均使用 `message.messageId ?? message.id`
- 删除前对消息 ID 做归一化（正整数校验 + 去重）
- 删除请求无有效 ID 时明确返回失败，避免静默 no-op
- 增加扫描/删除接口请求与响应日志（Renderer + Main 双侧）
- 修复发送者识别：不再把 `senderInfo` 缺失的消息直接当作用户，改为基于 `senderId/fromId/peer` 综合判断
- 扫描阶段不再提前丢弃“无RJ文本但可能是回复”的消息，提升 `reply_to` 关联成功率
- 前端结果与日志新增“发送者ID（人/机器人）”输出，便于核对关联是否正确
- 前端列表改为“重复项优先 + 待删除优先 + 时间倒序”，便于先处理真正重复数据
- 前端表格新增发送者姓名展示（用户消息与Bot回复均显示）
- 主进程扫描返回日志新增 `sampleUserSenderNames/sampleBotSenderNames` 便于快速核查关联正确性
- 删除链路新增“频道发送者回退删除”：当配置实体删除失败且消息来自频道发送者时，会尝试按发送者频道实体重试删除
- 删除结果支持 `partial`（部分成功）与 `deletedMessageIds`，前端将只移除实际删除成功的行，失败会展示首条错误原因
- 删除错误日志补全 `code/message/attempts/meta`，不再出现“失败但无错误原因”的空日志
- 修复关联回归：RJ原始消息支持 `user` 与 `channel` 两种发送者类型参与配对，避免 `userWithRJ=0` 时全量结果丢失
- 关联前统计日志新增 `channelWithRJ/originWithRJ/channel` 字段，便于快速判断是“发送者分类变化”还是“关联算法失效”
- 修复确认弹窗误删：`删除选中/一键删除` 改为 Promise 确认流，只有点“删除”才会执行，不再出现未确认自动删除
- 删除链路新增频道镜像删除：当消息来源为频道发送者且存在 `fwdFrom.channelPost/replyToTopId` 映射时，会同步删除频道侧对应消息

## 影响文件

- `src/renderer/src/components/RjDuplicateDetector.vue`
- `src/main/modules/tg-rj-duplicates.js`

## 验证结果

- `lsp_diagnostics`：改动文件 0 报错
- `npx eslint src/renderer/src/components/RjDuplicateDetector.vue src/main/modules/tg-rj-duplicates.js`：通过
- `npm run test`：20/20 通过
- `npm run build`：通过

## 日志关键字

- Renderer:
  - `[RJ重复检测] tg-scan-rj-duplicates 请求/响应`
  - `[RJ重复检测] tg-delete-duplicate-messages 请求/响应`
- Main (`tg-rj-duplicates`):
  - `IPC: tg-scan-rj-duplicates 请求/响应`
  - `IPC: tg-delete-duplicate-messages 请求/响应`
  - `[接口日志] tg-scan-rj-duplicates 返回 ...`
  - `[接口日志] tg-delete-duplicate-messages 请求 ...`
