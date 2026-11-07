import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_HEARTBEAT_INTERVAL_MS,
  AUTOMATION_HEARTBEAT_MIN_UPDATE_MS,
  automationHeartbeatFingerprint,
  buildAutomationHeartbeatStatus,
  createAutomationHeartbeatController,
  createStableInstanceId,
  normalizeAutomationHeartbeatSnapshot,
  resolveAutomationHeartbeatEndpoint,
} from "./translation-automation-heartbeat.js";

const INSTANCE_ID = "desktop-test-instance";

const configured = () => ({
  translationAutomation: {
    heartbeatUrl: "https://bot.example.workers.dev",
  },
});

function snapshot(overrides = {}) {
  const runtimeStatus = {
    step: "translate",
    currentCode: "RJ123456",
    message: "正在翻译 RJ123456",
    updatedAt: "2026-11-06T00:00:00.000Z",
    nextProbeAt: "",
    translationProgress: {
      queuedDownloadCodes: ["RJ111111"],
      downloadingCodes: ["RJ222222"],
      readyTranslateCodes: ["RJ123456", "RJ333333"],
      completedCodes: ["RJ555555"],
      failedCodes: [],
      failedItems: [],
      currentCode: "RJ123456",
    },
    progress: {},
    ...(overrides.runtimeStatus || {}),
  };
  return {
    running: true,
    queueCount: 3,
    lastRun: null,
    ...overrides,
    runtimeStatus,
  };
}

function harness({
  config = configured(),
  secret = "heartbeat-test-secret",
  respond = async () => ({ status: 200 }),
} = {}) {
  const calls = [];
  const request = vi.fn(async (options) => {
    calls.push(options);
    return respond(options);
  });
  const logger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const controller = createAutomationHeartbeatController({
    request,
    getConfig: () => config,
    getSecret: () => secret,
    instanceId: INSTANCE_ID,
    logger,
    allowInsecure: false,
  });
  return { controller, calls, request, logger };
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await Promise.resolve();
};

