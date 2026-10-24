import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ROOT = join(__dirname, '..', '..');

interface Babel {
  transformSync(
    code: string,
    options: {
      filename: string;
      cwd: string;
      configFile: string;
      babelrc: boolean;
      sourceType: 'module';
      caller: { name: string; platform: string; bundler: string; isDev: boolean };
    },
  ): { code?: string | null } | null;
}

interface MetroConfig {
  resolver: {
    resolveRequest: (
      context: { resolveRequest: (...args: unknown[]) => unknown },
      moduleName: string,
      platform: string,
    ) => unknown;
  };
}

/**
 * The RNNoise package reads `import.meta.url`. Metro serves lazy web chunks as
 * classic scripts, where that is a syntax error, and Hermes refuses it outright,
 * so a plain build left the web chunk unloadable and failed the Android bundle.
 */
describe('RNNoise in the app bundles', () => {
  it('rewrites import.meta for web chunks', () => {
    const babel = require('@babel/core') as Babel;
    const result = babel.transformSync('export const base = import.meta.url;', {
      filename: join(ROOT, 'node_modules/@shiguredo/noise-suppression/dist/noise_suppression.js'),
      cwd: ROOT,
      configFile: join(ROOT, 'babel.config.js'),
      babelrc: false,
      sourceType: 'module',
      caller: { name: 'metro', platform: 'web', bundler: 'metro', isDev: false },
    });

    expect(result?.code).not.toContain('import.meta');
    expect(result?.code).toContain('__ExpoImportMetaRegistry');
  });

  it('leaves the browser-only package out of native bundles', () => {
    const config = require(join(ROOT, 'metro.config.js')) as MetroConfig;
    const fallback = (): unknown => ({ type: 'sourceFile', filePath: 'resolved' });

    for (const platform of ['android', 'ios']) {
      expect(
        config.resolver.resolveRequest(
          { resolveRequest: fallback },
          '@shiguredo/noise-suppression',
          platform,
        ),
      ).toEqual({ type: 'empty' });
    }
    expect(
      config.resolver.resolveRequest(
        { resolveRequest: fallback },
        '@shiguredo/noise-suppression',
        'web',
      ),
    ).not.toEqual({ type: 'empty' });
  });
});
