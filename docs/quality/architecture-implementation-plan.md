# 架构分层改进实施计划

> 文档版本: 1.0  
> 创建日期: 2026-03-01  
> 预计完成: 2周 (Sprint 1)

---

## 📋 执行概览

### Sprint 时间表

| 周次       | 日期     | 主题     | 关键产出            |
| ---------- | -------- | -------- | ------------------- |
| **Week 1** | Day 1-2  | 清理阶段 | PR #1: 删除冗余代码 |
|            | Day 3-4  | 统一阶段 | PR #2: 统一实现模式 |
|            | Day 5    | 审查     | Code Review, 合并   |
| **Week 2** | Day 6-8  | 优化阶段 | PR #3: 架构增强     |
|            | Day 9-10 | 完善阶段 | PR #4: 监控与文档   |

---

## 🚀 Phase 1: 清理阶段 (Day 1-2)

### 目标

消除最严重的技术债务，为后续改进奠定基础

### 任务清单

#### Task 1.1: 删除备份文件

**优先级**: P0 | **预计时间**: 5分钟 | **负责人**: 任意开发者

**步骤**:

```bash
# 1. 确认文件存在
ls -la src/main/modules/tg-recent-activity.js.bak

# 2. 删除文件
git rm src/main/modules/tg-recent-activity.js.bak

# 3. 提交
git commit -m "chore: remove backup file

删除不应该进入版本控制的备份文件

Relates to #<issue-number>"
```

**验证**:

```bash
# 确认已删除
find . -name "*.bak" -type f
# 应该无输出
```

**回滚方案**:

```bash
# 如果需要恢复
git show <commit-hash>:src/main/modules/tg-recent-activity.js.bak > src/main/modules/tg-recent-activity.js.bak
```

---

#### Task 1.2: 合并 asmr-login.js 到 asmr-localization.js

**优先级**: P1 | **预计时间**: 30分钟 | **负责人**: 熟悉 ASMR 模块的开发者

**前置条件**:

- [ ] 已阅读 asmr-login.js 全部代码
- [ ] 已阅读 asmr-localization.js 中的登录相关代码
- [ ] 理解 IPC 处理器注册机制

**步骤**:

**Step 1: 分析需要合并的功能** (5分钟)

```bash
# 查看 asmr-login.js 导出的功能
grep -n "export" src/main/modules/asmr-login.js

# 查看当前 asmr-localization.js 已有的登录功能
grep -n "login\|Login" src/main/modules/asmr-localization.js
```

**Step 2: 在 asmr-localization.js 中添加合并的代码** (15分钟)

在 `src/main/modules/asmr-localization.js` 中添加:

```javascript
// 在文件顶部导入区域添加
// ... 现有导入 ...

// 从 asmr-login.js 合并的功能
// 注意: 以下函数是从 asmr-login.js 合并的

/**
 * ASMR 登录
 * @param {Object} credentials - 登录凭据
 * @param {string} credentials.username - 用户名
 * @param {string} credentials.password - 密码
 * @returns {Promise<Object>} 登录结果
 */
async function loginAsmr(credentials) {
  // 从 asmr-login.js 复制实现
  // ... 具体实现 ...
}

/**
 * 检查 ASMR 登录状态
 * @returns {Promise<Object>} 登录状态
 */
async function checkAsmrLoginStatus() {
  // 从 asmr-login.js 复制实现
  // ... 具体实现 ...
}

/**
 * ASMR 登出
 * @returns {Promise<void>}
 */
async function logoutAsmr() {
  // 从 asmr-login.js 复制实现
  // ... 具体实现 ...
}

// 在 setupAsmrIPC 函数中添加处理器注册
export function setupAsmrIPC() {
  // ... 现有的处理器注册 ...

  // 添加从 asmr-login.js 合并的处理器
  ipcMain.handle("asmr:login", async (event, credentials) => {
    return await loginAsmr(credentials);
  });

  ipcMain.handle("asmr:checkLoginStatus", async () => {
    return await checkAsmrLoginStatus();
  });

  ipcMain.handle("asmr:logout", async () => {
    return await logoutAsmr();
  });
}
```

**Step 3: 删除 asmr-login.js** (5分钟)

```bash
# 1. 确认所有功能已合并
# 2. 删除文件
git rm src/main/modules/asmr-login.js

# 3. 检查是否还有其他地方引用了 asmr-login.js
grep -r "asmr-login" src/ --include="*.js"
# 应该无输出或只显示已删除的文件
```

