# Telegram Search Bot（Bot API 主线实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-08-07

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
- `/search <编号>`（支持 `RJ/VJ/BJ`；纯数字支持 6-8 位，7 位自动补 0）
- `/info <编号>`（支持 `RJ/VJ/BJ`；纯数字支持 6-8 位，7 位自动补 0；返回作品详情）
- `/status`（返回自动翻译队列的简短运行状态与各阶段数量；非翻译时显示缓存队列数量，等待时显示下次扫描时间，翻译时显示当前 RJ 编号与后续待翻译数量）
- `/zip`（只返回最近一次每日整合包的 Telegram 消息链接；不会触发下载、压缩或上传）
- 群聊额外支持直接提及 Bot 搜索：`@BotName RJ123456`（等价于 `/search RJ123456`）

权限控制：`tg.botAllowedUsers` / `tg.botAllowedChats`。

### 2.3 每日 ZIP 整合包

1. Bot 在每天 **18:00（Asia/Shanghai）** 先扫描配置的讨论群 `tg.discussion`，再预下载缺失 ZIP 到本地缓存；每天 **19:00** 再次扫描讨论群、生成并发送整合包。
2. 整包内容是完整最近上传列表；手动“强制生成并上传整合包”不会影响当天的 19:00 固定发送。只有当天 19:00 自动发送已成功时，才跳过后续重复的自动发送。
3. 仅选择文件名以 `RJ`/`BJ`/`VJ` 编号开头且扩展名为 `.zip` 的文件；同一编号只保留最新消息。
4. 因此，若某天 19:00 后才上传，下一天即使没有上传，只要这些文件尚未被自动打包，仍会在 19:00 生成一次；即使白天已手动生成，当天 19:00 也会固定发送一次。
5. 服务依次从 Telegram 下载去重后的文件，重新压缩并回传至配置的讨论群 `tg.discussion`。
6. 整合包发送失败时会重新解析讨论群并进行 5 次递增延迟重试（5、10、20、40 分钟）；只有成功发送后才删除本地总包。
7. 产物命名为 `kuruharu-MMDD.zip`，并保存其 Telegram 消息链接；`/zip` 只读取并返回已保存链接，不执行生成操作。
8. 已下载的源 ZIP 使用原始 `RJ...zip` 文件名持久缓存；缓存索引内部记录频道与 Telegram 消息 ID，后续打包复用缓存，只下载新增、更新或缓存缺失的文件。
9. 缺失文件使用 4 路受控并发下载，下载完成后仍按最近上传顺序写入整合包。
10. 临时归档目录在上传完成后自动清理；可通过 `tg.dailyZipOutputDir` 指定缓存与临时目录的父路径。
11. 桌面端“Telegram 搜索 Bot”控制页提供“强制生成并上传整合包”按钮，可立即绕过定时与快照检查，重新生成整合包并显示链接。
12. 若 Bot 在当天 19:00 后才启动，且当天尚未自动发送成功，会立即补发一次；若已自动成功则不会重复发送。
13. 讨论组增量扫描超过 60 秒会记录超时、重置用于最近上传扫描的 Telegram 客户端，并使用本地最近上传缓存继续预下载或打包，避免定时任务无限挂起。

---

## 3. 搜索链路（实现态）

主函数：`handleSearchRequest(rawInput)`

执行顺序：

1. **历史上传索引命中**（`historyCache.history`）
2. **前置包内存索引命中**（`buildPresetIndexEntries`）
3. **本地未命中时检查 One 站字幕版本**（仅 Bot `/search` 命令）
   - 调用 `https://api.asmr-200.com/api/search/{RJ}` 校验作品存在
   - 存在时并行补充查询 `other_language_editions_in_db`
   - 若当前作品或其多语言版本存在字幕，则优先返回对应字幕版 / 汉化 RJ 的作品页地址，不加入待翻译队列
