import * as Sentry from "@sentry/node";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sanitizeSecrets } from "./secrets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let initialized = false;
let enabled = false;

/**
 * Initialize error tracking (Sentry)
 * Only enabled if REPOLENS_TELEMETRY_ENABLED=true
 */
export function initTelemetry() {
  // Skip if already initialized
  if (initialized) return;
  initialized = true;

  // Check if telemetry is enabled (opt-in)
  const telemetryEnabled = process.env.REPOLENS_TELEMETRY_ENABLED === "true";
  
  if (!telemetryEnabled) {
    enabled = false;
    return;
  }

  try {
    // Get version from package.json
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const version = packageJson.version || "unknown";

    Sentry.init({
      dsn: "https://082083dbf5899ed7e65dfd9b8dc72f90@o4511014913703936.ingest.de.sentry.io/4511014919209040", // TODO: Replace with actual DSN
      
      // Release tracking
      release: `repolens@${version}`,
      
      // Environment
      environment: process.env.NODE_ENV || "production",
      
      // Sample rate (10% of errors)
      sampleRate: 0.1,
      
      // Only send errors, not all events
      tracesSampleRate: 0,
      
      // Privacy: Don't send PII
      beforeSend(event) {
        // Remove potentially sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        
        // Remove file paths that might contain usernames
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map(exception => {
            if (exception.stacktrace?.frames) {
              exception.stacktrace.frames = exception.stacktrace.frames.map(frame => {
                if (frame.filename) {
                  // Keep only relative paths
                  frame.filename = frame.filename.replace(/.*\/RepoLens\//, "");
                }
                return frame;
              });
            }
            
            // Sanitize exception messages for secrets
            if (exception.value) {
              exception.value = sanitizeSecrets(exception.value);
            }
            
            return exception;
          });
        }
        
        // Sanitize event message
        if (event.message) {
          event.message = sanitizeSecrets(event.message);
        }
        
        // Sanitize extra context
        if (event.extra) {
          event.extra = JSON.parse(sanitizeSecrets(JSON.stringify(event.extra)));
        }
        
        return event;
      }
    });

    enabled = true;
  } catch (error) {
    // Silently fail if Sentry init fails - don't break the CLI
    console.error("Failed to initialize telemetry:", error.message);
    enabled = false;
  }
}

/**
 * Capture an error
 */
