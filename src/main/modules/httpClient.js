/**
 * 统一的 HTTP 客户端管理
 * 解决代理配置和客户端复用问题
 * 支持请求/响应拦截器
 */

import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getConfig } from "./config";
import { createLogSender } from "../utils/logger";
import { normalizeError } from "../utils/errorHandler.js";

const logger = createLogSender("http");

// 单例客户端实例
let asmrClient = null;
let tgClient = null;
let asmrProxyInUse = null;
let tgProxyInUse = null;

// 默认代理列表（按优先级排序）
const DEFAULT_PROXIES = [
  "http://127.0.0.1:7890",
  "http://127.0.0.1:1080",
  "http://localhost:7890",
];

function resolveProxyUrl(config, scope) {
  // 全局代理优先，其次使用模块代理，再回落默认代理。
  return (
    config?.system?.proxyUrl || config?.[scope]?.proxyUrl || DEFAULT_PROXIES[0]
  );
}

/**
 * 获取 ASMR API 客户端（带代理支持，从配置读取）
 */
export function getAsmrClient() {
  const config = getConfig();
  const proxyUrl = resolveProxyUrl(config, "asmr");

  if (asmrClient && asmrProxyInUse === proxyUrl) {
    return asmrClient;
  }

  asmrClient = createClientWithInterceptors("asmr", proxyUrl);
  asmrProxyInUse = proxyUrl;
  logger.info(`[HTTP] 创建 ASMR 客户端，使用代理: ${proxyUrl}`);

  return asmrClient;
}

/**
 * 获取 Telegram API 客户端
 */
export function getTgClient() {
  const config = getConfig();
  const proxyUrl = resolveProxyUrl(config, "tg");

  if (tgClient && tgProxyInUse === proxyUrl) {
    return tgClient;
  }

  tgClient = createClientWithInterceptors("tg", proxyUrl);
  tgProxyInUse = proxyUrl;
  logger.info(`[HTTP] 创建 Telegram 客户端，使用代理: ${proxyUrl}`);

  return tgClient;
}

/**
 * 创建带拦截器的客户端
 */
function createClientWithInterceptors(name, proxyUrl) {
  let agent = null;

  try {
    agent = new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    logger.error(`[HTTP] 代理设置失败，使用直连: ${e.message}`);
  }

  const client = axios.create({
    timeout: 30000,
    httpsAgent: agent,
    proxy: false,
  });

  // 请求拦截器
  client.interceptors.request.use(
    (config) => {
      // 添加默认 headers
      config.headers = config.headers || {};
      config.headers["User-Agent"] =
        config.headers["User-Agent"] || "KuruHaru/1.0";
      config.headers["Accept"] = config.headers["Accept"] || "application/json";

      // 记录请求
      logger.debug(
        `[${name}] 请求: ${config.method?.toUpperCase()} ${config.url}`,
      );

      return config;
    },
    (error) => {
      logger.error(`[${name}] 请求错误: ${error.message}`);
      return Promise.reject(error);
    },
  );

  // 响应拦截器
  client.interceptors.response.use(
    (response) => {
      logger.debug(`[${name}] 响应: ${response.status} ${response.config.url}`);
      return response;
    },
    async (error) => {
      const normalized = normalizeError(error);

      // 如果是网络错误，尝试切换代理
      if (normalized.error.type === "network" && shouldRetryWithProxy(error)) {
        logger.warn(`[${name}] 网络错误，尝试切换代理...`);
        const newProxy = await tryNextProxy(name, proxyUrl);
        if (newProxy) {
          logger.info(`[${name}] 切换代理成功: ${newProxy}`);
          // 重新创建客户端
          return createClientWithInterceptors(name, newProxy).request(
            error.config,
          );
        }
      }

      logger.error(
        `[${name}] 响应错误: ${normalized.error.message} (${normalized.error.code})`,
      );
      return Promise.reject(normalized);
    },
  );

  return client;
}

/**
 * 检查是否应该使用代理重试
 */
function shouldRetryWithProxy(error) {
  // 只在连接被拒绝或超时时重试
  return (
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ENOTFOUND"
  );
}

/**
 * 尝试下一个代理
 */
async function tryNextProxy(name, currentProxy) {
  const proxies = [currentProxy, ...DEFAULT_PROXIES].filter(
    (p) => p !== currentProxy,
  );

  for (const proxy of proxies) {
    try {
      // 测试代理是否可用
      const testClient = axios.create({
        timeout: 5000,
        proxy: false,
        httpsAgent: new HttpsProxyAgent(proxy),
      });

      await testClient.get("https://www.google.com", {
        validateStatus: () => true,
      });

      return proxy;
    } catch {
      logger.debug(`[${name}] 代理 ${proxy} 不可用`);
    }
  }

  return null;
}

/**
 * 获取通用 HTTP 客户端
 */
export function getHttpClient(options = {}) {
  const { timeout = 30000, proxyUrl = null } = options;

  if (proxyUrl) {
    try {
      const agent = new HttpsProxyAgent(proxyUrl);
      return axios.create({ timeout, httpsAgent: agent, proxy: false });
    } catch (e) {
      logger.error("[HTTP] 客户端创建失败:", e.message);
      return axios.create({ timeout });
    }
  }
  return axios.create({ timeout });
}

/**
 * 清除客户端缓存（用于配置更改时重置）
 */
export function clearClientCache() {
  asmrClient = null;
  tgClient = null;
  asmrProxyInUse = null;
  tgProxyInUse = null;
  logger.info("[HTTP] 客户端缓存已清除");
}
