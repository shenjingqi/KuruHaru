# 文档库结构说明

> 最后更新: 2026-03-04

本文档描述 `docs/` 目录当前真实结构，用于快速导航与一致性维护。

## 1. 当前目录结构

```text
docs/
├── README.md
├── ARCHITECTURE.md
├── STRUCTURE.md
├── development-tools.md
│
├── design-docs/
│   ├── README.md
│   ├── architecture-design.md
│   ├── business-background.md
│   ├── business-boundary.md
│   ├── data-flow.md
│   ├── design-decisions.md
│   ├── feature-local-file-management.md
│   ├── feature-cloud-data-sync.md
│   ├── feature-whisper-transcription.md
│   ├── feature-telegram-upload.md
│   ├── feature-local-cleaning.md
│   ├── feature-cloud-cleaning.md
│   ├── feature-recent-activity.md
│   ├── feature-rj-filter.md
│   ├── feature-advanced-search.md
│   ├── feature-rj-duplicate-detector.md
│   ├── feature-telegram-search-bot.md
│   ├── module-index.md
│   └── ui-style-guide.md
│
├── exec-plans/
│   ├── README.md
│   ├── active/
│   │   ├── 2026-03-04-侧边栏导航重构方案.md
│   │   └── 2026-03-04-无边框窗口设计方案.md
│   ├── completed/
│   │   ├── 2026-02-27-harness-t0-improvements.md
│   │   ├── 2026-02-28-添加上传取消按钮功能.md
│   │   ├── 2026-03-03-rj-duplicate-detector-id-delete-hotfix.md
│   │   ├── 2026-03-03-rj-duplicate-detector-v2.md
│   │   ├── 2026-03-03-rj-duplicate-detector-v3.md
│   │   └── 2026-03-03-telegram-bot-api-migration.md
│   └── tech-debt/
│       └── 2026-02-28-仪表盘上次更新时间显示未知.md
│
├── product-specs/
│   └── README.md
├── quality/
│   ├── README.md
│   ├── architecture-implementation-plan.md
│   ├── architecture-layering-spec-v2.md
│   ├── technical-debt.md
│   └── technical-debt-remediation-plan.md
└── references/
    └── README.md
```

---

## 2. 目录职责

| 目录             | 职责                             |
| ---------------- | -------------------------------- |
| `design-docs/`   | 架构与模块设计、数据流、设计决策 |
| `exec-plans/`    | 执行计划、完成记录、技术债条目   |
| `quality/`       | 质量状态、架构规范、债务清单     |
| `product-specs/` | 产品规格与需求文档               |
| `references/`    | 参考资料                         |

---

## 3. 维护原则

1. 文档描述必须可在仓库中被验证（路径、文件名、模块名一致）。
2. 新增/重命名文件后，同步更新索引文档（至少更新本文件与相关 README）。
3. 当代码与文档冲突时，必须在同一变更周期内完成对齐。
4. 对同主题文档优先单点维护于 `design-docs/`，避免根目录与子目录双份重复。
5. 单智能体默认从 `docs/README.md` 进入，按“必读最小集”获取上下文。
