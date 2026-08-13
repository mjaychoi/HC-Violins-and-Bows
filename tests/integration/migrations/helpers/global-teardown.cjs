/**
 * Counterpart to global-setup.cjs: stops the isolated local Postgres
 * instance and removes its scratch data directory. Reconstructs an
 * EmbeddedPostgres instance from the databaseDir/port written to disk by
 * global-setup.cjs rather than relying on in-process object identity
 * surviving between the globalSetup and globalTeardown phases.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.tmpdir(), 'hcvb-migration-test-pg-state.json');

module.exports = async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }

  const { databaseDir, port, user, password } = JSON.parse(
    fs.readFileSync(STATE_FILE, 'utf8')
  );

  try {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const pg = new EmbeddedPostgres({
      databaseDir,
      port,
      user,
      password,
      persistent: false,
    });
    await pg.stop();
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true });
    fs.rmSync(STATE_FILE, { force: true });
  }
};
