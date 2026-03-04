# 云端数据同步（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-04

本文档沉淀 ASMR 云端数据同步能力的实现态设计，覆盖手动触发、缓存读取与前端广播更新。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/modules/asmr-localization.js`

### 1.2 前端调用面

- `src/preload/index.js`
  - `asmrGetCachedCloudWorks()`
  - `triggerCloudDataFetch()`

### 1.3 相关页面

- `Settings.vue`
- `CloudCleaner.vue`

---

## 2. 核心链路（怎么做）

### 2.1 触发同步

1. 前端调用 `asmr-trigger-cloud-data-fetch` 或 `asmr-fetch-cloud-works`。
2. 主进程执行云端抓取流程（播放列表 + 作品数据）。
3. 更新内存缓存 `cloudWorksCache`。
4. 向渲染层广播 `cloud-works-updated`。

### 2.2 缓存读取

1. 前端调用 `asmr-get-cached-cloud-works`。
2. 主进程直接返回当前缓存快照。

### 2.3 计划列表拉取（配套）

1. 前端调用 `asmr-fetch-playlist`。
2. 主进程按登录态获取播放列表并返回。
3. 结果用于同步范围选择与筛选入口。

---

## 3. 关键 IPC

- `asmr-trigger-cloud-data-fetch`
- `asmr-fetch-cloud-works`
- `asmr-get-cached-cloud-works`
- `asmr-fetch-playlist`
- 事件：`cloud-works-updated`

---

## 4. 数据与状态

- 缓存：主进程内存态 `cloudWorksCache`。
- 广播：通过 `webContents.send('cloud-works-updated')` 通知页面刷新。
- 依赖：ASMR 登录态（`asmr-login` / `asmr-check-login`）。

---

## 5. 实现映射

| 能力           | 文件                                       |
| -------------- | ------------------------------------------ |
| 云端同步主链路 | `src/main/modules/asmr-localization.js`    |
| IPC 桥接       | `src/preload/index.js`                     |
| 页面消费       | `src/renderer/src/components/Settings.vue` |
