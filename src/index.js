/**
 * Programmatic entry for @chappibunny/repolens.
 *
 * Importing this module does not start the CLI. The `repolens` binary
 * lives in bin/repolens.js and calls runCli() from src/cli.js.
 */

export { loadConfig } from "./core/config.js";
export { scanRepo } from "./core/scan.js";
export { generateDocumentSet } from "./docs/generate-doc-set.js";
export { writeDocumentSet, readPreviousDocumentSet } from "./docs/write-doc-set.js";
export { publishDocs } from "./publishers/index.js";
export { runDoctor } from "./doctor.js";
