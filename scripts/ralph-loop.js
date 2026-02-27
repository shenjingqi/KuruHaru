#!/usr/bin/env node

/**
 * RalphWiggum Loop - Self-Correcting Development Loop
 *
 * 自动化开发循环：编码 → 验证 → 修复 → 重试
 *
 * 集成 Agent 视觉系统:
 *   - 任务隔离日志
 *   - CDP 连接 (可选)
 *   - DOM 快照 (可选)
 *
 * 使用方法:
 *   node scripts/ralph-loop.js "你的任务描述"
 *   node scripts/ralph-loop.js "你的任务描述" --with-vision  # 启用视觉系统
 *
 * 环境变量:
 *   RALPH_MAX_RETRIES=3    最大重试次数 (默认 3)
 *   RALPH_AUTO_FIX=true    自动尝试修复 (默认 true)
 *   CDP_PORT=9222          CDP 端口 (默认 9222)
 *   TASK_ID=xxx            指定任务 ID
 */

import { execSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  createWriteStream,
} from "fs";
import { join } from "path";

const MAX_RETRIES = parseInt(process.env.RALPH_MAX_RETRIES || "3");
const AUTO_FIX = process.env.RALPH_AUTO_FIX !== "false";
const USE_VISION = process.argv.includes("--with-vision");
const CDP_PORT = parseInt(process.env.CDP_PORT || "9222");

// 任务 ID
const TASK_ID =
  process.env.TASK_ID ||
  `ralph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// 日志流
let taskLogStream = null;

/**
 * 初始化任务日志
 */
function initTaskLog() {
  const logDir = join(process.cwd(), "logs", "tasks");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logPath = join(logDir, `${TASK_ID}.log`);
  taskLogStream = createWriteStream(logPath, { flags: "a", encoding: "utf8" });

  return logPath;
}

/**
 * 写入任务日志
 */
function taskLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    taskId: TASK_ID,
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (taskLogStream) {
    taskLogStream.write(line + "\n");
  }

  // 同时输出到控制台
  const color =
    level === "error"
      ? COLORS.red
      : level === "warn"
        ? COLORS.yellow
        : level === "info"
          ? COLORS.cyan
          : COLORS.reset;

  console.log(`${color}[${TASK_ID}] ${message}${COLORS.reset}`);
}

function log(color, msg) {
  console.log(`${color}${msg}${COLORS.reset}`);
}

function run(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      encoding: "utf8",
      stdio: "pipe",
      ...options,
    });
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || error.message,
      code: error.status,
    };
  }
}

/**
 * 捕获 DOM 快照（如果可用）
 */
async function captureVisionSnapshot(phase) {
  if (!USE_VISION) return null;

  try {
    // 尝试连接 CDP
    const net = await import("net");

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on("connect", () => {
        socket.destroy();
        taskLog("info", `CDP 连接成功 (${phase})`, { port: CDP_PORT });
        resolve({ connected: true, port: CDP_PORT });
      });

      socket.on("timeout", () => {
        socket.destroy();
        taskLog("warn", `CDP 不可用 (${phase})`, { port: CDP_PORT });
        resolve(null);
      });

      socket.on("error", () => {
        resolve(null);
      });

      socket.connect(CDP_PORT, "localhost");
    });
  } catch (err) {
    taskLog("warn", `CDP 检查失败: ${err.message}`);
    return null;
  }
}

/**
 * 记录失败到设计决策文档
 */
function recordFailure(task, attempt, error) {
  const decisionFile = join(
    process.cwd(),
    "docs",
    "design-docs",
    "design-decisions.md",
  );

  if (!existsSync(decisionFile)) {
    return;
  }

  try {
    const content = readFileSync(decisionFile, "utf8");
    const failureEntry = `
### 失败记录: ${task}

