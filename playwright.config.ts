import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "python3 -m http.server 4174 --bind 127.0.0.1",
    url: "http://127.0.0.1:4174/preview/design-direction.html",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
