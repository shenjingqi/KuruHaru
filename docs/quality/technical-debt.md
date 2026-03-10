# 技术债务

> 状态: 🟢 大部分修复  
> 最后更新: 2026-03-05

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
| **Lint 警告**    | 0 错误    | 44 警告   | -         | 44    |

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
| TODO 功能实现      | ✅   | telegram-login.js 状态通知链路已接线（`tg-upload-finished`）  |
| ESLint 警告        | 🟡   | 44 个警告（主要是 require-await 风格问题）                    |
| 架构违规重构       | 🟡   | Runtime → Service 依赖重构（大改动，低优先级）                |

---

## 详细技术债务列表

### 1. 同步文件操作阻塞主线程 (P0) 🟡 部分修复

**问题**: 同步 fs 操作会阻塞 UI

| 模块                    | 状态      | 数量 | 主要操作                                                                        |
| ----------------------- | --------- | ---- | ------------------------------------------------------------------------------- |
| `whisper.js`            | 🟢 已修复 | 0    | packFolderInPlace, count-media-files 已异步化，递归扫描函数 scanSubDir 已异步化 |
| `tg-recent-activity.js` | 🟡 待修复 | 7    | readFileSync, writeFileSync, mkdirSync, unlinkSync                              |
| `config.js`             | 🟡 待修复 | 7    | readFileSync, mkdirSync, writeFileSync                                          |
| `asmr-localization.js`  | 🟡 待修复 | 12   | readFileSync, unlinkSync, mkdirSync, writeFileSync                              |

**修复方案**: 改用 `fs.promises` 或 `async/await`

---

### 2. TODO 注释 (P2) ✅ 已收敛

当前 `src/` 与 `scripts/` 已无遗留 TODO/FIXME/HACK 标记；剩余 TODO 主要为文档模板占位文本。

---

### 3. ESLint 警告 (P2) ⚠️ 部分修复

**当前状态**: 44 个警告（0 error，主要为历史风格告警）

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
- [x] 实现 TODO 功能
- [ ] ESLint 警告清理（可选）

---

## 相关文档

- [docs/quality/README.md](./README.md) - 质量评分
- [docs/development-workflow.md](../development-workflow.md) - 开发流程
- [docs/design-docs/module-index.md](../design-docs/module-index.md) - 模块文档

---

## 新增技术债务 (2026-03-01)

### 4. 代码重复: 日志工具重复实现 (P0) 🔴 待修复

**问题**: 三个文件实现了相同的 `createLogSender` 功能

**影响**: 代码维护困难，日志格式可能不一致

**涉及文件**:

- `src/main/utils.js` (行 109-145)
- `src/main/utils/logger.js` (标准实现)
- `src/main/utils/telegram-login.js` (行 14-27, 内联实现)

**修复方案**:

1. `utils.js`: 删除实现，改为从 logger.js 重新导出
2. `telegram-login.js`: 删除内联日志，使用标准 logger

**预计工作量**: 30分钟

---

### 5. 备份文件未清理 (P0) 🔴 待修复

**问题**: 备份文件不应该存在于版本控制中

**文件**: `src/main/modules/tg-recent-activity.js.bak`

**风险**: 可能包含过期代码或敏感信息

**修复操作**:

```bash
git rm src/main/modules/tg-recent-activity.js.bak
git commit -m "chore: remove backup file"
```

**预计工作量**: 5分钟

**问题**: 备份文件不应该存在于版本控制中

**文件**: `src/main/modules/tg-recent-activity.js.bak`

**风险**: 可能包含过期代码或敏感信息

**修复操作**:

```bash
git rm src/main/modules/tg-recent-activity.js.bak
git commit -m "chore: remove backup file"
```

**预计工作量**: 5分钟

---

### 6. IPC 处理器注册模式不一致 (P1) 🟡 待修复

**问题**: 不同模块对 IPC 处理器移除的处理方式不一致

**现状**:

- `config.js`: 移除所有处理器后再注册
- `whisper.js`: 只移除 2 个特定处理器
- `tg-recent-activity.js`: 使用 `removeHandler`

**风险**: 热重载或模块重新加载时可能导致处理器重复或覆盖

**修复方案**: 统一使用 `config.js` 模式

**涉及文件**:

