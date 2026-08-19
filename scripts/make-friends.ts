import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. List all users
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError);
    process.exit(1);
  }

  console.log(`Total users: ${users.users.length}`);
  users.users.forEach(u => {
    console.log(`  ${u.id}  ${u.email}  ${(u.user_metadata as any)?.display_name ?? ''}`);
  });

  // 2. Find remseechanell — check email and display_name
  const target = users.users.find(u => {
    const email = (u.email || '').toLowerCase();
    const displayName = ((u.user_metadata as any)?.display_name || '').toLowerCase();
    return email.includes('remseechannel') || displayName.includes('remseechannel');
  });

  if (!target) {
    console.error('\nCould not find user matching "remseechanell"');
    console.error('Available users:');
    users.users.forEach(u => console.error(`  ${u.email}`));
    process.exit(1);
  }

  console.log(`\nTarget user: ${target.email} (${target.id})`);

  // 3. Get all other user IDs
  const others = users.users.filter(u => u.id !== target.id);
  console.log(`Other users to befriend: ${others.length}`);

  if (others.length === 0) {
    console.log('No other users found. Done.');
    return;
  }

  // 4. Build bidirectional accepted rows
  // From target → others
  const rowsFromTarget = others.map(u => ({
    user_id: target.id,
    friend_id: u.id,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }));

  // From others → target
  const rowsToTarget = others.map(u => ({
    user_id: u.id,
    friend_id: target.id,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }));

  const allRows = [...rowsFromTarget, ...rowsToTarget];

  // 5. Insert (upsert to handle existing rows)
  const { error: insertError } = await supabase
    .from('heights_cloud_friends')
    .upsert(allRows, { onConflict: 'user_id,friend_id' });

  if (insertError) {
    console.error('Failed to insert friend rows:', insertError);
    process.exit(1);
  }

  console.log(`\nSuccess! Inserted ${allRows.length} friend rows (${others.length} friends, bidirectional).`);
  console.log('remseechanell is now friends with everyone.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
