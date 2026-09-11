// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173/',
    timezoneId: 'Europe/Kyiv',
    locale: 'ru-RU',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node serve.mjs',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
