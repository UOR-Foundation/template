import { defineConfig, devices } from '@playwright/test';

// The page is static; serve.mjs serves it from its own origin, exactly as Pages does.
export default defineConfig({
  testDir: 'tests',
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:8123' },
  webServer: { command: 'node serve.mjs 8123', url: 'http://127.0.0.1:8123/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
