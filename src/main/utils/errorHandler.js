/**
 * 统一错误处理工具
 * 提供标准化的错误分类、映射和用户友好的错误消息
 */

/**
 * 错误类型枚举
 */
export const ERROR_TYPE = {
  NETWORK: "network", // 网络错误
  AUTH: "auth", // 认证错误
  VALIDATION: "validation", // 验证错误
  SYSTEM: "system", // 系统错误
  TIMEOUT: "timeout", // 超时错误
  CANCELLED: "cancelled", // 用户取消
};

/**
 * 错误严重级别
 */
export const ERROR_SEVERITY = {
  ERROR: "error", // 阻塞性错误
  WARN: "warning", // 非阻塞警告
  INFO: "info", // 一般信息
};

function buildNormalizedErrorResult(payload) {
  const normalizedPayload = {
    type: payload.type || ERROR_TYPE.SYSTEM,
    code: payload.code || "UNKNOWN_ERROR",
    message: payload.message || "未知错误",
    details: payload.details || "",
    severity: payload.severity || ERROR_SEVERITY.ERROR,
    retryable: payload.retryable === true,
  };

  if (Array.isArray(payload.actions) && payload.actions.length > 0) {
    normalizedPayload.actions = payload.actions;
  }

  if (payload.fieldErrors && typeof payload.fieldErrors === "object") {
    normalizedPayload.fieldErrors = payload.fieldErrors;
  }

  return {
    success: false,
    type: normalizedPayload.type,
    code: normalizedPayload.code,
    message: normalizedPayload.message,
    details: normalizedPayload.details,
    severity: normalizedPayload.severity,
    retryable: normalizedPayload.retryable,
    actions: normalizedPayload.actions || [],
    fieldErrors: normalizedPayload.fieldErrors,
    error: normalizedPayload,
  };
}

function isNormalizedErrorResult(value) {
  return (
    value &&
    typeof value === "object" &&
    value.success === false &&
    value.error &&
    typeof value.error === "object"
  );
}

function normalizeExistingErrorResult(error) {
  const payload = error?.error || {};

  return buildNormalizedErrorResult({
    type: payload.type || error?.type,
    code: payload.code || error?.code,
    message: payload.message || error?.message,
    details: payload.details || error?.details,
    severity: payload.severity || error?.severity,
    retryable:
      typeof payload.retryable === "boolean"
        ? payload.retryable
        : error?.retryable === true,
    actions: Array.isArray(payload.actions) ? payload.actions : error?.actions,
    fieldErrors: payload.fieldErrors || error?.fieldErrors,
  });
}

/**
 * 标准化错误响应格式
 * @param {Object} error - 原始错误对象
 * @param {Object} options - 配置选项
 * @returns {Object} 标准化后的错误对象
 */
