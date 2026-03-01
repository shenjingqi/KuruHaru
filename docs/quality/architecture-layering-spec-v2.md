# KuruHaru 架构分层规范 v2.0

> 版本: 2.0  
> 生效日期: 2026-03-01  
> 适用范围: 主进程 (src/main/)

---

## 1. 架构总览

### 1.1 分层架构图

```
┌─────────────────────────────────────────────────────────┐
│  表现层 (Presentation)                                  │
│  ├── UI 层 (Vue 组件、Pinia Stores)                     │
│  └── 职责: 用户界面、状态管理、用户交互                  │
├─────────────────────────────────────────────────────────┤
│  应用层 (Application)                                   │
│  ├── Runtime 层 (应用生命周期、窗口管理)                  │
│  └── 职责: 应用入口、系统集成、IPC路由                   │
├─────────────────────────────────────────────────────────┤
│  领域层 (Domain)                                        │
│  ├── Service 层 (业务逻辑编排)                          │
│  │   ├── Orchestration (工作流编排: whisper, tg)         │
│  │   └── Coordination (业务协调: login, auth)            │
│  └── 职责: 业务规则、领域逻辑、业务流程                  │
├─────────────────────────────────────────────────────────┤
│  基础设施层 (Infrastructure)                             │
│  ├── DataAccess 层 (HTTP客户端、文件系统)                 │
│  ├── Utils 层 (日志、错误处理、重试)                      │
│  ├── Config 层 (配置管理、环境管理)                       │
│  └── Types 层 (类型定义、架构规则)                        │
└─────────────────────────────────────────────────────────┘

                    ↑
                    │  依赖方向: 只能向下依赖
                    │  (高层 → 低层)
                    ↓
```

### 1.2 分层职责定义

| 层级           | 职责                             | 不做什么           | 示例                             |
| -------------- | -------------------------------- | ------------------ | -------------------------------- |
| **UI**         | 展示界面、响应交互、管理组件状态 | 不直接调用 Service | Vue 组件、Pinia Stores           |
| **Runtime**    | 应用生命周期、窗口管理、IPC 路由 | 不包含业务逻辑     | index.js、preload                |
| **Service**    | 业务编排、流程控制、领域逻辑     | 不直接操作 IO      | whisper.js、tg-recent-activity   |
| **DataAccess** | HTTP 请求、文件操作、数据持久化  | 不包含业务规则     | httpClient.js、asmr-localization |
| **Utils**      | 日志、错误处理、重试、工具函数   | 不依赖业务逻辑     | logger.js、errorHandler.js       |
| **Config**     | 配置读取、环境管理、配置验证     | 不修改配置外的状态 | config.js                        |
| **Types**      | 类型定义、架构规则、运行时检查   | 不包含运行时逻辑   | types/index.js                   |

---

## 2. 依赖规则

### 2.1 依赖方向原则

```
✅ 允许: 高层 → 低层
❌ 禁止: 低层 → 高层
❌ 禁止: 同层之间直接依赖 (特殊情况除外)
```

### 2.2 允许的依赖关系

| 当前层     | 可依赖的层                                         | 说明                               |
| ---------- | -------------------------------------------------- | ---------------------------------- |
| UI         | Runtime, Service, DataAccess, Utils, Config, Types | UI 可以依赖所有下层                |
| Runtime    | Service, DataAccess, Utils, Config, Types          | Runtime 是入口，可依赖服务层       |
| Service    | DataAccess, Utils, Config, Types                   | Service 编排业务，依赖数据访问     |
| DataAccess | Utils, Config, Types                               | DataAccess 操作 IO，依赖工具和配置 |
| Utils      | Config, Types                                      | Utils 可以被所有层使用 (特殊规则)  |
| Config     | Types                                              | Config 是最接近底层的应用代码      |
| Types      | 无                                                 | Types 是最底层，不依赖任何层       |

### 2.3 特殊规则: Utils 层

**Utils 层可以被所有其他层使用**，这是唯一的例外规则。

原因:

- Utils 提供的是通用工具函数 (日志、错误处理、重试等)
- 这些功能是横切关注点，不是业务逻辑
- 强制其他层不依赖 Utils 会导致代码重复

**限制**: Utils 层只能依赖 Config 和 Types，不能依赖其他层。

---

## 3. 实现规范

### 3.1 模块模板

每个层级的模块应遵循相应的模板:

#### Service 层模块模板

