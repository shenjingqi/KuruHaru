# 技术债务

> 状态: 🟡 部分修复  
> 最后更新: 2026-02-28

本文档记录 KuruHaru 项目的技术债务清单，供 Agent 参考进行修复。

---

## 审计摘要

| 类别 | 严重 | 中等 | 低 | 总计 |
|------|------|------|------|------|
| **Console.log** | 147+ | 113+ | ✅ 主进程已修复 | - |
| **架构违规** | 1 循环依赖 | 16 | - | 17+ |
| **错误处理** | 0 ✅ | 3 | - | 3 |
| **文档不一致** | 1 缺失 | 5 | 2 | 8 |
| **Lint 警告** | 0 错误 | 27 警告 | - | 27 |

| 类别            | 严重       | 中等    | 低              | 总计 |
| --------------- | ---------- | ------- | --------------- | ---- |
| **Console.log** | 0 ✅ | 0 ✅ | ✅ 已完成 | - |
| **同步 fs 操作** | 30+ | 41+ | - | 71+ |
| **架构违规** | 1 循环依赖 ✅ | 16 | - | 17+ |
| **错误处理** | 0 ✅ | 3 ✅ | - | 3 |
| **文档不一致** | 1 缺失 ✅ | 5 ✅ | 2 | 8 |
| **Lint 警告** | 0 错误 | 27 警告 | - | 27 |
| **架构违规**    | 1 循环依赖 | 16      | -               | 17+  |
| **错误处理**    | 0 ✅       | 3       | -               | 3    |
| **文档不一致**  | 1 缺失     | 5       | 2               | 8    |
| **Lint 警告**   | 0 错误     | 27 警告 | -               | 27   |

---

## 🔴 P0 - 立即修复

### 1. 循环依赖 (Critical) ✅ 已修复

**问题**: `config.js` ↔ `logger.js` 形成循环依赖

**修复方案**: 使用延迟初始化解决

**状态**: ✅ 已完成 (2026-02-28)

---

### 2. 未处理的异步调用 (High) ✅ 已修复

| 文件                                     | 行号 | 问题                                   | 状态      |
| ---------------------------------------- | ---- | -------------------------------------- | --------- |
| `src/main/modules/asmr-localization.js`  | 164  | `autoLoginOnStartup()` 无 await/.catch | ✅ 已修复 |
| `src/main/modules/asmr-login.js`         | 493  | `saveConfig(saveData)` 未 await        | ✅ 已修复 |
| `src/main/modules/tg-recent-activity.js` | 399  | `saveRecentActivity()` 无错误处理      | ✅ 已修复 |
| `src/main/modules/tg-recent-activity.js` | 493  | `saveRecentActivity()` 无错误处理      | ✅ 已修复 |
| `src/main/utils/telegram-login.js`       | 247  | `saveConfig(saveData)` 未 await        | ✅ 已修复 |

---

### 3. 同步文件操作阻塞主线程 (High) ❌ 未修复

**问题**: 71 处使用同步 fs 操作，会阻塞 UI

| 模块                                     | 数量 | 主要操作                                           |
| ---------------------------------------- | ---- | -------------------------------------------------- |
| `src/main/utils.js`                      | 5    | readdirSync, statSync                              |
| `src/main/index.js`                      | 10   | readFileSync, mkdirSync, writeFileSync             |
| `src/main/modules/whisper.js`            | 14   | readdirSync, statSync, unlinkSync, mkdirSync       |
| `src/main/modules/asmr-localization.js`  | 12   | readFileSync, unlinkSync, mkdirSync, writeFileSync |
| `src/main/modules/tg-recent-activity.js` | 7    | readFileSync, writeFileSync, mkdirSync, unlinkSync |
| `src/main/modules/config.js`             | 7    | readFileSync, mkdirSync, writeFileSync             |

**修复方案**: 改用 `fs.promises` 或 `async/await`

**状态**: ❌ 待修复 (低优先级，需要大规模重构)

---

## 🟡 P1 - 本周修复

### 4. Console.log 滥用 (Medium) ⚠️ 部分修复

**问题**: 渲染进程 57 处使用 console.log，应使用项目日志系统

| 模块               | 数量 |
| ------------------ | ---- |
| Settings.vue       | 18   |
| RecentActivity.vue | 12   |
| App.vue            | 11   |
| WhisperTool.vue    | 8    |
| HomePanel.vue      | 3    |
| TgDownloader.vue   | 2    |
| Tools.vue          | 2    |
| ChineseList.vue    | 1    |

**说明**: 主进程已使用 logger，渲染进程需手动清理

**状态**: ⚠️ 渲染进程待清理 (57 处)

---

### 5. 空 Catch 块 (Medium) ✅ 已修复

