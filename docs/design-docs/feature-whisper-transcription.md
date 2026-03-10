# Whisper 语音转字幕（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-06

本文档沉淀 Whisper 功能实现态设计，覆盖媒体计数、任务启动/停止、进度回传与字幕打包。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/whisper.js`

### 1.2 前端组件

- `src/renderer/src/components/WhisperTool.vue`
- `src/renderer/src/components/WhisperProgress.vue`

### 1.3 前端桥接

- `src/preload/index.js`
  - `startTask(config)` / `stopTask()`
  - `zipSubtitles(data)`
  - `onLogUpdate(callback)` / `onTaskFinished(callback)`

---

## 2. 核心链路（怎么做）

### 2.1 任务执行

1. 前端通过事件 `start-task` 发起任务。
2. 主进程启动转写流程（子进程执行）。
3. 任务执行期间持续发送 `log-update`。
4. 结束时发送 `task-finished` 返回结果。

### 2.2 任务中断

1. 前端发送 `stop-task`。
2. 主进程中断当前任务并回收状态。

### 2.3 字幕打包

1. 前端调用 `zip-subtitles`。
2. 主进程将指定字幕集合打包为 zip 并返回输出信息。

### 2.4 翻译前自动作品信息缓存

1. `start-task` 触发后，主进程递归扫描 `targetPath` 下目录名/文件名中的 `RJ/VJ/BJ` 编号。
2. 将扫描到的编号集合交给 `tg-info-cache` 模块进行缓存预热。
3. 仅对缓存未命中的编号发起网络抓取并写入 `tg-info-cache.json`。
4. 该流程与翻译进程并行执行，不阻塞 Whisper 翻译启动。

---

## 3. 关键 IPC

- `count-media-files`
- `zip-subtitles`
- 事件：`start-task` / `stop-task`
- 回传：`log-update` / `task-finished`

---

## 4. 配置字段（Whisper）

来自 `config.whisper`：

- `exePath`：Whisper 可执行文件路径
- `targetPath`：目标目录
- `subFormats`：字幕输出格式

---

## 5. 实现映射

| 能力           | 文件                                          |
| -------------- | --------------------------------------------- |
| Whisper 主链路 | `src/main/modules/whisper.js`                 |
| 翻译前 RJ 缓存 | `src/main/modules/whisper.js` + `tg-info-cache.js` |
| IPC 桥接       | `src/preload/index.js`                        |
| 页面交互       | `src/renderer/src/components/WhisperTool.vue` |
