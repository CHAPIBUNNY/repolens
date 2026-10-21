#!/usr/bin/env node
import { runBadgeCli } from "../src/badge.js";

const code = await runBadgeCli({
  target: process.cwd(),
  format: "all",
  out: process.env.REPOLENS_BADGE_OUT || "repolens-badge.json",
  url: process.env.REPOLENS_BADGE_URL || "",
  link: process.env.REPOLENS_BADGE_LINK || "",
  label: "code health",
});
process.exit(code);
