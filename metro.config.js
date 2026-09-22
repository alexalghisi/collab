const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shim = path.resolve(__dirname, 'src/shims/webcrypto.cjs');
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'isomorphic-webcrypto' ||
    moduleName === 'isomorphic-webcrypto/src/react-native'
  ) {
    return { type: 'sourceFile', filePath: shim };
  }
  if (defaultResolve) {
    return defaultResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
