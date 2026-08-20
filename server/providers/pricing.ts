/**
 * Static model pricing reference (USD per 1M tokens).
 * Used to estimate cost when the provider doesn't return it.
 * Prices reflect actual provider rates as of Aug 2026.
 */

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-7-sonnet-latest": { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-opus-4": { inputPer1M: 15.0, outputPer1M: 75.0, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "kimi-k2.5": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "kimi-k2.6": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "kimi-k2.7-code": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "kimi-k2.7-code-highspeed": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "kimi-k3": { inputPer1M: 0.6, outputPer1M: 2.4 },
  "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28, cacheReadPer1M: 0.0028 },
  "deepseek-v4-pro": { inputPer1M: 0.435, outputPer1M: 0.87, cacheReadPer1M: 0.003625 },
  "openrouter/tencent/hy3:free": { inputPer1M: 0, outputPer1M: 0 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 0.14, outputPer1M: 0.28, cacheReadPer1M: 0.0028 };

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  // inputTokens includes BOTH cache hit and cache miss tokens.
  // cacheReadTokens is the subset of input that was a cache hit.
  // Charge cache miss tokens at full input rate, cache hit tokens at the
  // discounted cache read rate — don't double-charge.
  const cacheMissTokens = Math.max(0, inputTokens - cacheReadTokens);
  const cost =
    (cacheMissTokens / 1_000_000) * p.inputPer1M +
    (cacheReadTokens / 1_000_000) * (p.cacheReadPer1M ?? p.inputPer1M) +
    (outputTokens / 1_000_000) * p.outputPer1M +
    (cacheWriteTokens / 1_000_000) * (p.cacheWritePer1M ?? 0);
  return Math.round(cost * 1_000_000) / 1_000_000;
}
