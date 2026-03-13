# Telemetry & Observability

RepoLens includes **opt-in** error tracking and usage telemetry to help improve the tool and understand how teams use it.

## What We Collect (When Enabled)

### 1. Error Information (Phase 1)

**Error tracking:**
- Error messages and stack traces
- Command that failed (e.g., `publish`, `migrate`)
- RepoLens version
- Node.js version and platform (e.g., `darwin`, `linux`)

### 2. Usage Metrics (Phase 2)

**Performance metrics:**
- Command execution times (scan, render, publish)
- Repository size (file count, module count)
- Document generation count

**Feature usage:**
- Commands run (init, doctor, migrate, publish)
- Publishers used (Notion, Markdown, Confluence)
- AI usage (enabled/disabled, provider)
- Success/failure rates

**Aggregate statistics:**
- Platform distribution (macOS, Linux, Windows)
- Node.js version distribution
- AI provider popularity

**What We DON'T Collect:**
- ❌ Your source code or file contents
- ❌ Notion tokens or API keys
- ❌ Personal information (usernames, emails, etc.)
- ❌ Repository names or paths (anonymized with hash)
- ❌ Environment variables
- ❌ HTTP headers or cookies
- ❌ File names or directory structures
- ❌ Notion page IDs or database IDs

## Privacy Protections

1. **Opt-in by default** - Telemetry is disabled unless you explicitly enable it
2. **Anonymous** - No personally identifiable information is collected
3. **Sanitized paths** - File paths are stripped to prevent leaking usernames
4. **Sample rate** - Only 10% of errors are sent (reduces server load)
5. **Local-first** - All failures are logged locally regardless of telemetry setting

## How to Enable

Add to your `.env` file:

```bash
REPOLENS_TELEMETRY_ENABLED=true
```

Or set as an environment variable:

```bash
export REPOLENS_TELEMETRY_ENABLED=true
```

## How to Disable

Telemetry is **disabled by default**. To explicitly disable:

```bash
REPOLENS_TELEMETRY_ENABLED=false
```

Or simply omit the variable entirely.

## What Happens to Errors When Telemetry is Disabled?

When telemetry is disabled:
- Errors are logged to your console (as usual)
- Full stack traces available with `--verbose` flag
- No data sent to external services
- RepoLens continues to work normally

## Why Enable Telemetry?

By enabling telemetry, you help us:

### Error Tracking Benefits
- **Identify bugs faster** - See real-world issues before they're reported
- **Prioritize fixes** - Understand which errors affect the most users
- **Improve reliability** - Catch edge cases we missed in testing
- **Better support** - Diagnose issues without requiring detailed bug reports

### Usage Tracking Benefits
- **Understand adoption patterns** - See which features teams actually use
- **Optimize performance** - Identify slow operations and bottlenecks
- **Guide roadmap** - Prioritize features that provide the most value
- **Improve documentation** - Focus on areas where users struggle
- **Platform support** - Know which platforms need the most attention

### What This Means for You
- **Faster bug fixes** - Issues you encounter are fixed before you report them
- **Better features** - Development focused on real-world usage patterns
- **Improved performance** - Optimizations based on actual bottlenecks
- **Stronger ecosystem** - Data helps secure funding and maintainer time

## Where Data is Sent

Errors and metrics are sent to [Sentry.io](https://sentry.io), a privacy-focused error tracking and performance monitoring service.

**Data retention:** 90 days  
**Data location:** EU (Germany) - GDPR compliant  
**Compliance:** GDPR, SOC 2 Type II, ISO 27001  
**Encryption:** TLS 1.3 in transit, AES-256 at rest

## Example Metrics Collected

Here are real examples of what we track (sanitized):

### Error Event
```json
{
  "error": "ENOENT: no such file or directory",
  "command": "publish",
  "version": "1.4.0",
  "platform": "darwin",
  "nodeVersion": "v20.11.0"
}
```

### Usage Event
```json
{
  "command": "publish",
  "status": "success",
  "duration": 2341,
  "fileCount": 234,
  "moduleCount": 42,
  "aiEnabled": true,
  "aiProvider": "openai",
  "publishers": ["notion", "markdown"],
  "platform": "linux",
  "nodeVersion": "v20.11.0"
}
```

### Performance Metric
```json
{
  "operation": "scan",
  "duration": 1523,
  "fileCount": 234
}
```

**Note:** All events are anonymous. No repository names, file paths, or user identities are included.

## Questions?

- Review our [Privacy Policy](https://github.com/CHAPIBUNNY/repolens#privacy)
- Open an [issue](https://github.com/CHAPIBUNNY/repolens/issues) with questions
- Email: trades@rabitaitrades.com

---

**Last updated:** March 2026  
**Applies to:** RepoLens v0.4.3+
