-- Make agent_heights_agent_logs UNLOGGED to eliminate WAL writes entirely.
-- Trade-off: no replication, no crash recovery for log data (acceptable — logs
-- are transient and capped at 500 per agent, regenerated on next flush).
ALTER TABLE public.agent_heights_agent_logs SET UNLOGGED;
