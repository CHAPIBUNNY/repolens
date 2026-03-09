import fs from "node:fs/promises";
import path from "node:path";
import { info, warn, error as logError } from "./utils/logger.js";

/**
 * Detect legacy workflow patterns that need migration
 */
function detectLegacyPatterns(content) {
  const patterns = {
    cdToolsRepolens: /cd\s+tools\/repolens/i.test(content),
    npmInstallRepolens: /npm\s+(?:ci|install)(?:\s|$)(?!.*repolens@)/m.test(content),
    npxWithoutLatest: /npx\s+repolens\s+(?!@latest)/m.test(content),
    missingNodeSetup: !content.includes("actions/setup-node@"),
    missingEnvVars: !content.includes("NOTION_TOKEN") && !content.includes("env:")
  };

  const detected = [];
  if (patterns.cdToolsRepolens) {
    detected.push("cd tools/repolens");
  }
  if (patterns.npmInstallRepolens) {
    detected.push("npm install without @latest");
  }
  if (patterns.npxWithoutLatest) {
    detected.push("npx repolens without @latest");
  }
  if (patterns.missingNodeSetup) {
    detected.push("missing Node.js setup");
  }
  if (patterns.missingEnvVars) {
    detected.push("missing environment variables");
  }

  return {
    isLegacy: detected.length > 0,
    patterns: detected
  };
}

/**
 * Migrate workflow to v0.4.0 format
 */
function migrateWorkflowContent(content) {
  let migrated = content;

  // Remove cd tools/repolens commands
  migrated = migrated.replace(/cd\s+tools\/repolens\s*\n?/gi, "");
  
  // Remove standalone npm ci/install that's part of old setup
  migrated = migrated.replace(/npm\s+(?:ci|install)\s*\n/g, "");

  // Update npx repolens to npx repolens@latest
  migrated = migrated.replace(/npx\s+repolens\s+/g, "npx repolens@latest ");

  // Add Node.js setup if missing (insert after checkout step)
  if (!migrated.includes("actions/setup-node@")) {
    const checkoutPattern = /(- name: Checkout repository\s+uses: actions\/checkout@v\d+)/;
    if (checkoutPattern.test(migrated)) {
      migrated = migrated.replace(
        checkoutPattern,
        `$1
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20`
      );
    }
  }

  // Add environment variables if missing
  if (!migrated.includes("NOTION_TOKEN") && !migrated.includes("env:")) {
    // Find the publish/generate documentation step
    const publishPattern = /(- name: .*(?:publish|generate).*documentation.*\n)/i;
    if (publishPattern.test(migrated)) {
      migrated = migrated.replace(
        publishPattern,
        `$1        env:
          NOTION_TOKEN: \${{ secrets.NOTION_TOKEN }}
          NOTION_PARENT_PAGE_ID: \${{ secrets.NOTION_PARENT_PAGE_ID }}
          REPOLENS_AI_API_KEY: \${{ secrets.REPOLENS_AI_API_KEY }}
          REPOLENS_AI_PROVIDER: openai
        `
      );
    }
  }

  // Add AI environment variables if env section exists but missing AI vars
  if (migrated.includes("NOTION_TOKEN") && !migrated.includes("REPOLENS_AI_API_KEY")) {
    migrated = migrated.replace(
      /(NOTION_PARENT_PAGE_ID: \${{ secrets\.NOTION_PARENT_PAGE_ID }})/,
      `$1
          REPOLENS_AI_API_KEY: \${{ secrets.REPOLENS_AI_API_KEY }}
          REPOLENS_AI_PROVIDER: openai`
    );
  }

  return migrated;
}

/**
 * Find all workflow files in .github/workflows
 */
async function findWorkflowFiles(targetDir) {
  const workflowDir = path.join(targetDir, ".github", "workflows");
  
  try {
    await fs.access(workflowDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(workflowDir);
  const workflowFiles = files.filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
  
  return workflowFiles.map(f => path.join(workflowDir, f));
}

/**
 * Show diff between old and new content
 */
function showDiff(oldContent, newContent) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLines = Math.max(oldLines.length, newLines.length);

  console.log("\n📋 Changes Preview:");
  console.log("─".repeat(60));

  let changesShown = 0;
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i] || "";
    const newLine = newLines[i] || "";

    if (oldLine !== newLine) {
      if (oldLine) {
        console.log(`  - ${oldLine}`);
      }
      if (newLine) {
        console.log(`  + ${newLine}`);
      }
      changesShown++;
      if (changesShown > 20) {
        console.log(`  ... (${maxLines - i} more lines)`);
        break;
      }
    }
  }

  console.log("─".repeat(60));
}

/**
 * Main migration function
 */
export async function runMigrate(targetDir = process.cwd(), options = {}) {
  const { dryRun = false, force = false } = options;

  try {
    await printMigrationBanner();

    info(`🔍 Scanning for workflow files in: ${targetDir}`);
    
    const workflowFiles = await findWorkflowFiles(targetDir);

    if (workflowFiles.length === 0) {
      warn("⚠️  No workflow files found in .github/workflows/");
      info("\n💡 If you haven't set up GitHub Actions yet:");
      info("   Run: repolens init");
      return;
    }

    info(`   Found ${workflowFiles.length} workflow file(s)`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const workflowPath of workflowFiles) {
      const filename = path.basename(workflowPath);
      console.log(`\n📄 Checking: ${filename}`);

      const content = await fs.readFile(workflowPath, "utf8");
      const detection = detectLegacyPatterns(content);

      if (!detection.isLegacy) {
        info("   ✅ Already up to date!");
        skippedCount++;
        continue;
      }

      info("   🔧 Legacy patterns detected:");
      detection.patterns.forEach(p => info(`      - ${p}`));

      const migratedContent = migrateWorkflowContent(content);

      if (!force) {
        showDiff(content, migratedContent);
      }

      if (dryRun) {
        info("\n   🔍 DRY RUN: No changes written");
        migratedCount++;
        continue;
      }

      // Backup original file
      const backupPath = `${workflowPath}.backup`;
      await fs.writeFile(backupPath, content, "utf8");
      info(`   💾 Backup saved: ${path.basename(backupPath)}`);

      // Write migrated content
      await fs.writeFile(workflowPath, migratedContent, "utf8");
      info(`   ✅ Migrated: ${filename}`);
      migratedCount++;
    }

    // Summary
    console.log("\n" + "─".repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    
    if (migratedCount > 0) {
      console.log("\n🎉 Migration complete!");
      
      if (!dryRun) {
        console.log("\n📝 Next steps:");
        console.log("   1. Review the changes: git diff .github/workflows/");
        console.log("   2. Test locally: npx repolens@latest publish");
        console.log("   3. Commit: git add .github/workflows/ && git commit -m 'chore: migrate RepoLens workflow to v0.4.0'");
        console.log("   4. Push: git push");
        console.log("\n💡 Tip: Backups saved as *.backup - delete them once verified");
      } else {
        console.log("\n💡 Run without --dry-run to apply changes");
      }
    } else {
      console.log("\n✨ All workflows are up to date!");
    }

  } catch (err) {
    logError(`Migration failed: ${err.message}`);
    throw err;
  }
}

async function printMigrationBanner() {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 RepoLens Workflow Migration Tool");
  console.log("   Upgrading to v0.4.0 format");
  console.log("=".repeat(60));
}
