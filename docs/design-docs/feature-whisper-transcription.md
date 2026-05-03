# Whisper 语音转字幕（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-05-01

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

### 2.1.1 异常退出自动恢复

1. 前端页面级 workflow 单点监听 `log-update` / `task-finished`，不再把恢复策略放在进度弹窗内。
2. 当主进程回传可恢复异常时，前端会先记录失败日志，再在外层重新触发一次“开始翻译”。
3. 当前恢复判定覆盖两类高频场景：
   - 引擎直接返回显存/OOM 相关错误文本；
   - Windows 下 Whisper 子进程以 `3221226505` 退出（历史日志中的高频崩溃特征）。
4. 自动恢复采用“高总上限 + 低无进度上限”策略：
   - 允许较高累计自动恢复次数，以支持大批量目录持续跑完；
   - 若连续多次恢复后仍无新进度，则停止自动重试并把失败结果展示给用户。
5. `task-finished` 现在会补充 `success`、`reason`、`exitCode`、`signal` 等字段，供前端进行更稳定的恢复判定。

### 2.2 任务中断

1. 前端发送 `stop-task`。
2. 主进程中断当前任务并回收状态。

### 2.3 字幕打包

1. 前端调用 `zip-subtitles`。
2. 主进程递归扫描目标目录中的音频与字幕文件。
3. 若检测到音频文件，则按“相对路径去扩展名”校验每个音频是否都有对应字幕。
4. 仅在字幕完整时打包为 zip；若存在缺失项，则返回缺失清单并跳过该目录打包。
5. 若目录中未检测到音频文件，则保留原有行为，仅按字幕文件执行打包。

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

| 能力           | 文件                                               |
| -------------- | -------------------------------------------------- |
| Whisper 主链路 | `src/main/modules/whisper.js`                      |
| 翻译前 RJ 缓存 | `src/main/modules/whisper.js` + `tg-info-cache.js` |
| IPC 桥接       | `src/preload/index.js`                             |
| 页面交互       | `src/renderer/src/components/WhisperTool.vue`      |
