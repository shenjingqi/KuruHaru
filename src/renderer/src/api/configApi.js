import { callBridge } from './bridge';

export const loadConfig = () =>
  callBridge({
    namespace: 'config',
    method: 'load',
    fallbacks: ['loadConfig'],
  });

export const saveConfig = (config) =>
  callBridge({
    namespace: 'config',
    method: 'save',
    fallbacks: ['saveConfig'],
    args: [config],
  });

export const saveCustomPaths = (paths) =>
  callBridge({
    namespace: 'config',
    method: 'saveCustomPaths',
    fallbacks: ['saveCustomPaths'],
    args: [paths],
  });
