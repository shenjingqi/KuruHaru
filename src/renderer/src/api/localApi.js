import { callBridge, resolveBridgeMethod } from './bridge';

export const scanLocalArchives = (dir) =>
  callBridge({
    namespace: 'local',
    method: 'scanLocalArchives',
    fallbacks: ['scanLocalArchives'],
    args: [dir],
  });

export const readFile = (filePath) => {
  const method = resolveBridgeMethod({
    namespace: 'local',
    method: 'readFile',
    fallbacks: ['readFile'],
  });
  return method(filePath);
};

export const writeFile = (payload) =>
  callBridge({
    namespace: 'local',
    method: 'writeFile',
    fallbacks: ['writeFile'],
    args: [payload],
  });
