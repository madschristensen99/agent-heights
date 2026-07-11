/**
 * Shared API provider configuration.
 *
 * Kimi (Moonshot AI) is the default provider when KIMI_BACKUP_KEY is set.
 * Swarms is used as a fallback when KIMI_BACKUP_KEY is not set but SWARMS_API_KEY is.
 *
 * Both providers expose an OpenAI-compatible /chat/completions endpoint,
 * but they differ in base URL, auth header, and model names.
 */

export type ProviderName = "kimi" | "swarms";

export interface ProviderConfig {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  /** Extra headers to send with every request (e.g. auth header). */
  headers: Record<string, string>;
}

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const KIMI_API_KEY = process.env.KIMI_BACKUP_KEY ?? "";

const SWARMS_BASE_URL = "https://api.swarms.world/v1";
const SWARMS_API_KEY = process.env.SWARMS_API_KEY ?? process.env.MASTER_SWARMS_API_KEY ?? "";

/**
 * Map Swarms model names to Kimi equivalents.
 * When running on Kimi, the model id sent to the API must be a Kimi model.
 */
const KIMI_DEFAULT_MODEL = "kimi-k2.7-code-highspeed";

const SWARMS_TO_KIMI_MODEL: Record<string, string> = {
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
 * Kimi is preferred when KIMI_BACKUP_KEY is set; Swarms is the fallback.
 */
export function getProviderConfig(): ProviderConfig {
  if (KIMI_API_KEY) {
    return {
      name: "kimi",
      baseUrl: KIMI_BASE_URL,
      apiKey: KIMI_API_KEY,
      headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
    };
  }

  return {
    name: "swarms",
    baseUrl: SWARMS_BASE_URL,
    apiKey: SWARMS_API_KEY,
    headers: { "x-api-key": SWARMS_API_KEY },
  };
}

/**
 * Resolve the model id for the active provider.
 * If we're on Kimi and the model is a Swarms name, map it to the Kimi equivalent.
 */
export function resolveModel(model: string, provider: ProviderName): string {
  if (provider === "kimi") {
    return SWARMS_TO_KIMI_MODEL[model] ?? model;
  }
  return model;
}

/**
 * Check whether any API key is configured.
 */
export function hasApiKey(): boolean {
  return !!KIMI_API_KEY || !!SWARMS_API_KEY;
}
