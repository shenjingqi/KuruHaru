# ASMR 音声下载任务（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-04-13

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
   - 黑名单目录/文件过滤
   - 特典与本篇识别
   - 指纹去重
   - 短指纹冲突修复（本篇/特典并存）
   - Windows 路径长度保护
   - 单作品下载任务数超过默认上限 20 时转人工复核

### 2.3 任务输出

1. 保留任务写入 `aria2_tasks.txt`。
2. 人工复核条目写入 `manual_review.txt`。
3. 若启用 Aria2 且非测试模式，则逐条调用 `aria2.addUri` 推送任务。
4. 页面展示摘要、任务预览、人工复核清单与推送异常。
5. 输入区实时显示总行数、识别数、去重后数量与无效行数。

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
