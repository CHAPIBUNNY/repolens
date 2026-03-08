import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { log, warn, info } from "./logger.js";
import { createInterface } from "node:readline";

const execAsync = promisify(exec);

let mmdcAvailable = null;
let installPromptShown = false;

/**
 * Check if mmdc (mermaid-cli) is installed
 * @returns {Promise<boolean>}
 */
export async function isMermaidCliInstalled() {
  if (mmdcAvailable !== null) return mmdcAvailable;

  try {
    // Try local installation first
    const localMmdc = path.join(process.cwd(), "node_modules", ".bin", "mmdc");
    await fs.access(localMmdc);
    mmdcAvailable = true;
    return true;
  } catch {
    // Try global installation
    try {
      await execAsync("mmdc --version", { timeout: 3000 });
      mmdcAvailable = true;
      return true;
    } catch {
      mmdcAvailable = false;
      return false;
    }
  }
}

/**
 * Show interactive installation prompt for mermaid-cli (only once per session)
 * @returns {Promise<boolean>} True if user installed it, false otherwise
 */
export async function promptMermaidCliInstall() {
  if (installPromptShown) return false;
  installPromptShown = true;

  // Skip prompt in non-interactive or CI environments
  if (!process.stdin.isTTY || process.env.CI) {
    warn("\n⚠️  Mermaid CLI not installed - using mermaid.ink fallback");
    info("For self-hosted SVG diagrams, install: npm install -g @mermaid-js/mermaid-cli\n");
    return false;
  }

  info("\n┌─────────────────────────────────────────────────────────────┐");
  info("│ 📊 Enhanced Diagram Rendering Available                     │");
  info("├─────────────────────────────────────────────────────────────┤");
  info("│ @mermaid-js/mermaid-cli generates high-quality SVG diagrams │");
  info("│ locally and hosts them on GitHub for best performance.     │");
  info("│                                                             │");
  info("│ Benefits:                                                   │");
  info("│ ✓ Self-contained SVG files (no external dependencies)      │");
  info("│ ✓ Faster loading via GitHub CDN                            │");
  info("│ ✓ Version-controlled diagrams                              │");
  info("│ ✓ Works offline                                            │");
  info("│                                                             │");
  info("│ Size: ~50MB (includes Chromium for rendering)              │");
  info("│ Fallback: mermaid.ink will be used if you skip this        │");
  info("└─────────────────────────────────────────────────────────────┘");
  info("");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question("Install @mermaid-js/mermaid-cli now? (y/N): ", async (answer) => {
      rl.close();
      
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        info("\n⏳ Installing @mermaid-js/mermaid-cli (this may take a minute)...");
        try {
          await execAsync("npm install @mermaid-js/mermaid-cli", {
            cwd: process.cwd(),
            timeout: 120000 // 2 minutes for large download
          });
          info("✓ Installation complete! SVG diagrams will be generated locally.\n");
          mmdcAvailable = true;
          resolve(true);
        } catch (error) {
          warn(`Installation failed: ${error.message}`);
          info("→ Falling back to mermaid.ink for diagram rendering.\n");
          resolve(false);
        }
      } else {
        info("→ Skipping installation. Using mermaid.ink for diagram rendering.");
        info("  Tip: Install later with: npm install -g @mermaid-js/mermaid-cli\n");
        resolve(false);
      }
    });
  });
}

/**
 * Render Mermaid diagram to SVG using @mermaid-js/mermaid-cli
 * @param {string} mermaidCode - Mermaid diagram code
 * @param {string} outputPath - Path to save the SVG file
 * @returns {Promise<string|null>} Path to the generated SVG file, or null if unavailable
 */
export async function renderMermaidToSvg(mermaidCode, outputPath) {
  // Check if Mermaid CLI is installed
  let installed = await isMermaidCliInstalled();
  
  if (!installed) {
    // Prompt user to install (interactive if possible)
    installed = await promptMermaidCliInstall();
    
    if (!installed) {
      return null; // User declined or installation failed - use fallback
    }
  }

  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Create temporary input file
  const tempInput = path.join(dir, ".temp-mermaid.mmd");
  await fs.writeFile(tempInput, mermaidCode, "utf8");

  try {
    // Try local installation first
    const localMmdc = path.join(process.cwd(), "node_modules", ".bin", "mmdc");
    let mmdc;
    
    try {
      await fs.access(localMmdc);
      mmdc = localMmdc;
    } catch {
      // Fall back to global mmdc
      mmdc = "mmdc";
    }

    await execAsync(`"${mmdc}" -i "${tempInput}" -o "${outputPath}" -t neutral -b transparent`, {
      timeout: 15000
    });
    
    log(`Generated SVG diagram: ${outputPath}`);
    return outputPath;
  } catch (error) {
    log(`Warning: Failed to render Mermaid diagram: ${error.message}`);
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
