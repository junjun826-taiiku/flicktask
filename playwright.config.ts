import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';
const isLocal = baseURL.includes('localhost');

export default defineConfig({
  testDir: 'tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  // @local tests need the dev-only test login, which production (correctly) does not have
  grepInvert: isLocal ? undefined : /@local/,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: isLocal ? /prod\.spec/ : /app\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: isLocal ? /prod\.spec/ : /.*/ },
  ],
  webServer: isLocal
    ? { command: 'npx vite --port 5173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