- **任务 ID**: ${TASK_ID}
- **失败时间**: ${new Date().toISOString()}
- **尝试次数**: ${attempt}
- **错误类型**: ${error}
- **建议**: 检查代码并修复后重试
`;

    // 在最后一个 ## 标题后插入
    const newContent = content.replace(/(## \w+.*?\n)/, `$1${failureEntry}\n`);

    writeFileSync(decisionFile, newContent);
    taskLog("info", "已记录失败到 design-decisions.md");
  } catch (_e) {
    // 忽略记录错误
    // 忽略记录错误
  }
}

async function ralphLoop(task) {
  // 初始化任务日志
  const logPath = initTaskLog();
  taskLog("info", "RalphWiggum Loop 开始", { task, logPath });

  log(COLORS.cyan, `\n🤖 RalphWiggum Loop 开始 [${TASK_ID}]`);
  log(COLORS.blue, `📝 任务: ${task}`);
  if (USE_VISION) {
    log(COLORS.magenta, `👁️ 视觉系统: 启用`);
  }
  log(COLORS.blue, `📄 日志: ${logPath}\n`);

  let attempt = 0;
  let lastError = null;

  // 初始快照
  await captureVisionSnapshot("start");

  while (attempt < MAX_RETRIES) {
    attempt++;
    taskLog("info", `开始第 ${attempt}/${MAX_RETRIES} 次尝试`);
    log(COLORS.yellow, `--- 第 ${attempt}/${MAX_RETRIES} 次尝试 ---`);

    // 1. 运行 lint
    log(COLORS.blue, `🔍 运行 ESLint...`);
    taskLog("info", "运行 npm run lint");
    const lintStart = Date.now();
    const lintResult = run("npm run lint");
    const lintDuration = Date.now() - lintStart;

    if (!lintResult.success) {
      const errorCount = (lintResult.output.match(/✖ \d+ (error|problems)/) || [
        "",
      ])[0];
      lastError = `Lint failed: ${errorCount}`;
      taskLog("error", lastError, {
        duration: lintDuration,
        output: lintResult.output,
      });
      log(COLORS.red, `❌ Lint 失败: ${errorCount}`);

      if (AUTO_FIX) {
        log(COLORS.blue, `🔧 尝试自动修复...`);
        taskLog("info", "尝试 npm run lint -- --fix");
        const fixResult = run("npm run lint -- --fix");
        if (fixResult.success) {
          taskLog("info", "自动修复成功");
          log(COLORS.green, `✅ 自动修复成功`);
          continue;
        }
      }

      // 快照
      await captureVisionSnapshot(`lint-fail-${attempt}`);
      continue;
    }

    taskLog("info", `Lint 通过`, { duration: lintDuration });
    log(COLORS.green, `✅ Lint 通过`);

    // 2. 运行 build
    log(COLORS.blue, `🔨 运行 Build...`);
    taskLog("info", "运行 npm run build");
    const buildStart = Date.now();
    const buildResult = run("npm run build");
    const buildDuration = Date.now() - buildStart;

    if (!buildResult.success) {
      lastError = "Build failed";
      taskLog("error", lastError, {
        duration: buildDuration,
        output: buildResult.output,
      });
      log(COLORS.red, `❌ ${lastError}`);
      log(COLORS.red, buildResult.output);

      // 快照
      await captureVisionSnapshot(`build-fail-${attempt}`);
      continue;
    }

    taskLog("info", `Build 成功`, { duration: buildDuration });
    log(COLORS.green, `✅ Build 成功`);

    // 最终快照
    await captureVisionSnapshot("success");

    // 3. 成功！
    taskLog("info", "任务完成");
    log(COLORS.green, `\n🎉 RalphWiggum Loop 完成！`);
    log(COLORS.green, `✅ 任务成功: ${task}`);
    log(COLORS.cyan, `📄 详细日志: ${logPath}`);

    // 关闭日志流
    if (taskLogStream) {
      taskLogStream.end();
    }

    return true;
  }

  // 失败
  taskLog("error", `尝试 ${MAX_RETRIES} 次后仍失败`, { lastError });
  recordFailure(task, attempt, lastError);

  log(COLORS.red, `\n❌ RalphWiggum Loop 失败`);
  log(COLORS.red, `尝试 ${MAX_RETRIES} 次后仍失败`);
  log(COLORS.yellow, `\n💡 建议:`);
  log(COLORS.yellow, `   1. 检查错误信息`);
  log(COLORS.yellow, `   2. 查看 ${logPath} 获取详细日志`);
  log(
    COLORS.yellow,
    `   3. 查看 docs/design-docs/design-decisions.md 记录失败原因`,
  );
  log(COLORS.yellow, `   4. 必要时回滚到上一个可运行版本`);

  // 关闭日志流
  if (taskLogStream) {
    taskLogStream.end();
  }

  process.exit(1);
}

// CLI
const task = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .join(" ");

if (!task) {
  console.log(`
使用方法: 
  node scripts/ralph-loop.js "你的任务描述"
  node scripts/ralph-loop.js "你的任务描述" --with-vision  # 启用视觉系统

环境变量:
  RALPH_MAX_RETRIES=3    最大重试次数
  RALPH_AUTO_FIX=true    自动尝试修复
  CDP_PORT=9222          CDP 端口
  TASK_ID=xxx            指定任务 ID
`);
  process.exit(1);
}

ralphLoop(task);
