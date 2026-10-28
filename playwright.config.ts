import { defineConfig, devices } from "@playwright/test";

const SYN = 5310;
const SD = 5311;
const stilldrawn = !!process.env.BP_STILLDRAWN; // needs the network (media on R2)

const sizes = [
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "390", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;
const schemes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "retain-on-failure" },
  projects: sizes.flatMap((s) =>
    schemes.map((colorScheme) => ({
      name: `${s.name}-${colorScheme}`,
      testMatch: stilldrawn ? /.*\.spec\.ts/ : /synthetic\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: s.viewport, isMobile: "isMobile" in s, hasTouch: "hasTouch" in s, colorScheme },
    })),
  ),
  webServer: [
    {
      command: `node bin/blindpanel.mjs dev examples/synthetic/study.yaml --port ${SYN} --out .blindpanel/e2e/synthetic`,
      url: `http://localhost:${SYN}/`,
      reuseExistingServer: !process.env.CI,
    },
    ...(stilldrawn
      ? [{
          command: `node bin/blindpanel.mjs dev examples/stilldrawn/study.yaml --port ${SD} --out .blindpanel/e2e/stilldrawn`,
          url: `http://localhost:${SD}/`,
          reuseExistingServer: !process.env.CI,
        }]
      : []),
  ],
});
