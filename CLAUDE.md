# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Harness工程师的三大核心职责

### 01 设计环境

搭好脚手架：

- **仓库结构**: `src/main/`, `src/preload/`, `src/renderer/` 三层分离
- **CI流水线**: `npm run verify` (lint + build)
- **开发者工具**:
  - ESLint 9 + Prettier 3 代码规范
  - Vitest 单元测试
  - RalphWiggum Loop 自动验证

### 02 明确意图

用清晰的语言拆解需求，将意图转化为无歧义的规范：

- **架构约束**: 向前依赖规则 `Types → Config → Modules → Utils → IPC → UI`
- **IPC模式**: `ipcMain.handle()` → `window.api.invoke()`
- **配置管理**: `getConfig()` / `saveConfig()` 统一配置读写
- **日志规范**: `createLogSender('module-name')` 统一日志

### 03 构建反馈

自我审查→静态检查→集成测试，让Agent在闭环里自己跑通：

- **静态检查**: `npm run lint` → ESLint 规则强制执行
- **单元测试**: `npm run test` → Vitest 验证模块功能
- **集成验证**: `npm run verify` → lint + build 双重检查
- **Ralph Loop**: `npm run ralph "任务"` → 自动验证循环

---

## 日常工作流与核心总结

### 深度优先工作法

大目标→构建模块→逐个完成→解锁复杂任务

**示例**: 实现 Telegram Bot 功能

1. **大目标**: 完成 Bot API 迁移
2. **构建模块**: 配置 → 核心模块 → IPC → UI
3. **逐个完成**:
   - `npm install node-telegram-bot-api`
   - 更新 `config.js` 添加 botToken
   - 重构 `tg-search-bot.js`
   - 更新 UI 组件
4. **解锁**: `npm run verify` 验证通过

### RalphWiggum Loop

编码→审查→测试→修复 反复

```bash
# 启动 Ralph Loop 自动验证
npm run ralph "实现 Telegram Bot API 迁移"
```

**循环过程**:

1. Agent 编写代码
2. 自动审查 (`npm run lint`)
3. 运行测试 (`npm run test`)
4. 发现问题 → 自动修复
5. 直到所有检查通过

---

## 分层架构与依赖规则

### 向前依赖规则（必须遵守）

代码只能"向前"依赖：

```
Types → Config → Modules → Utils
                    │
                    ▼
              IPC Handlers → Renderer
                    │
                    ▼
Main Process ←── Preload
```

**依赖矩阵**:

| 当前层          | 可依赖                                      |
| --------------- | ------------------------------------------- |
| Types           | (无)                                        |
| Config          | Types                                       |
| Repo/DataAccess | Types, Config                               |
| Modules/Service | Types, Config, DataAccess                   |
| Runtime         | Types, Config, DataAccess, Modules          |
| UI              | Types, Config, DataAccess, Modules, Runtime |

**强制规则**:

- ❌ Renderer 不能直接 require Node.js 模块
- ❌ Renderer 不能直接访问文件系统
- ❌ Service 层不能引用 UI 组件
- ✅ 所有主进程功能通过 IPC 暴露
- ✅ 数据流向必须是单向的

---

## 如何让系统知识对Agent可发现?

### 一张地图，而不是一本说明书

