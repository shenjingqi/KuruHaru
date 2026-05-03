/**
 * errorHandler.js 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  normalizeError,
  formatErrorMessage,
  isRetryable,
  getRecoveryActions,
  ERROR_TYPE,
  ERROR_SEVERITY,
} from "./errorHandler.js";

describe("errorHandler.js", () => {
  describe("normalizeError", () => {
    it("应该处理网络错误", () => {
      const error = {
        code: "ECONNREFUSED",
        message: "Connection refused",
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.NETWORK);
      expect(result.error.retryable).toBe(true);
    });

    it("应该处理超时错误", () => {
      const error = {
        message: "timeout: Request timeout",
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.TIMEOUT);
      expect(result.error.retryable).toBe(true);
    });

    it("应该处理认证错误 (401)", () => {
      const error = {
        response: {
          status: 401,
          data: { message: "Unauthorized" },
        },
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.AUTH);
      expect(result.error.retryable).toBe(false);
    });

    it("应该处理认证错误 (403)", () => {
      const error = {
        response: {
          status: 403,
          data: { message: "Forbidden" },
        },
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.AUTH);
      expect(result.error.retryable).toBe(false);
    });

    it("应该处理 404 错误", () => {
      const error = {
        response: {
          status: 404,
          data: { message: "Not found" },
        },
      };
      const result = normalizeError(error, { context: "资源不存在" });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("资源不存在");
    });

    it("应该处理服务器错误 (500)", () => {
      const error = {
        response: {
          status: 500,
          data: { message: "Internal server error" },
        },
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.SYSTEM);
      expect(result.error.retryable).toBe(true);
    });

    it("应该处理验证错误 (422)", () => {
      const error = {
        response: {
          status: 422,
          data: {
            errors: [{ param: "username", msg: "用户名必填" }],
          },
        },
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.VALIDATION);
      expect(result.error.fieldErrors).toBeDefined();
      expect(result.error.fieldErrors.username).toBe("用户名必填");
    });

    it("应该处理用户取消", () => {
      const error = {
        name: "AbortError",
        message: "USER_CANCEL",
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.CANCELLED);
      expect(result.error.retryable).toBe(false);
    });

    it("应该兼容已标准化错误对象", () => {
      const normalized = normalizeError({
        code: "ECONNREFUSED",
        message: "Connection refused",
      });
      const result = normalizeError(normalized);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.NETWORK);
      expect(result.message).toBe(result.error.message);
      expect(result.code).toBe(result.error.code);
    });

    it("应该将 TLS 握手断开识别为网络错误", () => {
      const error = {
        message:
          "Client network socket disconnected before secure TLS connection was established",
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.NETWORK);
      expect(result.error.code).toBe("NETWORK_ERROR");
      expect(result.error.retryable).toBe(true);
    });

    it("应该处理默认未知错误", () => {
      const error = {
        message: "Some unknown error",
      };
      const result = normalizeError(error);

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ERROR_TYPE.SYSTEM);
      expect(result.error.code).toBe("UNKNOWN_ERROR");
    });
  });

  describe("formatErrorMessage", () => {
    it("应该格式化错误消息", () => {
      const normalizedError = {
        error: {
          message: "网络连接失败",
          severity: ERROR_SEVERITY.ERROR,
        },
      };
      const result = formatErrorMessage(normalizedError);

      expect(result).toContain("❌");
      expect(result).toContain("网络连接失败");
    });

    it("应该支持前缀", () => {
      const normalizedError = {
        error: {
          message: "网络连接失败",
          severity: ERROR_SEVERITY.ERROR,
        },
      };
      const result = formatErrorMessage(normalizedError, "错误:");

      expect(result).toContain("错误:");
      expect(result).toContain("网络连接失败");
    });
  });

  describe("isRetryable", () => {
    it("应该正确判断可重试错误", () => {
      const retryableError = {
        error: { retryable: true },
      };
      const nonRetryableError = {
        error: { retryable: false },
      };

      expect(isRetryable(retryableError)).toBe(true);
      expect(isRetryable(nonRetryableError)).toBe(false);
    });
  });

  describe("getRecoveryActions", () => {
    it("应该返回恢复建议", () => {
      const error = {
        error: {
          actions: ["检查网络", "重试"],
        },
      };
      const result = getRecoveryActions(error);

      expect(result).toEqual(["检查网络", "重试"]);
    });

    it("应该处理没有建议的情况", () => {
      const error = {
        error: {},
      };
      const result = getRecoveryActions(error);

      expect(result).toEqual([]);
    });
  });
});
