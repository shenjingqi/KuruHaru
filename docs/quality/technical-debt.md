# 技术债务

> 状态: 🟢 大部分修复  
> 最后更新: 2026-02-28

本文档记录 KuruHaru 项目的技术债务清单，供 Agent 参考进行修复。

---

## 审计摘要

| 类别             | 严重      | 中等      | 低        | 总计  |
| ---------------- | --------- | --------- | --------- | ----- |
| **Console.log**  | ✅ 已完成 | ✅ 已完成 | ✅ 已完成 | -     |
| **同步 fs 操作** | 部分完成  | 部分完成  | -         | 约40+ |
| **架构违规**     | ✅ 已修复 | 16        | -         | 17+   |
| **错误处理**     | ✅ 已完成 | ✅ 已完成 | -         | 3     |
| **文档不一致**   | ✅ 已完成 | ✅ 已完成 | 2         | 8     |
| **Lint 警告**    | 0 错误    | 27 警告   | -         | 27    |

---

## 修复状态概览

### ✅ 已完成 (P0 - P1)

| 项目              | 状态 | 说明                                          |
| ----------------- | ---- | --------------------------------------------- |
| 循环依赖修复      | ✅   | config.js ↔ logger.js 已解决                  |
| Console.log 清理  | ✅   | 渲染进程 57 处已清理                          |
| 魔法数字提取      | ✅   | 常量已提取并命名                              |
| whisper.js 异步化 | ✅   | packFolderInPlace, count-media-files 已异步化 |
| 异步调用错误处理  | ✅   | 5 处缺失的 await/.catch 已修复                |
| 空 catch 块填充   | ✅   | 已添加日志记录                                |
| 文档不一致修复    | ✅   | ARCHITECTURE.md 已创建，模块列表已更新        |

### 🟡 进行中 / 待修复 (P2)

| 项目               | 状态 | 说明                                                          |
| ------------------ | ---- | ------------------------------------------------------------- |
| 其他模块 fs 异步化 | 🟡   | tg-recent-activity.js, config.js, asmr-localization.js 待处理 |
| TODO 功能实现      | 🟡   | telegram-login.js 状态通知待实现                              |
| ESLint 警告        | 🟡   | 27 个警告（主要是 require-await 风格问题）                    |
| 架构违规重构       | 🟡   | Runtime → Service 依赖重构（大改动，低优先级）                |

---

## 详细技术债务列表

### 1. 同步文件操作阻塞主线程 (P0) 🟡 部分修复

**问题**: 同步 fs 操作会阻塞 UI

| 模块                    | 状态      | 数量 | 主要操作                                           |
| ----------------------- | --------- | ---- | -------------------------------------------------- |
| `whisper.js`            | 🟢 已修复 | 0    | packFolderInPlace, count-media-files 已异步化      |
| `tg-recent-activity.js` | 🟡 待修复 | 7    | readFileSync, writeFileSync, mkdirSync, unlinkSync |
| `config.js`             | 🟡 待修复 | 7    | readFileSync, mkdirSync, writeFileSync             |
| `asmr-localization.js`  | 🟡 待修复 | 12   | readFileSync, unlinkSync, mkdirSync, writeFileSync |

**修复方案**: 改用 `fs.promises` 或 `async/await`

---

### 2. TODO 注释 (P2) 🟡 待修复

| 文件                | 行号 | 内容                        | 状态      |
| ------------------- | ---- | --------------------------- | --------- |
| `telegram-login.js` | 294  | `// TODO: 实现状态通知逻辑` | 🟡 待实现 |

---

### 3. ESLint 警告 (P2) ⚠️ 部分修复

**当前状态**: 27 个警告 (从 764 → 27，减少 96%)

| 规则             | 数量 | 说明                           |
| ---------------- | ---- | ------------------------------ |
| `require-await`  | 24   | IPC 处理器风格警告，不影响功能 |
| `no-unused-vars` | 3    | catch 块中未使用的变量         |

**说明**: 剩余警告为代码风格问题，不影响功能。

---

## 修复计划

### 阶段一: 已完成 (P0) ✅

- [x] 解决 config.js ↔ logger.js 循环依赖
- [x] 添加 5 处缺失的 await/.catch
- [x] whisper.js 高频同步操作异步化

### 阶段二: 已完成 (P1) ✅

- [x] 清理渲染进程 console.log (57 处)
- [x] 填充空 catch 块，至少记录日志
- [x] 提取魔法数字为常量

### 阶段三: 进行中 (P2) 🟡

- [ ] 其他模块同步 fs 操作异步化
- [ ] 实现 TODO 功能
- [ ] ESLint 警告清理（可选）

---

## 相关文档

- [docs/quality/README.md](./README.md) - 质量评分
- [docs/development-workflow.md](../development-workflow.md) - 开发流程
- [docs/design-docs/module-index.md](../design-docs/module-index.md) - 模块文档
