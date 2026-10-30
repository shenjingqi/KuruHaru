# ASMR 音声下载任务（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-10-21

本文档沉淀“ASMR 音声下载任务”功能的实现态设计，覆盖 `RJ/VJ/BJ` 编号输入、轨道解析、过滤去重、清单落盘与 Aria2 RPC 推送。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/asmr-audio-downloader.js`
- `src/main/modules/asmr-core/audio-download-utils.js`

### 1.2 前端组件

- `src/renderer/src/components/AsmrDownloader.vue`
- `src/renderer/src/composables/useAsmrDownloaderPage.js`

### 1.3 前端桥接

- `src/preload/index.js`
  - `invoke('asmr-audio-downloader-run', payload)`

---

## 2. 核心链路（怎么做）

### 2.1 输入解析

1. 页面接收多行文本输入。
2. 支持从 `.txt` 文件一键导入原始编号列表。
3. 每行支持提取 `RJ/VJ/BJ` 编号，也兼容纯数字输入（按 `RJ` 处理）。
4. 自动去重并保留原始输入顺序。
5. 无法识别的行转入人工复核列表。

### 2.2 轨道获取与过滤

1. 主进程调用 `https://api.asmr-200.com/api/tracks/:id` 获取作品轨道树。
2. 递归解析目录/音频节点，保留目录结构。
3. 复用 Python 脚本中的规则：
   - 黑名单目录/文件过滤（`本編` 可免死）
   - 人工关键词目录过滤（多语言、差分、パーツ分け等）
   - 可选视频格式过滤（默认开启）：同一轨道存在音频版本时优先音频；仅当该轨道只有视频版本时保留视频兜底，避免开启过滤后整条音轨缺失
   - 特典与本篇识别
   - Windows 路径长度保护
   - 单作品下载任务数超过默认上限 20 时转人工复核

#### 2.2.1 指纹与格式选择不变量

- 指纹归一化忽略容器格式、`音声のみ` 等版本标记、`効果音あり` 等 SE 标记、重复下载后缀 `(1)` 与前导轨道序号，但**永远不返回空串**：无法归一化的标题回退为 `__fallback__<文件名>`。旧实现用「効果音 + 贪婪通配」删除标题，会把 `（効果音ありmp3）01_プロローグ…` 整段删空，导致同一目录 15 条音轨共用空指纹、最终只下载 1 条。
- **去重只看音频文件自身的指纹，目录不参与身份判定**：无论音频落在根目录、`mp3版/`、`音声mp3/`、`動画/` 还是任何未收录的目录，只要指纹相同就属于同一轨道，只保留一份。因此 `根目录/01.wav` 与 `mp3版/01.mp3` 只会下载 mp3，不需要维护“格式目录名单”，也不会因新命名再次重复下载。
- 同一轨道存在多种扩展名时只保留最高优先级版本：`mp3 > m4a > aac > ogg > flac > wav > wma > 视频`。只有该轨道没有更优格式时才回退到 wav/视频；因此 `1_（wav）X.wav` 与 `2_（mp3）X.mp3` 只下载 mp3。
- 同一扩展名下按轨道序号区分：不同序号视为不同轨道（`01_あ.mp3` 与 `02_あ.mp3` 都保留）；相同序号视为重复/SE 变体，只保留评分最高的一条（重复下载后缀 `(1)` 同样归为同一序号）。码率标记（`320kbps`/`128kbps` 等）不参与指纹，评分优先保留高码率版本。
- 唯一沿用原算法的例外：极短指纹（长度 ≤ 3，如 `01`、`1`）在 `本篇/特典` 之间可能“同名不同曲”，此时按特典标记拆成两组，避免特典音轨被本篇误杀。
- 最终任务再按 `outPath`（忽略大小写）去重一次，避免同一路径被重复写入清单或重复推送 aria2。

> 说明：`.lrc`/`.srt` 等字幕不在下载任务内，由 Whisper 转写阶段按音频生成；下载侧只负责产出正确的音频集合。

### 2.3 任务输出

1. 保留任务写入 `aria2_tasks.txt`。
2. 人工复核条目写入 `manual_review.txt`。
3. 若启用 Aria2 且非测试模式，则逐条调用 `aria2.addUri` 推送任务。
4. 页面展示摘要、任务预览、人工复核清单与推送异常。
5. 输入区实时显示总行数、识别数、去重后数量与无效行数。
6. 页面可切换“过滤视频格式”选项：开启时优先音频，仅保留没有音频对应版本的视频轨道；关闭时视频容器也参与去重，但音频版本仍然优先。

---

## 3. 关键 IPC

- `asmr-audio-downloader-run`

请求字段：

- `inputText`
- `downloadDir`
- `rpcUrl`
- `rpcSecret`
- `useAria2`
- `testMode`
- `filterVideoFormats`
- `maxAutoTasksPerWork`

---

## 4. 返回语义（实现态）

- `success`
- `message`
- `summary`
  - `inputCount`
  - `validCount`
  - `invalidCount`
  - `manualCount`
  - `taskCount`
  - `pushedCount`
  - `pushErrorCount`
  - `filterVideoFormats`
  - `manualReviewPath`
  - `aria2InputPath`
- `manualItems`
- `processedItems`
- `pushErrors`
- `taskPreview`

---

## 5. 配置字段

新增/使用以下配置项：

- `asmr.downloadRpcUrl`
- `asmr.downloadRpcSecret`
- `asmr.downloadUseAria2`
- `asmr.downloadTestMode`
- `asmr.downloadFilterVideoFormats`
- `asmr.downloadMaxAutoTasksPerWork`
- `paths.asmrDownloadDir`

---

## 6. 实现映射

| 能力              | 文件                                                      |
| ----------------- | --------------------------------------------------------- |
| 编号解析/过滤去重 | `src/main/modules/asmr-core/audio-download-utils.js`      |
| IPC 与 Aria2 推送 | `src/main/modules/asmr-audio-downloader.js`               |
| 前端桥接          | `src/preload/index.js`, `src/renderer/src/api/asmrApi.js` |
| 独立页面          | `src/renderer/src/components/AsmrDownloader.vue`          |
