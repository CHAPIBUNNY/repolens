import { describe, it, expect } from "vitest";
import { shouldPrintBanner } from "../src/utils/banner.js";

describe("banner", () => {
  it("prints only on a TTY outside CI", () => {
    expect(shouldPrintBanner({ isTTY: true, env: {} })).toBe(true);
    expect(shouldPrintBanner({ isTTY: false, env: {} })).toBe(false);
    expect(shouldPrintBanner({ isTTY: true, env: { CI: "true" } })).toBe(false);
    expect(shouldPrintBanner({ isTTY: true, env: { CI: "1" } })).toBe(false);
  });
});
