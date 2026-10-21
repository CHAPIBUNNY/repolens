import { describe, it, expect } from "vitest";
import path from "node:path";
import { isGlobalInstallPath, repolensCommand } from "../src/utils/invocation.js";

describe("repolens command invocation", () => {
  it("uses the bare command for a global install", () => {
    expect(repolensCommand("publish", { globalInstall: true })).toBe("repolens publish");
    expect(repolensCommand("doctor", { globalInstall: true })).toBe("repolens doctor");
  });

  it("uses npx when RepoLens is not global", () => {
    expect(repolensCommand("publish", { globalInstall: false })).toBe("npx @chappibunny/repolens publish");
  });

  it("treats an npm global prefix as installed and an npx cache as not", () => {
    const prefix = path.join("/usr", "local");
    const globalEntry = path.join(prefix, "lib", "node_modules", "@chappibunny", "repolens", "bin", "repolens.js");
    const npxEntry = path.join("/home", "user", ".npm", "_npx", "abc", "node_modules", "@chappibunny", "repolens", "bin", "repolens.js");
    expect(isGlobalInstallPath(globalEntry, prefix)).toBe(true);
    expect(isGlobalInstallPath(npxEntry, prefix)).toBe(false);
    expect(isGlobalInstallPath("", prefix)).toBe(false);
  });
});
