import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.SMOKE_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3000',
    extraHTTPHeaders: { 'x-real-ip': '127.0.0.1' },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'bun run start',
        url: 'http://127.0.0.1:3000/api/health',
        reuseExistingServer: true,
        timeout: 30_000,
      },
})
