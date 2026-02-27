/**
 * retry.js 单元测试
 */
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("retry.js", () => {
  it("应该在成功时立即返回结果", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("应该在失败时重试指定次数", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("error");
      }
      return "success";
    };

    const result = await withRetry(fn, { maxRetries: 3, backoff: 10 });

    expect(result).toBe("success");
    expect(callCount).toBe(3);
  });

  it("应该在达到最大重试次数后抛出错误", async () => {
    const fn = async () => {
      throw new Error("persistent error");
    };

    await expect(withRetry(fn, { maxRetries: 3, backoff: 10 })).rejects.toThrow(
      "persistent error",
    );
  });

  it("应该在重试前调用 onRetry 回调", async () => {
    const onRetry = vi.fn();
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 2) {
        throw new Error("error");
      }
      return "success";
    };

    await withRetry(fn, { maxRetries: 3, backoff: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it("应该使用默认配置", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    await withRetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("应该支持自定义重试次数和退避时间", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    await withRetry(fn, { maxRetries: 5, backoff: 500 });

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
