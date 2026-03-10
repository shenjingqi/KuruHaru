# Telegram 上传（实现留存）

> 状态: ✅ 已实现  
> 最后更新: 2026-03-05

本文档沉淀 Telegram 登录与串行上传能力的实现态设计，覆盖认证、状态检查、上传控制与日志回传。

---

## 1. 模块定位

### 1.1 主实现

- `src/main/utils/telegram-login.js`

### 1.2 前端组件

- `src/renderer/src/components/Settings.vue`（登录与状态）
- `src/renderer/src/components/UploadTool.vue`（上传入口）

### 1.3 前端桥接

- `src/preload/index.js`
  - `tgCheckLogin()` / `tgLogin()` / `tgGetStatus()`
  - `tgUploadFiles(data)` / `tgCancelUpload()` / `tgCancelAuth()`

---

## 2. 核心链路（怎么做）

### 2.1 登录与状态

1. 前端调用 `tg-check-login` 尝试自动连接。
2. 未登录时调用 `tg-login` 进入认证流程。
3. 若需要验证码/密码，主进程发送 `tg-auth-needed`。
4. 前端通过 `tg-auth-reply` 回传认证输入，完成会话持久化。
5. 若遇到 `AUTH_KEY_DUPLICATED`，主进程会自动清空本地 `tg.session` 并返回“需重新登录”状态，避免旧会话反复失败。

### 2.2 串行上传

1. 前端发送事件 `tg-upload-files`（文件列表 + 频道 ID）。
2. 主进程逐文件执行“发送标题消息 -> 发送文件”串行链路。
3. 上传过程中持续发送 `log-update`（进度与结果）。
4. 失败按策略重试，最终返回成功/失败汇总信息。

### 2.3 取消控制

1. 上传中可调用 `tg-cancel-upload`。
2. 登录阶段可调用 `tg-cancel-auth`。
3. 主进程统一返回可恢复状态，避免卡死任务。

---

## 3. 关键 IPC

- `tg-check-login`
- `tg-get-status`
- `tg-login`
- `tg-cancel-auth`
- `tg-cancel-upload`
- 事件：`tg-upload-files`
- 事件回传：`tg-auth-needed`、`log-update`

---

## 4. 配置字段（tg / upload）

- `tg.apiId` / `tg.apiHash` / `tg.phone` / `tg.session`
- `upload.channelId`

补充说明：`tg-login` 支持从调用参数注入 `apiId/apiHash/phone`，并在登录成功时与 `session` 一并持久化。

---

## 5. 实现映射

| 能力             | 文件                                         |
| ---------------- | -------------------------------------------- |
| 登录与上传主链路 | `src/main/utils/telegram-login.js`           |
| IPC 桥接         | `src/preload/index.js`                       |
| UI 交互          | `src/renderer/src/components/UploadTool.vue` |
