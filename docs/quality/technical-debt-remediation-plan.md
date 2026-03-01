# 技术债务修复方案

> 生成时间: 2026-03-01
> 基于: technical-debt.md + AGENTS.md + 代码库分析

---

## 📊 执行摘要

### 当前债务状态

| 类别           | 严重  | 中等  | 低    | 总计   |
| -------------- | ----- | ----- | ----- | ------ |
| **代码重复**   | 1     | 2     | 0     | 3      |
| **未使用代码** | 1     | 0     | 0     | 1      |
| **文档格式**   | 2     | 1     | 2     | 5      |
| **架构违规**   | 0     | 1     | 2     | 3      |
| **总计**       | **4** | **5** | **4** | **13** |

### 修复时间表

| 阶段     | 时间    | 任务数 | 预期收益         |
| -------- | ------- | ------ | ---------------- |
| 紧急修复 | 第1周   | 4      | 消除80%严重问题  |
| 高优先级 | 第2周   | 5      | 提升代码可维护性 |
| 中优先级 | 第3-4周 | 4      | 完善架构一致性   |

---

## 🔴 阶段一: 紧急修复 (第1周)

### 任务 1.1: 删除备份文件

**优先级**: P0 | **预计时间**: 5分钟

**问题**: `src/main/modules/tg-recent-activity.js.bak` 不应该存在于代码库中

**操作步骤**:

```bash
# 1. 删除文件
git rm src/main/modules/tg-recent-activity.js.bak

# 2. 提交更改
git commit -m "chore: remove backup file

删除不应该进入版本控制的备份文件
Relates to technical debt cleanup"
```

**验证**:

```bash
# 确认文件已删除
ls src/main/modules/*.bak
# 应该无输出
```

---

### 任务 1.2: 修复 technical-debt.md 表格格式

**优先级**: P0 | **预计时间**: 15分钟

**问题**: 两个表格格式混乱，数据列对齐错误

**修复内容 1 - T1 改进优先级表格** (第 85-90 行):

将:

```markdown
### T1 改进优先级（进行中）

| 优先级  | 改进项              | 当前分数 | 目标分数 | 状态      |
| ------- | ------------------- | -------- | -------- | --------- |
| ✅ T1-1 | **UI 组件风格统一** | 70       | 80+      | ✅ 已完成 |
```

改为:

```markdown
### T1 改进优先级（进行中）

| 优先级  | 改进项              | 当前分数 | 目标分数 | 状态      |
| ------- | ------------------- | -------- | -------- | --------- |
| ✅ T1-1 | **UI 组件风格统一** | 70       | 80+      | ✅ 已完成 |
| ✅ T1-2 | **模块文档完善**    | 65       | 80+      | ✅ 已完成 |
| ✅ T1-3 | **IPC 命名优化**    | 75       | 85+      | ✅ 已完成 |
```

**修复内容 2 - 已完成的改进表格** (第 96-112 行):

将混乱的多行表格改为:

```markdown
## 已完成的改进

| 改进项                  | 状态      | 日期       |
| ----------------------- | --------- | ---------- |
| 向前依赖架构            | ✅ 已完成 | 2026-02-26 |
| HTTP 统一代理           | ✅ 已完成 | 2026-02-26 |
| 业务边界划分            | ✅ 已完成 | 2026-02-26 |
| 文档真相源              | ✅ 已完成 | 2026-02-26 |
| 决策日志                | ✅ 已完成 | 2026-02-26 |
| 单元测试覆盖            | ✅ 已完成 | 2026-02-27 |
| httpClient interceptors | ✅ 已完成 | 2026-02-27 |
| 错误处理统一            | ✅ 已完成 | 2026-02-27 |
| UI 组件风格统一         | ✅ 已完成 | 2026-02-27 |
| 模块文档完善            | ✅ 已完成 | 2026-02-27 |
| IPC 命名优化            | ✅ 已完成 | 2026-02-27 |
```

---

### 任务 1.3: 修复 AGENTS.md 重复内容

