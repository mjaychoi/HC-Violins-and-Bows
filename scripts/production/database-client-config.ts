/**
 * PostgreSQL client TLS configuration shared by production and staging
 * scripts.
 *
 * Node `pg` / `pg-connection-string` treats `sslmode=require` as
 * verify-full against Node's built-in CA store, and a connection string
 * that contains SSL parameters replaces any `ssl` object passed beside it.
 * Supabase's database CA is not in that built-in store, so a hosted
 * connection fails with "self-signed certificate in certificate chain"
 * before any SQL runs.
 *
 * When `DATABASE_CA_CERT_PATH` is set for a TLS connection, this helper
 * strips those SSL parameters and supplies the CA with certificate and
 * hostname verification left on. When neither the path nor
 * `DATABASE_CA_CERT_REQUIRED` is set, the connection string is returned
 * unchanged so local embedded Postgres keeps its existing behavior.
 * Protected production workflows explicitly require the CA.
 *
 * Never logs the certificate, the connection string, or credentials.
 */
import fs from 'fs';
import tls from 'tls';
import type { ClientConfig } from 'pg';

export const DATABASE_CA_CERT_PATH_ENV = 'DATABASE_CA_CERT_PATH';
export const DATABASE_CA_CERT_REQUIRED_ENV = 'DATABASE_CA_CERT_REQUIRED';

const SSL_QUERY_PARAMETERS = new Set([
  'sslmode',
  'ssl',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'uselibpqcompat',
  'sslnegotiation',
]);

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase() ?? '';
  return value === '1' || value === 'true' || value === 'yes';
}

function queryParameters(connectionString: string): URLSearchParams {
  const queryIndex = connectionString.indexOf('?');
  if (queryIndex === -1) {
    return new URLSearchParams();
  }
  return new URLSearchParams(connectionString.slice(queryIndex + 1));
}

function connectionStringRequestsTls(connectionString: string): boolean {
  const params = queryParameters(connectionString);
  const sslmode = params.get('sslmode');
  if (sslmode && sslmode.toLowerCase() !== 'disable') {
    return true;
  }
  const ssl = params.get('ssl')?.toLowerCase() ?? '';
  return ssl === 'true' || ssl === '1' || ssl === 'require';
}

/**
 * Removes SSL query parameters without re-encoding the userinfo. `pg`
 * replaces an explicit `ssl` object with whatever those parameters parse to.
 */
export function stripSslParameters(connectionString: string): string {
  const queryIndex = connectionString.indexOf('?');
  if (queryIndex === -1) {
    return connectionString;
  }
  const base = connectionString.slice(0, queryIndex);
  const params = queryParameters(connectionString);
  for (const name of [...params.keys()]) {
    if (SSL_QUERY_PARAMETERS.has(name.toLowerCase())) {
      params.delete(name);
    }
  }
  const rest = params.toString();
  return rest.length > 0 ? `${base}?${rest}` : base;
}

function readTrustedCaPem(caCertPath: string): string {
  let pem: string;
  try {
    pem = fs.readFileSync(caCertPath, 'utf8');
  } catch {
    throw new Error(
      'DATABASE_CA_CERT_PATH could not be read. Refusing to connect without a trusted CA.'
    );
  }
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(
      'DATABASE_CA_CERT_PATH is not a PEM certificate. Refusing to connect without a trusted CA.'
    );
  }
  return pem;
}

/**
 * libpq `sslmode=require` encrypts without verifying the server certificate.
 * Hosted `psql` and `supabase db push` need `verify-full` plus `sslrootcert`
 * to check the same CA the Node client trusts. The returned URL is for the
 * client only; callers must not print it.
 */
export function formatLibpqVerifyFullConnectionString(
  connectionString: string,
  caCertPath: string
): string {
  const path = caCertPath.trim();
  if (!path) {
    throw new Error(
      'DATABASE_CA_CERT_PATH is required to verify the hosted PostgreSQL certificate.'
    );
  }
  readTrustedCaPem(path);
  const queryIndex = connectionString.indexOf('?');
  const base =
    queryIndex === -1
      ? connectionString
      : connectionString.slice(0, queryIndex);
  const params = queryParameters(connectionString);
  for (const name of [...params.keys()]) {
    if (SSL_QUERY_PARAMETERS.has(name.toLowerCase())) {
      params.delete(name);
    }
  }
  params.set('sslmode', 'verify-full');
  params.set('sslrootcert', path);
  return `${base}?${params.toString()}`;
}

/**
 * Config for `new Client(...)`.
 *
 * - No CA path and CA not required: original connection string (local tests).
 * - CA required but missing: fail before connecting.
 * - CA present for a TLS connection, or CA required: verify-full against
 *   that CA. SSL parameters are removed from the connection string so they
 *   cannot replace this `ssl` object.
 */
export function createDatabaseClientConfig(
  connectionString: string
): ClientConfig {
  const caCertPath = process.env[DATABASE_CA_CERT_PATH_ENV]?.trim() ?? '';
  const caRequired = envFlag(DATABASE_CA_CERT_REQUIRED_ENV);

  if (!caCertPath && !caRequired) {
    return { connectionString };
  }

  if (!caCertPath) {
    throw new Error(
      'DATABASE_CA_CERT_PATH is required for hosted PostgreSQL certificate verification. Refusing to connect without a trusted CA.'
    );
  }

  if (!caRequired && !connectionStringRequestsTls(connectionString)) {
    return { connectionString };
  }

  const ca = readTrustedCaPem(caCertPath);
  return {
    connectionString: stripSslParameters(connectionString),
    ssl: {
      ca,
      rejectUnauthorized: true,
      checkServerIdentity: tls.checkServerIdentity,
    },
  };
}
