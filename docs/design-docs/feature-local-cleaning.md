# 本地清理（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-04-15

本文档沉淀“本地清理”功能的实现态设计，覆盖本地文件比对、最近上传字幕清理、预览删除与实际删除执行。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/index.js`（`clean-data` 处理器）

### 1.2 前端组件

- `src/renderer/src/components/Tools.vue`
- `src/renderer/src/components/LocalCleaner.vue`

### 1.3 前端桥接

- `src/preload/index.js`
  - `invoke('clean-data', { mainFile, compareDir, deleteFiles })`
  - `invoke('clean-recent-uploaded-subtitles', { archiveDir, subtitleDir, deleteFiles })`

---

## 2. 核心链路（怎么做）

### 2.1 比对阶段

1. 传入主文件 `mainFile` 与比对目录 `compareDir`。
2. 主进程从主文件提取 `RJ/VJ/BJ` 号集合。
3. 扫描目录内 zip 文件并提取文件名中的 `RJ/VJ/BJ`。
4. 判断每个 zip 是否“所有编号都在主文件中出现”。

### 2.2 删除阶段

1. 当 `deleteFiles=false`：仅返回预览清单。
2. 当 `deleteFiles=true`：执行文件删除并记录结果。
3. 返回统计：原始数、保留数、删除数、删除编号集合。

### 2.3 最近上传字幕本地清理

1. 工具箱传入字幕压缩包目录 `archiveDir` 与字幕文件夹根目录 `subtitleDir`。
2. 主进程读取 `paths.uploadHistoryDir/recent_activity.json` 作为最近上传缓存。
3. 使用缓存中的 `RJ/VJ/BJ` 编号与文件名，匹配本地 zip 与字幕文件夹。
4. 当 `deleteFiles=false`：返回预览结果。
5. 当 `deleteFiles=true`：删除匹配 zip，并递归删除匹配的字幕文件夹。

---

## 3. 关键 IPC

- `clean-data`
- `clean-recent-uploaded-subtitles`

请求：

- `mainFile`
- `compareDir`
- `deleteFiles`

最近上传字幕清理请求：

- `archiveDir`
- `subtitleDir`
- `deleteFiles`

---

## 4. 返回语义（实现态）

- `success`
- `originalCount`
- `cleanedCount`
- `deletedCount`
- `deletedCodes`
- `filesToDelete`
- `filesToKeep`
- `actuallyDeleted`
- `archiveMatches`
- `folderMatches`
- `deletedArchiveCount`
- `deletedFolderCount`
- `failedEntries`

---

## 5. 实现映射

| 能力             | 文件                                              |
| ---------------- | ------------------------------------------------- |
| 本地清理主链路   | `src/main/index.js`                               |
| 最近上传字幕清理 | `src/main/modules/recent-upload-local-cleaner.js` |
| IPC 桥接         | `src/preload/index.js`                            |
| 页面交互         | `src/renderer/src/components/Tools.vue`           |
