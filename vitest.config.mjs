import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: [
        'src/test/resources/web/js/**/*.test.mjs',
        'src/test/resources/web/js/**/*.test.js',
    ],
  }
});
