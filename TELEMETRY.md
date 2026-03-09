# Telemetry & Error Tracking

RepoLens includes **opt-in** error tracking to help improve the tool and diagnose issues faster.

## What We Collect (When Enabled)

**Error Information:**
- Error messages and stack traces
- Command that failed (e.g., `publish`, `migrate`)
- RepoLens version
- Node.js version and platform (e.g., `darwin`, `linux`)

**What We DON'T Collect:**
- ❌ Your source code or file contents
- ❌ Notion tokens or API keys
- ❌ Personal information (usernames, emails, etc.)
- ❌ Repository names or paths
- ❌ Environment variables
- ❌ HTTP headers or cookies

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
- **Identify bugs faster** - See real-world issues before they're reported
- **Prioritize fixes** - Understand which errors affect the most users
- **Improve reliability** - Catch edge cases we missed in testing
- **Better support** - Diagnose issues without requiring detailed bug reports

## Where Data is Sent

Errors are sent to [Sentry.io](https://sentry.io), a privacy-focused error tracking service.

**Data retention:** 90 days  
**Data location:** US (configurable on request)  
**Compliance:** GDPR-compliant

## Questions?

- Review our [Privacy Policy](https://github.com/CHAPIBUNNY/repolens#privacy)
- Open an [issue](https://github.com/CHAPIBUNNY/repolens/issues) with questions
- Email: trades@rabitaitrades.com

---

**Last updated:** March 9, 2026  
**Applies to:** RepoLens v0.4.3+
