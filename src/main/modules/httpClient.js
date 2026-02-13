/**
 * 统一的 HTTP 客户端管理
 * 解决代理配置和客户端复用问题
 */

import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { getConfig } from './config'
import { createLogSender } from '../utils/logger'

const logger = createLogSender('http')

// 单例客户端实例
let asmrClient = null

/**
 * 获取 ASMR API 客户端（带代理支持，从配置读取）
 */
export function getAsmrClient() {
  if (asmrClient) {
    return asmrClient
  }

  const config = getConfig()
  // 从配置读取代理地址，支持自定义
  const proxyUrl = config.asmr?.proxyUrl || 'http://127.0.0.1:7890'

  try {
    const agent = new HttpsProxyAgent(proxyUrl)
    logger.info('[HTTP] 创建 ASMR 客户端，使用代理:', proxyUrl)
    asmrClient = axios.create({
      timeout: 30000,
      httpsAgent: agent,
      proxy: false
    })
  } catch (e) {
    logger.error('[HTTP] 代理设置失败，使用直连:', e.message)
    asmrClient = axios.create({ timeout: 30000 })
  }

  return asmrClient
}

/**
 * 获取通用 HTTP 客户端
 */
export function getHttpClient(options = {}) {
  const { timeout = 30000, proxyUrl = null } = options

  try {
    if (proxyUrl) {
      const agent = new HttpsProxyAgent(proxyUrl)
      return axios.create({ timeout, httpsAgent: agent, proxy: false })
    }
    return axios.create({ timeout })
  } catch (e) {
    logger.error('[HTTP] 客户端创建失败:', e.message)
    return axios.create({ timeout })
  }
}

/**
 * 清除客户端缓存（用于配置更改时重置）
 */
export function clearClientCache() {
  asmrClient = null
  logger.info('[HTTP] 客户端缓存已清除')
}
