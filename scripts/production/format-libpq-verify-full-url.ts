#!/usr/bin/env tsx
/**
 * Rewrites DATABASE_URL for libpq clients (`psql`, `supabase db push`) so
 * they verify the CA file at DATABASE_CA_CERT_PATH.
 *
 * Writes only the rewritten URL to stdout. Callers must capture it and
 * must not print it. Errors go to stderr and never include the URL or the
 * certificate.
 */
import { formatLibpqVerifyFullConnectionString } from './database-client-config';

const connectionString = process.env.DATABASE_URL;
const caCertPath = process.env.DATABASE_CA_CERT_PATH;

if (!connectionString?.trim() || !caCertPath?.trim()) {
  console.error(
    'DATABASE_URL and DATABASE_CA_CERT_PATH are required to prepare a verify-full libpq URL.'
  );
  process.exit(1);
}

try {
  process.stdout.write(
    `${formatLibpqVerifyFullConnectionString(connectionString, caCertPath)}\n`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
