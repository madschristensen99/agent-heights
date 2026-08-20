-- Single-SQL log trimming function.
-- Replaces the N+1 pattern of: for each agent, count logs, select oldest, delete.
-- This function does it all in one query using ROW_NUMBER().
CREATE OR REPLACE FUNCTION public.trim_agent_logs(cap int DEFAULT 500)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY ts DESC) AS rn
    FROM public.agent_heights_agent_logs
    WHERE archived = false
  ),
  deleted AS (
    DELETE FROM public.agent_heights_agent_logs
    WHERE id IN (SELECT id FROM ranked WHERE rn > cap)
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;