**Step 4: 测试** (5分钟)

```bash
# 1. 启动应用
npm run dev

# 2. 测试 ASMR 登录功能
# 3. 检查控制台是否有错误
# 4. 测试登录、检查状态、登出功能
```

**验证清单**:

- [ ] asmr-login.js 已删除
- [ ] 登录功能正常工作
- [ ] 没有运行时错误
- [ ] IPC 处理器正确注册

**回滚方案**:

```bash
# 如果出现问题，从 git 恢复
git checkout HEAD -- src/main/modules/asmr-login.js
# 然后恢复 asmr-localization.js 的修改
git checkout HEAD -- src/main/modules/asmr-localization.js
```

---

## 🔄 Phase 2: 统一阶段 (Day 3-4)

### 目标

统一实现模式，消除不一致

### 任务清单

#### Task 2.1: 统一日志工具

**优先级**: P0 | **预计时间**: 30分钟

**步骤**:

**Step 1: 修改 utils.js** (10分钟)

```javascript
// src/main/utils.js
// ... 保持其他代码不变 ...

// 删除原有的 createLogSender 实现 (删除行 109-145)
// 改为重新导出
export { createLogSender } from "./logger.js";
```

**Step 2: 修改 telegram-login.js** (15分钟)

```javascript
// src/main/utils/telegram-login.js

// 在文件顶部导入
import { createLogSender } from "./logger.js";

// 删除原有的内联日志对象 (删除行 14-27)
// 改为使用标准日志
const logger = createLogSender("telegram-login");

// 将文件中所有的 console.log 改为 logger.info
// 将 console.error 改为 logger.error
// 等等...
```

**Step 3: 验证** (5分钟)

```bash
# 1. 运行测试
npm test

# 2. 启动应用
npm run dev

# 3. 检查日志输出格式是否统一
# 应该看到: [模块名] message
```

---

#### Task 2.2: 统一 IPC 处理器注册模式

**优先级**: P1 | **预计时间**: 40分钟

**标准模式**:

```javascript
// src/main/modules/模块名.js

import { ipcMain } from "electron";

/**
 * 设置 IPC 处理器
 * 使用统一模式：定义-移除-注册
 */
export function setupXXXIPC() {
  // Step 1: 定义处理器映射
  const handlers = {
    "channel:action1": handleAction1,
    "channel:action2": handleAction2,
    // ...
  };

  // Step 2: 安全移除所有已有处理器
  Object.keys(handlers).forEach((channel) => {
    try {
      ipcMain.removeHandler(channel);
    } catch (e) {
      // 处理器不存在，忽略错误
    }
  });

  // Step 3: 注册新处理器
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });

  console.log(`[IPC] 已注册 ${Object.keys(handlers).length} 个处理器`);
}

// 处理器函数实现
async function handleAction1(event, data) {
  // 实现...
}

async function handleAction2(event, data) {
  // 实现...
}
```

**需要修改的模块**:

1. `whisper.js` - 更新 IPC 注册模式
2. `tg-recent-activity.js` - 如果存在不一致的模式
3. 其他模块 - 检查并统一

---

## 🔧 Phase 3: 优化阶段 (Week 2)

### 3.1 配置缓存优化

**当前问题**: `getConfig()` 每次调用都读取文件

**优化方案**:

```javascript
// src/main/modules/config.js

let configCache = null;
let configCacheTime = 0;
const CACHE_TTL = 5000; // 5秒缓存

export async function getConfig() {
  const now = Date.now();

  // 检查缓存是否有效
  if (configCache && now - configCacheTime < CACHE_TTL) {
    return configCache;
  }

  // 原有读取逻辑...
  // ... 读取并合并配置 ...

  // 更新缓存
  configCache = mergedConfig;
  configCacheTime = now;

  return mergedConfig;
}

export async function saveConfig(newConfig) {
  // 清除缓存，强制下次重新读取
  configCache = null;

  // 原有保存逻辑...
}
```

### 3.2 架构运行时检查

**增强 types/index.js**:

