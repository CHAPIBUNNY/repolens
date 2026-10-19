import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { advisoryId, loadWaivers, partitionAudit } from "../scripts/audit-runtime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const waivers = loadWaivers(path.join(root, "scripts/audit-waivers.json"));

const bracesVia = {
  source: 1240992,
  name: "braces",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  title: "braces stack exhaustion",
};

function report(vulnerabilities) {
  return { vulnerabilities };
}

describe("runtime audit waivers", () => {
  it("reads the documented braces waiver", () => {
    expect(waivers.map((waiver) => waiver.id)).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
    expect(waivers[0].package).toBe("braces");
    expect(waivers[0].reason).toMatch(/No patched braces release/);
  });

  it("extracts a GHSA id from an advisory url", () => {
    expect(advisoryId(bracesVia)).toBe("GHSA-VFJ7-8CJW-P6XM");
    expect(advisoryId("braces")).toBeNull();
  });

  it("waives the braces → micromatch → fast-glob chain and nothing else", () => {
    const result = partitionAudit(report({
      braces: { severity: "high", via: [bracesVia] },
      micromatch: { severity: "high", via: ["braces"] },
      "fast-glob": { severity: "high", via: ["micromatch"] },
    }), waivers);

    expect(result.blocking).toEqual([]);
    expect(result.waivedFindings.map((finding) => finding.name).sort()).toEqual([
      "braces",
      "fast-glob",
      "micromatch",
    ]);
  });

  it("still fails when fast-glob has another high advisory", () => {
    const result = partitionAudit(report({
      braces: { severity: "high", via: [bracesVia] },
      micromatch: { severity: "high", via: ["braces"] },
      "fast-glob": {
        severity: "high",
        via: [
          "micromatch",
          { url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz", severity: "high" },
        ],
      },
    }), waivers);

    expect(result.blocking.map((finding) => finding.name)).toEqual(["fast-glob"]);
  });

  it("still fails on an unrelated high or critical runtime package", () => {
    const result = partitionAudit(report({
      braces: { severity: "high", via: [bracesVia] },
      "left-pad": {
        severity: "critical",
        via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }],
      },
    }), waivers);

    expect(result.blocking).toEqual([{ name: "left-pad", severity: "critical" }]);
  });

  it("does not fail the gate on moderate findings", () => {
    const result = partitionAudit(report({
      example: {
        severity: "moderate",
        via: [{ url: "https://github.com/advisories/GHSA-mod-1111-2222" }],
      },
    }), waivers);

    expect(result.blocking).toEqual([]);
    expect(result.waivedFindings).toEqual([]);
  });

  it("passes npm audit --omit=dev against this lockfile after the waiver", () => {
    const stdout = execFileSync("node", ["scripts/audit-runtime.js"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(stdout).toContain("GHSA-vfj7-8cjw-p6xm");
    expect(stdout).toContain("No unwaived high or critical runtime vulnerabilities.");
  });
});
