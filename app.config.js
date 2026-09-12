/**
 * GitHub Pages serves the site from a sub-path (/collab). Everything else —
 * native bundles and the Electron shell — loads from the root, so the base
 * URL is only applied when the deploy sets WEB_BASE_URL.
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.WEB_BASE_URL;
  if (!baseUrl) {
    return config;
  }
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
