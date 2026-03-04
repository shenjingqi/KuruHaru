# RJ 筛选（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-04

本文档沉淀 RJ 精准筛选能力的实现态设计，覆盖 URL 解析、条件过滤、去重比对与导出。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/asmr-localization.js`

### 1.2 前端组件

- `src/renderer/src/components/RjFilter.vue`

### 1.3 前端桥接

- `src/preload/index.js`
  - `invoke('filter-rj-from-url', payload)`
  - 配套导出：`dialog:saveFile` + `write-file`

---

## 2. 核心链路（怎么做）

### 2.1 发起筛选

1. 前端输入来源 URL（搜索/列表）。
2. 设置筛选参数（如日期模式、比对文件路径）。
3. 调用 `filter-rj-from-url`。

### 2.2 主进程筛选

1. 根据 URL 抓取候选作品集。
2. 提取作品 RJ 编号。
3. 按条件做日期过滤与去重比对（可参考 TXT）。
4. 返回最终 RJ 列表与统计信息。

### 2.3 导出结果

1. 前端调用 `dialog:saveFile` 选择导出路径。
2. 使用 `write-file` 写入筛选结果文本。

---

## 3. 关键 IPC

- `filter-rj-from-url`
- （配套）`dialog:saveFile`
- （配套）`write-file`

---

## 4. 请求参数（实现态）

- `url`
- `dateMode`
- `compareFilePath`

---

## 5. 实现映射

| 能力          | 文件                                       |
| ------------- | ------------------------------------------ |
| RJ 筛选主链路 | `src/main/modules/asmr-localization.js`    |
| IPC 桥接      | `src/preload/index.js`                     |
| 页面交互      | `src/renderer/src/components/RjFilter.vue` |