```javascript
// src/main/types/index.js

// ... 现有的 LAYER 定义 ...

/**
 * 开发模式依赖检查
 * 在开发环境下自动检查依赖方向是否正确
 */
export function checkLayerDependency(moduleName, currentLayer, dependencies) {
  // 只在开发环境检查
  if (process.env.NODE_ENV !== "development") return;

  const allowed = ALLOWED_DEPENDENCIES[currentLayer] || [];

  // 检查每个依赖是否允许
  const invalid = dependencies.filter((dep) => {
    // utils 层可以被所有层使用
    if (dep === "utils") return false;
    // 检查是否在允许列表中
    return !allowed.includes(dep);
  });

  if (invalid.length > 0) {
    console.warn(
      `\n[架构检查] ⚠️  ${moduleName}\n` +
        `  当前层: ${currentLayer}\n` +
        `  违规依赖: ${invalid.join(", ")}\n` +
        `  允许依赖: ${allowed.join(", ") || "无"}\n`,
    );
  }
}

/**
 * 模块装饰器 - 自动检查依赖
 * 使用方法:
 *
 *   import { withLayerCheck, LAYER_SERVICE } from '../types/index.js';
 *
 *   class MyModule {
 *     @withLayerCheck(LAYER_SERVICE, ['logger', 'config'])
 *     setup() {
 *       // ...
 *     }
 *   }
 */
export function withLayerCheck(layer, dependencies) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args) {
      // 检查依赖
      checkLayerDependency(
        `${target.constructor.name}.${propertyKey}`,
        layer,
        dependencies,
      );

      // 执行原方法
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
```

### 3.3 统一错误处理模式

**创建错误处理规范**:

```javascript
// src/main/utils/errorHandler.js

/**
 * 标准化错误对象
 * 将各种错误类型转换为统一格式
 *
 * @param {Error|Object|string} error - 原始错误
 * @param {string} context - 错误发生的上下文（模块:操作）
 * @returns {StandardizedError}
 */
export function normalizeError(error, context = "") {
  // 如果已经是标准化错误，直接返回
  if (error.isStandardized) {
    return error;
  }

  const standardized = {
    isStandardized: true,
    context,
    timestamp: new Date().toISOString(),
  };

  // 处理不同类型的错误
  if (error instanceof Error) {
    standardized.message = error.message;
    standardized.stack = error.stack;
    standardized.name = error.name;
    standardized.code = error.code || "UNKNOWN_ERROR";
  } else if (typeof error === "string") {
    standardized.message = error;
    standardized.code = "STRING_ERROR";
  } else if (typeof error === "object") {
    standardized.message = error.message || "Unknown error";
    standardized.code = error.code || "OBJECT_ERROR";
    standardized.details = error;
  } else {
    standardized.message = "Unknown error";
    standardized.code = "UNKNOWN_ERROR";
  }

  return standardized;
}

/**
 * 错误分类
 * 根据错误代码或消息自动分类错误
 *
 * @param {StandardizedError} error
 * @returns {string} 错误类别
 */
export function categorizeError(error) {
  const code = error.code || "";
  const message = error.message || "";

  // 网络错误
  if (
    code.includes("NETWORK") ||
    code.includes("TIMEOUT") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return "NETWORK_ERROR";
  }

  // 认证错误
  if (
    code.includes("AUTH") ||
    code.includes("LOGIN") ||
    message.includes("authentication") ||
    message.includes("unauthorized")
  ) {
    return "AUTH_ERROR";
  }

  // 文件系统错误
  if (
    code.includes("FILE") ||
    code.includes("PATH") ||
    message.includes("ENOENT") ||
    message.includes("EACCES")
  ) {
    return "FILESYSTEM_ERROR";
  }

  // 配置错误
  if (code.includes("CONFIG") || code.includes("VALIDATION")) {
    return "CONFIG_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * 获取用户友好的错误消息
 *
 * @param {StandardizedError} error
 * @returns {string} 用户友好的消息
 */
export function getUserFriendlyMessage(error) {
  const category = categorizeError(error);

  const messages = {
    NETWORK_ERROR: "网络连接失败，请检查网络设置后重试",
    AUTH_ERROR: "登录状态已过期，请重新登录",
    FILESYSTEM_ERROR: "文件操作失败，请检查文件权限",
    CONFIG_ERROR: "配置错误，请检查设置",
    UNKNOWN_ERROR: "操作失败，请稍后重试",
  };

  return messages[category] || messages["UNKNOWN_ERROR"];
}

/**
 * 错误处理包装器
 * 用于统一包装异步函数的错误处理
 *
 * @param {Function} fn - 要包装的函数
 * @param {string} context - 上下文
 * @returns {Function} 包装后的函数
 */
export function withErrorHandling(fn, context) {
  return async function (...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      const standardized = normalizeError(error, context);

      // 记录错误
      console.error(`[${context}] Error:`, standardized);

      // 重新抛出标准化错误
      throw standardized;
    }
  };
}

/**
 * 创建错误工厂
 * 用于创建特定类型的错误
 *
 * @param {string} type - 错误类型
 * @returns {Function} 错误创建函数
 */
export function createErrorFactory(type) {
  return function (message, code, details) {
    const error = new Error(message);
    error.name = type;
    error.code = code || `${type}_ERROR`;
    error.details = details;
    error.isCustom = true;
    return error;
  };
}

// 预定义的错误工厂
export const createNetworkError = createErrorFactory("NetworkError");
export const createAuthError = createErrorFactory("AuthError");
export const createValidationError = createErrorFactory("ValidationError");
export const createFileSystemError = createErrorFactory("FileSystemError");

// 使用示例
// throw createNetworkError('连接超时', 'NETWORK_TIMEOUT', { url: '...' });
```