- `src/main/modules/whisper.js`
- `src/main/modules/tg-recent-activity.js`

**预计工作量**: 40分钟

---

### 7. 未使用的模块: asmr-login.js (P1) 🟡 待修复

**问题**: `src/main/modules/asmr-login.js` 的 `setupAsmrIPCHandlers()` 从未被调用

**分析**: `index.js` 只调用了 `asmr-localization.js` 的 `setupAsmrIPC()`

**方案选项**:

**选项 A** (推荐): 合并到 asmr-localization.js

- 将 `asmr-login.js` 的 IPC 处理器合并到 `asmr-localization.js`
- 删除 `asmr-login.js`

**选项 B**: 在 index.js 中添加调用

- 在 `index.js` 中调用 `setupAsmrIPCHandlers()`

**建议**: 采用选项 A，避免功能分散

**预计工作量**: 30分钟

---

### 8. 配置读取无缓存 (P2) 🟢 待优化

**问题**: `config.js` 的 `getConfig()` 每次调用都读取文件，性能较差

**代码位置**: `src/main/modules/config.js` 行 80-152

**优化方案**: 添加简单缓存机制

```javascript
let configCache = null;
let configCacheTime = 0;
const CACHE_TTL = 5000; // 5秒缓存

export async function getConfig() {
  const now = Date.now();
  if (configCache && now - configCacheTime < CACHE_TTL) {
    return configCache;
  }

  // 原有读取逻辑...
  configCache = mergedConfig;
  configCacheTime = now;
  return mergedConfig;
}

export async function saveConfig(newConfig) {
  configCache = null; // 清除缓存
  // 原有保存逻辑...
}
```

**预计工作量**: 20分钟

---

## 📊 修复优先级总览

| 优先级 | 任务数 | 预计总时间 | 关键收益         |
| ------ | ------ | ---------- | ---------------- |
| P0     | 3      | 40分钟     | 消除严重技术债务 |
| P1     | 3      | 2小时      | 提升代码可维护性 |
| P2     | 1      | 20分钟     | 性能优化         |

**总计**: 7项任务，约3小时工作量

---

## T1 改进优先级（进行中）

| 优先级  | 改进项              | 当前分数 | 目标分数 | 状态      |
| ------- | ------------------- | -------- | -------- | --------- |
| ✅ T1-1 | **UI 组件风格统一** | 70       | 80+      | ✅ 已完成 |
| ✅ T1-2 | **模块文档完善**    | 65       | 80+      | ✅ 已完成 |
| ✅ T1-3 | **IPC 命名优化**    | 75       | 85+      | ✅ 已完成 |

## 已完成的改进

| 改进项                  | 状态      | 日期       |
| ----------------------- | --------- | ---------- |
| 向前依赖架构            | ✅ 已完成 | 2026-02-26 |
| HTTP 统一代理           | ✅ 已完成 | 2026-02-26 |
| 业务边界划分            | ✅ 已完成 | 2026-02-26 |
| 文档真相源              | ✅ 已完成 | 2026-02-26 |
| 决策日志                | ✅ 已完成 | 2026-02-26 |
| 单元测试覆盖            | ✅ 已完成 | 2026-02-27 |
| httpClient interceptors | ✅ 已完成 | 2026-02-27 |
| 错误处理统一            | ✅ 已完成 | 2026-02-27 |
| UI 组件风格统一         | ✅ 已完成 | 2026-02-27 |
| 模块文档完善            | ✅ 已完成 | 2026-02-27 |
| IPC 命名优化            | ✅ 已完成 | 2026-02-27 |

## ✅ 快速启动清单

### 今天可以完成的 (40分钟):

- [ ] 删除备份文件 (5分钟)
- [ ] 修复 technical-debt.md 表格格式 (15分钟)
- [ ] 修复 AGENTS.md 重复内容 (5分钟)
- [ ] 统一日志工具 (30分钟)

### 本周完成的:

- [ ] 修复 IPC 处理器模式
- [ ] 处理未使用的 asmr-login.js
- [ ] 添加配置缓存

---

## 📝 相关文档

- [技术债务修复方案详细版](./technical-debt-remediation-plan.md) - 包含代码示例和详细步骤
- [AGENTS.md](../../AGENTS.md) - 项目入职手册
- [质量评分](./README.md) - 模块质量评分
