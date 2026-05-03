import { callBridge, getApiNamespace, getWindowApi, noop, resolveBridgeMethod } from './bridge';

const getAsmrBridge = () => getApiNamespace('asmr');

export const asmrLogin = (payload) =>
  callBridge({
    namespace: 'asmr',
    method: 'login',
    fallbacks: ['asmrLogin'],
    args: [payload],
  });

export const asmrFetchCloudWorks = () =>
  callBridge({
    namespace: 'asmr',
    method: 'fetchCloudWorks',
    fallbacks: ['asmrFetchCloudWorks'],
  });

export const asmrRunAudioDownloader = (payload) =>
  callBridge({
    namespace: 'asmr',
    method: 'runAudioDownloader',
    fallbacks: ['asmrRunAudioDownloader'],
    args: [payload],
    fallbackValue: () => {
      const api = getWindowApi();
      if (typeof api?.invoke === 'function') {
        return api.invoke('asmr-audio-downloader-run', payload);
      }
      throw new Error(
        '[renderer-api] Missing bridge method: asmr.runAudioDownloader / asmrRunAudioDownloader / invoke',
      );
    },
  });

export const asmrDeleteWorks = (workIds) =>
  callBridge({
    namespace: 'asmr',
    method: 'deleteWorks',
    fallbacks: ['asmrDeleteWorks'],
    args: [workIds],
  });

export const asmrGetCachedCloudWorks = () =>
  callBridge({
    namespace: 'asmr',
    method: 'getCachedCloudWorks',
    fallbacks: ['asmrGetCachedCloudWorks'],
  });

export const onCloudWorksUpdated = (callback) => {
  const bridge = getAsmrBridge();
  const api = getWindowApi();
  if (typeof bridge.onCloudWorksUpdated === 'function') {
    return bridge.onCloudWorksUpdated(callback);
  }
  if (typeof api.onCloudWorksUpdated === 'function') {
    return api.onCloudWorksUpdated(callback);
  }
  if (typeof api.on === 'function') {
    api.on('cloud-works-updated', callback);
    return () => api.removeAllListeners?.('cloud-works-updated');
  }
  return noop;
};

export const removeCloudWorksUpdatedListeners = () => {
  const bridge = getAsmrBridge();
  const api = getWindowApi();
  if (typeof bridge.removeCloudWorksUpdatedListeners === 'function') {
    return bridge.removeCloudWorksUpdatedListeners();
  }
  if (typeof api.removeCloudWorksUpdatedListeners === 'function') {
    return api.removeCloudWorksUpdatedListeners();
  }
  return api.removeAllListeners?.('cloud-works-updated');
};

export const asmrDeleteByRJ = (rjCodes) =>
  callBridge({
    namespace: 'asmr',
    method: 'deleteByRJ',
    fallbacks: ['asmrDeleteByRJ'],
    args: [rjCodes],
  });

export const asmrFetchChineseWorks = (options) =>
  callBridge({
    namespace: 'asmr',
    method: 'fetchChineseWorks',
    fallbacks: ['asmrFetchChineseWorks'],
    args: [options],
  });

export const asmrSetChineseListPath = (path) =>
  callBridge({
    namespace: 'asmr',
    method: 'setChineseListPath',
    fallbacks: ['asmrSetChineseListPath'],
    args: [path],
  });

export const asmrGetChineseListPath = () =>
  callBridge({
    namespace: 'asmr',
    method: 'getChineseListPath',
    fallbacks: ['asmrGetChineseListPath'],
  });

export const asmrReadChineseList = () =>
  callBridge({
    namespace: 'asmr',
    method: 'readChineseList',
    fallbacks: ['asmrReadChineseList'],
  });

export const asmrWriteChineseList = (rjCodes) => {
  const method = resolveBridgeMethod({
    namespace: 'asmr',
    method: 'writeChineseList',
    fallbacks: ['asmrWriteChineseList'],
  });
  return method(rjCodes);
};

export const onChineseListProgress = (handler) => {
  const bridge = getAsmrBridge();
  const api = getWindowApi();
  if (typeof bridge.onChineseListProgress === 'function') {
    return bridge.onChineseListProgress(handler);
  }
  if (typeof api.onChineseListProgress === 'function') {
    return api.onChineseListProgress(handler);
  }
  if (typeof api.on === 'function') {
    api.on('chinese-list-progress', handler);
    return () => api.removeAllListeners?.('chinese-list-progress');
  }
  return noop;
};

export const removeChineseListProgressListener = (handler) => {
  const bridge = getAsmrBridge();
  const api = getWindowApi();
  if (typeof bridge.removeChineseListProgressListener === 'function') {
    return bridge.removeChineseListProgressListener(handler);
  }
  if (typeof api.removeChineseListProgressListener === 'function') {
    return api.removeChineseListProgressListener(handler);
  }
  return api.removeListener?.('chinese-list-progress', handler);
};

export const filterRjFromUrl = (payload) => {
  const method = resolveBridgeMethod({
    namespace: 'asmr',
    method: 'filterRjFromUrl',
    fallbacks: ['filterRjFromUrl', 'filterRjFromUrlLegacy'],
  });
  return method(payload);
};
