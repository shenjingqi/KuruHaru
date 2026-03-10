const dialogBridge = window.api.dialog || {};

const callDialog = (method, fallback, ...args) =>
  typeof dialogBridge[method] === "function"
    ? dialogBridge[method](...args)
    : window.api[fallback](...args);

export const openDirectory = () =>
  callDialog("openDirectory", "dialogOpenDirectory");

export const openFile = (options) =>
  callDialog("openFile", "dialogOpenFile", options);

export const selectFile = (type) =>
  callDialog("selectFile", "selectFile", type);

export const saveFile = (options) =>
  callDialog("saveFile", "dialogSaveFile", options);
