import { callBridge } from './bridge';

export const openDirectory = () =>
  callBridge({
    namespace: 'dialog',
    method: 'openDirectory',
    fallbacks: ['dialogOpenDirectory'],
  });

export const openFile = (options) =>
  callBridge({
    namespace: 'dialog',
    method: 'openFile',
    fallbacks: ['dialogOpenFile'],
    args: [options],
  });

export const selectFile = (type) =>
  callBridge({
    namespace: 'dialog',
    method: 'selectFile',
    fallbacks: ['selectFile'],
    args: [type],
  });

export const saveFile = (options) =>
  callBridge({
    namespace: 'dialog',
    method: 'saveFile',
    fallbacks: ['dialogSaveFile'],
    args: [options],
  });
