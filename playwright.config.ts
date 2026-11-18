import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a real server. Locally they use the dev server
// on port 3030 (reused if already running). In CI the app is built and started
// with `next start`. Set PLAYWRIGHT_BASE_URL to test a running deployment.
const port = 3030;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Generous: the first visit to a page compiles it in dev mode.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // CLAUDE.md §4a: every page is checked at 390px.
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: process.env.CI
      ? `npm run start -- -p ${port}`
      : `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
