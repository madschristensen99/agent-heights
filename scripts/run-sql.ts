const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.heights_cloud_friends (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
ALTER TABLE public.heights_cloud_friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS 'Service role full access to friends' ON public.heights_cloud_friends;
CREATE POLICY 'Service role full access to friends'
  ON public.heights_cloud_friends FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_heights_cloud_friends_user
  ON public.heights_cloud_friends (user_id, status);
CREATE INDEX IF NOT EXISTS idx_heights_cloud_friends_friend
  ON public.heights_cloud_friends (friend_id, status);
`;

async function main() {
  // Try the /pg/query endpoint (Supabase SQL endpoint)
  const resp = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: createTableSQL }),
  });

  const text = await resp.text();
  console.log('Status:', resp.status);
  console.log('Response:', text);

  if (!resp.ok) {
    console.error('Failed to create table');
    process.exit(1);
  }

  console.log('Table created successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
