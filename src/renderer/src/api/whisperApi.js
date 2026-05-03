import { getApiNamespace, getWindowApi, resolveBridgeMethod } from './bridge';

const getWhisperBridge = () => getApiNamespace('whisper');

const callWhisper = (method, fallback, ...args) => {
  const resolved = resolveBridgeMethod({
    namespace: 'whisper',
    method,
    fallbacks: [fallback],
  });
  return resolved(...args);
};

const removeWhisperListener = (method, fallback, channel, handler) => {
  const bridge = getWhisperBridge();
  const api = getWindowApi();
  if (typeof bridge[method] === 'function') {
    return bridge[method](handler);
  }
  if (typeof api[fallback] === 'function') {
    return api[fallback](handler);
  }
  return api.removeListener?.(channel, handler);
};

export const startTask = (payload) =>
  callWhisper('startTask', 'startTask', payload);

export const stopTask = () => callWhisper('stopTask', 'stopTask');

export const countMediaFiles = (targetPath) => {
  const bridge = getWhisperBridge();
  const api = getWindowApi();
  if (typeof bridge.countMediaFiles === 'function') {
    return bridge.countMediaFiles(targetPath);
  }
  if (typeof api.countMediaFiles === 'function') {
    return api.countMediaFiles(targetPath);
  }
  throw new Error('[whisperApi] Missing API bridge method: countMediaFiles');
};

export const onTaskFinished = (handler) =>
  callWhisper('onTaskFinished', 'onTaskFinished', handler);

export const onLogUpdate = (handler) =>
  callWhisper('onLogUpdate', 'onLogUpdate', handler);

export const removeTaskFinishedListener = (handler) =>
  removeWhisperListener(
    'removeTaskFinishedListener',
    'removeTaskFinishedListener',
    'task-finished',
    handler,
  );

export const removeLogUpdateListener = (handler) =>
  removeWhisperListener(
    'removeLogUpdateListener',
    'removeLogUpdateListener',
    'log-update',
    handler,
  );
