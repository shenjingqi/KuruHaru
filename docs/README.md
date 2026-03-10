# Docs 单入口导航（Single-Agent Quick Find）

> 状态: ✅ 可用  
> 最后更新: 2026-03-05

本文件是文档系统的**唯一入口**。单智能体工作时，按下列顺序阅读即可快速建立上下文。

---

## 1) 必读最小集（按顺序）

1. `docs/ARCHITECTURE.md`  
   系统分层、模块装配、当前可验证状态。
2. `docs/design-docs/module-index.md`  
   功能 → 文件 → IPC 的最快导航。
3. `docs/design-docs/data-flow.md`  
   关键数据流、IPC 通道、存储路径真相源。
4. `docs/product-specs/README.md`  
   业务功能清单与流程图。
5. `docs/quality/README.md`  
   质量约束、技术债、验证口径。

---

## 2) 需要时再读

- `docs/design-docs/business-background.md` / `business-boundary.md`：业务背景与边界。
- `docs/design-docs/design-decisions.md`：关键设计决策历史。
- `docs/design-docs/js-architecture-breakthrough.md`：JS 架构升级与设计突破建议。
- `docs/design-docs/feature-*.md`：特性级实现留存。
- `docs/exec-plans/README.md`：执行计划索引（active/completed 总览）。
- `docs/exec-plans/completed/2026-03-04-无边框窗口设计方案.md`：桌面无边框重构归档。
- `docs/exec-plans/completed/2026-03-04-页面与JS分阶段重构方案.md`：页面与主链路 JS 重构归档。

---

## 3) 低优先级历史资料

- `docs/exec-plans/completed/*`：历史执行记录（默认可跳过）。
- `docs/exec-plans/tech-debt/*`：历史债务条目。
- `docs/references/*`：外部参考。

---

## 4) 瘦身规则（防止重复）

1. 同主题文档只保留一份真相源；避免根目录与子目录双份副本。
2. 顶层文档只放“入口与总览”，细节沉淀到 `design-docs/`。
3. 新增文档前先在本文件登记；可被现有文档覆盖时不新增。