describe("automation heartbeat protocol helpers", () => {
  it("normalizes the Worker origin or a full endpoint", () => {
    expect(
      resolveAutomationHeartbeatEndpoint("https://bot.example.workers.dev"),
    ).toEqual({
      ok: true,
      url: "https://bot.example.workers.dev/api/automation/heartbeat",
    });
    expect(
      resolveAutomationHeartbeatEndpoint(
        "https://bot.example.workers.dev/api/automation/heartbeat",
      ),
    ).toEqual({
      ok: true,
      url: "https://bot.example.workers.dev/api/automation/heartbeat",
    });
  });

  it("rejects insecure, malformed, and unrelated paths", () => {
    expect(resolveAutomationHeartbeatEndpoint("http://bot.example")).toEqual({
      ok: false,
      reason: "insecure-url",
    });
    expect(
      resolveAutomationHeartbeatEndpoint("http://localhost:8787", {
        allowInsecure: true,
      }).ok,
    ).toBe(true);
    expect(
      resolveAutomationHeartbeatEndpoint("http://example.com", {
        allowInsecure: true,
      }),
    ).toEqual({ ok: false, reason: "insecure-url" });
    expect(resolveAutomationHeartbeatEndpoint("https://bot.example/foo")).toEqual({
      ok: false,
      reason: "invalid-path",
    });
    expect(
      resolveAutomationHeartbeatEndpoint("https://bot.example?x=1"),
    ).toEqual({ ok: false, reason: "invalid-url" });
    expect(resolveAutomationHeartbeatEndpoint("")).toEqual({
      ok: false,
      reason: "missing-url",
    });
  });

  it("derives a stable, non-identifying instance id", () => {
    const first = createStableInstanceId("C:\\Users\\example\\AppData");
    expect(first).toBe(createStableInstanceId("C:\\Users\\example\\AppData"));
    expect(first).not.toBe(createStableInstanceId("C:\\another-profile"));
    expect(first).toMatch(/^desktop-[a-f0-9]{24}$/);
  });

  it("never exposes the secret in the Renderer-visible heartbeat status", () => {
    const status = buildAutomationHeartbeatStatus({
      config: { heartbeatUrl: "https://bot.example.workers.dev" },
      secret: "renderer-must-not-see-this",
      active: true,
    });
    expect(status).toEqual({
      url: "https://bot.example.workers.dev",
      secretConfigured: true,
      active: true,
    });
    expect(JSON.stringify(status)).not.toContain("renderer-must-not-see-this");
  });

  it("bounds and whitelists the snapshot", () => {
    const normalized = normalizeAutomationHeartbeatSnapshot(
      snapshot({
        queueCount: -1,
        runtimeStatus: {
          step: "not-a-step",
          message: "x".repeat(900),
          currentCode: "rj123456",
          translationProgress: {
            readyTranslateCodes: Array.from(
              { length: 120 },
              (_, index) => `RJ${String(index).padStart(6, "0")}`,
            ),
            failedCodes: ["bad", "VJ123456"],
            failedItems: [
              { code: "RJ123456", reason: "r".repeat(300) },
              { code: "invalid", reason: "ignored" },
            ],
          },
          progress: { mediaFileCount: 3, injected: "no" },
        },
      }),
      { instanceId: INSTANCE_ID, now: new Date("2026-11-06T00:00:00Z") },
    );
    expect(normalized.queueCount).toBeNull();
    expect(normalized.runtimeStatus.step).toBe("unknown");
    expect(normalized.runtimeStatus.message).toHaveLength(500);
    expect(normalized.runtimeStatus.currentCode).toBe("RJ123456");
    expect(
      normalized.runtimeStatus.translationProgress.readyTranslateCodes,
    ).toHaveLength(100);
    expect(normalized.runtimeStatus.translationProgress.failedCodes).toEqual([
      "VJ123456",
    ]);
    expect(normalized.runtimeStatus.translationProgress.failedItems).toEqual([
      { code: "RJ123456", reason: "r".repeat(200) },
    ]);
    expect(normalized.runtimeStatus.progress).toEqual({ mediaFileCount: 3 });
  });

  it("ignores volatile timestamps in the change fingerprint", () => {
    const first = normalizeAutomationHeartbeatSnapshot(snapshot(), {
      instanceId: INSTANCE_ID,
      now: new Date("2026-11-06T00:00:00Z"),
    });
    const second = {
      ...first,
      sentAt: "2026-11-06T00:01:00.000Z",
      runtimeStatus: {
        ...first.runtimeStatus,
        updatedAt: "2026-11-06T00:01:00.000Z",
      },
    };
    expect(automationHeartbeatFingerprint(second)).toBe(
      automationHeartbeatFingerprint(first),
    );
  });
});

