import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/routeTree.gen.ts',
        'src/routes/api/**',
      ],
    },
  },
})