**优先级**: P0 | **预计时间**: 5分钟

**问题**: 第 188-191 行重复了扩展阅读部分，且不完整

**操作**: 删除以下行:

```markdown
- 项目架构详解: `docs/ARCHITECTURE.md`
- 质量评分: `docs/quality/README.md`
- 开发流程: `docs/development-workflow.md`
- Agent Vision: `docs/agent-vision-solution.md`
```

---

### 任务 1.4: 统一日志工具

**优先级**: P0 | **预计时间**: 30分钟

**问题**: 三个文件都实现了 `createLogSender`，造成代码重复

#### 步骤 1: 修改 `src/main/utils.js`

**操作**: 删除原有的 `createLogSender` 实现，改为重新导出

```javascript
// src/main/utils.js
// ... 其他代码保持不变 ...

// 删除原有的 createLogSender 函数 (行 109-145)
// 改为从 logger.js 重新导出
export { createLogSender } from "./logger.js";
```

#### 步骤 2: 修改 `src/main/utils/telegram-login.js`

**操作**: 删除内联日志对象，使用标准日志工具

```javascript
// src/main/utils/telegram-login.js
// ... 文件开头的导入 ...

// 删除原有的内联日志对象 (行 14-27)
// 改为:
import { createLogSender } from "./logger.js";
const logger = createLogSender("telegram-login");

// ... 其余代码保持不变，将所有 console.log 改为 logger.info ...
```

#### 验证步骤

```bash
# 1. 确保项目可以正常启动
npm run dev

# 2. 检查日志输出是否正常
# 应该看到格式统一的日志: [telegram-login] message

# 3. 运行测试确保没有破坏功能
npm test
```

---

## 🟠 阶段二: 高优先级修复 (第2周)

### 任务 2.1: 修复 IPC 处理器重复注册问题

**优先级**: P1 | **预计时间**: 20分钟

**问题**: 不同模块对 IPC 处理器移除的处理不一致

**修复** `src/main/modules/whisper.js`:

```javascript
export function setupWhisperIPC() {
  // 统一使用数组管理处理器，便于维护
  const handlers = [
    { channel: "whisper:startTask", handler: handleStartTask },
    { channel: "whisper:stopTask", handler: handleStopTask },
  ];

  // 移除所有处理器（静默处理不存在的处理器）
  handlers.forEach(({ channel }) => {
    try {
      ipcMain.removeHandler(channel);
    } catch (e) {
      // 处理器不存在，忽略
    }
  });

  // 注册处理器
  handlers.forEach(({ channel, handler }) => {
    ipcMain.handle(channel, handler);
  });
}
```

---

### 任务 2.2: 处理未使用的 asmr-login.js

**优先级**: P1 | **预计时间**: 30分钟

**问题**: `src/main/modules/asmr-login.js` 的 `setupAsmrIPCHandlers()` 从未被调用

**推荐方案 A** - 合并到 asmr-localization.js:

**步骤 1**: 修改 `src/main/modules/asmr-localization.js`

```javascript
// 在文件顶部添加导入
import { loginAsmr, checkAsmrLoginStatus, logoutAsmr } from "./asmr-login.js";

// 在 setupAsmrIPC 函数中添加处理器注册
export function setupAsmrIPC() {
  // ... 现有处理器注册 ...

  // 添加登录相关处理器
  ipcMain.handle("asmr:login", handleLogin);
  ipcMain.handle("asmr:checkLoginStatus", handleCheckLoginStatus);
  ipcMain.handle("asmr:logout", handleLogout);
}

// 添加处理函数
async function handleLogin(event, credentials) {
  return await loginAsmr(credentials);
}

async function handleCheckLoginStatus() {
  return await checkAsmrLoginStatus();
}

async function handleLogout() {
  return await logoutAsmr();
}
```

**步骤 2**: 删除 `src/main/modules/asmr-login.js`

```bash
git rm src/main/modules/asmr-login.js
git commit -m "refactor: merge asmr-login into asmr-localization

消除未使用的模块，统一登录功能到 asmr-localization"
```

