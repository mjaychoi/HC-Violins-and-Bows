import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { assertUrlIsNotConfiguredProduction } from '../staging/env-guard';
import {
  AUTH_MATRIX_ORG_A_CLIENT_NUMBER,
  AUTH_MATRIX_ORG_A_ID,
  AUTH_MATRIX_ORG_A_SERIAL,
  AUTH_MATRIX_ORG_B_CLIENT_NUMBER,
  AUTH_MATRIX_ORG_B_ID,
  AUTH_MATRIX_ORG_B_SERIAL,
} from './constants';

dotenv.config({ path: '.env.local' });

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

  assertUrlIsNotConfiguredProduction(url);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('organizations').upsert([
    { id: AUTH_MATRIX_ORG_A_ID, name: 'Auth Matrix Org A' },
    { id: AUTH_MATRIX_ORG_B_ID, name: 'Auth Matrix Org B' },
  ]);

  const instrumentRows = [
    {
      org_id: AUTH_MATRIX_ORG_A_ID,
      maker: 'Matrix Maker A',
      type: 'Violin',
      status: 'Available',
      certificate: false,
      serial_number: AUTH_MATRIX_ORG_A_SERIAL,
    },
    {
      org_id: AUTH_MATRIX_ORG_B_ID,
      maker: 'Matrix Maker B',
      type: 'Violin',
      status: 'Available',
      certificate: false,
      serial_number: AUTH_MATRIX_ORG_B_SERIAL,
    },
  ];

  const { data: instruments, error: instrumentError } = await supabase
    .from('instruments')
    .upsert(instrumentRows, { onConflict: 'org_id,serial_number' })
    .select('id, org_id, serial_number');

  if (instrumentError) {
    throw instrumentError;
  }

  const clientRows = [
    {
      org_id: AUTH_MATRIX_ORG_A_ID,
      first_name: 'OrgA',
      last_name: 'Client',
      name: 'OrgA Client',
      client_number: AUTH_MATRIX_ORG_A_CLIENT_NUMBER,
    },
    {
      org_id: AUTH_MATRIX_ORG_B_ID,
      first_name: 'OrgB',
      last_name: 'Client',
      name: 'OrgB Client',
      client_number: AUTH_MATRIX_ORG_B_CLIENT_NUMBER,
    },
  ];

  const { error: clientError } = await supabase
    .from('clients')
    .upsert(clientRows, { onConflict: 'org_id,client_number' });

  if (clientError) {
    throw clientError;
  }

  const orgAInstrument = instruments?.find(
    row => row.org_id === AUTH_MATRIX_ORG_A_ID
  );
  const orgBInstrument = instruments?.find(
    row => row.org_id === AUTH_MATRIX_ORG_B_ID
  );

  console.log(
    JSON.stringify(
      {
        orgAId: AUTH_MATRIX_ORG_A_ID,
        orgBId: AUTH_MATRIX_ORG_B_ID,
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