**AGENTS.md** → 100行 → 目录地图
**ARCHITECTURE.md** → 鸟瞰图
**docs/** → (真相源)

```
知识库结构:
├── AGENTS.md              # Agent 入职手册（本文件）
├── ARCHITECTURE.md        # 架构鸟瞰图
├── CLAUDE.md              # Claude Code 指导
├── docs/
│   ├── design-docs/       # 设计方案（验证状态+核心信念）
│   ├── exec-plans/        # 执行计划 (active/completed/tech-debt)
│   ├── product-specs/     # 产品规格
│   ├── references/        # 参考资料
│   └── quality/           # 质量评分
├── src/
│   ├── main/              # 主进程
│   ├── preload/           # 预加载脚本
│   └── renderer/          # 渲染进程
└── tests/                 # 测试
```

### 文档类型与用途

| 文档                | 用途             | 更新频率    |
| ------------------- | ---------------- | ----------- |
| `AGENTS.md`         | Agent 入职指南   | 架构变更时  |
| `CLAUDE.md`         | Claude Code 指导 | 流程变更时  |
| `ARCHITECTURE.md`   | 架构鸟瞰         | 重大变更时  |
| `docs/design-docs/` | 设计方案         | 设计完成时  |
| `docs/exec-plans/`  | 执行计划         | 进行中/完成 |
| `docs/quality/`     | 质量评分         | 定期更新    |

---

## 知识的"保鲜"工程

### 自动化防线：Linter & CI

像测试代码一样测试文档。CI流水线强制检查：

- **链接有效性**: 文档内链接可访问
- **交叉引用**: 引用其他文档存在
- **结构合规**: 符合文档模板

### 主动维护：文档园丁Agent

不仅仅是检查，而是自动修复。定期扫描代码仓库：

- 发现文档与代码行为不一致
- 自动提交 PR 进行更新

---

## 不在仓库 = 对 Agent 不存在

只有仓库里的版本化文件：

- 配置文件
- Schema定义
- 代码
- Markdown文档
- 执行计划

如果你想让Agent有效工作，你必须把重要知识搬进仓库。但"搬"不是把slack里的碎片对话原样复制进去，给Agent更多上下文是**组织和暴露正确的信息让它能推理**，而不是用临时指令淹没它。

像给新队友做入职培训：

- 介绍产品原则
- 说明工程规范
- 传递团队文化

把这些信息提供给Agent，它的输出就会更符合团队预期。

---

## 为 Agent 可读性选技术

### 选择"无聊"的技术

成熟、稳定、没花哨新特性的老技术：

- **可组合性好**: API更简洁、更规范
- **API稳定**: 训练数据学到的用法不过时
- **训练数据多**: 大模型理解更深、犯错更少

### 反直觉：自己造轮子 > 黑盒库

引入第三方库 = Agent看不到内部实现

- 隐藏Bug、边界行为 → Agent没法修
- 自研简化版 = 白盒，完全透明
- Agent能看源码、写测试、理解逻辑、修改它

---

## 当AI光速写代码如何防止它造出屎山？

### 文档是"建议"，Agent需要的是"法律"

靠文档约束的困境：

- Agent看了文档、理解了，但它未必会遵守
- Agent会复制已有结构 → 错误模式被指数级放大

靠人类CodeReview维持秩序 → 不可扩展

### 核心原则：强制执行不变量，而不是微观管理实现

**不变量** = 死规定，不能商量
**实现** = Agent可自由选择

OpenAI规定：所有外部数据必须在边界处做Schema校验

- 这是**不变量**，是死规定，不能商量
- 但你用什么工具来校验？可以用不同的实现方式
- 这是**实现**，Agent可以自由选择

不是不管，而是只管那条不可逾越的底线。底线以上，你怎么跑都行。就像高速公路，正是因为有了护栏和车道线，你才敢踩油门。

### 刚性分层 · Providers入口 · Linter即Prompt

**固定分层**：代码只能"向前"依赖

```
Types → Config → Repo → DataAccess → Service → Runtime → UI
```

**横切关注点**：统一入口Providers

- 认证、日志、遥测、功能开关
- 每个模块都需要，但不属于任何一个模块
- 全部通过Providers单一接口进入

**精妙设计**：Linter不只报错，还是上下文注入

```
Linter报错: Service层不能引用UI模块
    ↓
自带修复指令: "请将共享逻辑移到Utils目录"
    ↓
Agent自我修复: 重构代码
    ↓
重跑Linter: 全绿 ✓
```

---

## 当自治阈值被跨越：Agent跑通完整开发闭环

### 智能体生成的范围和人类角色变化

Agent就像人类一样使用标准开发工具。

不仅是产品代码，它还生成：

- 产品代码和测试
- 内部开发者工具
- 评估框架
- 管理仓库的脚本
- CI配置与发布工具
- 文档与设计历史
- 代码审查意见与回复
- 生产环境监控面板

**工程师变成定义规范的"甲方"**

如果Agent卡壳，人类绝不下场逐行修代码。挣扎是一种报错信号，排查逻辑漏洞：

1. 排定系统的优先级
2. 将反馈翻译为明确验收标准验证成果
3. 设计护栏与工具

### 跨越自治阈值：端到端软件制造闭环

1. **验证状态** - 验证代码库的当前状态
2. **复现缺陷** - 复现已报告的缺陷
3. **录屏留证** - 录制展示故障的视频
4. **实施修复** - 修改代码进行修复
5. **运行验证** - 通过运行程序验证修复
6. **录制成果** - 录制第二个视频展示方案
7. **提交PR** - 提交拉取请求(Pull Request)
8. **回应反馈** - 回应代理和人工反馈
9. **修复构建** - 检测并修复构建失败
10. **合并变更** - 自动合并代码(仅需判断时呼叫人类)

### 极严苛的工程约束自治的底座

令人惊叹的高速自治，绝不能被简单地"复制粘贴"。它是用极高的基础设施门槛换来的。

**缺乏护栏的后果**：
单纯追求让大模型全自动写代码，只会加速制造导致系统崩溃的"数字垃圾"。

**自治的终极真理**：
高度自治≠撒手不管。越是高度自治，越离不开极度严密的工程设计与约束。

---

## 如何控制 Agent 的代码熵增?OpenAI的后台垃圾回收机制

### 随着吞吐量暴涨的"代码熵增"

Agent的本能是"复制"——它会模仿仓库中**已有代码的模式**。一旦某个角落出现了细微的技术债，这种"便宜的妥协"就会被Agent快速复制、放大。最终导致：系统结构逐渐失去连贯性。

### 如何应对技术债：设立原则与自动清理

**1. 机器可验证的"黄金原则"**

不再仅靠"约定"，而是把品味变成可强制执行的规则：

- **优先共享工具库**：关键逻辑集中管理，防Agent造多版本轮子
- **禁止YOLO式探测**：必须通过边界显式校验或强类型SDK访问外部数据

**2. 持续自动的"垃圾回收"**

规则是不够的，还需要后台Agent定期巡检与清除：

- 扫描偏离模式
- 生成小粒度重构PR
- 极速Review或自动合并

---

## Module-Specific Notes

### Telegram Modules

**Two API modes supported:**

| Mode               | Library                 | Use Case                                      |
| ------------------ | ----------------------- | --------------------------------------------- |
| **MTProto Client** | GramJS `TelegramClient` | Access full channel history, user perspective |
| **Bot API**        | `node-telegram-bot-api` | Respond to /commands, bot perspective         |

**Authentication:**

- MTProto: apiId + apiHash + session
- Bot API: Bot Token (from @BotFather)

### Whisper Module

- Spawns child process for whisper.cpp execution
- Progress reported via IPC 'log-update' events
- Supports multiple subtitle formats (srt, vtt, txt)

### ASMR Localization

- Handles login session management
- Playlist operations support pagination
- Works with custom HTTP client with retry logic

---

## Testing

Tests use Vitest:

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Run specific test file
npx vitest run src/test/specific-test.js
```

---

## Build Artifacts

Build output locations:

- Main process: `out/main/`
- Preload: `out/preload/`
- Renderer: `out/renderer/`
- Distribution packages: `dist/`

---

## Important File Locations

| File                         | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `src/main/index.js`          | Main process entry, window creation, IPC handlers |
| `src/main/modules/config.js` | Configuration management                          |
| `src/preload/index.js`       | IPC bridge between main and renderer              |
| `src/renderer/src/App.vue`   | Root Vue component, navigation                    |
| `electron.vite.config.js`    | Build configuration                               |
| `eslint.config.js`           | Linting rules                                     |
