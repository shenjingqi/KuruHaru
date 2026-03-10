import fs from "fs";
import path from "path";

const ensureAbort = (signal) => {
  if (signal?.aborted) {
    const error = new Error("任务已取消");
    error.code = "WORKFLOW_CANCELLED";
    throw error;
  }
};

const resolveNodeInput = ({ inputValues, inputMap }) => {
  if (Array.isArray(inputValues) && inputValues.length > 0) {
    return inputValues[0];
  }

  if (inputMap && typeof inputMap === "object") {
    const firstKey = Object.keys(inputMap)[0];
    if (firstKey) {
      return inputMap[firstKey];
    }
  }

  return undefined;
};

const resolvePath = ({ config, inputValues, inputMap }) => {
  const fromConfig =
    typeof config?.path === "string" && config.path.trim()
      ? config.path.trim()
      : "";
  if (fromConfig) {
    return fromConfig;
  }

  const nodeInput = resolveNodeInput({ inputValues, inputMap });
  if (typeof nodeInput === "string" && nodeInput.trim()) {
    return nodeInput.trim();
  }

  if (nodeInput && typeof nodeInput === "object") {
    if (typeof nodeInput.path === "string" && nodeInput.path.trim()) {
      return nodeInput.path.trim();
    }
  }

  return "";
};

const resolveContent = ({ config, inputValues, inputMap }) => {
  if (Object.prototype.hasOwnProperty.call(config || {}, "content")) {
    return config.content;
  }

  const nodeInput = resolveNodeInput({ inputValues, inputMap });
  if (nodeInput === undefined) {
    return "";
  }

  if (typeof nodeInput === "string") {
    return nodeInput;
  }

  if (typeof nodeInput === "object") {
    if (typeof nodeInput.content === "string") {
      return nodeInput.content;
    }
    return JSON.stringify(nodeInput, null, 2);
  }

  return String(nodeInput);
};

export const CORE_NODE_DEFINITIONS = [
  {
    type: "input.manual",
    label: "手动输入",
    category: "input",
    description: "输出节点配置中的 value，或透传上游输入",
    defaultConfig: {
      value: "",
    },
    execute: async ({ config, inputValues, inputMap, signal }) => {
      ensureAbort(signal);
      if (Object.prototype.hasOwnProperty.call(config || {}, "value")) {
        return config.value;
      }
      const input = resolveNodeInput({ inputValues, inputMap });
      return input === undefined ? null : input;
    },
  },
  {
    type: "file.readText",
    label: "读取文本文件",
    category: "file",
    description: "读取文本文件内容并输出",
    defaultConfig: {
      path: "",
      encoding: "utf-8",
    },
    execute: async ({ config, inputValues, inputMap, signal }) => {
      ensureAbort(signal);
      const filePath = resolvePath({ config, inputValues, inputMap });
      if (!filePath) {
        throw new Error("file.readText 缺少 path 参数");
      }

      const encoding =
        typeof config?.encoding === "string" && config.encoding.trim()
          ? config.encoding.trim()
          : "utf-8";

      const content = await fs.promises.readFile(filePath, encoding);
      return {
        path: filePath,
        content,
      };
    },
  },
  {
    type: "file.writeText",
    label: "写入文本文件",
    category: "file",
    description: "将文本写入指定路径，内容可来自 config.content 或上游输入",
    defaultConfig: {
      path: "",
      content: "",
      encoding: "utf-8",
    },
    execute: async ({ config, inputValues, inputMap, signal }) => {
      ensureAbort(signal);
      const filePath = resolvePath({ config, inputValues, inputMap });
      if (!filePath) {
        throw new Error("file.writeText 缺少 path 参数");
      }

      const encoding =
        typeof config?.encoding === "string" && config.encoding.trim()
          ? config.encoding.trim()
          : "utf-8";
      const content = resolveContent({ config, inputValues, inputMap });

      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, encoding);

      return {
        path: filePath,
        bytes: Buffer.byteLength(content, encoding),
      };
    },
  },
  {
    type: "util.delay",
    label: "延时节点",
    category: "util",
    description: "按配置等待指定毫秒数",
    defaultConfig: {
      ms: 500,
    },
    execute: async ({ config, signal }) => {
      ensureAbort(signal);
      const ms = Math.max(
        0,
        Math.min(30 * 60 * 1000, Number.parseInt(config?.ms, 10) || 0),
      );
      if (!ms) {
        return { delayedMs: 0 };
      }

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, ms);

        const onAbort = () => {
          clearTimeout(timer);
          cleanup();
          const error = new Error("任务已取消");
          error.code = "WORKFLOW_CANCELLED";
          reject(error);
        };

        const cleanup = () => {
          signal?.removeEventListener("abort", onAbort);
        };

        signal?.addEventListener("abort", onAbort, { once: true });
      });

      return { delayedMs: ms };
    },
  },
  {
    type: "output.inspect",
    label: "调试输出",
    category: "output",
    description: "透传上游输入，便于在运行记录中检查数据",
    defaultConfig: {},
    execute: async ({ inputValues, inputMap, signal }) => {
      ensureAbort(signal);
      if (Array.isArray(inputValues) && inputValues.length === 1) {
        return inputValues[0];
      }
      if (Array.isArray(inputValues) && inputValues.length > 1) {
        return inputValues;
      }
      return inputMap || null;
    },
  },
];
