// Provider-agnostic AI text generation

import { warn, info } from "../utils/logger.js";
import { executeAIRequest } from "../utils/rate-limit.js";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 2500;

export async function generateText({ system, user, temperature, maxTokens, config, jsonMode, jsonSchema }) {
  // Check if AI is enabled (env var takes precedence, then config)
  const aiConfig = config?.ai || {};
  const enabled = process.env.REPOLENS_AI_ENABLED === "true" || aiConfig.enabled === true;
  
  if (!enabled) {
    return {
      success: false,
      error: "AI features are disabled. Set REPOLENS_AI_ENABLED=true to enable.",
      fallback: true
    };
  }
  
  // Get provider configuration (env vars take precedence, then config, then defaults)
  const provider = process.env.REPOLENS_AI_PROVIDER || aiConfig.provider || "openai_compatible";
  const baseUrl = process.env.REPOLENS_AI_BASE_URL || aiConfig.base_url;
  // For "github" provider, fall back to GITHUB_TOKEN when no explicit AI key is set
  const apiKey = process.env.REPOLENS_AI_API_KEY
    || (provider === "github" ? process.env.GITHUB_TOKEN : undefined);
  const model = process.env.REPOLENS_AI_MODEL || aiConfig.model || getDefaultModel(provider);
  const timeoutMs = parseInt(process.env.REPOLENS_AI_TIMEOUT_MS || aiConfig.timeout_ms || DEFAULT_TIMEOUT_MS);
  
  // Use config values as fallback for maxTokens; temperature only when explicitly set
  const resolvedTemp = temperature ?? aiConfig.temperature ?? undefined;
  const resolvedMaxTokens = maxTokens ?? aiConfig.max_tokens ?? DEFAULT_MAX_TOKENS;
  
  // Validate configuration
  if (!apiKey) {
    warn("REPOLENS_AI_API_KEY not set. AI features disabled.");
    return {
      success: false,
      error: "Missing API key",
      fallback: true
    };
  }
  
  if (!baseUrl && provider === "openai_compatible") {
    warn("REPOLENS_AI_BASE_URL not set. Using OpenAI default.");
  }

  // Select provider adapter
  const adapter = getProviderAdapter(provider);
  
  try {
    const result = await adapter({
      baseUrl: baseUrl || getDefaultBaseUrl(provider),
      apiKey,
      model,
      system,
      user,
      temperature: resolvedTemp,
      maxTokens: resolvedMaxTokens,
      timeoutMs,
      jsonMode,
    });

    // Validate JSON schema if provided
    if (jsonMode && jsonSchema && result) {
      const parsed = safeParseJSON(result);
      if (!parsed) {
        warn("AI returned invalid JSON, re-prompting once...");
        const retryResult = await adapter({
          baseUrl: baseUrl || getDefaultBaseUrl(provider),
          apiKey,
          model,
          system,
          user: user + "\n\nIMPORTANT: Your previous response was not valid JSON. Respond ONLY with a valid JSON object.",
          temperature: resolvedTemp,
          maxTokens: resolvedMaxTokens,
          timeoutMs,
          jsonMode,
        });
        const retryParsed = safeParseJSON(retryResult);
        if (!retryParsed) {
          warn("AI JSON re-prompt also failed, falling back to deterministic.");
          return { success: false, error: "Invalid JSON from AI after retry", fallback: true };
        }
        const schemaError = validateSchema(retryParsed, jsonSchema);
        if (schemaError) {
          warn(`AI JSON schema mismatch after retry: ${schemaError}`);
          return { success: false, error: schemaError, fallback: true };
        }
        return { success: true, text: retryResult, parsed: retryParsed, fallback: false };
      }
      const schemaError = validateSchema(parsed, jsonSchema);
      if (schemaError) {
        warn(`AI JSON schema mismatch: ${schemaError}`);
        return { success: false, error: schemaError, fallback: true };
      }
      return { success: true, text: result, parsed, fallback: false };
    }
    
    return {
      success: true,
      text: result,
      fallback: false
    };
    
  } catch (error) {
    warn(`AI generation failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
}

/**
 * Parse JSON safely, returning null on failure.
 */
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown code blocks
    const match = text?.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
    }
    return null;
  }
}

/**
 * Validate an object against a simple schema (required string fields).
 * Returns error message or null if valid.
 */
function validateSchema(obj, schema) {
  if (!schema || !schema.required) return null;
  for (const field of schema.required) {
    if (!(field in obj)) return `Missing required field: ${field}`;
  }
  return null;
}

/**
 * Get default model for a provider.
 */
function getDefaultModel(provider) {
  switch (provider) {
    case "anthropic": return "claude-sonnet-4-20250514";
    case "google": return "gemini-pro";
    case "github": return "gpt-4o-mini";
    default: return "gpt-5-mini";
  }
}

/**
 * Get default base URL for a provider.
 */
function getDefaultBaseUrl(provider) {
  switch (provider) {
    case "anthropic": return "https://api.anthropic.com";
    case "azure": return process.env.REPOLENS_AI_BASE_URL || "https://api.openai.com/v1";
    case "google": return "https://generativelanguage.googleapis.com";
    case "github": return "https://models.inference.ai.github.com/v1";
    default: return "https://api.openai.com/v1";
  }
}

/**
 * Select the appropriate provider adapter function.
 */
function getProviderAdapter(provider) {
  switch (provider) {
    case "anthropic": return callAnthropicAPI;
    case "google": return callGoogleAPI;
    // "openai_compatible", "azure", and "github" all use the OpenAI chat/completions format
    default: return callOpenAICompatibleAPI;
  }
}

async function callOpenAICompatibleAPI({ baseUrl, apiKey, model, system, user, temperature, maxTokens, timeoutMs, jsonMode }) {
  return await executeAIRequest(async () => {
    const url = `${baseUrl}/chat/completions`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Build request body — omit temperature if not supported by model
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_completion_tokens: maxTokens
      };
      // Only send temperature when explicitly configured — some models
      // (e.g. gpt-5-mini) reject any non-default value
      if (temperature != null) {
        body.temperature = temperature;
      }
      if (jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error("No completion returned from API");
      }
      
      return data.choices[0].message.content;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  });
}

/**
 * Anthropic Messages API adapter.
 */
async function callAnthropicAPI({ baseUrl, apiKey, model, system, user, temperature, maxTokens, timeoutMs }) {
  return await executeAIRequest(async () => {
    const url = `${baseUrl}/v1/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model: model || "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      };
      if (temperature != null) {
        body.temperature = temperature;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.content || data.content.length === 0) {
        throw new Error("No content returned from Anthropic API");
      }

      return data.content[0].text;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  });
}

