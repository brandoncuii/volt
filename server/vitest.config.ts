import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run the TypeScript sources in src/. `tsc` also compiles the tests
    // into dist/__tests__/, and without this exclude vitest would collect those
    // stale .js copies too — they fail because tsc doesn't copy data JSON into
    // dist/data/.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
