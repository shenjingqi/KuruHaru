const configBridge = window.api.config || {};

const callConfig = (method, fallback, ...args) =>
  typeof configBridge[method] === "function"
    ? configBridge[method](...args)
    : window.api[fallback](...args);

export const loadConfig = () => callConfig("load", "loadConfig");

export const saveConfig = (config) => callConfig("save", "saveConfig", config);

export const saveCustomPaths = (paths) =>
  callConfig("saveCustomPaths", "saveCustomPaths", paths);