---

## 📚 使用规范

### 模块中的错误处理模式

```javascript
// 推荐模式
import { normalizeError, withErrorHandling } from "../utils/errorHandler.js";

// 模式 1: 使用包装器 (推荐用于整个函数)
export const riskyOperation = withErrorHandling(async function riskyOperation(
  data,
) {
  // 业务逻辑
  const result = await someAsyncWork(data);
  return result;
}, "ModuleName:operationName");

// 模式 2: 手动错误处理 (推荐用于需要自定义处理的场景)
async function anotherOperation() {
  try {
    const result = await something();
    return result;
  } catch (error) {
    // 可以在这里添加自定义处理
    console.log("特定处理...");

    // 然后标准化并抛出
    throw normalizeError(error, "ModuleName:anotherOperation");
  }
}
```

---

## ✅ 验收标准

### 功能验收

- [ ] 所有现有功能正常工作
- [ ] 新的错误处理模式可以正常工作
- [ ] 标准化错误包含所需的所有字段
- [ ] 用户友好的错误消息显示正确

### 代码验收

- [ ] 所有模块使用统一的错误处理模式
- [ ] 没有直接使用 `throw new Error()` (除非必要)
- [ ] 所有异步函数都有适当的错误处理
- [ ] 代码审查通过

### 测试验收

- [ ] 单元测试覆盖新的错误处理工具
- [ ] 集成测试验证错误处理流程
- [ ] 手动测试验证用户界面错误显示

---

## 📝 文档更新

### 需要更新的文档

1. **AGENTS.md** - 添加架构分层改进说明
2. **docs/design-docs/architecture-design.md** - 更新架构图
3. **docs/quality/technical-debt.md** - 标记已修复的债务
4. **CHANGELOG.md** - 记录架构改进

### 文档模板

```markdown
## 架构改进记录

### 改进内容

- [描述改进内容]

### 影响范围

- [列出受影响的模块]

### 迁移指南

1. [步骤1]
2. [步骤2]

### 回滚方案

[如果需要回滚的步骤]
```

---

## 🎯 下一步行动

### 立即执行 (今天)

1. **创建功能分支**

   ```bash
   git checkout -b refactor/architecture-layer-improvement
   ```

2. **设置开发环境**
   - 确保所有测试通过
   - 备份当前数据库/配置

3. **开始第一个任务**
   - 从 Task 1.1 (删除备份文件) 开始
   - 提交第一个 commit

### 本周目标

- [ ] 完成 Phase 1: 清理阶段
- [ ] 完成 Phase 2: 统一阶段
- [ ] 所有 PR 通过 Code Review
- [ ] 合并到主分支

### 成功指标

- 代码重复率 < 1%
- 架构一致性 > 95%
- 所有测试通过
- 零回归缺陷

---

## 📞 支持与资源

### 问题升级路径

1. **技术问题** → 在 PR 中评论 @技术负责人
2. **架构问题** → 在 #architecture 频道讨论
3. **阻塞问题** → 立即联系技术主管

### 相关资源

- [架构决策记录](../../design-docs/architecture-decisions.md)
- [技术债务清单](../technical-debt.md)
- [模块文档](../../design-docs/module-index.md)
- [API 文档](../../api/README.md)

---

**准备开始？** 执行第一步：创建分支并开始 Task 1.1！