4. **确认无字幕版本时转 One 站待翻译队列**
   - Bot 启动后立即刷新待翻译队列快照，并按 `tg.translationQueueCacheRefreshMs`（默认 5 分钟）定时刷新到本地 `tg-translation-queue-cache.json`
   - `/search` 在提交入队 API 前优先命中该本地快照；命中时返回“已在待翻译队列，无需重复入队”，不会再次提交
   - 调用 `https://api.asmr-200.com/api/playlist/add-works-to-playlist` 入队
   - 入队成功后立即返回 tag 摘要与队列链接；playlist 是否可见改为后台补验，不再同步扫描完整队列阻塞 `/search`
   - `/search` 命令增加超时兜底，避免消息长期停留在 `Searching ...`
   - 若正文已包含同一队列链接，Bot 不再重复追加相同 URL
   - 入队前会先检查 One 站 tag；若命中以下黑名单 tag，则对外仍返回“已转入待翻译队列”的成功提示，但不会实际调用入队 API：`BL/男同性恋`、`男性胸部`、`扶她`、`男子怀孕/出产`、`男無`、`人妖/双性人`、`GAY/男同`、`女性向`、`大男子主义`、`蕾丝/女同`、`性转换(TS)`、`男同性恋`、`百合`、`伪娘`、`同性爱者`
   - `/search` 的拦截判断不仅看当前已生效 tag，也会额外检查低愿力 tag 与 tag 历史别名，避免只在 `-tag` 命中、却在 `-tagw` / 历史别名场景漏拦截
   - 命令执行超过 45 秒，或 One/入队接口发生网络类临时错误时，会把群聊、话题、原消息、作品编号和尝试次数持久化到本地错误池 `tg-search-retry-queue.json`；等待 `tg.searchRetryDelayMs`（默认 60 秒）后自动重试。默认 `tg.searchRetryMaxAttempts=0` 表示不设次数上限，Bot 在线期间持续保留并重试，直到搜索得到终态结果；成功或“One 站未找到”等不可重试业务结果都会移出错误池。Bot 会尝试回复原群/话题；若通知发送失败，仅记录通知错误，不会把已完成的搜索重新入池。重启 Bot 后仍会恢复未完成任务。
5. **One 站也未命中时报错**

> 对应消息：`暂未找到 RJxxxxxx，请在 one 站查看是否拥有，或在频道提出。`

- `/search` 按 `历史上传索引 / 前置包 / One / 入队` 的顺序检索；不会在请求期间实时遍历 Telegram 频道。频道历史由独立同步任务写入本地历史索引，避免 User API 卡住阻塞 One 入队。
- 最近上传缓存仅用于“最近活动”展示、下载与每日 ZIP 输入，不作为 `/search` 的来源，避免讨论组消息 ID 被错误拼接为上传频道链接。
- 每段都会记录 `start / hit / miss / skip / fail` 等状态，方便直接从日志判断卡在哪一段。

## 3.1 作品详情链路（新增）

主函数：`handleInfoRequest(rawInput)`

执行顺序：

1. **作品缓存 JSON 命中**（`tg.infoCachePath`）
2. **实时抓取**（DLSite Ajax 基础信息）
3. **补充策略链**：DLSite 页面 / DLSite 预告页（announce） -> DLWatcher -> ASMR.ONE
4. **抓取命中后自动回填缓存 JSON**（可由 `tg.infoCachePersistOnFetch` 关闭）

- 当作品为 `announce` / 预告状态、Ajax 仅返回占位封面或字段不足时，会额外尝试抓取 DLSite 预告页 HTML。
- 预告页补充字段包括：真实封面、作者、剧情、插画、声优、音乐、作品形式、文件形式、分类等。
- TG Bot 详情消息会优先展示这些补充字段，减少预告作品只显示基础信息或 `No image` 的情况。
- 当仅有 `announce` 预告页可用时，详情消息里的 `View on DLSite` 按钮会直接指向预告页，而不是正式 `work` 页面。
- `/info` 的 `年龄指定` 会统一归一化为 `全年龄 / R15 / R18` 三档；旧缓存里的 `adult`、`general`、`R-15` 等历史值也会在读取与渲染时自动纠正。

