import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch:
    process.env.E2E_LIVE === "1"
      ? "live.spec.ts"
      : /(?:demo|coaching)\.spec\.ts/,
  timeout: 120000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: process.env.E2E_URL || "http://localhost:3000",
    trace: process.env.E2E_LIVE === "1" ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