```javascript
/**
 * @file 模块名称和简要描述
 * @module Service/模块名
 * @description 详细描述模块的职责和功能
 */

import { ipcMain } from "electron";
import { createLogSender } from "../utils/logger.js";
import { normalizeError } from "../utils/errorHandler.js";
import { withRetry } from "../utils/retry.js";

// 导入依赖的 DataAccess 层
import { someDataAccessFunction } from "./data-access-module.js";

// 导入 Config 层 (如果需要)
import { getConfig } from "./config.js";

// 导入 Types 层 (如果需要)
import { LAYER_SERVICE } from "../types/index.js";

// 创建日志实例
const logger = createLogSender("module-name");

/**
 * 处理器映射
 * @type {Object.<string, Function>}
 */
const HANDLERS = {
  "namespace:action1": handleAction1,
  "namespace:action2": handleAction2,
  // ...
};

/**
 * 设置 IPC 处理器
 * @export
 */
export function setupModuleIPC() {
  // 移除所有已有处理器
  Object.keys(HANDLERS).forEach((channel) => {
    try {
      ipcMain.removeHandler(channel);
    } catch (e) {
      // 处理器不存在，忽略
    }
  });

  // 注册新处理器
  Object.entries(HANDLERS).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });

  logger.info(`已注册 ${Object.keys(HANDLERS).length} 个 IPC 处理器`);
}

/**
 * 处理 action1
 * @private
 * @param {Event} event - IPC 事件
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>} 处理结果
 */
async function handleAction1(event, data) {
  try {
    logger.info("开始处理 action1:", data);

    // 业务逻辑
    const result = await someDataAccessFunction(data);

    logger.info("action1 处理完成");
    return result;
  } catch (error) {
    logger.error("action1 处理失败:", error);
    throw normalizeError(error, "ModuleName:handleAction1");
  }
}

/**
 * 处理 action2
 * @private
 * @param {Event} event - IPC 事件
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>} 处理结果
 */
async function handleAction2(event, data) {
  // 使用 withRetry 包装需要重试的操作
  return withRetry(
    async () => {
      // 业务逻辑
      return await someDataAccessFunction(data);
    },
    {
      maxAttempts: 3,
      onRetry: (error, attempt) => {
        logger.warn(`action2 第 ${attempt} 次重试`, error.message);
      },
    },
  );
}

// 导出业务逻辑函数供其他模块使用
export { someBusinessFunction } from "./internal-module.js";
```

#### DataAccess 层模块模板

```javascript
/**
 * @file 数据访问模块
 * @module DataAccess/模块名
 * @description 封装数据访问逻辑，包括 HTTP 请求、文件操作等
 */

import fs from "fs/promises"; // 使用异步 API
import path from "path";
import { createLogSender } from "../utils/logger.js";
import { normalizeError } from "../utils/errorHandler.js";
import { withRetry } from "../utils/retry.js";

const logger = createLogSender("data-access-module");

/**
 * 获取数据
 * @param {Object} params - 查询参数
 * @returns {Promise<Object>} 查询结果
 */
export async function fetchData(params) {
  try {
    logger.info("获取数据:", params);

    // 数据访问逻辑
    const data = await withRetry(
      async () => {
        // 实际的数据访问
        return await someIOOperation(params);
      },
      { maxAttempts: 3 },
    );

    logger.info("数据获取成功");
    return data;
  } catch (error) {
    logger.error("数据获取失败:", error);
    throw normalizeError(error, "DataAccess:fetchData");
  }
}

/**
 * 保存数据
 * @param {Object} data - 要保存的数据
 * @param {string} filePath - 文件路径
 * @returns {Promise<void>}
 */
export async function saveData(data, filePath) {
  try {
    logger.info("保存数据到:", filePath);

    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 写入文件 (使用异步 API)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    logger.info("数据保存成功");
  } catch (error) {
    logger.error("数据保存失败:", error);
    throw normalizeError(error, "DataAccess:saveData");
  }
}
```

---

## 4. 检查清单

### 4.1 代码审查清单

#### 架构合规性检查

- [ ] 模块只依赖其下层模块
- [ ] 没有循环依赖
- [ ] Utils 层可以被所有层使用
- [ ] 没有同层之间的直接依赖 (特殊情况除外)

#### 代码质量检查

- [ ] 所有函数都有 JSDoc 注释
- [ ] 错误处理使用 normalizeError
- [ ] 日志使用 createLogSender
- [ ] 异步操作使用 async/await
- [ ] 文件操作使用 fs/promises

#### 测试检查

