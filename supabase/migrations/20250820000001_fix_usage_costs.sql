-- Backfill: fix mislabeled model names and recalculate costs
-- All Claude/GPT/Gemini/Kimi model names were aliases for deepseek-v4-flash,
-- but some records stored the original alias name instead of the resolved one.
-- Costs were also calculated at the alias model's rates (e.g. Claude at $3/1M)
-- instead of the actual DeepSeek rates ($0.14/1M input, $0.0028/1M cache read).

-- Step 1: Fix model names — map all known aliases to deepseek-v4-flash
UPDATE public.api_usage_records
SET model = 'deepseek-v4-flash'
WHERE model IN (
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-latest',
  'claude-opus-4',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3-mini',
  'gemini-1.5-pro',
  'openrouter/tencent/hy3:free',
  'kimi-k2.5',
  'kimi-k2.6'
);

-- Step 2: Recalculate total_cost for all deepseek-v4-flash records
-- using correct pricing: $0.14/1M input (cache miss), $0.0028/1M cache read, $0.28/1M output
-- Note: input_tokens includes cache hits, so subtract cache_read to avoid double-charging
UPDATE public.api_usage_records
SET total_cost = ROUND((
  (GREATEST(input_tokens - cache_read_tokens, 0) / 1000000.0) * 0.14 +
  (cache_read_tokens / 1000000.0) * 0.0028 +
  (output_tokens / 1000000.0) * 0.28
)::numeric, 6)
WHERE model = 'deepseek-v4-flash';

-- Step 3: Recalculate for deepseek-v4-pro if any exist
UPDATE public.api_usage_records
SET total_cost = ROUND((
  (GREATEST(input_tokens - cache_read_tokens, 0) / 1000000.0) * 0.435 +
  (cache_read_tokens / 1000000.0) * 0.003625 +
  (output_tokens / 1000000.0) * 0.87
)::numeric, 6)
WHERE model = 'deepseek-v4-pro';

-- Step 4: Recalculate for kimi models (still have entries with kimi-k2.5)
UPDATE public.api_usage_records
SET total_cost = ROUND((
  (input_tokens / 1000000.0) * 0.6 +
  (output_tokens / 1000000.0) * 2.4
)::numeric, 6)
WHERE model LIKE 'kimi-%' AND model NOT LIKE 'kimi-k2.5' AND model NOT LIKE 'kimi-k2.6';

-- Step 5: Delete zero-token records (failed/empty API calls that shouldn't have been recorded)
DELETE FROM public.api_usage_records
WHERE input_tokens = 0
  AND output_tokens = 0
  AND total_cost = 0
  AND model NOT LIKE 'circle:%';
