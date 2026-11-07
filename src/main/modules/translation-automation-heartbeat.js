import { createHash } from "node:crypto";

// Shared protocol constants. The Worker owns the authoritative lease TTL and
// rejects anything that does not match this versioned contract.
export const AUTOMATION_HEARTBEAT_VERSION = 1;
export const AUTOMATION_HEARTBEAT_PATH = "/api/automation/heartbeat";
export const AUTOMATION_HEARTBEAT_INTERVAL_MS = 60 * 1000;
export const AUTOMATION_HEARTBEAT_TTL_SECONDS = 180;
export const AUTOMATION_HEARTBEAT_MIN_UPDATE_MS = 12 * 1000;
export const AUTOMATION_HEARTBEAT_TIMEOUT_MS = 8 * 1000;

export const AUTOMATION_HEARTBEAT_STEPS = Object.freeze([
  "idle",
  "history-sync",
  "scan",
  "queue",
  "enqueue",
  "download",
  "translate",
  "package",
  "upload",
  "cleanup",
  "completed",
  "error",
  "disabled",
  "waiting-window",
]);

const STEP_SET = new Set(AUTOMATION_HEARTBEAT_STEPS);
const CODE_PATTERN = /^(?:RJ|VJ|BJ)\d{6,8}$/;
const MAX_CODE_COUNT = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_FAILED_ITEMS = 100;
const MAX_FAILURE_REASON_LENGTH = 200;
const MAX_QUEUE_COUNT = 1_000_000;
const CONTROL_CHARACTER_LIMIT = 32;
const DELETE_CHARACTER = 127;
const PROGRESS_NUMBER_FIELDS = Object.freeze([
  "mediaFileCount",
  "aria2TempFileCount",
  "totalBytes",
  "stablePolls",
  "stablePollsRequired",
  "subtitleFileCount",
  "idleMs",
]);
const LAST_RUN_NUMBER_FIELDS = Object.freeze([
  "discovered",
  "queued",
  "queueBefore",
  "queueAfterCleanup",
  "queueReady",
  "processed",
  "recovered",
  "skippedTranslated",
  "failed",
]);

const stripControlCharacters = (value) =>
  Array.from(String(value ?? ""))
    .map((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint < CONTROL_CHARACTER_LIMIT ||
        codePoint === DELETE_CHARACTER
        ? " "
        : character;
    })
    .join("");

const normalizeText = (value, maxLength) =>
  stripControlCharacters(value).trim().slice(0, maxLength);

const normalizeCode = (value) => {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  return CODE_PATTERN.test(code) ? code : "";
};

const normalizeCodes = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeCode).filter(Boolean))].slice(
        0,
        MAX_CODE_COUNT,
      )
    : [];

const normalizeFailedItems = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const code = normalizeCode(item?.code);
          if (!code) return null;
          return {
            code,
            reason: normalizeText(item?.reason, MAX_FAILURE_REASON_LENGTH),
          };
        })
        .filter(Boolean)
        .slice(0, MAX_FAILED_ITEMS)
    : [];

const normalizeCount = (value, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;

const normalizeProgress = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const progress = {};
  for (const field of PROGRESS_NUMBER_FIELDS) {
    const normalized = normalizeCount(value[field], 1_000_000_000_000);
    if (normalized !== null) progress[field] = normalized;
  }
  return progress;
};

const normalizeLastRun = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lastRun = {};
  const at = normalizeText(value.at, 40);
  if (at) lastRun.at = at;
  for (const field of LAST_RUN_NUMBER_FIELDS) {
    const normalized = normalizeCount(value[field], 1_000_000_000_000);
    if (normalized !== null) lastRun[field] = normalized;
  }
  return lastRun;
};

/**
 * Build the bounded snapshot that is uploaded to the Worker. The Worker
 * re-validates every field; this normalization keeps the local payload small
 * and prevents progress arrays from growing without bound.
 */
export function normalizeAutomationHeartbeatSnapshot(
  snapshot = {},
  { instanceId = "", now = new Date() } = {},
) {
  const runtimeStatus =
    snapshot.runtimeStatus &&
    typeof snapshot.runtimeStatus === "object" &&
    !Array.isArray(snapshot.runtimeStatus)
      ? snapshot.runtimeStatus
      : {};
  const translationProgress =
    runtimeStatus.translationProgress &&
    typeof runtimeStatus.translationProgress === "object" &&
    !Array.isArray(runtimeStatus.translationProgress)
      ? runtimeStatus.translationProgress
      : {};
  const step = STEP_SET.has(runtimeStatus.step) ? runtimeStatus.step : "unknown";
  return {
    version: AUTOMATION_HEARTBEAT_VERSION,
    instanceId: normalizeText(instanceId, 128),
    sentAt: now.toISOString(),
    running: snapshot.running === true,
    queueCount: normalizeCount(snapshot.queueCount, MAX_QUEUE_COUNT),
    runtimeStatus: {
      step,
      currentCode: normalizeCode(runtimeStatus.currentCode),
      message: normalizeText(runtimeStatus.message, MAX_MESSAGE_LENGTH),
      updatedAt: normalizeText(runtimeStatus.updatedAt, 40),
      nextProbeAt: normalizeText(runtimeStatus.nextProbeAt, 40),
      translationProgress: {
        queuedDownloadCodes: normalizeCodes(
          translationProgress.queuedDownloadCodes,
        ),
        downloadingCodes: normalizeCodes(translationProgress.downloadingCodes),
        readyTranslateCodes: normalizeCodes(
          translationProgress.readyTranslateCodes,
        ),
        completedCodes: normalizeCodes(translationProgress.completedCodes),
        failedCodes: normalizeCodes(translationProgress.failedCodes),
        failedItems: normalizeFailedItems(translationProgress.failedItems),
        currentCode: normalizeCode(translationProgress.currentCode),
      },
      progress: normalizeProgress(runtimeStatus.progress),
    },
    lastRun: normalizeLastRun(snapshot.lastRun),
  };
}