- [ ] 所有公共函数都有单元测试
- [ ] 错误路径有测试覆盖
- [ ] 边界条件有测试
- [ ] 集成测试通过

### 4.2 CI/CD 检查

```yaml
# .github/workflows/architecture-check.yml
name: Architecture Compliance

on:
  pull_request:
    paths:
      - "src/main/**/*.js"

jobs:
  architecture-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check Dependency Direction
        run: |
          # 检查是否有低层依赖高层
          # 这个脚本需要根据实际情况编写
          node scripts/check-dependency-direction.js

      - name: Check Layer Compliance
        run: |
          # 检查各层是否符合规范
          node scripts/check-layer-compliance.js

      - name: Check Code Patterns
        run: |
          # 检查代码模式
          # 例如: 确保所有错误处理使用 normalizeError
          node scripts/check-code-patterns.js
```

---

## 5. 迁移路径

### 5.1 从旧架构迁移

#### 迁移策略

**渐进式迁移** (推荐):

1. 一次迁移一个模块
2. 每次迁移后进行测试
3. 保持向后兼容
4. 逐步淘汰旧代码

#### 迁移检查清单

对于每个要迁移的模块:

- [ ] 分析当前依赖关系
- [ ] 确定目标层
- [ ] 规划新的依赖关系
- [ ] 更新导入语句
- [ ] 重构代码以符合新规范
- [ ] 添加/更新测试
- [ ] 验证功能正常
- [ ] 更新文档

### 5.2 向后兼容性

#### 兼容策略

**版本控制**:

- 使用语义化版本控制
- 主要版本变更 = 破坏性变更
- 次要版本变更 = 向后兼容的新功能
- 补丁版本 = 向后兼容的修复

**弃用策略**:

```javascript
// 标记弃用的函数
/**
 * @deprecated 使用 newFunction 替代
 * @see {@link newFunction}
 */
export function oldFunction() {
  console.warn("Warning: oldFunction is deprecated. Use newFunction instead.");
  return newFunction();
}
```

---

## 6. 工具与资源

### 6.1 推荐工具

#### 代码分析

- **ESLint**: 代码规范检查
- **dependency-cruiser**: 依赖关系可视化
- **madge**: 循环依赖检测

#### 文档工具

- **JSDoc**: API 文档生成
- **TypeScript**: 类型检查 (渐进式采用)
- **Markdown**: 文档编写

#### 测试工具

- **Vitest**: 单元测试
- **Playwright**: 集成测试
- **c8**: 覆盖率检查

### 6.2 脚手架工具

#### 快速创建新模块

```javascript
// scripts/scaffold-module.js
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [moduleName, layer] = process.argv.slice(2);

if (!moduleName || !layer) {
  console.error('Usage: node scaffold-module.js <module-name> <layer>');
  console.error('Layers: service, data-access, utils, config');
  process.exit(1);
}

const templates = {
  service: `/**
 * @file ${moduleName}.js
 * @module Service/${moduleName}
 */

import { ipcMain } from 'electron';
import { createLogSender } from '../utils/logger.js';
import { normalizeError } from '../utils/errorHandler.js';

const logger = createLogSender('${moduleName}');

const HANDLERS = {
  '${moduleName}:action': handleAction,
};

export function setup${toPascalCase(moduleName)}IPC() {
  Object.keys(HANDLERS).forEach(channel => {
    try {
      ipcMain.removeHandler(channel);
    } catch (e) {}
  });

  Object.entries(HANDLERS).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });

  logger.info('IPC handlers registered');
}

async function handleAction(event, data) {
  try {
    logger.info('Processing action', data);
    // TODO: 实现业务逻辑
    return { success: true };
  } catch (error) {
    logger.error('Action failed', error);
    throw normalizeError(error, '${moduleName}:handleAction');
  }
}
`,
  // ... 其他层的模板
};

function toPascalCase(str) {
  return str.replace(/(?:^|-)(\w)/g, (_, c) => c.toUpperCase());
}

const template = templates[layer];
if (!template) {
  console.error(`Unknown layer: ${layer}`);
  process.exit(1);
}

const outputPath = path.join('src/main/modules', `${moduleName}.js`);
fs.writeFileSync(outputPath, template);
console.log(`Created: ${outputPath}`);
```

**使用**:

```bash
node scripts/scaffold-module.js my-new-module service
```

---

## 7. 最佳实践

### 7.1 代码组织

#### 文件结构

