#!/usr/bin/env node

/**
 * RalphWiggum Loop - Self-Correcting Development Loop
 *
 * 自动化开发循环：编码 → 验证 → 修复 → 重试
 *
 * 使用方法:
 *   node scripts/ralph-loop.js "你的任务描述"
 *
 * 环境变量:
 *   RALPH_MAX_RETRIES=3    最大重试次数 (默认 3)
 *   RALPH_AUTO_FIX=true    自动尝试修复 (默认 true)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MAX_RETRIES = parseInt(process.env.RALPH_MAX_RETRIES || "3", 10);
const AUTO_FIX = process.env.RALPH_AUTO_FIX !== "false";
const RUN_ID = `ralph-${Date.now()}`;

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

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

- **运行 ID**: ${RUN_ID}
- **失败时间**: ${new Date().toISOString()}
- **尝试次数**: ${attempt}
- **错误类型**: ${error}
- **建议**: 检查代码并修复后重试
`;

    const newContent = content.replace(/(## \w+.*?\n)/, `$1${failureEntry}\n`);
    writeFileSync(decisionFile, newContent);
  } catch {
    // 忽略记录错误
  }
}

function ralphLoop(task) {
  log(COLORS.cyan, `\n🤖 RalphWiggum Loop 开始 [${RUN_ID}]`);
  log(COLORS.blue, `📝 任务: ${task}\n`);

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    log(COLORS.yellow, `--- 第 ${attempt}/${MAX_RETRIES} 次尝试 ---`);

    // 1. 运行 lint
    log(COLORS.blue, "🔍 运行 ESLint...");
    const lintResult = run("npm run lint");

    if (!lintResult.success) {
      const errorCount = (lintResult.output.match(/✖ \d+ (error|problems)/) || [
        "",
      ])[0];
      lastError = `Lint failed: ${errorCount}`;
      log(COLORS.red, `❌ Lint 失败: ${errorCount}`);

      if (AUTO_FIX) {
        log(COLORS.blue, "🔧 尝试自动修复...");
        const fixResult = run("npm run lint -- --fix");
        if (fixResult.success) {
          log(COLORS.green, "✅ 自动修复成功");
          continue;
        }
      }

      continue;
    }

    log(COLORS.green, "✅ Lint 通过");

    // 2. 运行 build
    log(COLORS.blue, "🔨 运行 Build...");
    const buildResult = run("npm run build");

    if (!buildResult.success) {
      lastError = "Build failed";
      log(COLORS.red, `❌ ${lastError}`);
      log(COLORS.red, buildResult.output);
      continue;
    }

    log(COLORS.green, "✅ Build 成功");

    // 3. 成功
    log(COLORS.green, "\n🎉 RalphWiggum Loop 完成！");
    log(COLORS.green, `✅ 任务成功: ${task}`);
    return true;
  }

  // 失败
  recordFailure(task, attempt, lastError);

  log(COLORS.red, "\n❌ RalphWiggum Loop 失败");
  log(COLORS.red, `尝试 ${MAX_RETRIES} 次后仍失败`);
  log(COLORS.yellow, "\n💡 建议:");
  log(COLORS.yellow, "   1. 检查错误信息");
  log(
    COLORS.yellow,
    "   2. 查看 docs/design-docs/design-decisions.md 记录失败原因",
  );
  log(COLORS.yellow, "   3. 必要时回滚到上一个可运行版本");

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

环境变量:
  RALPH_MAX_RETRIES=3    最大重试次数
  RALPH_AUTO_FIX=true    自动尝试修复
`);
  process.exit(1);
}

ralphLoop(task);
