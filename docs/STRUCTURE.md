# 文档库结构说明

本文档库按照 Harness Engineering 原则组织，为 Agent 提供渐进式知识发现能力。

---

## 目录结构

```
docs/
├── design-docs/           # 设计方案（验证状态+核心信念）
│   ├── README.md          # 设计文档目录说明
│   ├── architecture-design.md
│   ├── data-flow.md
│   ├── module-index.md
│   ├── feature-rj-duplicate-detector.md
│   └── ...
│
├── exec-plans/            # 执行计划
│   ├── README.md          # 执行计划说明
│   ├── active/            # 进行中
│   │   ├── bug-analysis-rj-duplicate-detector.md
│   │   ├── bug-analysis-tg-search-bot.md
│   │   └── plan-telegram-bot-api-migration.md
│   ├── completed/         # 已完成
│   │   ├── 2026-02-27-harness-t0-improvements.md
│   │   └── 2026-02-28-添加上传取消按钮功能.md
│   └── tech-debt/        # 技术债务
│       └── 2026-02-28-仪表盘上次更新时间显示未知.md
│
├── product-specs/         # 产品规格
│   └── README.md
│
├── quality/               # 质量评分
│   ├── README.md
│   ├── architecture-implementation-plan.md
│   ├── architecture-layering-spec-v2.md
│   ├── technical-debt.md
│   └── technical-debt-remediation-plan.md
│
├── references/            # 参考资料
│   └── README.md
│
└── STRUCTURE.md           # 本文档
```

---

## 文件类型说明

### 1. design-docs/ - 设计方案

**用途**: 记录系统架构、业务逻辑、数据流等核心设计

**标记验证状态**:
- ✅ **已验证** - 已实现并通过测试
- 🔄 **验证中** - 正在开发中
- ❓ **待验证** - 设计阶段，未实现

**核心信念**: 每个设计文档都应包含核心信念（设计原则），指导后续决策

---

### 2. exec-plans/ - 执行计划

**用途**: 记录具体实施计划、Bug分析、功能实现

**状态目录**:
- **active/** - 进行中的计划
- **completed/** - 已完成（按日期命名）
- **tech-debt/** - 已知技术债务

**命名规范**:
- Bug分析: `bug-analysis-<功能名>.md`
- 实施计划: `YYYY-MM-DD-简短描述.md`

---

### 3. product-specs/ - 产品规格

**用途**: 记录产品需求、用户故事、PRD

---

### 4. quality/ - 质量评分

**用途**: 质量评估、技术债务跟踪、架构规范

**核心文件**:
- `architecture-layering-spec-v2.md` - 分层架构规范
- `technical-debt.md` - 技术债务清单
- `technical-debt-remediation-plan.md` - 技术债务清理计划

---

### 5. references/ - 参考资料

**用途**: 外部链接、工具文档、学习资料

---

## 核心原则

### 1. 渐进式披露

Agent 从少量稳定的 `AGENTS.md` 开始，逐步深入到具体文档。

### 2. 真相源原则

`docs/` 目录是项目的唯一真相源。当代码与文档不一致时，必须更新代码或文档使其一致。

### 3. 验证状态标记

每个设计文档都应有验证状态标记，Agent 看到就知道该信任到什么程度。

### 4. 不在仓库 = 对 Agent 不存在

只有版本化的文件对 Agent 可见。Slack 对话、口头约定对 Agent 不存在。

---

## 使用指南

### 创建新的设计文档

```markdown
# 功能名称

**验证状态**: 🔄 验证中

## 核心信念

1. 信念一：xxx
2. 信念二：xxx

## 设计...
```

### 创建新的执行计划

根据类型放入对应目录：
- Bug分析 → `exec-plans/active/bug-analysis-<功能>.md`
- 功能实现 → `exec-plans/active/plan-<功能>.md`
- 完成后 → 移动到 `exec-plans/completed/YYYY-MM-DD-描述.md`

---

## 文档维护责任

| 操作 | 触发条件 | 负责人 |
|------|----------|--------|
| 创建设计文档 | 新功能设计阶段 | 功能负责人 |
| 更新验证状态 | 功能实现/测试完成 | 开发者 |
| 移动执行计划 | 任务完成 | 开发者 |
| 更新技术债务 | 发现/修复债务 | 发现者 |
| 文档审阅 | 定期/发布前 | Tech Lead |

---

*本文档库遵循 Harness Engineering 原则，为 Agent-first 开发提供结构化知识支撑。*
