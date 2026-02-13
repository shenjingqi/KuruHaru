/**
 * 重试包装器
 * 为网络操作提供指数退避重试机制
 */

import { normalizeError, isRetryable } from './errorHandler.js'

/**
 * 带重试的异步函数执行
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 重试配置
 * @returns {Promise} 执行结果
 */
export async function withRetry(fn, options = {}) {
  const { maxRetries = 3, backoff = 1000, onRetry = null } = options

  let lastError
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const result = await fn()
      // 成功，直接返回
      return result
    } catch (error) {
      lastError = error

      // 检查是否可重试
      const normalizedError = normalizeError(error)
      const retryable = isRetryable(normalizedError)

      // 如果不可重试或已达到最大重试次数，抛出错误
      if (!retryable || attempt >= maxRetries - 1) {
        throw error
      }

      // 重试前回调
      if (onRetry) {
        onRetry(attempt + 1, error)
      }

      // 指数退避等待
      const delay = backoff * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))

      attempt++
    }
  }

  // 所有重试都失败，抛出最后一个错误
  throw lastError
}
