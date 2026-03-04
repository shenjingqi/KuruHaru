# 本地文件管理（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-04

本文档沉淀“本地文件管理”能力的实现态设计，覆盖目录选择、归档扫描、文件名提取与读写导出链路。

---

## 1. 模块定位

### 1.1 主进程入口

- `src/main/index.js`

### 1.2 相关能力

- 通用文件对话框：`dialog:openFile`、`dialog:saveFile`
- 本地归档扫描：`scan-local-archives`
- 本地 RJ 扫描（ASMR 域）：`scan-local-ids`
- 文件提取与导出：`extract-file-names`、`write-file`、`fs-read-file`

### 1.3 前端调用面

- `src/preload/index.js` 暴露：
  - `dialogOpenFile` / `dialogSaveFile`
  - `scanLocalArchives` / `scanLocalIds`
  - `writeFile`

---

## 2. 核心链路（怎么做）

### 2.1 归档扫描

1. 前端选择目录（`dialog:openFile`，`type=dir`）。
2. 调用 `scan-local-archives` 扫描目录。
3. 主进程递归收集归档结果并按路径去重。
4. 返回规范化条目（补齐 `tags` 字段供前端消费）。

### 2.2 RJ 号扫描

1. 前端传入目录路径调用 `scan-local-ids`。
2. 主进程在本地文件中提取 RJ 号集合。
3. 返回结构化结果，用于后续筛选/比对流程。

### 2.3 文件名提取与导出

1. 调用 `extract-file-names` 传入 `sourceDir / outputDir / fileName`。
2. 主进程异步遍历目录，提取 `RJ/VJ/BJ` 文件标识并去重排序。
3. 写入文本文件并返回统计（成功数/输出路径）。
4. 前端可继续通过 `dialog:saveFile + write-file` 做二次导出。

---

## 3. 关键 IPC

- `dialog:openFile`
- `dialog:saveFile`
- `scan-local-archives`
- `scan-local-ids`
- `extract-file-names`
- `fs-read-file`
- `write-file`

---

## 4. 返回语义（实现态）

- `scan-local-archives`：归档条目数组（去重后）。
- `extract-file-names`：`{ success, fileCount, outputPath }`。
- `write-file`：`{ success }` 或 `{ success: false, error }`。
- 对话框：`{ canceled, filePath, filePaths }`。

---

## 5. 实现映射

| 能力          | 文件                                    |
| ------------- | --------------------------------------- |
| 通用文件操作  | `src/main/index.js`                     |
| ASMR 本地扫描 | `src/main/modules/asmr-localization.js` |
| 前端桥接      | `src/preload/index.js`                  |
