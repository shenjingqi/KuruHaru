import fs from "fs";
import path from "path";
import { app } from "electron";
import {
  normalizeWorkflowDefinition,
  summarizeWorkflowDefinition,
} from "./contracts/workflow-schema";

const ROOT_DIR_NAME = "workflows";
const DEFINITIONS_DIR_NAME = "definitions";
const RUNS_DIR_NAME = "runs";
const LOGS_DIR_NAME = "logs";

const createEntityId = (prefix) => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${timestamp}-${randomPart}`;
};

const getRootDir = () => path.join(app.getPath("userData"), ROOT_DIR_NAME);
const getDefinitionsDir = () => path.join(getRootDir(), DEFINITIONS_DIR_NAME);
const getRunsDir = () => path.join(getRootDir(), RUNS_DIR_NAME);
const getLogsDir = () => path.join(getRootDir(), LOGS_DIR_NAME);

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const ensureStorageDirs = async () => {
  await Promise.all([
    ensureDir(getDefinitionsDir()),
    ensureDir(getRunsDir()),
    ensureDir(getLogsDir()),
  ]);
};

const readJsonFile = async (filePath, fallbackValue = null) => {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallbackValue;
  }
};

const writeJsonFile = async (filePath, payload) => {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
};

const getDefinitionFilePath = (workflowId) =>
  path.join(getDefinitionsDir(), `${workflowId}.json`);

const getRunFilePath = (runId) => path.join(getRunsDir(), `${runId}.json`);

export const createWorkflowId = () => createEntityId("wf");

export const createRunId = () => createEntityId("run");

export const getWorkflowStorageRoot = () => getRootDir();

export const ensureWorkflowStorageDirs = async () => {
  await ensureStorageDirs();
};

export const listWorkflowDefinitions = async () => {
  await ensureStorageDirs();
  const definitionsDir = getDefinitionsDir();
  const entries = await fs.promises.readdir(definitionsDir, {
    withFileTypes: true,
  });
  const jsonFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
    )
    .map((entry) => entry.name);

  const summaries = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(definitionsDir, fileName);
    const payload = await readJsonFile(filePath, null);
    if (!payload || typeof payload !== "object") {
      continue;
    }
    summaries.push(summarizeWorkflowDefinition(payload));
  }

  summaries.sort((left, right) =>
    String(right.updatedAt).localeCompare(String(left.updatedAt)),
  );
  return summaries;
};

export const readWorkflowDefinitionById = async (workflowId) => {
  if (!workflowId || typeof workflowId !== "string") {
    return null;
  }

  await ensureStorageDirs();
  const filePath = getDefinitionFilePath(workflowId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const payload = await readJsonFile(filePath, null);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return normalizeWorkflowDefinition(payload);
};

export const saveWorkflowDefinition = async (rawWorkflow) => {
  await ensureStorageDirs();

  const normalized = normalizeWorkflowDefinition(rawWorkflow);
  const nowIso = new Date().toISOString();
  const workflowId = normalized.id || createWorkflowId();

  const nextWorkflow = {
    ...normalized,
    id: workflowId,
    createdAt:
      typeof normalized.createdAt === "string" && normalized.createdAt.trim()
        ? normalized.createdAt
        : nowIso,
    updatedAt: nowIso,
  };

  const filePath = getDefinitionFilePath(workflowId);
  await writeJsonFile(filePath, nextWorkflow);
  return nextWorkflow;
};

export const deleteWorkflowDefinition = async (workflowId) => {
  if (!workflowId || typeof workflowId !== "string") {
    return false;
  }

  await ensureStorageDirs();
  const filePath = getDefinitionFilePath(workflowId);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  await fs.promises.unlink(filePath);
  return true;
};

export const saveRunRecord = async (runRecord) => {
  if (!runRecord || typeof runRecord !== "object") {
    return null;
  }

  await ensureStorageDirs();
  const runId =
    typeof runRecord.runId === "string" && runRecord.runId.trim()
      ? runRecord.runId
      : createRunId();
  const nextRecord = {
    ...runRecord,
    runId,
  };

  await writeJsonFile(getRunFilePath(runId), nextRecord);
  return nextRecord;
};

export const readRunRecordById = async (runId) => {
  if (!runId || typeof runId !== "string") {
    return null;
  }

  await ensureStorageDirs();
  const filePath = getRunFilePath(runId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJsonFile(filePath, null);
};

export const listRunRecords = async (limit = 50) => {
  await ensureStorageDirs();
  const runsDir = getRunsDir();
  const entries = await fs.promises.readdir(runsDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
    )
    .map((entry) => entry.name);

  const runs = [];

  for (const fileName of jsonFiles) {
    const payload = await readJsonFile(path.join(runsDir, fileName), null);
    if (!payload || typeof payload !== "object") {
      continue;
    }
    runs.push(payload);
  }

  runs.sort((left, right) =>
    String(right.startedAt || "").localeCompare(String(left.startedAt || "")),
  );
  return runs.slice(0, Math.max(1, limit));
};