## 3.2 纯文本触发规则

- 纯文本自动识别仅在消息内容是“单独一个编号”时触发（如 `RJ123456`、`1234567`）。
- 若消息内容是 `@BotName RJ123456` 这种“仅提及当前 Bot + 单个编号”的形式，则走 `/search` 搜索链路。
- 不再从 `reply_to_message` 内容回溯提取编号，避免普通回复误触发信息回帖。
- 文本里“包含编号但还有其它文字”不会触发自动回复。

## 3.3 上传事件增量同步

- 当字幕上传链路成功发送标题消息后，会提取 RJ/VJ/BJ 编号并增量写入 `/search` 历史索引。
- 同步来源包含：
  - 上传工具（`tg-upload-files`）
  - 工作流节点（`tg.uploadSubtitles`）
- 该同步是增量写入，不替代手动“频道历史全量同步”。

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

## 4.6 `asmr.one/works` 首页热缓存（新增）

- 主进程启动后会异步拉取 `https://api.asmr.one/api/works?order=create_date&sort=desc&page=1&pageSize=100`。
- 拉取结果直接增量写入 `tg-info-cache.json`，用于优先缓存封面图、标题、社团、价格、销量、评分、发售日、ASMR.ONE 在线听链接等字段。
- 热缓存只向 `tg-info-cache.json` 新增缺失记录，不回写更新已有条目，也不替代既有的 DLSite / DLWatcher / ASMR.ONE 详情抓取链。
- 热缓存写入时会同步归一化 `年龄指定`，避免 `adult` 等英文原始值直接出现在 TG `/info` 响应里。
- 使用 `ETag / If-None-Match` 进行条件请求；未变化时走 `304`，避免反复下载整页数据。
- 调度策略：
  - 常态：每 1 小时检查一次
  - 检测到页面变化后：24 小时内每 20 分钟检查一次
  - 连续 72 小时无变化后：降频到每 3 小时检查一次
- 自愈策略：
  - 若实际检查时间超过当前理论间隔，主进程 watchdog 会自动补刷一次
  - 电脑从休眠恢复后，主进程会立即补刷一次

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
- `translationQueueCachePath`
- `translationQueueCacheRefreshMs`
- `searchRetryQueuePath`
- `searchRetryDelayMs`
- `searchRetryMaxAttempts`
- `botAutoStartOnStartup`
- `botAutoSyncOnStartup`
- `botSyncSearchCacheOnUpload`（默认 `true`，控制字幕上传后是否自动增量同步 `/search` 索引）
- `infoCachePath`
- `infoRequestTimeoutMs`
- `infoCacheMaxConcurrency`
- `infoCacheMaxFileSizeMB`
- `infoCachePersistOnFetch`
- `infoHotCacheEnabled`
- `infoHotCacheIntervalMs`
- `infoHotCacheActiveIntervalMs`
- `infoHotCacheCoolIntervalMs`
- `infoHotCacheActiveWindowMs`
- `infoHotCacheCoolAfterMs`
- `infoHotCachePageSize`
- `infoHotCacheStartupDelayMs`

`/search` 入待翻译队列依赖（`asmr`）：

- `token`（Bearer Token）
- `translationQueuePlaylistId`（优先使用；设置页可独立配置）
- `playlistId`（兼容回退；当未配置 `translationQueuePlaylistId` 时自动使用）

兼容保留旧字段（用于 User API 检索与历史行为兼容）：

- `apiId`
- `apiHash`
- `session`
- `channel`
- `discussion`

---

## 9. 来源计划

- `docs/exec-plans/completed/2026-03-03-telegram-bot-api-migration.md`
