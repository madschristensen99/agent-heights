-- Add is_premium column to marketplace agents table
ALTER TABLE heights_cloud_agents
ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- Create premium services catalog table
CREATE TABLE IF NOT EXISTS heights_cloud_premium_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES heights_cloud_agents(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  endpoint text NOT NULL,
  price_per_call numeric(10,4) NOT NULL,
  description text,
  tool_definitions jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Index for filtering premium agents
CREATE INDEX IF NOT EXISTS idx_heights_cloud_agents_is_premium
  ON heights_cloud_agents(is_premium)
  WHERE is_premium = true;

-- Index for looking up services by agent
CREATE INDEX IF NOT EXISTS idx_heights_cloud_premium_services_agent_id
  ON heights_cloud_premium_services(agent_id);
