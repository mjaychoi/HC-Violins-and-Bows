import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ORG_A_ID = '11111111-1111-4111-8111-111111111111';
const ORG_B_ID = '22222222-2222-4222-8222-222222222222';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const url =
    process.env.AUTH_MATRIX_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceKey =
    process.env.AUTH_MATRIX_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error(
      'Set AUTH_MATRIX_SUPABASE_URL and AUTH_MATRIX_SERVICE_ROLE_KEY (or local .env.local equivalents).'
    );
  }

  if (url.includes('dmilmlhquttcozxlpfxw')) {
    throw new Error('Refusing to seed production Supabase project.');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('organizations').upsert([
    { id: ORG_A_ID, name: 'Auth Matrix Org A' },
    { id: ORG_B_ID, name: 'Auth Matrix Org B' },
  ]);

  const instrumentRows = [
    {
      org_id: ORG_A_ID,
      maker: 'Matrix Maker A',
      type: 'Violin',
      status: 'Available',
      certificate: false,
      serial_number: 'MX-A-001',
    },
    {
      org_id: ORG_B_ID,
      maker: 'Matrix Maker B',
      type: 'Violin',
      status: 'Available',
      certificate: false,
      serial_number: 'MX-B-001',
    },
  ];

  const { data: instruments, error: instrumentError } = await supabase
    .from('instruments')
    .upsert(instrumentRows, { onConflict: 'serial_number' })
    .select('id, org_id, serial_number');

  if (instrumentError) {
    throw instrumentError;
  }

  const clientRows = [
    {
      org_id: ORG_A_ID,
      first_name: 'OrgA',
      last_name: 'Client',
      name: 'OrgA Client',
      client_number: 'CL901',
    },
    {
      org_id: ORG_B_ID,
      first_name: 'OrgB',
      last_name: 'Client',
      name: 'OrgB Client',
      client_number: 'CL902',
    },
  ];

  const { error: clientError } = await supabase
    .from('clients')
    .upsert(clientRows, { onConflict: 'client_number' });

  if (clientError) {
    throw clientError;
  }

  const orgAInstrument = instruments?.find(row => row.org_id === ORG_A_ID);
  const orgBInstrument = instruments?.find(row => row.org_id === ORG_B_ID);

  console.log(
    JSON.stringify(
      {
        orgAId: ORG_A_ID,
        orgBId: ORG_B_ID,
        orgAInstrumentId: orgAInstrument?.id ?? null,
        orgBInstrumentId: orgBInstrument?.id ?? null,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
