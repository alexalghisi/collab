const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shim = path.resolve(__dirname, 'src/shims/webcrypto.cjs');
const defaultResolve = config.resolver.resolveRequest;
/** Browser-only packages: native builds get an empty module instead. */
const WEB_ONLY = new Set(['@shiguredo/noise-suppression']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'isomorphic-webcrypto' ||
    moduleName === 'isomorphic-webcrypto/src/react-native'
  ) {
    return { type: 'sourceFile', filePath: shim };
  }
  if (platform !== 'web' && WEB_ONLY.has(moduleName)) {
    return { type: 'empty' };
  }
  if (defaultResolve) {
    return defaultResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
