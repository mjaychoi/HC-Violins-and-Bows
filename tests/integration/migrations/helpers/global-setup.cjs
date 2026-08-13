/**
 * Jest globalSetup for
 * tests/integration/migrations/*.integration.test.ts. Deliberately plain
 * CommonJS, loaded directly by Jest's CLI process (not through
 * jest-runtime's per-test Babel transform pipeline), so the dynamic
 * `import('embedded-postgres')` below goes through Node's real ESM loader
 * instead of hitting "Cannot use import statement outside a module"
 * (embedded-postgres ships ESM-only with no CJS build).
 *
 * Mirrors tests/integration/production/helpers/global-setup.cjs but starts
 * its own isolated instance/state file (distinct tmp filename) so this
 * suite can run standalone or alongside the production integration suite
 * without colliding.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const STATE_FILE = path.join(os.tmpdir(), 'hcvb-migration-test-pg-state.json');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error('Could not determine a free port for test Postgres.'));
      }
    });
  });
}

module.exports = async function globalSetup() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const port = await getFreePort();
  const databaseDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'hcvb-migration-test-pg-')
  );
  const user = 'postgres';
  const password = 'testpw-3a71fe08';

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ databaseDir, port, user, password })
  );

  const connectionString = `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`;
  process.env.TEST_MIGRATION_POSTGRES_URL = connectionString;
};

module.exports.STATE_FILE = STATE_FILE;
