import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ORG_A_ID = '11111111-1111-4111-8111-111111111111';
const ORG_B_ID = '22222222-2222-4222-8222-222222222222';

async function main() {
  const url =
    process.env.AUTH_MATRIX_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.AUTH_MATRIX_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase URL or service role key for cleanup.');
  }

  if (url.includes('dmilmlhquttcozxlpfxw')) {
    throw new Error('Refusing to cleanup production Supabase project.');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('clients').delete().in('org_id', [ORG_A_ID, ORG_B_ID]);
  await supabase.from('instruments').delete().in('org_id', [ORG_A_ID, ORG_B_ID]);
  await supabase.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID]);

  console.log('Auth matrix fixtures removed.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
