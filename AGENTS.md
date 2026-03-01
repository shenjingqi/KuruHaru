# AGENTS.md — KuruHaru Agent 入职手册

> 本文件给 AI Agent 阅读。README.md 给人看，AGENTS.md 给 Agent 看。

## 项目概览

**项目名称**: KuruHaru  
**类型**: Electron 桌面应用 (Electron + Vue 3 + Vite)  
**用途**: ASMR 内容管理 + Telegram 机器人工具  
**主要功能**: 本地文件管理、云端数据同步、Whisper 语音转字幕、Telegram 上传、文件清理等

---

## 技术栈

| 层级 | 技术                            |
| ---- | ------------------------------- |
| 框架 | Electron 39 + electron-vite 5   |
| 前端 | Vue 3.5 + Pinia + Naive UI      |
| 构建 | Vite 7 + UnoCSS + TailwindCSS 4 |
| 语言 | JavaScript (ESM)                |
| 工具 | ESLint 9 + Prettier 3 + Vitest  |

---

## 目录结构

```
scripts/
├── ralph-loop.js        # RalphWiggum Loop 自动验证脚本

src/
├── main/
│   ├── index.js            # 入口，窗口管理、系统托盘、IPC 处理器
│   ├── modules/            # 功能模块
│   │   ├── config.js       # 配置管理
│   │   ├── asmr-localization.js
│   │   ├── whisper.js
│   │   ├── tg-recent-activity.js
│   │   └── httpClient.js
│   └── utils/
│       ├── logger.js           # 日志系统
│       ├── errorHandler.js    # 错误处理
│       ├── retry.js           # 重试机制
│       ├── task-isolated-logger.js  # 任务隔离日志
│       ├── cdp-client.js      # CDP 客户端
│       └── dom-snapshot.js    # DOM 快照
├── preload/
│   └── index.js            # 预加载脚本
└── renderer/
    └── src/
        ├── main.js
        ├── App.vue
        └── components/
```

---

## 关键命令

```bash
# 开发
npm run dev          # 启动开发服务器 + Electron
npm run build        # 构建生产版本

# Lint / Format
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化

# 测试
npm run test         # 运行单元测试
npm run test:watch   # 监听模式

# RalphWiggum Loop (自动验证循环)
npm run ralph "任务描述"                 # 基本验证
npm run ralph "任务描述" --with-vision # 启用视觉系统 (CDP)

# 验证
npm run verify       # lint + build

# 构建安装包
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

---

## 架构约束（必须遵守）

### 1. 向前依赖规则

代码只能"向前"依赖：

```
Types → Config → Repo → DataAccess → Service → Runtime → UI
```

| 当前层          | 可依赖                                      |
| --------------- | ------------------------------------------- |
| Types           | (无)                                        |
| Config          | Types                                       |
| Repo/DataAccess | Types, Config                               |
| Service         | Types, Config, DataAccess                   |
| Runtime         | Types, Config, DataAccess, Service          |
| UI              | Types, Config, DataAccess, Service, Runtime |

### 2. IPC 通信模式

- 主进程使用 `ipcMain.handle()` 注册处理函数
- 返回 `Promise`，支持 async/await
- 渲染进程通过 `window.api.invoke()` 调用

### 3. 配置管理

- 配置文件: `config/config.json` 或用户 AppData 目录
- 读取: `getConfig()` — 返回合并后的配置对象
- 保存: `saveConfig(newConfig)` — 合并更新

### 4. 日志规范

- 日志工具: `src/main/utils/logger.js`
- 使用: `const logger = createLogSender('module-name')`

### 5. 错误处理

- 使用 `src/main/utils/errorHandler.js` 中的 `normalizeError()`
- 异步请求使用 `withRetry()` 包装

---

## 文档更新约束

> 每次功能验收完成后必须更新文档

**触发条件**:

- 新功能开发完成并通过验收
- 修改了现有功能的接口或行为
- 添加了新的模块或组件
- 发现代码与文档不一致时

**真相源原则**:

- docs 目录是项目的唯一真相源
- 当代码与文档不一致时，必须更新代码或文档使其一致

---

## 代码风格约束

### ESLint 规则

- 使用 ESM (`import`/`export`)
- 组件使用 `<script setup>` 语法
- Vue 组件使用 `defineProps`/`defineEmits` 显式声明
- 禁止使用 `any` 类型

### Prettier 配置

- 单引号
- 2 空格缩进
- trailing comma: es5
- printWidth: 100

---

## 验证状态

| 区域     | 状态    | 备注                     |
| -------- | ------- | ------------------------ |
| 开发环境 | ✅ 可用 | `npm run dev` 正常       |
| 生产构建 | ✅ 可用 | `npm run build:win` 正常 |
| Lint     | ✅ 可用 | ESLint + Prettier 已配置 |
| 测试     | ✅ 可用 | Vitest 20 个测试通过     |
| 模块加载 | ✅ 可用 | 主进程模块化良好         |

---

## 扩展阅读

- 项目架构详解: `docs/ARCHITECTURE.md`
- 质量评分: `docs/quality/README.md`
- 开发流程: `docs/development-workflow.md`
- Agent Vision: `docs/agent-vision-solution.md`
- UI 组件风格: `docs/ui-style-guide.md`
