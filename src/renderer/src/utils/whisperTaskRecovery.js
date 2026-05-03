const RECOVERABLE_WHISPER_EXIT_CODES = new Set([3221226505]);

const RECOVERABLE_WHISPER_ERROR_PATTERNS = [
  /CUDA out of memory/i,
  /out of memory/i,
  /显存/u,
  /Unable to allocate/i,
  /_ArrayMemoryError/i,
  /torch\.cuda\.OutOfMemoryError/i,
  /CUBLAS_STATUS_ALLOC_FAILED/i,
  /CUDA error/i,
  /误报显存/u,
];

const NON_RECOVERABLE_WHISPER_ERROR_PATTERNS = [
  /An object could not be cloned\./i,
];

const USER_STOP_PATTERN = /用户停止任务/u;

export const WHISPER_AUTO_RESTART_DELAY_MS = 2000;
export const WHISPER_MAX_AUTO_RESTARTS = 100;
export const WHISPER_MAX_STALLED_RESTARTS = 3;

export const cloneWhisperTaskPayload = (payload) => {
  try {
    return JSON.parse(JSON.stringify(payload || null));
  } catch {
    return null;
  }
};

const parseExitCodeFromErrorText = (errorText) => {
  if (!errorText) {
    return null;
  }

  const match = String(errorText).match(/退出码:\s*(\d+)/u);
  if (!match) {
    return null;
  }

  const exitCode = Number.parseInt(match[1], 10);
  return Number.isFinite(exitCode) ? exitCode : null;
};

export const classifyWhisperTaskResult = (taskResult = {}) => {
  const errorText = String(taskResult?.error || "").trim();
  const reason = String(taskResult?.reason || "").trim();
  const exitCodeFromPayload = Number.parseInt(taskResult?.exitCode, 10);
  const exitCode = Number.isFinite(exitCodeFromPayload)
    ? exitCodeFromPayload
    : parseExitCodeFromErrorText(errorText);
  const isUserStop =
    reason === "user-stop" || USER_STOP_PATTERN.test(errorText);
  const isError = Boolean(errorText) || taskResult?.success === false;
  const isNonRecoverable =
    isError &&
    NON_RECOVERABLE_WHISPER_ERROR_PATTERNS.some((pattern) =>
      pattern.test(errorText),
    );
  const isRecoverable =
    isError &&
    !isUserStop &&
    !isNonRecoverable &&
    (RECOVERABLE_WHISPER_EXIT_CODES.has(exitCode) ||
      RECOVERABLE_WHISPER_ERROR_PATTERNS.some((pattern) =>
        pattern.test(errorText),
      ));

  return {
    errorText,
    exitCode,
    isError,
    isNonRecoverable,
    isUserStop,
    isRecoverable,
  };
};

export const formatWhisperAutoRestartLog = ({
  attempt,
  delayMs = WHISPER_AUTO_RESTART_DELAY_MS,
  exitCode,
  stalledAttempt,
}) => {
  const waitSeconds = Math.max(1, Math.ceil(delayMs / 1000));
  const details = [];

  if (Number.isFinite(exitCode)) {
    details.push(`退出码 ${exitCode}`);
  }
  if (stalledAttempt > 0) {
    details.push(
      `连续无进度 ${stalledAttempt}/${WHISPER_MAX_STALLED_RESTARTS} 次`,
    );
  }

  const suffix = details.length > 0 ? `（${details.join("，")}）` : "";
  return `[系统] 检测到 Whisper 可能误报显存或异常退出，${waitSeconds} 秒后自动重试（累计 ${attempt}/${WHISPER_MAX_AUTO_RESTARTS} 次）${suffix}`;
};

export const formatWhisperAutoRestartAbortLog = ({
  attempt,
  stalledAttempt,
}) => {
  if (stalledAttempt > WHISPER_MAX_STALLED_RESTARTS) {
    return `[系统] 已停止自动重试：连续 ${stalledAttempt - 1} 次恢复后仍未观察到新进度，请检查 Whisper 引擎日志。`;
  }

  return `[系统] 已停止自动重试：累计自动恢复 ${attempt - 1} 次，已达到安全上限。`;
};