```
src/main/
├── modules/           # 业务模块 (Service + DataAccess)
│   ├── asmr-*.js    # ASMR 相关
│   ├── tg-*.js      # Telegram 相关
│   └── whisper.js   # Whisper 服务
├── utils/           # 工具函数 (Utils 层)
│   ├── logger.js    # 日志
│   ├── errorHandler.js  # 错误处理
│   └── retry.js     # 重试
├── types/           # 类型定义 (Types 层)
│   └── index.js     # 类型和架构规则
├── modules/
│   └── config.js    # 配置管理 (Config 层)
└── index.js         # 入口 (Runtime 层)
```

#### 命名规范

| 类型     | 命名规范         | 示例              |
| -------- | ---------------- | ----------------- |
| 模块文件 | kebab-case       | `my-module.js`    |
| 函数     | camelCase        | `myFunction()`    |
| 常量     | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 类       | PascalCase       | `MyClass`         |
| IPC 通道 | 命名空间:动作    | `service:action`  |

### 7.2 错误处理

#### 错误处理流程

```
发生错误
    ↓
捕获错误 (try-catch)
    ↓
标准化错误 (normalizeError)
    ↓
记录错误 (logger.error)
    ↓
抛出标准化错误 (throw)
    ↓
上层捕获 → 显示给用户
```

#### 错误处理最佳实践

1. **总是使用 normalizeError**

   ```javascript
   // ✅ 正确
   throw normalizeError(error, "Context:operation");

   // ❌ 错误
   throw error;
   throw new Error("message");
   ```

2. **在边界处处理错误**
   - IPC 处理器入口
   - 异步函数开始
   - 外部 API 调用

3. **不要吞掉错误**

   ```javascript
   // ❌ 错误 - 吞掉了错误
   try {
     await operation();
   } catch (e) {
     console.log("出错啦");
   }

   // ✅ 正确 - 记录并重新抛出
   try {
     await operation();
   } catch (error) {
     logger.error("操作失败", error);
     throw normalizeError(error, "Context:operation");
   }
   ```

### 7.3 日志记录

#### 日志级别使用规范

| 级别      | 使用场景     | 示例                    |
| --------- | ------------ | ----------------------- |
| **DEBUG** | 详细调试信息 | 变量值、执行路径        |
| **INFO**  | 正常流程事件 | 开始/完成任务、状态变化 |
| **WARN**  | 警告，可恢复 | 重试、降级、非预期输入  |
| **ERROR** | 错误，需处理 | 异常、失败、数据丢失    |

#### 日志最佳实践

1. **使用结构化日志**

   ```javascript
   // ✅ 正确
   logger.info("用户登录成功", {
     userId: user.id,
     timestamp: Date.now(),
   });

   // ❌ 错误
   logger.info(`用户 ${user.id} 登录成功`);
   ```

2. **在关键路径添加日志**
   - 入口和出口
   - 分支决策点
   - 错误发生点
   - 性能关键点

3. **避免敏感信息**

   ```javascript
   // ❌ 错误 - 记录了密码
   logger.info("用户登录", { username, password });

   // ✅ 正确 - 只记录用户名
   logger.info("用户登录", { username });
   ```

---

## 8. 附录

### 附录 A: 迁移检查清单

#### 迁移前

- [ ] 备份当前代码
- [ ] 创建功能分支
- [ ] 审查所有相关文档
- [ ] 准备回滚方案

#### 迁移中

- [ ] 按优先级逐步迁移
- [ ] 每个模块迁移后测试
- [ ] 记录问题和解决方案
- [ ] 保持与团队的沟通

#### 迁移后

- [ ] 全量测试
- [ ] 性能测试
- [ ] 更新文档
- [ ] 团队培训

### 附录 B: 常见问题

**Q: 如何处理循环依赖?**
A: 使用动态导入 (await import()) 或重构代码消除循环。

**Q: Utils 层可以依赖哪些层?**
A: Utils 只能依赖 Config 和 Types。

**Q: 如何处理跨多个层的复杂逻辑?**
A: 使用 Service 层编排，让 Service 层协调多个下层操作。

**Q: 测试时如何模拟依赖?**
A: 使用依赖注入模式，在测试时注入模拟对象。

### 附录 C: 参考资源

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [JavaScript Standard Style](https://standardjs.com/)

---

**文档维护者**: 架构团队  
**最后更新**: 2026-03-01  
**审查周期**: 每季度审查一次

**变更日志**:

- v2.0 (2026-03-01) - 初始版本，定义新的分层架构
