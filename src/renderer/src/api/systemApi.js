import { callBridge, getApiNamespace, getWindowApi, noop } from './bridge';

const getWindowControlsBridge = () => {
  const systemBridge = getApiNamespace('system');
  const api = getWindowApi();
  return systemBridge.windowControls || api.windowControls || {};
};

const callWindowControl = (method) => {
  const bridge = getWindowControlsBridge();
  return typeof bridge?.[method] === 'function' ? bridge[method]() : null;
};

export const readImageAsBase64 = (filePath) =>
  callBridge({
    namespace: 'system',
    method: 'readImageAsBase64',
    fallbacks: ['readImageAsBase64'],
    args: [filePath],
  });

export const getDefaultAvatar = () =>
  callBridge({
    namespace: 'system',
    method: 'getDefaultAvatar',
    fallbacks: ['getDefaultAvatar'],
  });

export const clearCache = (cacheFile = 'recent_activity.json') =>
  callBridge({
    namespace: 'system',
    method: 'clearCache',
    fallbacks: ['clearCache'],
    args: [cacheFile],
  });

export const minimizeWindow = () => callWindowControl('minimize');
export const toggleMaximizeWindow = () => callWindowControl('toggleMaximize');
export const closeWindow = () => callWindowControl('close');
export const isWindowMaximized = () => callWindowControl('isMaximized');
export const getWindowState = () => callWindowControl('getState');
export const getWindowBounds = () => callWindowControl('getBounds');

export const setWindowBounds = (bounds) => {
  const bridge = getWindowControlsBridge();
  return typeof bridge?.setBounds === 'function' ? bridge.setBounds(bounds) : null;
};

export const onWindowStateChanged = (callback) => {
  const systemBridge = getApiNamespace('system');
  const api = getWindowApi();
  const subscribe =
    typeof systemBridge.onWindowStateChanged === 'function'
      ? systemBridge.onWindowStateChanged
      : api?.onWindowStateChanged;

  if (typeof subscribe !== 'function') {
    return noop;
  }

  const unsubscribe = subscribe((state) => {
    callback(state || {});
  });

  return typeof unsubscribe === 'function' ? unsubscribe : noop;
};

export const isWindowControlSupported = () => {
  const bridge = getWindowControlsBridge();
  return typeof bridge?.supported === 'boolean'
    ? bridge.supported
    : typeof bridge?.minimize === 'function';
};
