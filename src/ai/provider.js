// Provider-agnostic AI text generation

import { warn, info } from "../utils/logger.js";
import { executeAIRequest } from "../utils/rate-limit.js";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2500;

export async function generateText({ system, user, temperature, maxTokens, config }) {
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
  const provider = process.env.REPOLENS_AI_PROVIDER || "openai_compatible";
  const baseUrl = process.env.REPOLENS_AI_BASE_URL;
  const apiKey = process.env.REPOLENS_AI_API_KEY;
  const model = process.env.REPOLENS_AI_MODEL || "gpt-5-mini";
  const timeoutMs = parseInt(process.env.REPOLENS_AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  
  // Use config values as fallback for temperature/maxTokens
  const resolvedTemp = temperature ?? aiConfig.temperature ?? DEFAULT_TEMPERATURE;
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
  
  try {
    const result = await callOpenAICompatibleAPI({
      baseUrl: baseUrl || "https://api.openai.com/v1",
      apiKey,
      model,
      system,
      user,
      temperature: resolvedTemp,
      maxTokens: resolvedMaxTokens,
      timeoutMs
    });
    
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

async function callOpenAICompatibleAPI({ baseUrl, apiKey, model, system, user, temperature, maxTokens, timeoutMs }) {
  return await executeAIRequest(async () => {
    const url = `${baseUrl}/chat/completions`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature,
          max_completion_tokens: maxTokens
        }),
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

export function isAIEnabled() {
  return process.env.REPOLENS_AI_ENABLED === "true";
}

export function getAIConfig() {
  return {
    enabled: isAIEnabled(),
    provider: process.env.REPOLENS_AI_PROVIDER || "openai_compatible",
    model: process.env.REPOLENS_AI_MODEL || "gpt-5-mini",
    hasApiKey: !!process.env.REPOLENS_AI_API_KEY,
    temperature: parseFloat(process.env.REPOLENS_AI_TEMPERATURE || DEFAULT_TEMPERATURE),
    maxTokens: parseInt(process.env.REPOLENS_AI_MAX_TOKENS || DEFAULT_MAX_TOKENS)
  };
}
