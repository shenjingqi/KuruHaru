const localBridge = window.api.local || {};

const resolveLocalMethod = (method, fallback) => {
  if (typeof localBridge[method] === "function") {
    return localBridge[method];
  }
  if (typeof window.api[fallback] === "function") {
    return window.api[fallback];
  }
  throw new Error(
    `[localApi] Missing API bridge method: ${method} (${fallback})`,
  );
};

const callLocal = (method, fallback, ...args) =>
  resolveLocalMethod(method, fallback)(...args);

export const scanLocalArchives = (dir) =>
  callLocal("scanLocalArchives", "scanLocalArchives", dir);

export const readFile = (filePath) => {
  if (typeof localBridge.readFile === "function") {
    return localBridge.readFile(filePath);
  }
  if (typeof window.api.readFile === "function") {
    return window.api.readFile(filePath);
  }
  throw new Error("[localApi] Missing API bridge method: readFile");
};

export const writeFile = (payload) =>
  callLocal("writeFile", "writeFile", payload);
