import { describe, expect, it } from "vitest";
import { evaluateTranslationAutomationRunGate } from "./translation-automation-gate.js";

describe("translation automation run gate and heartbeat entry", () => {
  it("does not enter when automation is disabled", () => {
    expect(
      evaluateTranslationAutomationRunGate({ enabled: false }),
    ).toEqual({ enter: false, reason: "disabled" });
  });

  it("does not enter outside the configured low-peak window", () => {
    expect(
      evaluateTranslationAutomationRunGate({
        enabled: true,
        withinQuietHours: false,
      }),
    ).toEqual({ enter: false, reason: "peak-hours" });
  });

  it("does not re-enter while a run is already in progress", () => {
    expect(
      evaluateTranslationAutomationRunGate({
        running: true,
        enabled: true,
        withinQuietHours: true,
      }),
    ).toEqual({ enter: false, reason: "running" });
  });

  it("enters only when a real run may start", () => {
    expect(
      evaluateTranslationAutomationRunGate({
        enabled: true,
        withinQuietHours: true,
      }),
    ).toEqual({ enter: true, reason: "running" });
    expect(
      evaluateTranslationAutomationRunGate({
        enabled: false,
        withinQuietHours: false,
        force: true,
      }),
    ).toEqual({ enter: true, reason: "running" });
  });
});
