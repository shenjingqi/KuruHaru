import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createLogSender } from "../../utils/logger";
import { getWorkflowStorageRoot } from "../storage";

const logger = createLogSender("workflow-publish-guardian");

const GUARDIAN_DIR_NAME = "publish-guardian";
const GUARDIAN_REGISTRY_FILE = "registry.json";
const GUARDIAN_SCHEMA_VERSION = 1;
const DEFAULT_RESERVE_TTL_MS = 20 * 60 * 1000;
const DAEMON_SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_RECORDS = 60000;
const MAX_RESERVATIONS = 5000;

let cachedRegistry = null;
let registryQueue = Promise.resolve();
let daemonTimer = null;

const createId = (prefix) => {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(5).toString("hex");
  return `${prefix}-${timestamp}-${randomPart}`;
};

const getRegistryDir = () =>
  path.join(getWorkflowStorageRoot(), GUARDIAN_DIR_NAME);
const getRegistryFilePath = () =>
  path.join(getRegistryDir(), GUARDIAN_REGISTRY_FILE);

const ensureRegistryDir = async () => {
  await fs.promises.mkdir(getRegistryDir(), { recursive: true });
};

const normalizeIsoString = (rawValue, fallback) => {
  if (typeof rawValue === "string" && rawValue.trim()) {
    return rawValue;
  }
  return fallback;
};

const normalizeIdempotencyKey = (rawKey) =>
  typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";

const cloneJsonValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const createEmptyRegistry = () => {
  const nowIso = new Date().toISOString();
  return {
    version: GUARDIAN_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    reservations: [],
    records: [],
  };
};

const normalizeReservation = (item = {}) => {
  const nowIso = new Date().toISOString();
  return {
    reservationId:
      typeof item.reservationId === "string" && item.reservationId.trim()
        ? item.reservationId.trim()
        : createId("resv"),
    idempotencyKey: normalizeIdempotencyKey(item.idempotencyKey),
    workflowId:
      typeof item.workflowId === "string" && item.workflowId.trim()
        ? item.workflowId.trim()
        : "",
    runId:
      typeof item.runId === "string" && item.runId.trim()
        ? item.runId.trim()
        : "",
    nodeId:
      typeof item.nodeId === "string" && item.nodeId.trim()
        ? item.nodeId.trim()
        : "",
    createdAt: normalizeIsoString(item.createdAt, nowIso),
    expiresAt: normalizeIsoString(item.expiresAt, nowIso),
    metadata:
      item.metadata && typeof item.metadata === "object" ? item.metadata : {},
  };
};

const normalizeRecord = (item = {}) => {
  const nowIso = new Date().toISOString();
  const statusRaw =
    typeof item.status === "string" ? item.status.trim().toLowerCase() : "";
  const status =
    statusRaw === "committed" ||
    statusRaw === "duplicate" ||
    statusRaw === "cleaned"
      ? statusRaw
      : "committed";

  return {
    recordId:
      typeof item.recordId === "string" && item.recordId.trim()
        ? item.recordId.trim()
        : createId("pub"),
    idempotencyKey: normalizeIdempotencyKey(item.idempotencyKey),
    workflowId:
      typeof item.workflowId === "string" && item.workflowId.trim()
        ? item.workflowId.trim()
        : "",
    runId:
      typeof item.runId === "string" && item.runId.trim()
        ? item.runId.trim()
        : "",
    nodeId:
      typeof item.nodeId === "string" && item.nodeId.trim()
        ? item.nodeId.trim()
        : "",
    createdAt: normalizeIsoString(item.createdAt, nowIso),
    updatedAt: normalizeIsoString(item.updatedAt, nowIso),
    status,
    duplicateOf:
      typeof item.duplicateOf === "string" && item.duplicateOf.trim()
        ? item.duplicateOf.trim()
        : "",
    messageRef:
      item.messageRef && typeof item.messageRef === "object"
        ? item.messageRef
        : {},
    metadata:
      item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    cleanupReason:
      typeof item.cleanupReason === "string" && item.cleanupReason.trim()
        ? item.cleanupReason.trim()
        : "",
  };
};

const normalizeRegistry = (rawRegistry = {}) => {
  const fallback = createEmptyRegistry();
  const registry =
    rawRegistry && typeof rawRegistry === "object" ? rawRegistry : {};

  const reservations = Array.isArray(registry.reservations)
    ? registry.reservations
        .map(normalizeReservation)
        .filter((item) => item.idempotencyKey)
    : [];

  const records = Array.isArray(registry.records)
    ? registry.records
        .map(normalizeRecord)
        .filter((item) => item.idempotencyKey)
    : [];

  return {
    version: GUARDIAN_SCHEMA_VERSION,
    createdAt: normalizeIsoString(registry.createdAt, fallback.createdAt),
    updatedAt: normalizeIsoString(registry.updatedAt, fallback.updatedAt),
    reservations,
    records,
  };
};

