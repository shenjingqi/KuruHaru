# 设计文档索引

> 最后更新: 2026-03-05

本目录用于沉淀项目的**长期设计资产**（架构、数据流、边界、功能实现留存、决策日志）。

> 单智能体快速入口：优先阅读 `docs/README.md` 的“必读最小集”。

---

## 核心原则

1. **向前依赖**：遵循 `Types → Config → Repo → DataAccess → Service → Runtime → UI`。
2. **IPC 优先**：Renderer 不直接访问 Node 能力。
3. **配置驱动**：行为由配置字段驱动，默认值与合并策略可追溯。
4. **可追溯沉淀**：`exec-plans/completed` 的长期成果必须回写到 design-docs。

---

## 文档列表

| 文档                               | 状态      | 说明                                             |
| ---------------------------------- | --------- | ------------------------------------------------ |
| `architecture-design.md`           | ✅ 可用   | 架构摘要页（详细以 `docs/ARCHITECTURE.md` 为准） |
| `business-background.md`           | ✅ 稳定   | 业务背景与目标                                   |
| `business-boundary.md`             | ✅ 稳定   | 业务边界与外部依赖                               |
| `data-flow.md`                     | ✅ 稳定   | 核心数据流与交互路径                             |
| `design-decisions.md`              | ✅ 活跃   | 关键决策与来源追溯                               |
| `js-architecture-breakthrough.md`  | 🔄 活跃   | JS 架构升级、设计突破与全量拆解配套策略          |
| `module-index.md`                  | ✅ 可用   | 模块与 IPC 快速导航                              |
| `feature-local-file-management.md` | ✅ 已实现 | 本地文件扫描/提取/导出实现留存                   |
| `feature-cloud-data-sync.md`       | ✅ 已实现 | ASMR 云端数据同步与缓存广播留存                  |
| `feature-whisper-transcription.md` | ✅ 已实现 | Whisper 转写与字幕打包链路留存                   |
| `feature-telegram-upload.md`       | ✅ 已实现 | Telegram 登录与串行上传留存                      |
| `feature-local-cleaning.md`        | ✅ 已实现 | 本地清理（`clean-data`）实现留存                 |
| `feature-cloud-cleaning.md`        | ✅ 已实现 | 云端清理（作品/RJ/本地关联）实现留存             |
| `feature-recent-activity.md`       | ✅ 已实现 | 最近活动扫描/读取/下载留存                       |
| `feature-rj-filter.md`             | ✅ 已实现 | RJ 筛选与导出链路留存                            |
| `feature-advanced-search.md`       | ✅ 已实现 | 高级搜索新增 `$tagw:` / `$lang:` 语法留存        |
| `feature-rj-duplicate-detector.md` | ✅ 已实现 | RJ 重复检测最终实现留存                          |
| `feature-telegram-search-bot.md`   | ✅ 已实现 | Telegram Search Bot（Bot API）留存               |

---

## 与执行计划的关系

- `exec-plans/active/*`：执行中过程文档。
- `exec-plans/completed/*`：完成记录（历史）。
- `design-docs/*`：稳定设计真相源（长期留存）。

当一个执行计划完成且结果具有长期价值时：

1. 在对应 feature 文档更新“实现态设计”。
2. 在 `design-decisions.md` 记录决策与影响。
3. 在本索引登记文档状态。
