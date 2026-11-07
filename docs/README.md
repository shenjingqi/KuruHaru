# KuruHaru v1 文档

> 基线：`v1`
> 状态：`current`
> 校验日期：2026-11-06

本目录只保留当前版本的可交付文档。文档描述当前代码、当前业务约束和已执行的验证。

## 阅读顺序

1. [`V1_BASELINE.md`](V1_BASELINE.md)：版本边界、当前事实和不变量。
2. [`PRODUCT.md`](PRODUCT.md)：用户流程、业务域和不可擅自改变的业务规则。
3. [`ARCHITECTURE.md`](ARCHITECTURE.md)：进程边界、模块装配、IPC、配置和持久化。
4. [`QUALITY.md`](QUALITY.md)：验证分级、ESLint 护栏 v2 方案、交付门禁和发布记录格式。
5. [`UI_MODERNIZATION.md`](UI_MODERNIZATION.md)：页面交互与视觉改造方案，当前为 `proposed`。

## 文档规则

- 每个主题只有一个当前文档；新事实写入对应主题，不另建重复副本。
- 代码、配置、IPC、数据格式或业务行为变化时，在同一变更中更新文档。
- `implemented` 只表示代码已合入；`verified` 需要对应的命令、GUI、在线或安装包证据。
- 建议、待办和验收结论必须分别标注，不把建议写成已完成。
- 配置字段的结构只来自 `src/shared/config-contract.mjs`，文档不复制默认值。
- 修改后运行 `npm run docs:config` 和 `git diff --check -- docs`。

## 交付状态

运行日志页面按 `ARCHITECTURE.md` 的受限 IPC 读取 `app.log`，只读显示并保留有限行数。