const readRegistryFromDisk = async () => {
  await ensureRegistryDir();
  const filePath = getRegistryFilePath();
  if (!fs.existsSync(filePath)) {
    return createEmptyRegistry();
  }

  try {
    const rawContent = await fs.promises.readFile(filePath, "utf-8");
    const parsed = JSON.parse(rawContent);
    return normalizeRegistry(parsed);
  } catch {
    return createEmptyRegistry();
  }
};

const writeRegistryToDisk = async (registry) => {
  await ensureRegistryDir();
  const filePath = getRegistryFilePath();
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(registry, null, 2),
    "utf-8",
  );
};

const getRegistry = async () => {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  cachedRegistry = await readRegistryFromDisk();
  return cachedRegistry;
};

const persistRegistry = async (registry) => {
  registry.updatedAt = new Date().toISOString();
  cachedRegistry = registry;
  await writeRegistryToDisk(registry);
};

const queueRegistryTask = async (task) => {
  const runTask = async () => {
    const registry = await getRegistry();
    return task(registry);
  };

  const next = registryQueue.then(runTask, runTask);
  registryQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const pruneGuardianRegistry = (registry) => {
  const nowIso = new Date().toISOString();
  const prevReservationCount = registry.reservations.length;
  const prevRecordCount = registry.records.length;

  registry.reservations = registry.reservations.filter(
    (item) => String(item.expiresAt || "") > nowIso,
  );

  registry.records.sort((left, right) =>
    String(left.createdAt || "").localeCompare(String(right.createdAt || "")),
  );

  if (registry.reservations.length > MAX_RESERVATIONS) {
    registry.reservations = registry.reservations.slice(
      registry.reservations.length - MAX_RESERVATIONS,
    );
  }

  if (registry.records.length > MAX_RECORDS) {
    registry.records = registry.records.slice(
      registry.records.length - MAX_RECORDS,
    );
  }

  return {
    expiredReservations: Math.max(
      prevReservationCount - registry.reservations.length,
      0,
    ),
    compactedRecords: Math.max(prevRecordCount - registry.records.length, 0),
  };
};

export const reservePublish = async ({
  idempotencyKey,
  workflowId,
  runId,
  nodeId,
  metadata,
  ttlMs,
}) => {
  return queueRegistryTask(async (registry) => {
    const key = normalizeIdempotencyKey(idempotencyKey);
    if (!key) {
      return {
        accepted: false,
        reason: "INVALID_KEY",
      };
    }

    pruneGuardianRegistry(registry);
    const nowIso = new Date().toISOString();

    const existingRecord = [...registry.records]
      .reverse()
      .find(
        (item) => item.idempotencyKey === key && item.status === "committed",
      );

    if (existingRecord) {
      await persistRegistry(registry);
      return {
        accepted: false,
        reason: "DUPLICATE",
        existingRecord: cloneJsonValue(existingRecord, null),
      };
    }

    const existingReservation = registry.reservations.find(
      (item) =>
        item.idempotencyKey === key && String(item.expiresAt || "") > nowIso,
    );

    if (existingReservation) {
      await persistRegistry(registry);
      return {
        accepted: false,
        reason: "RESERVED",
        existingReservation: cloneJsonValue(existingReservation, null),
      };
    }

    const safeTtlMs = Math.max(
      30 * 1000,
      Math.min(
        24 * 60 * 60 * 1000,
        Number.parseInt(ttlMs, 10) || DEFAULT_RESERVE_TTL_MS,
      ),
    );

    const reservation = {
      reservationId: createId("resv"),
      idempotencyKey: key,
      workflowId: typeof workflowId === "string" ? workflowId.trim() : "",
      runId: typeof runId === "string" ? runId.trim() : "",
      nodeId: typeof nodeId === "string" ? nodeId.trim() : "",
      createdAt: nowIso,
      expiresAt: new Date(Date.now() + safeTtlMs).toISOString(),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    };

    registry.reservations.push(reservation);
    pruneGuardianRegistry(registry);
    await persistRegistry(registry);

    return {
      accepted: true,
      reservationId: reservation.reservationId,
      idempotencyKey: reservation.idempotencyKey,
      expiresAt: reservation.expiresAt,
    };
  });
};

export const releasePublishReservation = async ({ reservationId }) => {
  return queueRegistryTask(async (registry) => {
    const normalizedId =
      typeof reservationId === "string" ? reservationId.trim() : "";
    if (!normalizedId) {
      return { released: false };
    }

    const prevCount = registry.reservations.length;
    registry.reservations = registry.reservations.filter(
      (item) => item.reservationId !== normalizedId,
    );

    const released = registry.reservations.length !== prevCount;
    if (released) {
      await persistRegistry(registry);
    }

    return { released };
  });
};

export const commitPublishedContent = async ({
  reservationId,
  idempotencyKey,
  workflowId,
  runId,
  nodeId,
  messageRef,
  metadata,
}) => {
  return queueRegistryTask(async (registry) => {
    const key = normalizeIdempotencyKey(idempotencyKey);
    if (!key) {
      return {
        success: false,
        reason: "INVALID_KEY",
      };
    }

    const nowIso = new Date().toISOString();
    pruneGuardianRegistry(registry);

    const normalizedReservationId =
      typeof reservationId === "string" ? reservationId.trim() : "";
    if (normalizedReservationId) {
      registry.reservations = registry.reservations.filter(
        (item) => item.reservationId !== normalizedReservationId,
      );
    }

    const record = normalizeRecord({
      recordId: createId("pub"),
      idempotencyKey: key,
      workflowId,
      runId,
      nodeId,
      createdAt: nowIso,
      updatedAt: nowIso,
      status: "committed",
      messageRef:
        messageRef && typeof messageRef === "object" ? messageRef : {},
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });

    registry.records.push(record);

    const committedForKey = registry.records
      .filter(
        (item) => item.idempotencyKey === key && item.status === "committed",
      )
      .sort((left, right) =>
        String(left.createdAt || "").localeCompare(
          String(right.createdAt || ""),
        ),
      );

    const duplicates = [];
    if (committedForKey.length > 1) {
      const canonical = committedForKey[0];
      committedForKey.slice(1).forEach((duplicateItem) => {
        duplicateItem.status = "duplicate";
        duplicateItem.duplicateOf = canonical.recordId;
        duplicateItem.updatedAt = nowIso;
        duplicates.push(cloneJsonValue(duplicateItem, null));
      });
    }

    pruneGuardianRegistry(registry);
    await persistRegistry(registry);

    return {
      success: true,
      record: cloneJsonValue(record, null),
      duplicates,
    };
  });
};

export const markDuplicateRecordsCleaned = async ({ recordIds, reason }) => {
  return queueRegistryTask(async (registry) => {
    const normalizedIds = new Set(
      (Array.isArray(recordIds) ? recordIds : [])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    );

    if (!normalizedIds.size) {
      return {
        updatedCount: 0,
      };
    }

    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    registry.records.forEach((record) => {
      if (!normalizedIds.has(record.recordId)) {
        return;
      }

      record.status = "cleaned";
      record.cleanupReason =
        typeof reason === "string" && reason.trim()
          ? reason.trim()
          : "duplicate-cleanup";
      record.updatedAt = nowIso;
      updatedCount += 1;
    });

    if (updatedCount > 0) {
      await persistRegistry(registry);
    }

    return {
      updatedCount,
    };
  });
};

export const sweepPublishGuardian = async () => {
  return queueRegistryTask(async (registry) => {
    const stats = pruneGuardianRegistry(registry);
    const hasChanges =
      stats.expiredReservations > 0 || stats.compactedRecords > 0;

    if (hasChanges) {
      await persistRegistry(registry);
    }

    return {
      ...stats,
      reservationCount: registry.reservations.length,
      recordCount: registry.records.length,
      hasChanges,
    };
  });
};

export const startPublishGuardianDaemon = () => {
  if (daemonTimer) {
    return;
  }

  daemonTimer = setInterval(() => {
    sweepPublishGuardian()
      .then((stats) => {
        if (stats?.hasChanges) {
          logger.info(
            `[guardian] sweep done, expiredReservations=${stats.expiredReservations}, compactedRecords=${stats.compactedRecords}`,
          );
        }
      })
      .catch((error) => {
        logger.warn(`[guardian] sweep failed: ${error?.message || error}`);
      });
  }, DAEMON_SWEEP_INTERVAL_MS);

  if (typeof daemonTimer.unref === "function") {
    daemonTimer.unref();
  }

  logger.info("[guardian] publish guardian daemon started");
};

export const stopPublishGuardianDaemon = () => {
  if (!daemonTimer) {
    return;
  }

  clearInterval(daemonTimer);
  daemonTimer = null;
};
