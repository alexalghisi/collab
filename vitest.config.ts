import { defineConfig } from 'vitest/config';

/**
 * Two projects:
 * - `unit`: transport, server and meeting logic in Node, no renderer.
 * - `components`: React Native components rendered through react-native-web in
 *   jsdom, the same renderer the web build ships.
 */
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
        },
      },
      {
        extends: true,
        resolve: {
          alias: { 'react-native': 'react-native-web' },
          extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.json'],
        },
        define: { __DEV__: 'false' },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