/**
 * Fingerprint only substantive state. High-frequency progress ticks update
 * `updatedAt` but must not create extra network traffic on their own.
 */
export function automationHeartbeatFingerprint(snapshot) {
  return JSON.stringify({
    queueCount: snapshot.queueCount,
    step: snapshot.runtimeStatus.step,
    currentCode: snapshot.runtimeStatus.currentCode,
    message: snapshot.runtimeStatus.message,
    nextProbeAt: snapshot.runtimeStatus.nextProbeAt,
    translationProgress: snapshot.runtimeStatus.translationProgress,
    progress: snapshot.runtimeStatus.progress,
    lastRun: snapshot.lastRun,
  });
}

/**
 * Accept either the Worker origin or the full heartbeat endpoint. In packaged
 * builds only HTTPS is accepted; local development may use localhost HTTP.
 */
export function resolveAutomationHeartbeatEndpoint(
  rawUrl,
  { allowInsecure = false } = {},
) {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return { ok: false, reason: "missing-url" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.username || url.password) return { ok: false, reason: "invalid-url" };
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "invalid-protocol" };
  }
  if (url.protocol === "http:") {
    const hostname = url.hostname.toLowerCase();
    const localHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1";
    if (!allowInsecure || !localHost) {
      return { ok: false, reason: "insecure-url" };
    }
  }
  if (url.search || url.hash) return { ok: false, reason: "invalid-url" };
  const path = url.pathname.replace(/\/+$/, "");
  if (!path) {
    url.pathname = AUTOMATION_HEARTBEAT_PATH;
  } else if (path.endsWith(AUTOMATION_HEARTBEAT_PATH)) {
    url.pathname = path;
  } else {
    return { ok: false, reason: "invalid-path" };
  }
  return { ok: true, url: url.toString() };
}

/** Stable, non-identifying instance id derived from the userData path. */
export function createStableInstanceId(seed = "") {
  const digest = createHash("sha256")
    .update(String(seed || "kuruharu-desktop"))
    .digest("hex");
  return `desktop-${digest.slice(0, 24)}`;
}

/**
 * The only heartbeat information exposed to the Renderer/status consumers.
 * The secret itself never appears in this object.
 */
export function buildAutomationHeartbeatStatus({
  config = {},
  secret = "",
  active = false,
} = {}) {
  return {
    url: String(config.heartbeatUrl || ""),
    secretConfigured: String(secret || "").trim().length > 0,
    active: Boolean(active),
  };
}

/**
 * Owns heartbeat renewal and release. All I/O is injected so the lifecycle can
 * be tested without Electron, timers, or a network.
 */
