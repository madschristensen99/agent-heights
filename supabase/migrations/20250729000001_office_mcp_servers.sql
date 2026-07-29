-- MCP Forge: self-built MCP servers created by agents.
-- Each row represents an MCP server that an agent wrote in its workspace
-- and registered via the register_mcp_server tool. These servers are
-- available to all agents in the same office (room).

CREATE TABLE IF NOT EXISTS agent_heights_office_mcp_servers (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  runtime       TEXT NOT NULL DEFAULT 'node',  -- "node" | "python"
  entry_file    TEXT NOT NULL,                  -- relative to builder's workspace
  built_by      TEXT NOT NULL,                  -- agent ID
  built_by_name TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'stopped', -- "running" | "stopped" | "error"
  tools         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, description}]
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_office_mcp_room ON agent_heights_office_mcp_servers (room_id);
CREATE INDEX IF NOT EXISTS idx_office_mcp_built_by ON agent_heights_office_mcp_servers (built_by);