---

## 🟡 阶段三: 中优先级优化 (第3-4周)

### 任务 3.1: 配置读取缓存优化

**优先级**: P2 | **预计时间**: 20分钟

**修复** `src/main/modules/config.js`:

```javascript
// 在文件顶部添加缓存变量
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
  // ... 合并配置的逻辑 ...

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

---

### 任务 3.2: 统一错误处理

**优先级**: P2 | **预计时间**: 40分钟

**统一模式** - 应用于所有模块:

```javascript
import { normalizeError } from "../utils/errorHandler.js";

async function someOperation() {
  try {
    // 执行操作
    const result = await riskyOperation();
    return result;
  } catch (error) {
    // 统一使用 normalizeError
    throw normalizeError(error, "模块名:操作名");
  }
}
```

**检查清单**:

- [ ] `asmr-login.js` (如果保留)
- [ ] `telegram-login.js`
- [ ] `tg-recent-activity.js`
- [ ] `asmr-localization.js`
- [ ] `whisper.js`

---

### 任务 3.3: 类型层运行时检查

**优先级**: P2 | **预计时间**: 30分钟

**增强** `src/main/types/index.js`:

```javascript
export const LayerDependencies = {
  Types: [],
  Config: ["Types"],
  Repo: ["Types", "Config"],
  DataAccess: ["Types", "Config"],
  Service: ["Types", "Config", "DataAccess"],
  Runtime: ["Types", "Config", "Repo", "DataAccess", "Service"],
  UI: ["Types", "Config", "Repo", "DataAccess", "Service", "Runtime"],
};

/**
 * 开发模式依赖检查
 * @param {string} moduleName - 模块名称
 * @param {string} currentLayer - 当前层级
 * @param {string[]} dependencies - 实际依赖列表
 */
export function checkLayerDependency(moduleName, currentLayer, dependencies) {
  if (process.env.NODE_ENV !== "development") return;

  const allowed = LayerDependencies[currentLayer] || [];
  const invalid = dependencies.filter(
    (dep) => !allowed.includes(dep) && dep !== "Utils", // Utils 层允许被所有层使用
  );

  if (invalid.length > 0) {
    console.warn(
      `[架构检查] ${moduleName} (层: ${currentLayer}) ` +
        `依赖了不允许的层: ${invalid.join(", ")}`,
    );
  }
}

/**
 * 模块装饰器 - 自动检查依赖
 * @param {string} layer - 所属层级
 * @param {string[]} deps - 依赖列表
 */
export function withLayerCheck(layer, deps) {
  return function (target, propertyKey, descriptor) {
    if (process.env.NODE_ENV === "development") {
      checkLayerDependency(target.name || propertyKey, layer, deps);
    }
    return descriptor;
  };
}
```

---

## 📈 预期收益

完成所有修复后:

| 指标         | 当前 | 预期      |
| ------------ | ---- | --------- |
| 代码重复     | 3处  | 0处       |
| 备份文件     | 1个  | 0个       |
| 未使用模块   | 1个  | 0个       |
| 文档格式错误 | 2处  | 0处       |
| 架构一致性   | 95%  | 98%       |
| 测试覆盖率   | 20个 | 保持+新增 |

---

## ✅ 快速开始 (选择你的路径)

### 路径 A: 30分钟快速修复

只修复最紧急的问题:

1. 删除备份文件 (5分钟)
2. 修复 technical-debt.md 表格 (15分钟)
3. 删除 AGENTS.md 重复内容 (5分钟)
4. 提交 (5分钟)

### 路径 B: 2小时标准修复

完成所有 P0-P1 修复:

1. 所有 P0 修复 (30分钟)
2. 统一日志工具 (30分钟)
3. 修复 IPC 处理器模式 (20分钟)
4. 处理 asmr-login.js (30分钟)
5. 测试验证 (10分钟)

### 路径 C: 完整修复计划

按时间表完成所有阶段 (4周)

---

需要我为你生成具体的代码修改 patch 吗？或者你想从哪个路径开始？
