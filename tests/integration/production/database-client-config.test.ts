/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import { Client } from 'pg';
import {
  createDatabaseClientConfig,
  formatLibpqVerifyFullConnectionString,
} from '../../../scripts/production/database-client-config';

const HOSTED_URL =
  'postgresql://postgres.example:s3cr3t-pw@db.example.test:5432/postgres?sslmode=require&uselibpqcompat=true';
const LOCAL_URL = 'postgresql://postgres:pw@127.0.0.1:5432/postgres';
const SECRET_MARKER = 'CERTIFICATEBODYMUSTNOTBELOGGED';

type ObservedSsl = {
  ca?: string;
  rejectUnauthorized?: boolean;
  checkServerIdentity?: typeof tls.checkServerIdentity;
};

function sslOf(client: Client): ObservedSsl {
  const connectionParameters = (
    client as unknown as { connectionParameters?: { ssl?: ObservedSsl } }
  ).connectionParameters;
  return connectionParameters?.ssl ?? {};
}

function openssl(args: string[], cwd: string): void {
  const result = spawnSync('openssl', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `openssl ${args[0]} failed`
    );
  }
}

function writeCertMaterial(dir: string): {
  caPath: string;
  otherCaPath: string;
  serverCert: string;
  serverKey: string;
  mismatchedCert: string;
  mismatchedKey: string;
} {
  openssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '1',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.crt',
      '-subj',
      '/CN=Test Database CA',
    ],
    dir
  );
  openssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '1',
      '-nodes',
      '-keyout',
      'other-ca.key',
      '-out',
      'other-ca.crt',
      '-subj',
      '/CN=Wrong CA',
    ],
    dir
  );
  fs.writeFileSync(
    path.join(dir, 'server.ext'),
    'subjectAltName=DNS:db.example.test\nextendedKeyUsage=serverAuth\n'
  );
  fs.writeFileSync(
    path.join(dir, 'mismatch.ext'),
    'subjectAltName=DNS:other.example.test\nextendedKeyUsage=serverAuth\n'
  );
  openssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.csr',
      '-subj',
      '/CN=db.example.test',
    ],
    dir
  );
  openssl(
    [
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'server.crt',
      '-days',
      '1',
      '-sha256',
      '-extfile',
      'server.ext',
    ],
    dir
  );
  openssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-keyout',
      'mismatch.key',
      '-out',
      'mismatch.csr',
      '-subj',
      '/CN=other.example.test',
    ],
    dir
  );
  openssl(
    [
      'x509',
      '-req',
      '-in',
      'mismatch.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'mismatch.crt',
      '-days',
      '1',
      '-sha256',
      '-extfile',
      'mismatch.ext',
    ],
    dir
  );
  return {
    caPath: path.join(dir, 'ca.crt'),
    otherCaPath: path.join(dir, 'other-ca.crt'),
    serverCert: path.join(dir, 'server.crt'),
    serverKey: path.join(dir, 'server.key'),
    mismatchedCert: path.join(dir, 'mismatch.crt'),
    mismatchedKey: path.join(dir, 'mismatch.key'),
  };
}

function handshake(
  port: number,
  ssl: ObservedSsl,
  servername: string
): Promise<Error | null> {
  return new Promise(resolve => {
    const socket = tls.connect(
      {
        host: '127.0.0.1',
        port,
        servername,
        ca: ssl.ca,
        rejectUnauthorized: ssl.rejectUnauthorized,
        checkServerIdentity: ssl.checkServerIdentity,
      },
      () => {
        socket.end();
        resolve(null);
      }
    );
    socket.on('error', error => resolve(error));
  });
}

