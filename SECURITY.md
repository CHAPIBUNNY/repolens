# Security Policy

```
    ██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗
    ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝
    ██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗
    ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║
    ██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║
    ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
                        🔒 Security First 🛡️
```

## Supported Versions

RepoLens follows semantic versioning. Security updates are provided for:

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| 0.7.x   | :white_check_mark: |
| < 0.7   | :x:                |

**Note**: Once RepoLens reaches v1.0, we will support the latest major version and one previous major version.

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in RepoLens, please report it responsibly:

### Reporting Process

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. **Email** security reports to: trades@rabitaitrades.com
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Resolution Timeline**: Critical issues within 7 days, others within 30 days
- **Disclosure**: Coordinated disclosure after the fix is released

### Scope

**In Scope**:
- Code injection via configuration files
- Credential leakage in logs/telemetry/documentation
- Denial of service via malformed inputs
- Supply chain vulnerabilities (dependencies, GitHub Actions)
- Path traversal attacks
- API rate limit bypasses

**Out of Scope**:
- Social engineering attacks
- Physical access attacks
- Issues in third-party dependencies (report to them directly)
- Self-hosted infrastructure issues

## Security Features

RepoLens implements defense-in-depth security:

### 1. Input Validation (`src/utils/validate.js`)

**Configuration Validation**:
- Schema validation with required fields enforcement
- Injection attack detection (shell, command substitution)
- Directory traversal prevention (`..`, absolute paths)
- Secret scanning in configuration files
- Circular reference protection (depth limit 20)

