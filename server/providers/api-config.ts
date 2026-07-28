/**
 * Shared API provider configuration.
 *
 * The LLM provider uses KIMI_KEY.
 * It exposes an OpenAI-compatible /chat/completions endpoint.
 */

export type ProviderName = "kimi";

export interface ProviderConfig {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  /** Extra headers to send with every request (e.g. auth header). */
  headers: Record<string, string>;
}

const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
const KIMI_API_KEY = process.env.KIMI_KEY ?? "";

const KIMI_DEFAULT_MODEL = "kimi-k2.5";

const MODEL_TO_KIMI: Record<string, string> = {
  "claude-sonnet-4-20250514": KIMI_DEFAULT_MODEL,
  "claude-3-7-sonnet-latest": KIMI_DEFAULT_MODEL,
  "claude-opus-4": KIMI_DEFAULT_MODEL,
  "gpt-4o": KIMI_DEFAULT_MODEL,
  "gpt-4.1-mini": KIMI_DEFAULT_MODEL,
  "gpt-4.1-nano": KIMI_DEFAULT_MODEL,
  "o3-mini": KIMI_DEFAULT_MODEL,
  "gemini-1.5-pro": KIMI_DEFAULT_MODEL,
  "openrouter/tencent/hy3:free": KIMI_DEFAULT_MODEL,
};

/**
 * Get the active provider configuration.
 */
export function getProviderConfig(): ProviderConfig {
  return {
    name: "kimi",
    baseUrl: KIMI_BASE_URL,
    apiKey: KIMI_API_KEY,
    headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
  };
}

/**
 * Resolve the model id for the active provider.
 * Maps known model names to Kimi equivalents.
 */
export function resolveModel(model: string, _provider: ProviderName): string {
  return MODEL_TO_KIMI[model] ?? model;
}

/**
 * Check whether any API key is configured.
 */
export function hasApiKey(): boolean {
  return !!KIMI_API_KEY;
}

/**
 * Models known to support vision (image understanding).
 * When an agent uses browser tools (screenshots), routing to a vision model
 * gives the agent the ability to actually "see" and reason about screenshots.
 */
const VISION_CAPABLE_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
  "claude-opus-4",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gemini-1.5-pro",
  "kimi-k2.5",
  "kimi-k2.6",
  "kimi-k2.7-code",
  "kimi-k2.7-code-highspeed",
  "kimi-k3",
]);

/**
 * Check if a model supports vision (image input).
 */
export function isVisionCapable(model: string): boolean {
  return VISION_CAPABLE_MODELS.has(model);
}

/**
 * If the current provider maps to Kimi (which may not support vision),
 * and the task requires vision, we still send the model as-is — the
 * screenshot tool returns a text description.
 *
 * This function is a placeholder for future routing logic — for now,
 * it just returns the resolved model. When per-user API keys support
 * vision models, this can route accordingly.
 */
export function resolveVisionModel(model: string, provider: ProviderName): string {
  return resolveModel(model, provider);
}
