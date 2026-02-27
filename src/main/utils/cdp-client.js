/**
 * CDP (Chrome DevTools Protocol) 客户端
 *
 * 依赖方向: Types → Config → Utils
 *
 * 用于连接 Electron 应用的 DevTools 端口，获取 UI 状态信息
 */

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = "localhost";

/**
 * CDP 客户端类
 */
export class CDPClient {
  constructor(options = {}) {
    this.host = options.host || DEFAULT_HOST;
    this.port = options.port || DEFAULT_PORT;
    this.ws = null;
    this.connected = false;
  }

  /**
   * 连接到 CDP WebSocket
   */
  async connect() {
    try {
      // 动态导入，确保在 Electron 环境中可用
      const wsLib = await import("ws");

      return new Promise((resolve, reject) => {
        const wsUrl = `ws://${this.host}:${this.port}`;
        this.ws = new wsLib.default(wsUrl);

        this.ws.on("open", () => {
          this.connected = true;
          resolve();
        });

        this.ws.on("error", (err) => {
          this.connected = false;
          reject(new Error(`CDP connection failed: ${err.message}`));
        });

        this.ws.on("message", (_data) => {
          // 消息处理
        });
      });
    } catch (err) {
      throw new Error(`CDP connect error: ${err.message}`);
    }
  }

  /**
   * 发送 CDP 命令
   */
  async send(method, params = {}) {
    if (!this.connected || !this.ws) {
      throw new Error("CDP not connected");
    }

    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      const message = JSON.stringify({
        id,
        method,
        params,
      });

      const timeout = setTimeout(() => {
        reject(new Error(`CDP command timeout: ${method}`));
      }, 30000);

      const handler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            clearTimeout(timeout);
            this.ws.removeListener("message", handler);
            if (response.result) {
              resolve(response.result);
            } else if (response.error) {
              reject(new Error(`CDP error: ${response.error.message}`));
            }
          }
        } catch (_e) {
          // 忽略解析错误
        }
      };

      this.ws.on("message", handler);
      this.ws.send(message);
    });
  }

  /**
   * 获取页面列表
   */
  async getPages() {
    const result = await this.send("Target.getTargets");
    return result.targetInfos.filter((t) => t.type === "page");
  }

  /**
   * 创建页面会话
   */
  async createSession(targetId) {
    const result = await this.send("Target.attachToTarget", { targetId });
    return result.sessionId;
  }

  /**
   * 评估 JavaScript
   */
  async evaluate(sessionId, expression) {
    return this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      sessionId,
    });
  }

  /**
   * 获取 DOM 文档
   */
  async getDocument(sessionId) {
    const result = await this.send("DOM.getDocument", { sessionId });
    return result.root;
  }

  /**
   * 查询选择器
   */
  async querySelector(sessionId, nodeId, selector) {
    const result = await this.send("DOM.querySelector", {
      nodeId,
      selector,
      sessionId,
    });
    return result.nodeId;
  }

  /**
   * 获取节点属性
   */
  async getAttributes(sessionId, nodeId) {
    const result = await this.send("DOM.getAttributes", {
      nodeId,
      sessionId,
    });
    return result.attributes;
  }

  /**
   * 获取页面截图
   */
  async takeScreenshot(sessionId, options = {}) {
    const result = await this.send("Page.captureScreenshot", {
      format: options.format || "png",
      quality: options.quality || 80,
      sessionId,
    });
    return Buffer.from(result.data, "base64");
  }

  /**
   * 监听 console 事件
   */
  async enableConsole(sessionId) {
    await this.send("Runtime.enable", { sessionId });
  }

  /**
   * 获取控制台消息
   */
  async getConsoleMessages(sessionId) {
    const result = await this.send("Runtime.getConsoleAPICalledHistory", {
      sessionId,
    });
    return result.entries || [];
  }

  /**
   * 获取页面加载状态
   */
  async getLoadEvent(sessionId) {
    const result = await this.send("Performance.getMetrics", { sessionId });
    return result.metrics;
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}

/**
 * 创建 CDP 客户端实例
 * @param {Object} options - 连接选项
 * @returns {CDPClient} CDP 客户端实例
 */
export function createCDPClient(options) {
  return new CDPClient(options);
}

/**
 * 获取 Electron 应用的 CDP 端口
 * 从命令行参数或环境变量获取
 */
export function getCDPPort() {
  // 从进程参数查找
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--remote-debugging-port") {
      return parseInt(process.argv[i + 1], 10);
    }
  }

  // 从环境变量读取
  if (process.env.CDP_PORT) {
    return parseInt(process.env.CDP_PORT, 10);
  }

  return DEFAULT_PORT;
}

/**
 * 检查 CDP 端口是否可用
 */
export async function isCDPAvailable(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  try {
    const net = await import("net");

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        resolve(false);
      });

      socket.connect(port, host);
    });
  } catch {
    return false;
  }
}
