const createBridgeError = (namespace, method, fallbacks = []) => {
  const fallbackLabel = Array.isArray(fallbacks) && fallbacks.length
    ? ` / ${fallbacks.join(', ')}`
    : '';
  return new Error(
    `[renderer-api] Missing bridge method: ${namespace ? `${namespace}.` : ''}${method}${fallbackLabel}`,
  );
};

export const getWindowApi = () => {
  if (typeof window === 'undefined' || !window || typeof window !== 'object') {
    return {};
  }
  return window.api && typeof window.api === 'object' ? window.api : {};
};

export const getApiNamespace = (namespace) => {
  const api = getWindowApi();
  if (!namespace) {
    return api;
  }
  const bridge = api?.[namespace];
  return bridge && typeof bridge === 'object' ? bridge : {};
};

export const resolveBridgeMethod = ({
  namespace = '',
  method = '',
  fallbacks = [],
  allowMissing = false,
}) => {
  const bridge = getApiNamespace(namespace);
  if (method && typeof bridge?.[method] === 'function') {
    return bridge[method].bind(bridge);
  }

  const api = getWindowApi();
  for (const fallback of fallbacks) {
    if (fallback && typeof api?.[fallback] === 'function') {
      return api[fallback].bind(api);
    }
  }

  if (allowMissing) {
    return null;
  }

  throw createBridgeError(namespace, method, fallbacks);
};

export const callBridge = (options = {}) => {
  const {
    namespace = '',
    method = '',
    fallbacks = [],
    args = [],
    fallbackValue,
  } = options;

  const resolved = resolveBridgeMethod({
    namespace,
    method,
    fallbacks,
    allowMissing: Object.prototype.hasOwnProperty.call(options, 'fallbackValue'),
  });

  if (!resolved) {
    return typeof fallbackValue === 'function' ? fallbackValue() : fallbackValue;
  }

  return resolved(...args);
};

export const noop = () => {};
