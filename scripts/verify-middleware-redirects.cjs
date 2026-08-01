#!/usr/bin/env node
/**
 * Black-box verification against a production build:
 * unauthenticated protected pages must redirect; public/static must not.
 *
 * Requires an existing `.next` output from `next build`.
 * Does not print cookie/token values.
 *
 * Hermetic child env: supplies non-secret placeholder S3 config so production
 * instrumentation (`validateStorageRuntimeConfig`) can start. The routing
 * test never uploads/downloads/lists object storage.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.MIDDLEWARE_VERIFY_PORT || 3025);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const MAX_REDIRECTS = 5;
const LOG_LIMIT = 4000;

/** Test-only placeholders for production startup validation — not real buckets. */
const HARNESS_STORAGE_DEFAULTS = {
  STORAGE_TYPE: 's3',
  S3_BUCKET_NAME: 'middleware-routing-test',
  S3_REGION: 'us-east-1',
};

function assertionError(message) {
  return new Error(`middleware redirect check failed: ${message}`);
}

function sanitizeLogText(text) {
  if (!text) return '';
  return String(text)
    .replace(
      /(authorization|cookie|set-cookie|api[_-]?key|token|secret|password|jwt)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]'
    )
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      '[redacted-jwt]'
    )
    .slice(0, LOG_LIMIT);
}

function request(pathname, { cookie, maxRedirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: cookie ? { Cookie: cookie } : undefined,
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            location: res.headers.location || null,
            contentType: res.headers['content-type'] || null,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.setTimeout(20000, () => {
      req.destroy(new Error(`timeout for ${pathname}`));
    });
    req.on('error', reject);
    req.end();
  }).then(async result => {
    if (
      maxRedirects > 0 &&
      result.status >= 300 &&
      result.status < 400 &&
      result.location
    ) {
      if (maxRedirects > MAX_REDIRECTS) {
        throw assertionError(`redirect limit exceeded for ${pathname}`);
      }
      const nextPath = result.location.startsWith('http')
        ? new URL(result.location).pathname + new URL(result.location).search
        : result.location;
      return request(nextPath, { cookie, maxRedirects: maxRedirects - 1 });
    }
    return result;
  });
}

/**
 * Wait until the HTTP server answers (any status). A persistent 500 is still
 * "listening" — the public `/` assertion below remains strict about 200.
 */
async function waitForServer(timeoutMs = 60000, childState) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (childState.exited) {
      throw assertionError(
        `next start exited early with code ${childState.exitCode}`
      );
    }
    try {
      const res = await request('/');
      if (res.status > 0) {
        return res;
      }
    } catch {
      // retry until listening
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw assertionError('server did not become ready');
}

function assertRedirectToLogin(label, result) {
  if (![301, 302, 303, 307, 308].includes(result.status)) {
    throw assertionError(`${label}: expected redirect, got ${result.status}`);
  }
  if (!result.location) {
    throw assertionError(`${label}: missing Location header`);
  }
  const loc = new URL(result.location, BASE);
  if (loc.pathname !== '/') {
    throw assertionError(
      `${label}: expected Location pathname /, got ${loc.pathname}`
    );
  }
}

function assertNoAuthRedirect(label, result) {
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
    const loc = new URL(result.location, BASE);
    if (loc.pathname === '/' && loc.searchParams.has('next')) {
      throw assertionError(
        `${label}: unexpected auth redirect to login (${result.status})`
      );
    }
  }
}

function buildChildEnv() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: HOST,
    RATE_LIMITING_DISABLED: process.env.RATE_LIMITING_DISABLED || 'true',
  };

  for (const [key, value] of Object.entries(HARNESS_STORAGE_DEFAULTS)) {
    if (!env[key] || !String(env[key]).trim()) {
      env[key] = value;
    }
  }

  return env;
}

async function main() {
  const buildId = path.join(process.cwd(), '.next', 'BUILD_ID');
  if (!fs.existsSync(buildId)) {
    throw assertionError('missing .next/BUILD_ID — run next build first');
  }

  const childState = { exited: false, exitCode: null };
  let stdout = '';
  let stderr = '';

  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'start', '-H', HOST, '-p', String(PORT)],
    {
      cwd: process.cwd(),
      env: buildChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout.on('data', chunk => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8');
  });
  child.on('exit', (code, signal) => {
    childState.exited = true;
    childState.exitCode = code ?? signal ?? 'unknown';
  });

  const shutdown = () => {
    if (!child.killed && !childState.exited) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  };

  const onSignal = () => {
    shutdown();
    process.exitCode = 130;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let failed = false;
  try {
    await waitForServer(60_000, childState);

    const publicHome = await request('/');
    if (publicHome.status !== 200) {
      throw assertionError(`GET / expected 200, got ${publicHome.status}`);
    }
    assertNoAuthRedirect('GET /', publicHome);

    for (const protectedPath of ['/dashboard', '/invoices', '/sales']) {
      const res = await request(protectedPath);
      assertRedirectToLogin(`GET ${protectedPath} (no cookie)`, res);
    }

    const malformed = await request('/dashboard', {
      cookie: 'hcv-sb-auth=%7Bnot-json',
    });
    assertRedirectToLogin('GET /dashboard (malformed cookie)', malformed);

    const favicon = await request('/favicon.ico');
    assertNoAuthRedirect('GET /favicon.ico', favicon);
    if (favicon.status >= 500) {
      throw assertionError(
        `GET /favicon.ico unexpected server error ${favicon.status}`
      );
    }

    const api = await request('/api/invoices');
    if (api.status !== 401) {
      throw assertionError(`GET /api/invoices expected 401, got ${api.status}`);
    }
    if (api.location) {
      throw assertionError('GET /api/invoices must not HTML-redirect');
    }
    if (!(api.contentType || '').includes('application/json')) {
      throw assertionError('GET /api/invoices expected application/json');
    }

    const loopProbe = await request('/dashboard', {
      maxRedirects: MAX_REDIRECTS,
    });
    if (loopProbe.status >= 500) {
      throw assertionError(
        `redirect follow for /dashboard failed with ${loopProbe.status}`
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          port: PORT,
          checks: [
            'public /',
            'unauthenticated /dashboard|/invoices|/sales redirect',
            'malformed cookie redirect',
            'favicon no auth redirect',
            'api 401 json',
            'no redirect loop within limit',
          ],
          harnessStorageDefaults: Object.keys(HARNESS_STORAGE_DEFAULTS),
          authenticatedSmoke: 'blocked_or_not_run',
        },
        null,
        2
      )
    );
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (childState.exited) {
      console.error(
        `next start child exit: ${JSON.stringify(childState.exitCode)}`
      );
    }
    const out = sanitizeLogText(stdout);
    const err = sanitizeLogText(stderr);
    if (out) {
      console.error('next start stdout (truncated):\n' + out);
    }
    if (err) {
      console.error('next start stderr (truncated):\n' + err);
    }
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    shutdown();
    await new Promise(r => setTimeout(r, 500));
    if (!failed) {
      process.exitCode = process.exitCode || 0;
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
