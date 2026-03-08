import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "./logger.js";

const execAsync = promisify(exec);

/**
 * Render Mermaid diagram to SVG using @mermaid-js/mermaid-cli
 * @param {string} mermaidCode - Mermaid diagram code
 * @param {string} outputPath - Path to save the SVG file
 * @returns {Promise<string>} Path to the generated SVG file
 */
export async function renderMermaidToSvg(mermaidCode, outputPath) {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Create temporary input file
  const tempInput = path.join(dir, ".temp-mermaid.mmd");
  await fs.writeFile(tempInput, mermaidCode, "utf8");

  try {
    // Use mmdc CLI to render SVG
    const mmdc = path.join(process.cwd(), "node_modules", ".bin", "mmdc");
    await execAsync(`"${mmdc}" -i "${tempInput}" -o "${outputPath}" -t neutral -b transparent`);
    
    log(`Generated SVG diagram: ${outputPath}`);
    return outputPath;
  } catch (error) {
    log(`Warning: Failed to render Mermaid diagram: ${error.message}`);
    // Return null if rendering fails - we'll fall back to mermaid.ink
    return null;
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempInput);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate GitHub raw URL for a file in the repository
 * @param {string} repoPath - Path to file relative to repo root
 * @param {string} owner - GitHub username/org
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @returns {string} GitHub raw URL
 */
export function getGitHubRawUrl(repoPath, owner, repo, branch = "main") {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${repoPath}`;
}
