import { getApiNamespace, getWindowApi, resolveBridgeMethod } from "./bridge";

const getToolsBridge = () => getApiNamespace("tools");
const getWhisperBridge = () => getApiNamespace("whisper");

const callTools = (method, fallback, payload) => {
  const resolved = resolveBridgeMethod({
    namespace: "tools",
    method,
    fallbacks: [fallback],
  });
  return resolved(payload);
};

export const extractFileNames = (payload) =>
  callTools("extractFileNames", "extractFileNames", payload);

export const cleanData = (payload) =>
  callTools("cleanData", "cleanData", payload);

export const cleanRecentUploadedSubtitles = (payload) =>
  callTools(
    "cleanRecentUploadedSubtitles",
    "cleanRecentUploadedSubtitles",
    payload,
  );

export const zipSubtitles = (payload) => {
  const toolsBridge = getToolsBridge();
  const whisperBridge = getWhisperBridge();
  const api = getWindowApi();
  if (typeof toolsBridge.zipSubtitles === "function") {
    return toolsBridge.zipSubtitles(payload);
  }
  if (typeof whisperBridge.zipSubtitles === "function") {
    return whisperBridge.zipSubtitles(payload);
  }
  if (typeof api.zipSubtitles === "function") {
    return api.zipSubtitles(payload);
  }
  throw new Error("[toolsApi] Missing API bridge method: zipSubtitles");
};