describe("automation heartbeat controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not send without a heartbeat URL or secret", async () => {
    const noUrl = harness({ config: { translationAutomation: { heartbeatUrl: "" } } });
    expect(noUrl.controller.start(snapshot())).toBe(false);
    const noSecret = harness({ secret: "" });
    expect(noSecret.controller.start(snapshot())).toBe(false);

    await flush();
    expect(noUrl.request).not.toHaveBeenCalled();
    expect(noSecret.request).not.toHaveBeenCalled();
    expect(noUrl.controller.getState().lastResult).toBe("unconfigured");
  });

  it("does not start before a run is actually running", async () => {
    const { controller, request } = harness();
    expect(controller.start(snapshot({ running: false }))).toBe(false);
    await flush();
    expect(request).not.toHaveBeenCalled();
    expect(controller.getState().started).toBe(false);
  });

  it("sends one initial snapshot when the run starts", async () => {
    const { controller, calls } = harness();
    expect(controller.start(snapshot())).toBe(true);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://bot.example.workers.dev/api/automation/heartbeat",
      secret: "heartbeat-test-secret",
    });
    expect(calls[0].body).toMatchObject({
      version: 1,
      instanceId: INSTANCE_ID,
      running: true,
      queueCount: 3,
    });
    expect(JSON.stringify(calls[0].body)).not.toContain("heartbeat-test-secret");
  });

  it("renews at the configured interval with the latest snapshot", async () => {
    const { controller, calls } = harness();
    controller.start(snapshot());
    await flush();
    controller.publish(
      snapshot({
        runtimeStatus: {
          step: "upload",
          currentCode: "RJ333333",
          message: "正在上传 RJ333333 字幕包",
        },
      }),
    );
    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_MIN_UPDATE_MS);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1].body.runtimeStatus.step).toBe("upload");
    expect(calls[1].body.runtimeStatus.currentCode).toBe("RJ333333");

    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_INTERVAL_MS - AUTOMATION_HEARTBEAT_MIN_UPDATE_MS);
    await flush();
    expect(calls).toHaveLength(3);
    expect(calls[2].body.runtimeStatus.step).toBe("upload");
  });

  it("throttles high-frequency progress updates", async () => {
    const { controller, calls } = harness();
    controller.start(snapshot());
    await flush();
    for (let index = 0; index < 6; index += 1) {
      controller.publish(
        snapshot({
          runtimeStatus: {
            translationProgress: {
              queuedDownloadCodes: [],
              downloadingCodes: [],
              readyTranslateCodes: [`RJ90${index}000`],
              completedCodes: [],
              failedCodes: [],
              failedItems: [],
              currentCode: "RJ123456",
            },
          },
        }),
      );
    }
    await flush();
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_MIN_UPDATE_MS);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1].body.runtimeStatus.translationProgress.readyTranslateCodes).toEqual([
      "RJ905000",
    ]);
  });

  it("skips updates whose substantive snapshot did not change", async () => {
    const { controller, calls } = harness();
    controller.start(snapshot());
    await flush();
    controller.publish(snapshot());
    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_MIN_UPDATE_MS);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("keeps running when heartbeat requests fail and retries only on the next tick", async () => {
    let fail = true;
    const { controller, request, logger } = harness({
      respond: async () => {
        if (fail) throw Object.assign(new Error("offline"), { code: "ECONNRESET" });
        return { status: 200 };
      },
    });
    controller.start(snapshot());
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.getState().lastResult).toBe("failed");

    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_INTERVAL_MS - 1);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    fail = false;
    vi.advanceTimersByTime(1);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(controller.getState().lastResult).toBe("ok");
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain("heartbeat-test-secret");
  });

  it("stops the timer and releases the lease on stop", async () => {
    const { controller, calls } = harness();
    controller.start(snapshot());
    await flush();
    await controller.stop();
    expect(calls.at(-1)).toMatchObject({
      method: "DELETE",
      url: "https://bot.example.workers.dev/api/automation/heartbeat",
      body: { version: 1, instanceId: INSTANCE_ID },
    });
    const countAfterStop = calls.length;
    vi.advanceTimersByTime(AUTOMATION_HEARTBEAT_INTERVAL_MS * 3);
    await flush();
    expect(calls).toHaveLength(countAfterStop);
    expect(controller.getState().started).toBe(false);
  });

  it("does not fail the run when the release request fails", async () => {
    const { controller, logger } = harness({
      respond: async (options) =>
        options.method === "DELETE" ? { status: 503 } : { status: 200 },
    });
    controller.start(snapshot());
    await flush();
    await expect(controller.stop()).resolves.toBeUndefined();
    expect(controller.getState().lastResult).toBe("release-failed");
    expect(logger.warn).toHaveBeenCalled();
  });

  it("never retries the release in a loop", async () => {
    const { controller, request } = harness({
      respond: async () => ({ status: 503 }),
    });
    controller.start(snapshot());
    await flush();
    await controller.stop();
    await controller.stop();
    const deleteCalls = request.mock.calls.filter(
      ([options]) => options.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(1);
  });
});
