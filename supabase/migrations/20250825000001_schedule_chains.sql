-- Add chain_to column to schedules table for compound schedule chains
ALTER TABLE agent_heights_schedules
ADD COLUMN IF NOT EXISTS chain_to text;