**Patterns Detected**:
- Shell injection: `;`, `|`, `&`, `` ` ``
- Command substitution: `$(`, `${`
- Path traversal: `..`, null bytes (`\0`)

### 2. Secrets Detection (`src/utils/secrets.js`)

**15+ Secret Patterns Detected**:
- OpenAI API keys: `sk-[a-zA-Z0-9]{20,}`
- GitHub tokens: `gh[ps]_[a-zA-Z0-9]{36,}`
- AWS keys: `AKIA[0-9A-Z]{16}`
- Notion tokens: `secret_[a-zA-Z0-9]{30,}`
- Generic API keys, JWT tokens, private keys

**Entropy-Based Detection**:
- High-entropy string detection (Shannon entropy > 4.5)
- Base64-encoded secret detection
- False positive filtering

**Automatic Sanitization**:
- All logger output (`log`, `info`, `warn`, `error`)
- Telemetry data (Sentry error messages, context)
- Exception stack traces

### 3. Rate Limiting (`src/utils/rate-limit.js`)

**API Protection**:
- **Notion API**: 3 requests/second (token bucket)
- **AI APIs**: 3 requests/second (conservative limit)
- **Retry Logic**: Exponential backoff with jitter
  - Notion: 3 retries (500ms → 1s → 2s)
  - AI: 2 retries (2s → 4s)
- **Retryable Errors**: 429, 500, 502, 503, 504, network errors

**Benefits**:
- Prevents accidental API abuse
- Respects provider rate limits
- Reduces costs from runaway processes

### 4. GitHub Actions Security

**Supply Chain Protection**:
- Actions pinned to commit SHAs (not tags)
- Minimal permissions (`contents: read` or `contents: write` only)
- Separate security job (fail early strategy)

**Security Checks (CI/CD)**:
1. **Dependency Audit**: Fails on critical/high vulnerabilities
2. **Secrets Scanning**: Detects hardcoded credentials
3. **Test Suite**: 163 tests including 43 security tests

**Workflow Hardening**:
```yaml
# ✅ Good: Pinned to commit SHA
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# ❌ Bad: Tag can be moved by attacker
uses: actions/checkout@v4
```

### 5. Dependency Management

**Current Status**: 0 vulnerabilities (519 dependencies)

**Maintenance**:
- Monthly security audits (`npm audit`)
- Automated dependency updates (Dependabot)
- Minimal dependency philosophy (prefer Node.js built-ins)

## Threat Model

### Assets We Protect

1. **User Credentials**: Notion tokens, AI API keys, GitHub tokens
2. **Repository Data**: Source code metadata, architecture insights
3. **CI/CD Pipeline**: GitHub Actions workflows, secrets
4. **User Privacy**: Telemetry data, error reports

### Threats & Mitigations

| Threat | Impact | Mitigation | Status |
|--------|--------|-----------|--------|
| **Credential Leakage** | High | Secret detection + sanitization | ✅ Active |
| **Code Injection** | High | Input validation + shell command escaping | ✅ Active |
| **Path Traversal** | Medium | Path validation + safe path resolution | ✅ Active |
| **Supply Chain Attack** | High | Action pinning + dependency audits | ✅ Active |
| **API Abuse** | Medium | Rate limiting + retry logic | ✅ Active |
| **Dependency Vulnerabilities** | Medium | npm audit + CI checks | ✅ Active |
| **Circular DoS** | Low | Depth limits + try/catch guards | ✅ Active |
| **Type Confusion** | Low | Type checking + validation | ✅ Active |

### Attack Scenarios (Prevented)

#### Scenario 1: Malicious Configuration
**Attack**: User creates `.repolens.yml` with shell injection:
```yaml
scan:
  include:
    - "src/**/*.js; rm -rf /"
```
**Prevention**: `validateConfig()` detects `;` and rejects configuration

#### Scenario 2: Credential in Logs
**Attack**: Error message contains API key:
```javascript
throw new Error(`API failed: ${apiKey}`);
```
**Prevention**: Logger sanitizes output, replaces `sk-abc123xyz` → `sk-ab***yz`

#### Scenario 3: Path Traversal
**Attack**: Config specifies output path: `../../../etc/passwd`
**Prevention**: `validateSafePath()` rejects `..` and absolute paths

#### Scenario 4: Supply Chain Compromise
**Attack**: Attacker compromises `actions/checkout@v4` tag
**Prevention**: SHA pinning ensures specific, audited version

## Best Practices for Users

### Configuration Security

**✅ DO**:
- Store secrets in GitHub Secrets (not in `.repolens.yml`)
- Use environment variables for sensitive data
- Keep `.repolens.yml` in version control (no secrets!)
- Review generated documentation before publishing

**❌ DON'T**:
- Hardcode API keys in configuration files
- Commit `.env` files to repositories
- Use overly permissive scan patterns (`**`)
- Disable security validation

### GitHub Actions Setup

**Recommended Secrets** (Repository Settings → Secrets → Actions):
- `NOTION_TOKEN`: Your Notion integration token
- `NOTION_PARENT_PAGE_ID`: Target page for documentation
- `REPOLENS_AI_API_KEY`: OpenAI API key (optional)

**Security Checklist**:
- [ ] Secrets stored in GitHub Secrets (not workflow file)
- [ ] Workflow permissions set to minimum required
- [ ] Actions pinned to commit SHAs (not tags)
- [ ] Secrets scanning enabled
- [ ] Dependency audit enabled

### Local Development

**Environment Variables**:
```bash
# .env (DO NOT COMMIT!)
NOTION_TOKEN=secret_abc123xyz
REPOLENS_AI_API_KEY=sk-abc123xyz

# .gitignore (ENSURE THIS EXISTS!)
.env
.env.local
*.env
```

**Testing Security Features**:
```bash
# Run security tests
npm test -- tests/security-fuzzing.test.js

# Manual secret scan
git grep -E "(sk-[a-zA-Z0-9]{20,}|ghp_)" -- '*.js' '*.ts'

# Dependency audit
npm audit --audit-level=moderate
```

## Security Testing

RepoLens includes 43 security-specific tests (`tests/security-fuzzing.test.js`):

### Test Coverage

1. **Secrets Detection** (6 tests):
   - OpenAI, GitHub, Notion token detection
   - Entropy-based heuristic detection
   - Sanitization effectiveness

2. **Config Validation** (7 tests):
   - Directory traversal prevention
   - Shell injection detection
   - Command substitution detection
   - Secret exposure in config

3. **Path Validation** (4 tests):
   - Directory traversal (`../../../etc`)
   - Absolute paths (`/etc/passwd`)
   - Null bytes (`\0`)

4. **Fuzzing** (6 tests):
   - Deeply nested objects (100 levels)
   - Long strings (1M characters)
   - Large arrays (10k elements)
   - Circular references
   - Unicode/emoji edge cases
   - Non-string types

5. **Injection Prevention** (16 tests):
   - SQL injection payloads
   - Command injection (`; rm -rf`)
   - Path traversal variants
   - YAML bomb attacks
   - NoSQL injection
   - LDAP injection
   - XML injection

6. **Boundary Conditions** (4 tests):
   - Empty configurations
   - Minimal valid configs
   - Unknown fields handling
   - Very large configs

### Running Security Tests

```bash
# Full security suite
npm test -- tests/security-fuzzing.test.js

# Specific category
npm test -- tests/security-fuzzing.test.js -t "Injection Attack"

# With verbose output
npm test -- tests/security-fuzzing.test.js --reporter=verbose
```

## Compliance & Standards

RepoLens follows industry best practices:

- **OWASP Top 10**: Addressed (injection, sensitive data, security misconfiguration)
- **CWE**: Common Weakness Enumeration patterns prevented
- **Supply Chain Levels for Software Artifacts (SLSA)**: Level 2 compliance goal

## Security Roadmap

### Planned Enhancements (Post-v1.0)

- [ ] **CSP for Generated Docs**: Content Security Policy headers
- [ ] **SAST Integration**: Static Application Security Testing (Snyk/CodeQL)
- [ ] **Dependency Signing**: Verify npm package signatures
- [ ] **Security Scorecard**: OpenSSF Scorecard integration
- [ ] **Trivy Scanning**: Container/filesystem vulnerability scanning
- [ ] **Bug Bounty Program**: Community security testing incentives

## Contact

- **Security Issues**: trades@rabitaitrades.com
- **General Questions**: [GitHub Issues](https://github.com/CHAPIBUNNY/repolens/issues)

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers:

- [Security Hall of Fame - Coming Soon]

---

**Last Updated**: July 2025  
**Security Team**: RepoLens Maintainers
