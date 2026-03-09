import * as Sentry from "@sentry/node";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
      dsn: "https://your-dsn@sentry.io/your-project-id", // TODO: Replace with actual DSN
      
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
            return exception;
          });
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
