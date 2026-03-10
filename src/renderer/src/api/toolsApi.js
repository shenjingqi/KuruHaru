const toolsBridge = window.api.tools || {};
const whisperBridge = window.api.whisper || {};

const resolveToolsMethod = (method, fallback) => {
  if (typeof toolsBridge[method] === "function") {
    return toolsBridge[method];
  }
  if (typeof window.api[fallback] === "function") {
    return window.api[fallback];
  }
  throw new Error(
    `[toolsApi] Missing API bridge method: ${method} (${fallback})`,
  );
};

const callTools = (method, fallback, payload) =>
  resolveToolsMethod(method, fallback)(payload);

export const extractFileNames = (payload) =>
  callTools("extractFileNames", "extractFileNames", payload);

export const cleanData = (payload) =>
  callTools("cleanData", "cleanData", payload);

export const zipSubtitles = (payload) => {
  if (typeof toolsBridge.zipSubtitles === "function") {
    return toolsBridge.zipSubtitles(payload);
  }
  if (typeof whisperBridge.zipSubtitles === "function") {
    return whisperBridge.zipSubtitles(payload);
  }
  return window.api.zipSubtitles(payload);
};
