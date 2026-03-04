# 设计决策日志

> 状态: ✅ 活跃  
> 最后更新: 2026-03-04

本文档用于沉淀“已完成执行计划”里的长期有效设计决策，避免知识只停留在 `exec-plans`。

---

## 决策清单（按时间）

## 2026-02-26：向前依赖架构（已实现）

**背景**

- 代码跨层依赖不清晰，修改成本高。

**决策**

- 采用分层依赖方向：

```text
Types → Config → Repo → DataAccess → Service → Runtime → UI
```

**影响**

- 明确了架构治理基线，后续文档与 ESLint 规则围绕该方向演进。

---

## 2026-02-26：HTTP 客户端统一入口（已实现）

**背景**

- 业务模块存在直接使用 axios 的路径，代理与错误处理难统一。

**决策**

- 网络请求统一通过 `src/main/modules/httpClient.js`。
- 约束层面禁止直接导入 axios（ESLint 限制规则）。

**影响**

- 代理、超时、错误处理策略可集中治理。

---

## 2026-02-27：T0 质量基线（已实现）

> 来源：`exec-plans/completed/2026-02-27-harness-t0-improvements.md`

**背景**

- 需要先建立最低可验证质量基线（测试 + 统一错误链路 + 网络拦截）。

**决策**

1. 引入 Vitest 作为单测框架（与 Vite/Electron 工程兼容）。
2. `errorHandler` 与 `retry` 进入可回归测试范围。
3. `httpClient` 使用请求/响应拦截器，响应阶段统一接入 `normalizeError`。

**影响**

- 测试基线固定为 20 tests（`errorHandler` 14 + `retry` 6）。
- 错误处理从“分散处理”转为“标准化输出”。

---

## 2026-03-03：Telegram Search Bot 迁移到 Bot API 主线（已实现）

> 来源：`exec-plans/completed/2026-03-03-telegram-bot-api-migration.md`

**背景**

- 需要以 Bot Token 为核心构建可运营的搜索 Bot，同时保留频道历史能力。

**决策**

1. 主实现统一到 `src/main/modules/tg-search-bot.js`。  
   `src/main/modules/tg-bot-api.js` 仅保留兼容转发入口。
2. 搜索链路采用分层命中：
   - 历史索引（本地）
   - 前置包内存索引（极速）
   - 频道检索（User API，可选）
3. 索引能力支持：
   - 手动同步 `tg-bot-sync-history`
   - 启动自动同步 `triggerStartupHistorySync`
   - `channel_post` 在线增量更新
4. 运行模式支持 Polling 与 Webhook 双模式。

**影响**

- Bot 能稳定提供 `/start`、`/help`、`/search`。
- 配置面扩展（`tg.botToken`、`tg.searchChannelId`、白名单、前置包路径、索引文件路径等）。

---

## 2026-03-03：RJ 重复检测改为“配对识别 + 安全删除链路”（已实现）

> 来源：
>
> - `exec-plans/completed/2026-03-03-rj-duplicate-detector-v3.md`
> - `exec-plans/completed/2026-03-03-rj-duplicate-detector-id-delete-hotfix.md`

**背景**

- 旧方案仅按 RJ 文本去重，未可靠处理“原始消息 + Bot 回复”关系。
- 删除链路在频道转发/镜像场景中存在失败与误删风险。

**决策**

1. 扫描范围严格限定到 `tg.channel`（不再回退 `tg.discussion`）。
2. 原始消息定义调整为：`senderType in {user, channel}` 且可提取 RJ。
3. 关联算法采用三轮：
   - `reply_to` 直接关联
   - 时间窗 + RJ 匹配（60s）
   - 无回复兜底
4. 删除链路强化：
   - 输入 ID 归一化（正整数 + 去重）
   - 主实体删除 + 频道镜像删除
   - 失败时按频道发送者回退删除
   - 返回 `partial` / `deletedMessageIds` / `errors[*].attempts`

**影响**

- 前端可按“实际删除成功 ID”移除行，避免错误移除。
- 运维可从日志快速定位删除失败原因（含 code/message/attempts/meta）。

---

## 2026-03-03：业务理解纠偏机制（已吸收）

> 来源：`exec-plans/completed/2026-03-03-rj-duplicate-detector-v2.md`

**背景**

- V2 阶段暴露出“对 Telegram 发送者类型与消息关联关系理解偏差”。

**决策**

- 在 RJ 关联链路中保留“可观测统计 + 样本日志”，用于快速发现分类偏差：
  - `userWithRJ / channelWithRJ / originWithRJ`
  - `reply无RJ消息发送者Top` 等
- 前后端统一消息 ID 读取规则：`message.messageId ?? message.id`。

**影响**

- 后续排障不再依赖猜测，能够基于日志快速判断“数据问题 vs 算法问题”。

---

## 文档更新规则

1. `exec-plans/completed/*` 的结果若形成长期规则，必须回写到本日志或对应 feature 设计文档。
2. 只记录“稳定决策”，临时调试步骤不写入本文件。
3. 记录时必须附来源计划文件，保证可追溯。