export function captureError(error, context = {}) {
  if (!enabled) return;
  
  try {
    Sentry.captureException(error, {
      extra: context,
      tags: {
        command: context.command || "unknown",
      }
    });
  } catch (e) {
    // Silently fail - don't break the CLI if error tracking fails
  }
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(message, level = "info", context = {}) {
  if (!enabled) return;
  
  try {
    Sentry.captureMessage(message, {
      level,
      extra: context,
      tags: {
        command: context.command || "unknown",
      }
    });
  } catch (e) {
    // Silently fail
  }
}

/**
 * Add context to current scope
 */
export function setContext(key, data) {
  if (!enabled) return;
  
  try {
    Sentry.setContext(key, data);
  } catch (e) {
    // Silently fail
  }
}

/**
 * Flush pending events and close Sentry
 */
export async function closeTelemetry() {
  if (!enabled) return;
  
  try {
    await Sentry.close(2000); // 2 second timeout
  } catch (e) {
    // Silently fail
  }
}

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled() {
  return enabled;
}

// ============================================================
// Usage Tracking & Observability
// ============================================================

const performanceTimers = new Map();

/**
 * Start a performance timer for an operation
 * @param {string} operation - Operation name (e.g., "scan", "render", "publish")
 * @param {object} metadata - Additional context about the operation
 */
export function startTimer(operation, metadata = {}) {
  if (!enabled) return;
  
  const key = `${operation}_${Date.now()}`;
  performanceTimers.set(key, {
    operation,
    startTime: Date.now(),
    metadata,
  });
  
  return key; // Return key so caller can stop this specific timer
}

/**
 * Stop a performance timer and record the metric
 * @param {string} timerKey - Key returned from startTimer()
 */
export function stopTimer(timerKey) {
  if (!enabled || !timerKey) return;
  
  const timer = performanceTimers.get(timerKey);
  if (!timer) return;
  
  const duration = Date.now() - timer.startTime;
  performanceTimers.delete(timerKey);
  
  // Send performance metric
  try {
    Sentry.metrics.distribution(
      `operation.duration`,
      duration,
      {
        unit: 'millisecond',
        tags: {
          operation: timer.operation,
          ...timer.metadata,
        },
      }
    );
  } catch (e) {
    // Silently fail
  }
  
  return duration;
}

/**
 * Track a usage event (command execution)
 * @param {string} command - Command name (init, doctor, migrate, publish)
 * @param {string} status - "success" or "failure"
 * @param {object} metrics - Metrics about the operation
 */
export function trackUsage(command, status, metrics = {}) {
  if (!enabled) return;
  
  try {
    // Anonymize repository info
    const sanitizedMetrics = {
      // Command info
      command,
      status,
      
      // Repository metrics (sanitized)
      fileCount: metrics.fileCount || 0,
      moduleCount: metrics.moduleCount || 0,
      
      // AI usage
      aiEnabled: Boolean(metrics.aiEnabled),
      aiProvider: metrics.aiProvider || null,
      
      // Publishers used
      publishers: metrics.publishers || [],
      
      // Performance
      duration: metrics.duration || null,
      
      // Environment (no sensitive data)
      nodeVersion: process.version,
      platform: process.platform,
      
      // Timestamp
      timestamp: new Date().toISOString(),
    };
    
    // Send as custom Sentry event
    Sentry.captureMessage(`Command: ${command}`, {
      level: status === "success" ? "info" : "warning",
      tags: {
        command,
        status,
        aiEnabled: String(sanitizedMetrics.aiEnabled),
      },
      extra: sanitizedMetrics,
    });
    
    // Also track as metric for aggregation
    Sentry.metrics.increment('command.executed', 1, {
      tags: {
        command,
        status,
        ai_enabled: String(sanitizedMetrics.aiEnabled),
        platform: process.platform,
      },
    });
    
  } catch (e) {
    // Silently fail
  }
}

/**
 * Track scan metrics
 * @param {object} scanResult - Result from scanRepo()
 */
export function trackScan(scanResult) {
  if (!enabled) return;
  
  try {
    const metrics = {
      filesCount: scanResult.filesCount || 0,
      modulesCount: scanResult.modules?.length || 0,
      apiEndpointsCount: scanResult.api?.length || 0,
      pagesCount: scanResult.pages?.length || 0,
    };
    
    // Record metrics
    Sentry.metrics.gauge('scan.files', metrics.filesCount);
    Sentry.metrics.gauge('scan.modules', metrics.modulesCount);
    Sentry.metrics.gauge('scan.api_endpoints', metrics.apiEndpointsCount);
    Sentry.metrics.gauge('scan.pages', metrics.pagesCount);
    
  } catch (e) {
    // Silently fail
  }
}

/**
 * Track document generation
 * @param {number} documentCount - Number of documents generated
 * @param {boolean} aiEnabled - Whether AI was used
 */
export function trackDocumentGeneration(documentCount, aiEnabled) {
  if (!enabled) return;
  
  try {
    Sentry.metrics.gauge('docs.generated', documentCount, {
      tags: {
        ai_enabled: String(aiEnabled),
      },
    });
  } catch (e) {
    // Silently fail
  }
}

/**
 * Track publishing
 * @param {string[]} publishers - List of publishers used (e.g., ["notion", "markdown"])
 * @param {string} status - "success" or "failure"
 */
export function trackPublishing(publishers, status) {
  if (!enabled) return;
  
  try {
    publishers.forEach(publisher => {
      Sentry.metrics.increment('publish.attempt', 1, {
        tags: {
          publisher,
          status,
        },
      });
    });
  } catch (e) {
    // Silently fail
  }
}

/**
 * Track migration
 * @param {number} migratedCount - Number of workflows migrated
 * @param {number} skippedCount - Number of workflows skipped
 */
export function trackMigration(migratedCount, skippedCount) {
  if (!enabled) return;
  
  try {
    Sentry.metrics.gauge('migration.workflows_migrated', migratedCount);
    Sentry.metrics.gauge('migration.workflows_skipped', skippedCount);
  } catch (e) {
    // Silently fail
  }
}

// ============================================================
// User Feedback
// ============================================================

/**
 * Ensure Sentry is initialized for feedback submission.
 * Feedback always works, even if REPOLENS_TELEMETRY_ENABLED is false.
 */
function ensureSentryForFeedback() {
  if (enabled) return true;

  // Initialize Sentry in a minimal mode just for feedback
  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const version = packageJson.version || "unknown";

    Sentry.init({
      dsn: "https://082083dbf5899ed7e65dfd9b8dc72f90@o4511014913703936.ingest.de.sentry.io/4511014919209040",
      release: `repolens@${version}`,
      environment: process.env.NODE_ENV || "production",
      sampleRate: 1.0, // Always send feedback
      tracesSampleRate: 0,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Send user feedback to Sentry
 * Works even when telemetry is disabled — feedback is always accepted.
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} message - Feedback message
 * @returns {Promise<boolean>} Whether feedback was sent successfully
 */
export async function sendFeedback(name, email, message) {
  try {
    if (!ensureSentryForFeedback()) {
      return false;
    }

    Sentry.captureFeedback({
      name,
      email,
      message,
    });

    // Flush to make sure feedback is sent before process exits
    await Sentry.flush(5000);
    return true;
  } catch (e) {
    return false;
  }
}
