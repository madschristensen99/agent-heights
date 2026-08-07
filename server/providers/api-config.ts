/**
 * Shared API provider configuration.
 *
 * Primary LLM provider: DeepSeek (DEEPSEEK_KEY).
 * Vision provider: Kimi (KIMI_KEY) — used for image understanding tasks
 * like browser screenshots, since DeepSeek V4 Flash does not support vision.
 * Both expose OpenAI-compatible /chat/completions endpoints.
 */

export type ProviderName = "deepseek" | "kimi";

export interface ProviderConfig {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  /** Extra headers to send with every request (e.g. auth header). */
  headers: Record<string, string>;
}

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_KEY ?? "";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
const KIMI_API_KEY = process.env.KIMI_KEY ?? "";
const KIMI_DEFAULT_MODEL = "kimi-k2.5";

/** Aliases that map to the DeepSeek default model. */
const MODEL_TO_DEEPSEEK: Record<string, string> = {
  "claude-sonnet-4-20250514": DEEPSEEK_DEFAULT_MODEL,
  "claude-3-7-sonnet-latest": DEEPSEEK_DEFAULT_MODEL,
  "claude-opus-4": DEEPSEEK_DEFAULT_MODEL,
  "gpt-4o": DEEPSEEK_DEFAULT_MODEL,
  "gpt-4.1-mini": DEEPSEEK_DEFAULT_MODEL,
  "gpt-4.1-nano": DEEPSEEK_DEFAULT_MODEL,
  "o3-mini": DEEPSEEK_DEFAULT_MODEL,
  "gemini-1.5-pro": DEEPSEEK_DEFAULT_MODEL,
  "openrouter/tencent/hy3:free": DEEPSEEK_DEFAULT_MODEL,
  // Legacy Kimi defaults → DeepSeek
  "kimi-k2.5": DEEPSEEK_DEFAULT_MODEL,
};

/**
 * Get the active primary provider configuration (DeepSeek).
 */
export function getProviderConfig(): ProviderConfig {
  return {
    name: "deepseek",
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: DEEPSEEK_API_KEY,
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
  };
}

/**
 * Get the vision provider configuration (Kimi).
 * Used when the primary model doesn't support image input.
 */
export function getVisionProviderConfig(): ProviderConfig {
  return {
    name: "kimi",
    baseUrl: KIMI_BASE_URL,
    apiKey: KIMI_API_KEY,
    headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
  };
}

/**
 * Resolve the model id for the active provider.
 * Maps known model names to DeepSeek equivalents.
 */
export function resolveModel(model: string, _provider: ProviderName): string {
  return MODEL_TO_DEEPSEEK[model] ?? model;
}

/**
 * Check whether any API key is configured.
 */
export function hasApiKey(): boolean {
  return !!DEEPSEEK_API_KEY;
}

/**
 * Check whether the vision (Kimi) provider is available.
 */
export function hasVisionApiKey(): boolean {
  return !!KIMI_API_KEY;
}

/**
 * Models known to support vision (image understanding).
 * DeepSeek V4 Flash does NOT support vision — only Kimi models do.
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
 * If the current model doesn't support vision, route to a Kimi vision model.
 * Returns the model name to use for vision-capable tasks (e.g. browser
 * screenshots). If the current model is already vision-capable, returns it
 * as-is.
 */
export function resolveVisionModel(model: string, _provider: ProviderName): string {
  if (isVisionCapable(model)) return model;
  // DeepSeek V4 Flash doesn't support vision — fall back to Kimi
  return KIMI_DEFAULT_MODEL;
}
