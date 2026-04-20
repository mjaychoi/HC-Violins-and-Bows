import * as dotenv from 'dotenv';
import { checkSchemaReadiness } from '../src/app/api/_utils/schemaReadiness';

dotenv.config({ path: '.env.local' });

// comment
function getSchemaTargetHost(): string | null {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.DATABASE_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    try {
      return new URL(candidate).host;
    } catch {
      // Ignore invalid URL candidates; readiness check below will still fail loudly.
    }
  }

  return null;
}

function printList(label: string, values: string[]) {
  if (values.length === 0) {
    return;
  }

  console.error(`${label}:`);
  for (const value of values) {
    console.error(`- ${value}`);
  }
}

async function main() {
  const host = getSchemaTargetHost();
  console.log(`Schema readiness target: ${host ?? 'unknown-host'}`);

  const result = await checkSchemaReadiness({ bypassCache: true });

  if (result.ready) {
    console.log('Schema readiness passed.');
    return;
  }

  console.error('Schema readiness failed.');
  printList('Missing required columns', result.missingColumns);
  process.exit(1);
}

main().catch(error => {
  console.error(
    'Schema readiness check crashed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