describe('hosted PostgreSQL CA client config', () => {
  jest.setTimeout(60000);
  const originalPath = process.env.DATABASE_CA_CERT_PATH;
  const originalRequired = process.env.DATABASE_CA_CERT_REQUIRED;
  let dir = '';
  let certs: ReturnType<typeof writeCertMaterial>;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-ca-'));
    certs = writeCertMaterial(dir);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.DATABASE_CA_CERT_PATH;
    } else {
      process.env.DATABASE_CA_CERT_PATH = originalPath;
    }
    if (originalRequired === undefined) {
      delete process.env.DATABASE_CA_CERT_REQUIRED;
    } else {
      process.env.DATABASE_CA_CERT_REQUIRED = originalRequired;
    }
  });

  it('keeps local and production connection strings unchanged when no CA is configured', () => {
    delete process.env.DATABASE_CA_CERT_PATH;
    delete process.env.DATABASE_CA_CERT_REQUIRED;

    expect(createDatabaseClientConfig(LOCAL_URL)).toEqual({
      connectionString: LOCAL_URL,
    });

    const productionShaped =
      'postgresql://postgres.example:s3cr3t-pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
    expect(createDatabaseClientConfig(productionShaped)).toEqual({
      connectionString: productionShaped,
    });
    const client = new Client({ connectionString: productionShaped });
    expect(sslOf(client).rejectUnauthorized).not.toBe(false);
  });

  it('verifies the hosted certificate and hostname with the trusted CA', async () => {
    process.env.DATABASE_CA_CERT_PATH = certs.caPath;
    process.env.DATABASE_CA_CERT_REQUIRED = 'true';
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const config = createDatabaseClientConfig(HOSTED_URL);
    const client = new Client(config);
    const ssl = sslOf(client);
    const caPem = fs.readFileSync(certs.caPath, 'utf8');

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(caPem);
    expect(ssl.checkServerIdentity).toBe(tls.checkServerIdentity);
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.connectionString).not.toContain('uselibpqcompat');
    expect(config.connectionString).not.toContain('BEGIN CERTIFICATE');
    expect(config.connectionString).toContain('s3cr3t-pw');

    const overridden = new Client({
      connectionString: HOSTED_URL,
      ssl: {
        ca: caPem,
        rejectUnauthorized: true,
        checkServerIdentity: tls.checkServerIdentity,
      },
    });
    expect(sslOf(overridden).ca).toBeUndefined();

    const server = tls.createServer(
      {
        cert: fs.readFileSync(certs.serverCert),
        key: fs.readFileSync(certs.serverKey),
      },
      socket => {
        socket.end();
      }
    );
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('TLS test server did not bind a TCP port.');
    }

    try {
      await expect(
        handshake(address.port, ssl, 'db.example.test')
      ).resolves.toBe(null);

      process.env.DATABASE_CA_CERT_PATH = certs.otherCaPath;
      const wrongCa = sslOf(new Client(createDatabaseClientConfig(HOSTED_URL)));
      const wrongCaError = await handshake(
        address.port,
        wrongCa,
        'db.example.test'
      );
      expect(wrongCaError?.message).toMatch(/certificate/i);

      const mismatchServer = tls.createServer(
        {
          cert: fs.readFileSync(certs.mismatchedCert),
          key: fs.readFileSync(certs.mismatchedKey),
        },
        socket => {
          socket.end();
        }
      );
      await new Promise<void>(resolve => {
        mismatchServer.listen(0, '127.0.0.1', () => resolve());
      });
      const mismatchAddress = mismatchServer.address();
      if (!mismatchAddress || typeof mismatchAddress === 'string') {
        throw new Error('Hostname mismatch server did not bind a TCP port.');
      }
      try {
        process.env.DATABASE_CA_CERT_PATH = certs.caPath;
        const hostnameChecked = sslOf(
          new Client(createDatabaseClientConfig(HOSTED_URL))
        );
        const hostnameError = await handshake(
          mismatchAddress.port,
          hostnameChecked,
          'db.example.test'
        );
        expect(hostnameError?.message).toMatch(/altname|hostname/i);
      } finally {
        mismatchServer.close();
      }
    } finally {
      server.close();
      const logged = [log, error, warn]
        .flatMap(spy => spy.mock.calls)
        .join(' ');
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
      expect(logged).not.toContain('BEGIN CERTIFICATE');
      expect(logged).not.toContain('s3cr3t-pw');
    }
  });

  it('does not log CA contents when the hosted CA is missing or not a certificate', () => {
    process.env.DATABASE_CA_CERT_REQUIRED = 'true';
    delete process.env.DATABASE_CA_CERT_PATH;
    expect(() => createDatabaseClientConfig(HOSTED_URL)).toThrow(
      /DATABASE_CA_CERT_PATH is required/
    );

    const missingPath = path.join(dir, 'missing.crt');
    process.env.DATABASE_CA_CERT_PATH = missingPath;
    expect(() => createDatabaseClientConfig(HOSTED_URL)).toThrow(
      /could not be read/
    );

    const invalidPath = path.join(dir, 'not-a-cert.txt');
    fs.writeFileSync(invalidPath, SECRET_MARKER);
    process.env.DATABASE_CA_CERT_PATH = invalidPath;
    expect(() => createDatabaseClientConfig(HOSTED_URL)).toThrow(/not a PEM/);
    try {
      createDatabaseClientConfig(HOSTED_URL);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(SECRET_MARKER);
      expect(message).not.toContain('BEGIN CERTIFICATE');
      expect(message).not.toContain('s3cr3t-pw');
    }
  });

  it('leaves a local plaintext URL alone when a CA file is present but not required', () => {
    process.env.DATABASE_CA_CERT_PATH = certs.caPath;
    delete process.env.DATABASE_CA_CERT_REQUIRED;
    expect(createDatabaseClientConfig(LOCAL_URL)).toEqual({
      connectionString: LOCAL_URL,
    });
  });

  it('prepares a verify-full libpq URL without embedding the certificate', () => {
    const formatted = formatLibpqVerifyFullConnectionString(
      HOSTED_URL,
      certs.caPath
    );
    expect(formatted).toContain('sslmode=verify-full');
    expect(formatted).toContain('sslrootcert=');
    expect(formatted).not.toContain('sslmode=require');
    expect(formatted).not.toContain('sslmode=no-verify');
    expect(formatted).not.toContain('uselibpqcompat');
    expect(formatted).not.toContain('BEGIN CERTIFICATE');
    expect(formatted).toContain('s3cr3t-pw');
  });
});
