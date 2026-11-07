/**
 * Pure entry gate for one automation run.
 *
 * The desktop heartbeat must be started only when this returns `enter: true`;
 * `disabled`, `peak-hours`, and an already-running run never produce a cloud
 * lease. Keeping the decision pure makes the product rule directly testable.
 */
export function evaluateTranslationAutomationRunGate({
  running: isRunning = false,
  enabled = false,
  force = false,
  withinQuietHours = true,
} = {}) {
  if (isRunning) return { enter: false, reason: "running" };
  if (!enabled && !force) return { enter: false, reason: "disabled" };
  if (!force && !withinQuietHours) return { enter: false, reason: "peak-hours" };
  return { enter: true, reason: "running" };
}
