#!/usr/bin/env node
/**
 * Production-dependency audit for the release workflow.
 *
 * Fails on high or critical findings from `npm audit --omit=dev`,
 * except advisories listed in scripts/audit-waivers.json. A dependency
 * is waived only when every advisory on it is a waived id, or it is
 * high solely because it depends on a waived package (braces → micromatch
 * → fast-glob). Any other high or critical runtime advisory still fails.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAIL_SEVERITIES = new Set(["high", "critical"]);

export function advisoryId(via) {
  if (!via || typeof via !== "object" || typeof via.url !== "string") return null;
  const match = via.url.match(/GHSA-[0-9a-z-]+/i);
  return match ? match[0].toUpperCase() : null;
}

export function partitionAudit(report, waivers) {
  const waiverIds = new Set(
    (waivers || []).map((waiver) => String(waiver.id || "").toUpperCase()).filter(Boolean)
  );
  const vulnerabilities = report?.vulnerabilities || {};
  const memo = new Map();

  function isWaived(name) {
    if (memo.has(name)) return memo.get(name);
    memo.set(name, false);

    const vuln = vulnerabilities[name];
    const vias = vuln?.via;
    if (!Array.isArray(vias) || vias.length === 0) return false;

    const ok = vias.every((via) => {
      if (typeof via === "string") return isWaived(via);
      const id = advisoryId(via);
      return id != null && waiverIds.has(id);
    });

    memo.set(name, ok);
    return ok;
  }

  const waivedFindings = [];
  const blocking = [];

  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    if (!FAIL_SEVERITIES.has(vuln.severity)) continue;
    if (isWaived(name)) {
      waivedFindings.push({ name, severity: vuln.severity });
    } else {
      blocking.push({ name, severity: vuln.severity });
    }
  }

  return { waivedFindings, blocking };
}

export function loadWaivers(waiversPath) {
  const raw = JSON.parse(readFileSync(waiversPath, "utf8"));
  if (!Array.isArray(raw.waivers)) {
    throw new Error(`Expected a "waivers" array in ${waiversPath}`);
  }
  return raw.waivers;
}

function runNpmAudit() {
  let stdout = "";
  try {
    stdout = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    stdout = error.stdout?.toString?.() || "";
    if (!stdout) {
      const stderr = error.stderr?.toString?.() || error.message;
      throw new Error(`npm audit --omit=dev failed: ${stderr}`);
    }
  }
  return JSON.parse(stdout);
}

function printReport(report, waivers, result) {
  const counts = report.metadata?.vulnerabilities || {};
  console.log("Runtime dependency audit (npm audit --omit=dev)");
  console.log(
    `  info=${counts.info ?? 0} low=${counts.low ?? 0} moderate=${counts.moderate ?? 0} high=${counts.high ?? 0} critical=${counts.critical ?? 0}`
  );

  if (result.waivedFindings.length > 0) {
    console.log("Waived high/critical runtime findings:");
    for (const finding of result.waivedFindings) {
      console.log(`  - ${finding.name} (${finding.severity})`);
    }
    for (const waiver of waivers) {
      console.log(`  ${waiver.id}: ${waiver.reason}`);
    }
  }

  if (result.blocking.length === 0) {
    console.log("No unwaived high or critical runtime vulnerabilities.");
    return;
  }

  console.error("Unwaived high or critical runtime vulnerabilities:");
  for (const finding of result.blocking) {
    console.error(`  - ${finding.name} (${finding.severity})`);
  }
}

export function main() {
  const waiversPath = fileURLToPath(new URL("./audit-waivers.json", import.meta.url));
  const waivers = loadWaivers(waiversPath);
  const report = runNpmAudit();
  const result = partitionAudit(report, waivers);
  printReport(report, waivers, result);
  return result.blocking.length === 0 ? 0 : 1;
}

const entryArg = process.argv[1];
if (entryArg && pathToFileURL(path.resolve(entryArg)).href === import.meta.url) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
