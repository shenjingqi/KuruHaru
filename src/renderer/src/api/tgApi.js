import { callBridge, getApiNamespace, getWindowApi, noop } from './bridge';

const getTgBridge = () => getApiNamespace('tg');

export const tgCheckLogin = () =>
  callBridge({ namespace: 'tg', method: 'checkLogin', fallbacks: ['tgCheckLogin'] });

export const tgLogin = (config) =>
  callBridge({
    namespace: 'tg',
    method: 'login',
    fallbacks: ['tgLogin'],
    args: [config],
  });

export const tgUploadFiles = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'uploadFiles',
    fallbacks: ['tgUploadFiles'],
    args: [payload],
  });

export const tgCancelUpload = () =>
  callBridge({ namespace: 'tg', method: 'cancelUpload', fallbacks: ['tgCancelUpload'] });

export const tgAuthReply = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'authReply',
    fallbacks: ['tgAuthReply'],
    args: [payload],
  });

export const onTgAuthNeeded = (callback) => {
  const bridge = getTgBridge();
  const api = getWindowApi();
  if (typeof bridge.onAuthNeeded === 'function') {
    return bridge.onAuthNeeded(callback);
  }
  if (typeof api.onTgAuthNeeded === 'function') {
    return api.onTgAuthNeeded(callback);
  }
  return noop;
};

export const onTgUploadFinished = (callback) => {
  const bridge = getTgBridge();
  const api = getWindowApi();
  if (typeof bridge.onUploadFinished === 'function') {
    return bridge.onUploadFinished(callback);
  }
  if (typeof api.onTgUploadFinished === 'function') {
    return api.onTgUploadFinished(callback);
  }
  if (typeof api.on === 'function') {
    api.on('tg-upload-finished', callback);
    return () => api.removeAllListeners?.('tg-upload-finished');
  }
  return noop;
};

export const onLogUpdate = (callback) => {
  const bridge = getTgBridge();
  const api = getWindowApi();
  if (typeof bridge.onLogUpdate === 'function') {
    return bridge.onLogUpdate(callback);
  }
  if (typeof api.onLogUpdate === 'function') {
    return api.onLogUpdate(callback);
  }
  return noop;
};

export const removeAllListeners = (channel) => {
  const bridge = getTgBridge();
  const api = getWindowApi();
  if (typeof bridge.removeAllListeners === 'function') {
    return bridge.removeAllListeners(channel);
  }
  return api.removeAllListeners?.(channel);
};

export const tgGetRecentActivity = () =>
  callBridge({
    namespace: 'tg',
    method: 'getRecentActivity',
    fallbacks: ['tgGetRecentActivity'],
  });

export const tgScanRecentActivity = () =>
  callBridge({
    namespace: 'tg',
    method: 'scanRecentActivity',
    fallbacks: ['tgScanRecentActivity'],
  });

export const tgReadRecentActivity = () =>
  callBridge({
    namespace: 'tg',
    method: 'readRecentActivity',
    fallbacks: ['tgReadRecentActivity'],
  });

export const tgReadRjList = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'readRjList',
    fallbacks: ['tgReadRjList'],
    args: [payload],
  });

export const tgDownloadFile = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'downloadFile',
    fallbacks: ['tgDownloadFile'],
    args: [payload],
  });

export const tgDownloadFiles = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'downloadFiles',
    fallbacks: ['tgDownloadFiles'],
    args: [payload],
  });

export const tgBotStatus = () =>
  callBridge({ namespace: 'tg', method: 'botStatus', fallbacks: ['tgBotStatus'] });

export const tgBotStart = () =>
  callBridge({ namespace: 'tg', method: 'botStart', fallbacks: ['tgBotStart'] });

export const tgBotStop = () =>
  callBridge({ namespace: 'tg', method: 'botStop', fallbacks: ['tgBotStop'] });

export const tgBotSearch = (rjCode) =>
  callBridge({
    namespace: 'tg',
    method: 'botSearch',
    fallbacks: ['tgBotSearch'],
    args: [rjCode],
  });

export const tgBotInfo = (workCode) =>
  callBridge({
    namespace: 'tg',
    method: 'botInfo',
    fallbacks: ['tgBotInfo'],
    args: [workCode],
  });

export const tgBotSyncHistory = (options) =>
  callBridge({
    namespace: 'tg',
    method: 'botSyncHistory',
    fallbacks: ['tgBotSyncHistory'],
    args: [options],
  });

export const tgInfoCacheBuild = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'infoCacheBuild',
    fallbacks: ['tgInfoCacheBuild'],
    args: [payload],
  });

export const tgInfoCacheStatus = (payload) =>
  callBridge({
    namespace: 'tg',
    method: 'infoCacheStatus',
    fallbacks: ['tgInfoCacheStatus'],
    args: [payload],
  });

export const tgScanRjDuplicates = (options) =>
  callBridge({
    namespace: 'tg',
    method: 'scanRjDuplicates',
    fallbacks: ['tgScanRjDuplicates'],
    args: [options],
  });

export const tgDeleteDuplicateMessages = (messageIds) =>
  callBridge({
    namespace: 'tg',
    method: 'deleteDuplicateMessages',
    fallbacks: ['tgDeleteDuplicateMessages'],
    args: [messageIds],
  });

export const tgInfoErrorRecover = (options) =>
  callBridge({
    namespace: 'tg',
    method: 'infoErrorRecover',
    fallbacks: ['tgInfoErrorRecover'],
    args: [options],
  });
