#!/usr/bin/env node
/**
 * Start the production Next.js standalone artifact for critical-path E2E.
 *
 * `output: 'standalone'` does not work with `next start`. This prepares
 * `public/` and `.next/static` inside the standalone tree, then execs
 * `node .next/standalone/server.js`.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BUILD_ID = path.join(ROOT, '.next', 'BUILD_ID');
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone');
const STANDALONE_SERVER = path.join(STANDALONE_DIR, 'server.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyDir(source, destination) {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function ensureProductionBuild() {
  if (process.env.PLAYWRIGHT_SKIP_BUILD === 'true') {
    if (!fs.existsSync(BUILD_ID)) {
      fail('missing .next/BUILD_ID — run next build first');
    }
    return;
  }

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (build.status !== 0) {
    fail('next build failed');
  }
}

function prepareStandaloneTree() {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    fail(
      'missing .next/standalone/server.js — next build must emit the standalone output'
    );
  }

  copyDir(path.join(ROOT, 'public'), path.join(STANDALONE_DIR, 'public'));
  copyDir(
    path.join(ROOT, '.next', 'static'),
    path.join(STANDALONE_DIR, '.next', 'static')
  );
}

function applyListenAddress() {
  if (!process.env.PORT || !process.env.HOSTNAME) {
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
    const url = new URL(base);
    process.env.HOSTNAME = process.env.HOSTNAME || url.hostname || '127.0.0.1';
    process.env.PORT = process.env.PORT || url.port || '3000';
  }
}

ensureProductionBuild();
prepareStandaloneTree();
applyListenAddress();

const child = spawn(process.execPath, [STANDALONE_SERVER], {
  cwd: STANDALONE_DIR,
  env: process.env,
  stdio: 'inherit',
});

const shutdown = signal => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