export function createAutomationHeartbeatController(options = {}) {
  const {
    request,
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
    getConfig = () => ({}),
    getSecret = () => "",
    instanceId = "",
    logger = console,
    allowInsecure = false,
    intervalMs = AUTOMATION_HEARTBEAT_INTERVAL_MS,
    minUpdateMs = AUTOMATION_HEARTBEAT_MIN_UPDATE_MS,
    timeoutMs = AUTOMATION_HEARTBEAT_TIMEOUT_MS,
  } = options;

  let started = false;
  let stopped = false;
  let intervalHandle = null;
  let trailingHandle = null;
  let inFlight = null;
  let releaseInFlight = null;
  let latestSnapshot = null;
  let lastSentFingerprint = "";
  let lastSentAt = 0;
  let lastResult = "idle";
  let activeTarget = null;

  const logWarning = (message, error) => {
    const code = String(error?.code || error?.name || "request-failed").slice(
      0,
      80,
    );
    logger.warn?.(`[automation-heartbeat] ${message}`, { code });
  };

  const resolveTarget = () => {
    const config = getConfig()?.translationAutomation || {};
    const endpoint = resolveAutomationHeartbeatEndpoint(config.heartbeatUrl, {
      allowInsecure,
    });
    const secret = String(getSecret() || "").trim();
    if (!endpoint.ok || !secret) return null;
    return { url: endpoint.url, secret, reason: endpoint.reason };
  };

  const clearTimers = () => {
    if (intervalHandle !== null) {
      clearTimer(intervalHandle);
      intervalHandle = null;
    }
    if (trailingHandle !== null) {
      clearTimer(trailingHandle);
      trailingHandle = null;
    }
  };

  const sendSnapshot = (snapshot) => {
    if (inFlight) return inFlight;
    const target = resolveTarget();
    if (!target) {
      lastResult = "unconfigured";
      return Promise.resolve(false);
    }
    const outgoing = {
      ...snapshot,
      sentAt: new Date(now()).toISOString(),
    };
    inFlight = Promise.resolve()
      .then(() =>
        request({
          url: target.url,
          method: "POST",
          secret: target.secret,
          body: outgoing,
          timeoutMs,
        }),
      )
      .then((response) => {
        if (!response || response.status < 200 || response.status >= 300) {
          throw new Error("heartbeat rejected");
        }
        lastResult = "ok";
        lastSentAt = now();
        lastSentFingerprint = automationHeartbeatFingerprint(outgoing);
        return true;
      })
      .catch((error) => {
        // Never retry in a tight loop. The next scheduled renewal retries.
        lastResult = "failed";
        logWarning("心跳发送失败，将在下一次续约重试", error);
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const scheduleTrailingUpdate = (delay) => {
    if (trailingHandle !== null) return;
    trailingHandle = setTimer(() => {
      trailingHandle = null;
      if (!started || stopped || !latestSnapshot) return;
      if (inFlight) {
        scheduleTrailingUpdate(1000);
        return;
      }
      if (automationHeartbeatFingerprint(latestSnapshot) === lastSentFingerprint) {
        return;
      }
      const elapsed = now() - lastSentAt;
      if (lastSentAt > 0 && elapsed < minUpdateMs) {
        scheduleTrailingUpdate(minUpdateMs - elapsed);
        return;
      }
      sendSnapshot(latestSnapshot);
    }, Math.max(1, delay));
    trailingHandle?.unref?.();
  };

  const renew = () => {
    if (!started || stopped || !latestSnapshot || inFlight) return;
    // Periodic renewal always sends, even when the fingerprint is unchanged.
    sendSnapshot(latestSnapshot);
  };

  const start = (snapshot = {}) => {
    if (started) {
      publish(snapshot);
      return true;
    }
    stopped = false;
    const target = resolveTarget();
    if (!target) {
      lastResult = "unconfigured";
      logger.debug?.(
        "[automation-heartbeat] 未配置心跳地址或密钥，跳过云端心跳",
      );
      return false;
    }
    const normalized = normalizeAutomationHeartbeatSnapshot(snapshot, {
      instanceId,
      now: new Date(now()),
    });
    if (!normalized.running) return false;
    started = true;
    activeTarget = target;
    latestSnapshot = normalized;
    intervalHandle = setTimer(renew, Math.max(1000, intervalMs));
    intervalHandle?.unref?.();
    sendSnapshot(normalized);
    return true;
  };

  const publish = (snapshot = {}) => {
    if (!started || stopped) return;
    const normalized = normalizeAutomationHeartbeatSnapshot(snapshot, {
      instanceId,
      now: new Date(now()),
    });
    if (!normalized.running) return;
    latestSnapshot = normalized;
    if (inFlight) {
      // A substantive change during an in-flight renewal must not wait for the
      // next 60-second tick; retry the throttled update after the request ends.
      scheduleTrailingUpdate(
        Math.max(1, minUpdateMs - Math.max(0, now() - lastSentAt)),
      );
      return;
    }
    const fingerprint = automationHeartbeatFingerprint(normalized);
    if (fingerprint === lastSentFingerprint) return;
    const elapsed = now() - lastSentAt;
    if (lastSentAt > 0 && elapsed < minUpdateMs) {
      scheduleTrailingUpdate(minUpdateMs - elapsed);
      return;
    }
    sendSnapshot(normalized);
  };

  const stop = async () => {
    if (!started) return;
    started = false;
    stopped = true;
    clearTimers();
    if (inFlight) await inFlight.catch(() => undefined);
    const target = activeTarget || resolveTarget();
    if (target) {
      releaseInFlight = Promise.resolve()
        .then(() =>
          request({
            url: target.url,
            method: "DELETE",
            secret: target.secret,
            body: {
              version: AUTOMATION_HEARTBEAT_VERSION,
              instanceId,
            },
            timeoutMs,
          }),
        )
        .then((response) => {
          if (!response || response.status < 200 || response.status >= 300) {
            throw new Error("heartbeat release rejected");
          }
          lastResult = "released";
          return true;
        })
        .catch((error) => {
          lastResult = "release-failed";
          logWarning("心跳释放失败，等待云端 TTL 过期", error);
          return false;
        })
        .finally(() => {
          releaseInFlight = null;
        });
      await releaseInFlight;
    }
    latestSnapshot = null;
    lastSentFingerprint = "";
    lastSentAt = 0;
    activeTarget = null;
  };

  return {
    start,
    publish,
    stop,
    getState: () => ({
      started,
      stopped,
      configured: Boolean(resolveTarget()),
      lastResult,
      lastSentAt,
      intervalMs,
      minUpdateMs,
      timeoutMs,
    }),
  };
}
