# Agent 视觉方案

> 状态: 🔄 演进中  
> 最后更新: 2026-02-26

本文档定义 KuruHaru 项目的 Agent 视觉感知系统，让 AI Agent 能够"看到"和"听到"应用状态。

---

## 设计目标

让 Agent 能够：

1. **看到** - 通过 CDP (Chrome DevTools Protocol) 感知 UI 状态
2. **听到** - 通过日志和指标感知内部状态
3. **闭环** - 自己发现问题 → 自己修复 → 自己验证

---

## 方向一：装"眼睛" - 外部感知

### 1.1 Chrome DevTools Protocol (CDP) 集成

```javascript
// src/main/utils/cdp-client.js
import { ChromeLauncher } from 'chrome-launcher'

/Agent 可以：
- 启动应用
- 打开 DevTools
- 检查每个按钮/输入框状态
- 截图当前界面
- 执行 JavaScript
```

### 1.2 DOM 快照

```javascript
// src/main/utils/dom-snapshot.js
export async function captureDOMSnapshot(page) {
  // 获取完整 DOM 树
  const dom = await page.content();

  // 截图
  const screenshot = await page.screenshot();

  // 提取关键信息
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    forms: Array.from(document.forms).map((f) => ({
      action: f.action,
      inputs: Array.from(f.elements).map((e) => ({
        type: e.type,
        name: e.name,
        value: e.value,
      })),
    })),
  }));

  return { dom, screenshot, info };
}
```

### 1.3 使用场景

```bash
# Agent 可以执行
npm run dev  # 启动应用
# → CDP 连接
# → 获取 DOM 快照
# → 分析 UI 状态
# → 发现问题 → 修复 → 验证
```

---

## 方向二：装"听诊器" - 内部感知

### 2.1 可观测性系统

```
┌─────────────────────────────────────────┐
│           Agent 感知层                  │
├─────────────────────────────────────────┤
│  📊 Metrics (指标)                     │
│  📝 Logs (日志)                        │
│  🔍 Traces (链路追踪)                  │
└─────────────────────────────────────────┘
         ↑              ↑              ↑
         │              │              │
    Loki (日志)   Prometheus    Jaeger
    (搜索)       (指标)        (链路)
```

### 2.2 任务隔离日志

每个任务独立日志文件：

```javascript
// src/main/utils/task-isolated-logger.js
import { createWriteStream } from "fs";

const TASK_ID = process.env.TASK_ID || `task-${Date.now()}`;

// 每个任务独立的日志文件
const taskLog = createWriteStream(`logs/tasks/${TASK_ID}.log`);

export function createTaskLogger(module) {
  return {
    info: (msg, ...args) => {
      taskLog.write(`[${TASK_ID}] [${module}] INFO: ${msg} ${args}\n`);
    },
    error: (msg, ...args) => {
      taskLog.write(`[${TASK_ID}] [${module}] ERROR: ${msg} ${args}\n`);
    },
  };
}
```

### 2.3 日志查询语法 (LogQL 风格)

```bash
# 查询特定任务的日志
grep "task-123456" logs/tasks/*.log

# 查询错误
grep "ERROR" logs/tasks/task-*.log

# 查询响应时间
grep "duration" logs/tasks/task-*.log | awk '{sum+=$NF; n++} END {print sum/n}'
```

---

## Agent 工作闭环

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent 感知闭环                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐    ┌─────────────┐    ┌─────────────┐       │
│   │ 启动应用 │ -> │ CDP 连接    │ -> │ DOM 快照   │       │
│   └─────────┘    └─────────────┘    └─────────────┘       │
│                                              │             │
│   ┌─────────┐    ┌─────────────┐    ┌─────────────┐       │
│   │ 分析状态 │ <- │ 发现问题    │ <- │ 获取日志   │       │
│   └─────────┘    └─────────────┘    └─────────────┘       │
│          │                                                │
│          ▼                                                │
│   ┌─────────┐    ┌─────────────┐    ┌─────────────┐       │
│   │ 修复代码 │ -> │ 重新验证    │ -> │ 确认修复   │       │
│   └─────────┘    └─────────────┘    └─────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 实施计划

### Phase 1: 日志增强 (T0)

- [x] 创建任务隔离日志模块 (`src/main/utils/task-isolated-logger.js`)
- [x] 集成 JSON 格式日志
- [x] 添加日志查询 API
- [x] 集成到 RalphWiggum Loop

### Phase 2: CDP 集成 (T1)

- [x] 创建 CDP 客户端工具 (`src/main/utils/cdp-client.js`)
- [x] 实现 DOM 快照功能 (`src/main/utils/dom-snapshot.js`)
- [x] RalphWiggum Loop 支持 CDP 连接

### Phase 3: 自动化闭环 (T2)

- [x] 集成到 RalphWiggum Loop
- [ ] 自动截图对比 (需 Electron 运行时)
- [ ] 失败自动分析

- [x] 创建任务隔离日志模块
- [ ] 集成 JSON 格式日志
- [ ] 添加日志查询 API

### Phase 2: CDP 集成 (T1)

- [ ] 添加 chrome-remote-interface 依赖
- [ ] 创建 CDP 客户端工具
- [ ] 实现 DOM 快照功能

### Phase 3: 自动化闭环 (T2)

- [ ] 集成到 RalphWiggum Loop
- [ ] 自动截图对比
- [ ] 失败自动分析

---

## 配置

### 环境变量

```bash
# 任务 ID (用于日志隔离)
TASK_ID=task-123456

# CDP 端口 (默认 9222)
CDP_PORT=9222

# 日志级别
LOG_LEVEL=debug
```

---

## 文档更新日志

| 日期       | 变更                                                   |
| ---------- | ------------------------------------------------------ |
| 2026-02-26 | 初始版本，定义 Agent 视觉方案                          |
| 2026-02-27 | 实现 Phase 1-2: 任务隔离日志、CDP 客户端、DOM 快照工具 |
| 2026-02-27 | RalphWiggum Loop 集成视觉系统                          |

| 日期       | 变更                          |
| ---------- | ----------------------------- |
| 2026-02-26 | 初始版本，定义 Agent 视觉方案 |
