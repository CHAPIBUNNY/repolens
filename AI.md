# AI-Enhanced Documentation

As of v0.4.0, RepoLens supports AI-powered documentation generation that creates clear, audience-specific documentation for both technical and non-technical readers.

## Overview

RepoLens uses a hybrid approach:

1. **Deterministic extraction** - Scans your repository structure, files, routes, APIs, and technologies
2. **Structured context** - Builds intermediate JSON artifacts with facts about your codebase
3. **AI synthesis** - Uses LLMs to generate human-readable explanations and insights
4. **Audience-aware output** - Creates documents for engineers, PMs, stakeholders, and executives

This approach prevents hallucination while providing rich, readable documentation.

## Document Structure

RepoLens generates up to 11 documents:

### For Non-Technical Audiences

- **00-executive-summary.md** - What the system does, who it serves, key risks
- **02-business-domains.md** - Codebase structure in business language

### For Mixed Audiences

- **01-system-overview.md** - High-level technical snapshot
- **05-route-map.md** - User-facing pages and capabilities
- **07-data-flows.md** - How information moves through the system
- **08-change-impact.md** - PR/diff analysis in plain language
- **09-system-map.md** - Visual diagram with explanation

### For Technical Audiences

- **03-architecture-overview.md** - Layered architecture analysis
- **04-module-catalog.md** - Complete code module inventory
- **06-api-surface.md** - Backend API documentation
- **10-developer-onboarding.md** - Quick start for new engineers

## Enabling AI Features

### 1. Set Environment Variables

Create a `.env` file (or set in GitHub Actions secrets):

```bash
# Enable AI features
REPOLENS_AI_ENABLED=true

# Your OpenAI API key (or compatible provider)
REPOLENS_AI_API_KEY=sk-xxx

# API endpoint (optional, defaults to OpenAI)
REPOLENS_AI_BASE_URL=https://api.openai.com/v1

# Model to use
REPOLENS_AI_MODEL=gpt-4-turbo-preview
```

### 2. Configure in .repolens.yml

```yaml
features:
  executive_summary: true
  business_domains: true
  architecture_overview: true
  data_flows: true
  developer_onboarding: true
  ai_enrichment: true

ai:
  enabled: true
  mode: "hybrid" # deterministic facts + AI explanations
  temperature: 0.2 # low = more deterministic
  max_tokens: 2500
```

### 3. Run Publish

```bash
npx @rabitai/repolens publish
```

## AI Providers

RepoLens supports any OpenAI-compatible API:

### OpenAI

```bash
REPOLENS_AI_BASE_URL=https://api.openai.com/v1
REPOLENS_AI_API_KEY=sk-xxx
REPOLENS_AI_MODEL=gpt-4-turbo-preview
```

### Anthropic (via OpenAI-compatible proxy)

```bash
REPOLENS_AI_BASE_URL=https://your-proxy.com/v1
REPOLENS_AI_API_KEY=sk-ant-xxx
REPOLENS_AI_MODEL=claude-3-opus-20240229
```

### Azure OpenAI

```bash
REPOLENS_AI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
REPOLENS_AI_API_KEY=xxx
REPOLENS_AI_MODEL=gpt-4
```

### Local Models (Ollama, LM Studio, etc.)

```bash
REPOLENS_AI_BASE_URL=http://localhost:11434/v1
REPOLENS_AI_API_KEY=dummy # not used for local
REPOLENS_AI_MODEL=llama3
```

## Configuration Options

### AI Section

```yaml
ai:
  enabled: true # Master switch
  
  mode: "hybrid" # Options: hybrid, full, off
    # hybrid: Deterministic facts + AI explanations
    # full: More AI-generated content
    # off: Deterministic only
  
  audience_default: "mixed" # Default target audience
    # mixed: Readable by technical and non-technical
    # technical: Developer-focused
    # non-technical: Leadership/stakeholder-focused
  
  temperature: 0.2 # 0.0 = deterministic, 1.0 = creative
  
  max_tokens: 2500 # Maximum response length
```

### Business Domains

Help AI understand your codebase by defining business domains:

```yaml
domains:
  authentication:
    match: ["auth", "login", "session"]
    description: "User authentication flows"
  
  payments:
    match: ["payment", "stripe", "checkout"]
    description: "Payment processing"
  
  market_data:
    match: ["stock", "chart", "price"]
    description: "Financial market data"
```

### Documentation Output

```yaml
documentation:
  output_dir: ".repolens" # Where to write files
  include_artifacts: true # Save JSON for debugging
  file_prefix: true # Add 00-, 01- numbers
  
  sections: # Which documents to generate
    - executive_summary
    - system_overview
    - business_domains
    - architecture_overview
    - module_catalog
    - route_map
    - api_surface
    - data_flows
    - change_impact
    - system_map
    - developer_onboarding
```

## Cost Considerations

AI generation adds cost. Typical pricing (GPT-4-turbo):

- Small repo (~50 modules): $0.10 - $0.30 per run
- Medium repo (~200 modules): $0.30 - $0.80 per run
- Large repo (~500 modules): $0.80 - $2.00 per run

Tips to reduce cost:

1. Use `gpt-3.5-turbo` for faster, cheaper results
2. Disable documents you don't need in `documentation.sections`
3. Run on main branch only (configure `notion.branches`)
4. Use local models for free (quality varies)

## Fallback Behavior

If AI is disabled or fails, RepoLens generates deterministic documentation automatically. You'll see a note: "AI-enhanced documentation is disabled."

## Zero Hallucination Policy

RepoLens prompts are designed to prevent AI from inventing facts:

- AI receives only structured JSON context (not raw code)
- Prompts explicitly forbid fabrication
- AI must state uncertainty when context is insufficient
- Deterministic facts (file counts, routes, modules) are never AI-generated

## Example Outputs

### Executive Summary (with AI)

```markdown
# Executive Summary

## What this system does

Based on the detected modules and routing structure, this appears to be 
a financial analytics platform that combines market data visualization, 
user account management, and research content delivery.

## Who it serves

The system serves retail investors and financial analysts who need...

## Core capabilities

1. Real-time market data analysis with interactive charts
2. Portfolio tracking and trade management
3. Research articles and investment insights
...
```

### Executive Summary (without AI)

```markdown
# Executive Summary

## What this system does

my-project is a Next.js, React application with 271 modules across 
1139 files.

## Main system areas

The codebase is organized into 12 main domains:
- Market Data & Analysis: 45 modules
- Authentication: 8 modules
...

Note: AI-enhanced documentation is disabled.
```

## Troubleshooting

### "AI features are disabled"

Set `REPOLENS_AI_ENABLED=true`

### "Missing API key"

Set `REPOLENS_AI_API_KEY=your-key`

### "Request timeout"

Increase timeout: `REPOLENS_AI_TIMEOUT_MS=120000` (2 minutes)

### "Rate limit exceeded"

Wait and retry, or reduce `temperature` and `max_tokens`

### Poor quality output

- Try GPT-4 instead of GPT-3.5
- Increase `max_tokens`
- Adjust `temperature` (try 0.1 for more focus)
- Add more detail to `domains` configuration

### Running costs too high

- Use `gpt-3.5-turbo` instead of `gpt-4`
- Reduce number of documents in `documentation.sections`
- Run less frequently (only on main branch merges)

## Next Steps

1. Start with default settings and `gpt-4-turbo-preview`
2. Review generated documentation
3. Add business domains to improve quality
4. Adjust `temperature` and `max_tokens` as needed
5. Switch to `gpt-3.5-turbo` to reduce costs if quality is acceptable