export function normalizeError(error, options = {}) {
  const { context = "" } = options;

  if (isNormalizedErrorResult(error)) {
    return normalizeExistingErrorResult(error);
  }

  const rawError = error && typeof error === "object" ? error : {};
  const errorMessage =
    typeof rawError.message === "string"
      ? rawError.message
      : typeof error === "string"
        ? error
        : "";
  const loweredMessage = errorMessage.toLowerCase();
  const errorCode = String(rawError.code || rawError.errno || "")
    .trim()
    .toUpperCase();
  const response = rawError.response;
  const errorDetails =
    typeof rawError.stack === "string" && rawError.stack.trim()
      ? rawError.stack
      : errorMessage || String(error ?? "");

  // 用户取消
  if (errorMessage === "USER_CANCEL" || rawError.name === "AbortError") {
    return buildNormalizedErrorResult({
      type: ERROR_TYPE.CANCELLED,
      code: "CANCELLED",
      message: "操作已取消",
      severity: ERROR_SEVERITY.INFO,
      retryable: false,
    });
  }

  // 超时错误
  if (
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNABORTED" ||
    loweredMessage.includes("timeout")
  ) {
    return buildNormalizedErrorResult({
      type: ERROR_TYPE.TIMEOUT,
      code: "TIMEOUT",
      message: "操作超时，请重试",
      details: errorMessage,
      severity: ERROR_SEVERITY.ERROR,
      retryable: true,
      actions: ["检查网络连接", "增加超时时间", "重试操作"],
    });
  }

  // 网络错误
  if (
    !response &&
    ([
      "ENOTFOUND",
      "ECONNREFUSED",
      "ECONNRESET",
      "EAI_AGAIN",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ERR_SOCKET_CONNECTION_TIMEOUT",
    ].includes(errorCode) ||
      loweredMessage.includes(
        "client network socket disconnected before secure tls connection was established",
      ) ||
      loweredMessage.includes(
        "network socket disconnected before secure tls connection was established",
      ) ||
      loweredMessage.includes("socket hang up"))
  ) {
    return buildNormalizedErrorResult({
      type: ERROR_TYPE.NETWORK,
      code: errorCode || "NETWORK_ERROR",
      message: "网络连接失败，请检查网络设置",
      details: errorMessage,
      severity: ERROR_SEVERITY.ERROR,
      retryable: true,
      actions: ["检查网络连接", "确认代理设置", "尝试重试"],
    });
  }

  // HTTP 错误
  if (response) {
    const status = response.status;
    const data = response.data || {};

    // 认证错误 (401, 403)
    if (status === 401 || status === 403) {
      return buildNormalizedErrorResult({
        type: ERROR_TYPE.AUTH,
        code: "AUTH_FAILED",
        message: "认证失败，请检查账号密码",
        details: data.error || data.message,
        severity: ERROR_SEVERITY.ERROR,
        retryable: false,
        actions: ["检查用户名和密码", "重试登录", "联系支持"],
      });
    }

    // 验证错误 (422)
    if (status === 422) {
      if (data.errors && data.errors.length > 0) {
        // 字段级错误
        const fieldErrors = data.errors.reduce((acc, err) => {
          acc[err.param] = err.msg;
          return acc;
        }, {});

        return buildNormalizedErrorResult({
          type: ERROR_TYPE.VALIDATION,
          code: "VALIDATION_FAILED",
          message: "输入信息有误",
          details: data.errors,
          fieldErrors,
          severity: ERROR_SEVERITY.WARN,
          retryable: true,
          actions: ["检查输入格式", "修正错误后重试"],
        });
      }

      return buildNormalizedErrorResult({
        type: ERROR_TYPE.VALIDATION,
        code: "VALIDATION_FAILED",
        message: "请求格式错误",
        details: data.message,
        severity: ERROR_SEVERITY.WARN,
        retryable: true,
      });
    }

    // 404 Not Found
    if (status === 404) {
      return buildNormalizedErrorResult({
        type: ERROR_TYPE.VALIDATION,
        code: "NOT_FOUND",
        message: context || "资源未找到",
        details: data.message || errorMessage,
        severity: ERROR_SEVERITY.ERROR,
        retryable: false,
        actions: ["检查资源ID", "确认资源是否存在"],
      });
    }

    // 5xx 服务器错误
    if (status >= 500) {
      return buildNormalizedErrorResult({
        type: ERROR_TYPE.SYSTEM,
        code: "SERVER_ERROR",
        message: "服务器错误，请稍后重试",
        details: `HTTP ${status}: ${data.message || errorMessage}`,
        severity: ERROR_SEVERITY.ERROR,
        retryable: true,
        actions: ["等待片刻后重试", "检查服务器状态", "联系支持"],
      });
    }
  }

  // 默认未知错误
  return buildNormalizedErrorResult({
    type: ERROR_TYPE.SYSTEM,
    code: "UNKNOWN_ERROR",
    message: errorMessage || "未知错误",
    details: errorDetails,
    severity: ERROR_SEVERITY.ERROR,
    retryable: true,
    actions: ["查看详细错误信息", "联系技术支持"],
  });
}

/**
 * 创建用户友好的错误消息（带emoji指示器）
 * @param {Object} normalizedError - 标准化错误对象
 * @param {string} prefix - 消息前缀
 * @returns {string} 格式化后的错误消息
 */
export function formatErrorMessage(normalizedError, prefix = "") {
  const { error } = normalizedError;

  const severityIcons = {
    [ERROR_SEVERITY.ERROR]: "❌",
    [ERROR_SEVERITY.WARN]: "⚠️",
    [ERROR_SEVERITY.INFO]: "ℹ️",
  };

  const icon = severityIcons[error.severity] || "❌";
  const message = prefix ? `${prefix} ${error.message}` : error.message;

  return `${icon} ${message}`;
}

/**
 * 检查错误是否可重试
 * @param {Object} normalizedError - 标准化错误对象
 * @returns {boolean} 是否可重试
 */
export function isRetryable(normalizedError) {
  return normalizedError.error?.retryable === true;
}

/**
 * 获取错误恢复建议
 * @param {Object} normalizedError - 标准化错误对象
 * @returns {Array} 建议操作列表
 */
export function getRecoveryActions(normalizedError) {
  return normalizedError.error?.actions || [];
}
