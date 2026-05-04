#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const defaultScenes = [
  "S4-blank",
  "S4-add-node-search",
  "S4-node-created",
  "S4-context-menu",
  "S5-node-card",
  "S5-inspector",
  "S5-node-search",
  "S6-port-hover",
  "S6-drag-connect",
  "S6-connect-target",
  "S6-connected-widget-taken",
  "S6-optional-widget-editable",
  "S7-queue-empty",
  "S7-queued",
  "S7-running",
  "S7-node-failed",
  "S7-history",
  "S7-selected-node",
];

const args = process.argv.slice(2);
const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0) {
    return "";
  }
  return String(args[index + 1] || "").trim();
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileExists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const pollForFile = async (targetPath, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fileExists(targetPath)) {
      const fileStat = await stat(targetPath);
      if (fileStat.size > 0) {
        return true;
      }
    }
    await wait(250);
  }
  return false;
};

const electronBinary = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  "electron.exe",
);
const mainEntry = path.join(root, "out", "main", "index.js");
const timeoutMs = Number.parseInt(getArgValue("--timeout") || "30000", 10);
const delayMs = Number.parseInt(getArgValue("--delay") || "520", 10);
const explicitScene = getArgValue("--scene");
const explicitOutput = getArgValue("--output");
const outputDir = path.join(root, "output", "playwright", "workflow-parity");

const runSceneCapture = async (scene, outputPath) => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  const child = spawn(electronBinary, [mainEntry], {
    cwd: root,
    env: {
      ...process.env,
      WORKFLOW_INITIAL_VIEW: "workflow-designer",
      WORKFLOW_PARITY_SCENE: scene,
      WORKFLOW_PARITY_CAPTURE_PATH: outputPath,
      WORKFLOW_PARITY_CAPTURE_DELAY: String(delayMs),
      WORKFLOW_PARITY_AUTO_EXIT: "1",
    },
    stdio: "ignore",
    windowsHide: false,
  });

  const done = await pollForFile(outputPath, timeoutMs);
  if (!done) {
    child.kill();
    throw new Error(`截图超时: ${scene}`);
  }

  await wait(250);
  if (!child.killed) {
    child.kill();
  }
  return outputPath;
};

const main = async () => {
  const scenes = explicitScene ? [explicitScene] : defaultScenes;
  const outputs = [];

  for (const scene of scenes) {
    const outputPath =
      explicitScene && explicitOutput
        ? path.resolve(explicitOutput)
        : path.join(outputDir, `${scene}-after.png`);
    outputs.push(await runSceneCapture(scene, outputPath));
  }

  outputs.forEach((item) => console.log(item));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
