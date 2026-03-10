# Telegram Search Bot（Bot API 主线实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-05

本文档沉淀 Bot API 迁移完成后的稳定设计，用于替代仅存在于执行计划中的实现细节。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/tg-search-bot.js`

### 1.2 兼容入口

- `src/main/modules/tg-bot-api.js`（仅转发到 `tg-search-bot`）

### 1.3 前端控制页

- `src/renderer/src/components/TgSearchBot.vue`

---

## 2. 运行模式与命令

## 2.1 运行模式

支持两种模式（`tg.botMode`）：

- `polling`（默认）
- `webhook`

Webhook 模式要求配置 `tg.botWebhookUrl`。

## 2.2 Bot 指令

- `/start`
- `/help`
- `/search <编号>`（支持 `RJ/VJ/BJ`）
- `/info <编号>`（支持 `RJ/VJ/BJ`，返回作品详情）

权限控制：`tg.botAllowedUsers` / `tg.botAllowedChats`。

---

## 3. 搜索链路（实现态）

主函数：`handleSearchRequest(rawInput)`

执行顺序：

1. **历史索引命中**（`historyCache.history`）
2. **前置包内存索引命中**（`buildPresetIndexEntries`）
   - 命中后异步触发频道补充：`refreshChannelHitInBackground`
3. **频道检索**（`searchRJInTelegramChannel`，需 User API 凭据）
4. **未命中兜底提示**

> 对应消息：`暂未找到 RJxxxxxx，请在 one 站查看是否拥有，或在频道提出。`

## 3.1 作品详情链路（新增）

主函数：`handleInfoRequest(rawInput)`

执行顺序：

1. **作品缓存 JSON 命中**（`tg.infoCachePath`）
2. **实时抓取**（DLSite Ajax 基础信息）
3. **补充策略链**：DLSite 页面 -> DLWatcher -> ASMR.ONE
4. **抓取命中后自动回填缓存 JSON**（可由 `tg.infoCachePersistOnFetch` 关闭）

---

## 4. 索引体系

## 4.1 历史索引文件

- 路径：`tg.botHistoryPath`（默认 `getDataDir()/tg-bot-history.json`）
- 结构：`{ updatedAt, history: { [RJ]: { url, alternateUrls, source, messageId, updatedAt } } }`

## 4.2 前置包内存索引

- 输入：`tg.prePackagePath` + `tg.prePackageLink`
- 缓存策略：
  - TTL：5 秒
  - 结合 `mtime + fileSize` 失效
- 提取规则：
  - 每行提取 RJ
  - 解析行内 URL；无 URL 时可回退 `prePackageLink`

## 4.3 频道历史同步

函数：`syncChannelHistoryToIndex(options)`

- 扫描频道消息并更新 RJ->URL 索引。
- 合并前置包索引到同一历史文件。
- 返回详细统计：`scannedMessages/matchedMessages/newCount/updatedCount/preset*`。

## 4.4 TG 链接稳定策略

- 链接构造由 `tg-search-bot-core/link-builders.js` 统一负责。
- 若可解析到内部频道 ID，优先写入 `https://t.me/c/{channelId}/{messageId}`（对改名更稳）。
- 同步保留备用链接：
  - `tg://privatepost?channel={channelId}&post={messageId}`
  - `https://t.me/{username}/{messageId}`（若有 username）
  - `tg://resolve?domain={username}&post={messageId}`（若有 username）
- `/search` 响应默认仅展示主链接（直链模式）；备用链接仅用于内部保留。

## 4.5 作品信息缓存淘汰策略

- 仅 `tg-info-cache.json`（纯文本/详情链路）启用文件大小上限控制。
- 当写入后超出 `tg.infoCacheMaxFileSizeMB` 时，按记录更新时间从旧到新淘汰，直到不超限。
- `/search` 使用的 `tg-bot-history.json` 不参与该淘汰逻辑，保持原行为不变。

---

## 5. 启动阶段行为

函数：`triggerStartupHistorySync()`

启动后异步执行（不阻塞 UI）：

1. `tg.botAutoStartOnStartup !== false` 时自动拉起 Bot。
2. 预热前置包索引缓存。
3. 满足条件时自动执行频道历史同步：
   - `tg.botAutoSyncOnStartup !== false`
   - 已配置 `tg.searchChannelId`
   - 已配置 User API 凭据（`apiId/apiHash/session`）

---

## 6. IPC 通道

`setupTgSearchBotIPC()` 注册：

- `tg-bot-search`
- `tg-bot-info`
- `tg-bot-start`
- `tg-bot-stop`
- `tg-bot-status`
- `tg-bot-sync-history`
- `tg-info-cache-build`（BOT A：TXT -> JSON）
- `tg-info-cache-status`（BOT A：缓存状态）

---

## 7. 前端交互行为（TgSearchBot.vue）

- 启动/停止 Bot
- 获取状态（运行态、连接态、索引数量、索引文件路径、频道）
- 手动触发“获取频道消息并保存索引”
- 输入 RJ 执行搜索并展示主链接（直链模式）

## 7.1 作品信息缓存页（TgInfoCache.vue）

- 独立页面负责 `TXT -> 作品信息缓存 JSON` 构建（BOT A）。
- 展示缓存文件路径、记录数、文件大小与构建结果。
- 与 `TgSearchBot.vue` 页面解耦，避免将 `/search` 链路与信息缓存构建混在一起。

---

## 8. 配置字段（tg）

核心字段：

- `botToken`
- `botMode`
- `botWebhookUrl`
- `botWebhookPort`
- `searchChannelId`
- `prePackagePath`
- `prePackageLink`
- `botAllowedUsers`
- `botAllowedChats`
- `botSearchLimit`
- `botHistoryPath`
- `botAutoStartOnStartup`
- `botAutoSyncOnStartup`
- `infoCachePath`
- `infoRequestTimeoutMs`
- `infoCacheMaxConcurrency`
- `infoCacheMaxFileSizeMB`
- `infoCachePersistOnFetch`

兼容保留旧字段（用于 User API 检索与历史行为兼容）：

- `apiId`
- `apiHash`
- `session`
- `channel`
- `discussion`

---

## 9. 来源计划

- `docs/exec-plans/completed/2026-03-03-telegram-bot-api-migration.md`
