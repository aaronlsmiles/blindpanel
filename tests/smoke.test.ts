import { expect, test } from "vitest";

test("core entry imports", async () => {
  expect(await import("../src/core/index.js")).toBeTruthy();
});