/**
 * Google Gemini API adapter.
 */
async function callGoogleAPI({ baseUrl, apiKey, model, system, user, temperature, maxTokens, timeoutMs }) {
  return await executeAIRequest(async () => {
    const geminiModel = model || "gemini-pro";
    const url = `${baseUrl}/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (temperature != null) {
        body.generationConfig.temperature = temperature;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No candidates returned from Google API");
      }

      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  });
}

export function isAIEnabled(config) {
  return process.env.REPOLENS_AI_ENABLED === "true" || config?.ai?.enabled === true;
}

export function getAIConfig(config) {
  const aiConfig = config?.ai || {};
  const provider = process.env.REPOLENS_AI_PROVIDER || aiConfig.provider || "openai_compatible";
  const hasApiKey = !!(process.env.REPOLENS_AI_API_KEY
    || (provider === "github" ? process.env.GITHUB_TOKEN : undefined));
  return {
    enabled: isAIEnabled(config),
    provider,
    model: process.env.REPOLENS_AI_MODEL || aiConfig.model || getDefaultModel(provider),
    hasApiKey,
    temperature: process.env.REPOLENS_AI_TEMPERATURE ? parseFloat(process.env.REPOLENS_AI_TEMPERATURE) : (aiConfig.temperature != null ? aiConfig.temperature : undefined),
    maxTokens: parseInt(process.env.REPOLENS_AI_MAX_TOKENS || aiConfig.max_tokens || DEFAULT_MAX_TOKENS)
  };
}
