-- Bulk insert function for agent logs.
-- Accepts a JSON array and inserts all rows in a single server-side operation.
-- More efficient than client-side batch insert: smaller network payload,
-- single server-side transaction, less Supabase client overhead.
CREATE OR REPLACE FUNCTION public.bulk_insert_agent_logs(payload json)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.agent_heights_agent_logs (agent_id, owner_id, ts, kind, text, archived)
  SELECT agent_id, owner_id, ts, kind, text, archived
  FROM json_populate_recordset(
    null::public.agent_heights_agent_logs,
    payload
  );
  SELECT count(*)::int FROM json_array_elements(payload);
$$;
