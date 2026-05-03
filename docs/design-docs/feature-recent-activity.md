# 最近活动（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-04

本文档沉淀“最近活动”功能的实现态设计，覆盖扫描、读取、下载与缓存管理。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/tg-recent-activity.js`

### 1.2 前端组件

- `src/renderer/src/components/RecentActivity.vue`
- `src/renderer/src/components/TgDownloader.vue`
- `src/renderer/src/components/HomePanel.vue`

> 说明：`HomePanel.vue` 仍保留最近活动统计与“扫描讨论组”入口；首页原有“距上次更新”卡片继续基于最近活动元数据计算。同时新增 `ASMR.one` 独立状态卡片（持续未更新天数、理论间隔、距上次检查），并将首页列表区域切换为展示 `ASMR.one /works` 热缓存最近同步到的最多 100 个作品号（以最新收录为主），不再直接复用 `recent_activity.json` 的最近记录列表。

### 1.3 前端桥接

- `src/preload/index.js`
  - `tgScanRecentActivity()`
  - `tgReadRecentActivity()`
  - `invoke('get-recent-activity')`
  - `invoke('download-tg-file', payload)`
  - `clearCache(cacheFile)` / `read-rj-list`

---

## 2. 核心链路（怎么做）

### 2.1 扫描并持久化

1. 前端调用 `tg-scan-recent-activity`。
2. 主进程扫描频道历史并生成结构化记录。
3. 将结果落盘到 `recent_activity.json`。

### 2.2 读取与展示

1. 前端调用 `tg-read-recent-activity` 或 `get-recent-activity`。
2. 主进程读取缓存文件并返回列表。
3. 前端按时间/状态展示并支持后续下载操作。

### 2.3 文件下载与缓存治理

1. 前端调用 `download-tg-file` 下载指定消息文件。
2. 调用 `clear-cache` 清理缓存文件。
3. 调用 `read-rj-list` 读取 RJ 列表做辅助筛选。

---

## 3. 关键 IPC

- `tg-scan-recent-activity`
- `tg-read-recent-activity`
- `get-recent-activity`
- `download-tg-file`
- `clear-cache`
- `read-rj-list`
- `tg-get-statistics`

---

## 4. 数据存储

- 默认缓存：`paths.uploadHistoryDir/recent_activity.json`
- 统计能力：`tg-get-statistics`

---

## 5. 实现映射

| 能力           | 文件                                             |
| -------------- | ------------------------------------------------ |
| 最近活动主链路 | `src/main/modules/tg-recent-activity.js`         |
| IPC 桥接       | `src/preload/index.js`                           |
| 页面交互       | `src/renderer/src/components/RecentActivity.vue` |
