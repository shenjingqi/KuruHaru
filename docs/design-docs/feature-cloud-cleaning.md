# 云端清理（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-04

本文档沉淀“云端清理”能力的实现态设计，覆盖云端作品删除、按 RJ 清理与本地关联文件清理。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/asmr-localization.js`

### 1.2 前端组件

- `src/renderer/src/components/CloudCleaner.vue`

### 1.3 前端桥接

- `src/preload/index.js`
  - `asmrDeleteByRJ(rjCodes)`
  - `invoke('asmr-delete-works', workIds)`
  - `invoke('asmr-delete-local-files', filePaths)`

---

## 2. 核心链路（怎么做）

### 2.1 云端作品清理

1. 前端提交作品 ID 列表调用 `asmr-delete-works`。
2. 主进程对目标作品执行云端删除。
3. 返回删除统计与失败信息。

### 2.2 按 RJ 批量清理

1. 前端传入 RJ 列表调用 `asmr-delete-by-rj`。
2. 主进程解析 RJ 对应作品并执行批量删除。
3. 返回每个 RJ 的处理结果。

### 2.3 本地关联文件清理

1. 前端传入文件路径调用 `asmr-delete-local-files`。
2. 主进程删除本地文件并返回成功/失败计数。

---

## 3. 关键 IPC

- `asmr-delete-works`
- `asmr-delete-by-rj`
- `asmr-delete-local-files`
- （配套）`asmr-fetch-cloud-works` / `asmr-trigger-cloud-data-fetch`

---

## 4. 依赖与前置条件

- ASMR 登录态有效。
- 目标作品来源于当前云端列表或 RJ 匹配结果。
- 本地清理路径需具备文件删除权限。

---

## 5. 实现映射

| 能力           | 文件                                           |
| -------------- | ---------------------------------------------- |
| 云端清理主链路 | `src/main/modules/asmr-localization.js`        |
| IPC 桥接       | `src/preload/index.js`                         |
| 页面交互       | `src/renderer/src/components/CloudCleaner.vue` |