**问题**: 错误被静默吞掉，难以调试

**状态**: ✅ 已完成 (2026-02-28)

---

### 6. 魔法数字 (Medium) ❌ 未修复

**问题**: 数字硬编码，缺乏语义化命名

| 文件                                     | 行号 | 值              | 含义                  |
| ---------------------------------------- | ---- | --------------- | --------------------- |
| `src/main/modules/tg-recent-activity.js` | 31   | `150*1024*1024` | ANCHOR_SIZE_THRESHOLD |
| `src/main/modules/tg-recent-activity.js` | 39   | `5*60*1000`     | DIALOGS_CACHE_TTL     |
| `src/main/modules/tg-recent-activity.js` | 201  | `2*1024*1024`   | MAX_FILE_SIZE         |
| `src/main/modules/tg-recent-activity.js` | 266  | `2000`          | BACKWARD_LIMIT        |
| `src/main/utils/telegram-login.js`       | 353  | `3`             | MAX_RETRIES           |
| `src/main/utils/telegram-login.js`       | 357  | `20000/30000`   | TIMEOUT               |

**修复方案**: 提取为常量

```javascript
const ANCHOR_SIZE_THRESHOLD = 150 * 1024 * 1024;
const DIALOGS_CACHE_TTL = 5 * 60 * 1000;
```

**状态**: ❌ 待修复

---

### 7. 架构违规 (Medium) ❌ 未修复

**问题**: 违反向前依赖规则 `Types → Config → Repo → DataAccess → Service → Runtime → UI`

| 违规类型             | 数量 | 示例                                            |
| -------------------- | ---- | ----------------------------------------------- |
| Runtime → Service    | 4    | index.js 直接导入 whisper, asmr-localization 等 |
| Service → Utils      | 8    | Service 层导入 logger, errorHandler             |
| Service → DataAccess | 1    | asmr-localization → httpClient                  |
| Config → Utils       | 1    | config.js → logger                              |
| Runtime → Utils      | 2    | index.js → utils                                |

**状态**: ❌ 待修复 (低优先级，需要大规模重构)

---

## 🟢 P2 - 计划修复

### 8. 文档不一致 ✅ 已修复

| 问题             | 详情                                           | 状态        |
| ---------------- | ---------------------------------------------- | ----------- |
| **缺失文档**     | `docs/ARCHITECTURE.md` 引用但不存在            | ✅ 已创建   |
| **未列出模块**   | `asmr-login.js` 存在于代码但文档未列出         | ✅ 已修复   |
| **未列出工具**   | `telegram-login.js`, `asmr-data-transforms.js` | ✅ 已修复   |
| **重复内容**     | AGENTS.md 行 182-186 和 188-191 重复           | ✅ 已修复   |
| **缺失依赖版本** | Naive UI, Pinia, UnoCSS, Vitest 版本未文档化   | 🟢 低优先级 |

---

### 9. TODO 注释 ❌ 未修复

| 文件                               | 行号 | 内容                        |
| ---------------------------------- | ---- | --------------------------- |
| `src/main/utils/telegram-login.js` | 294  | `// TODO: 实现状态通知逻辑` |

**状态**: ❌ 待修复

---

### 10. ESLint 警告 ⚠️ 部分修复

**当前状态**: 27 个警告 (从 764 → 27，减少 96%)

| 规则             | 数量 | 修复方案                       |
| ---------------- | ---- | ------------------------------ |
| `require-await`  | 24   | IPC 处理器风格警告，不影响功能 |
| `no-unused-vars` | 3    | catch 块中未使用的变量         |

**说明**: 剩余警告为代码风格问题，不影响功能。

**状态**: ⚠️ 部分修复

---

## 修复计划

### 阶段一: 立即修复 (P0)

- [x] 解决 config.js ↔ logger.js 循环依赖
- [x] 添加 5 处缺失的 await/.catch
- [ ] 评估同步 fs 操作，优先转换高频操作 (低优先级)

### 阶段二: 本周修复 (P1)

- [ ] 清理渲染进程 console.log (57 处)
- [x] 填充空 catch 块，至少记录日志
- [ ] 提取魔法数字为常量
- [ ] 重构 Runtime → Service 依赖 (可选，大改动)

### 阶段三: 计划修复 (P2)

- [x] 创建 docs/ARCHITECTURE.md
- [x] 更新 AGENTS.md 模块/工具列表
- [ ] 实现 TODO 功能

---

## 相关文档

- [docs/quality/README.md](./README.md) - 质量评分
- [docs/development-workflow.md](../development-workflow.md) - 开发流程
- [docs/design-docs/module-index.md](../design-docs/module-index.md) - 模块文档
