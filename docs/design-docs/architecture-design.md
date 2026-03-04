# 架构设计（摘要）

> 状态: ✅ 可用  
> 最后更新: 2026-03-04

本文件保留为**架构摘要页**，用于设计目录内快速定位。  
详细架构真相源请读取：`docs/ARCHITECTURE.md`。

---

## 1. 三段式总览

```text
Renderer (Vue)
  └─ window.api
      └─ Preload (contextBridge)
          └─ Main (ipcMain.handle/on)
              ├─ modules/*
              └─ utils/*
```

---

## 2. 最小关注点

1. Renderer 不直接访问 Node 能力。
2. 业务能力经由 IPC 暴露给前端。
3. 配置字段真相源为 `src/main/modules/config.js` 的 `DEFAULT_CONFIG`。
4. 功能定位优先看 `docs/design-docs/module-index.md`。
5. 数据流与 IPC 细节优先看 `docs/design-docs/data-flow.md`。

---

## 3. 跳转

- 总体架构（详细）: `docs/ARCHITECTURE.md`
- 模块导航（快速）: `docs/design-docs/module-index.md`
- 数据流（实现态）: `docs/design-docs/data-flow.md`
