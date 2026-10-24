module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // The RNNoise build (@shiguredo/noise-suppression) reads import.meta.url.
          // Expo loads lazy web chunks as classic scripts, where import.meta is a
          // syntax error, so rewrite it to Expo's runtime value.
          web: { unstable_transformImportMeta: true },
        },
      ],
    ],
  };
};
