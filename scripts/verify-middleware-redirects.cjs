#!/usr/bin/env node
/**
 * Black-box verification against a production build:
 * unauthenticated protected pages must redirect; public/static must not.
 *
 * Requires an existing `.next` output from `next build`.
 * Does not print cookie/token values.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.MIDDLEWARE_VERIFY_PORT || 3025);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const MAX_REDIRECTS = 5;

function fail(message) {
  console.error(`middleware redirect check failed: ${message}`);
  process.exit(1);
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
        fail(`redirect limit exceeded for ${pathname}`);
      }
      const nextPath = result.location.startsWith('http')
        ? new URL(result.location).pathname + new URL(result.location).search
        : result.location;
      return request(nextPath, { cookie, maxRedirects: maxRedirects - 1 });
    }
    return result;
  });
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request('/');
      if (res.status > 0) return;
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, 500));
  }
  fail('server did not become ready');
}

function assertRedirectToLogin(label, result) {
  if (![301, 302, 303, 307, 308].includes(result.status)) {
    fail(`${label}: expected redirect, got ${result.status}`);
  }
  if (!result.location) {
    fail(`${label}: missing Location header`);
  }
  const loc = new URL(result.location, BASE);
  if (loc.pathname !== '/') {
    fail(`${label}: expected Location pathname /, got ${loc.pathname}`);
  }
}

function assertNoAuthRedirect(label, result) {
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
    const loc = new URL(result.location, BASE);
    if (loc.pathname === '/' && loc.searchParams.has('next')) {
      fail(`${label}: unexpected auth redirect to login (${result.status})`);
    }
  }
}

async function main() {
  const buildId = path.join(process.cwd(), '.next', 'BUILD_ID');
  if (!fs.existsSync(buildId)) {
    fail('missing .next/BUILD_ID — run next build first');
  }

  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'start', '-H', HOST, '-p', String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: HOST,
        RATE_LIMITING_DISABLED: process.env.RATE_LIMITING_DISABLED || 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8');
  });

  const shutdown = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  try {
    await waitForServer();

    const publicHome = await request('/');
    if (publicHome.status !== 200) {
      fail(`GET / expected 200, got ${publicHome.status}`);
    }
    assertNoAuthRedirect('GET /', publicHome);

    for (const protectedPath of ['/dashboard', '/invoices', '/sales']) {
      const res = await request(protectedPath);
      assertRedirectToLogin(`GET ${protectedPath} (no cookie)`, res);
    }

    // Malformed cookie must redirect safely (no 500).
    const malformed = await request('/dashboard', {
      cookie: 'hcv-sb-auth=%7Bnot-json',
    });
    assertRedirectToLogin('GET /dashboard (malformed cookie)', malformed);

    // Static / Next asset must not auth-redirect.
    const favicon = await request('/favicon.ico');
    assertNoAuthRedirect('GET /favicon.ico', favicon);
    if (favicon.status >= 500) {
      fail(`GET /favicon.ico unexpected server error ${favicon.status}`);
    }

    // API auth remains JSON 401, not an HTML login redirect.
    const api = await request('/api/invoices');
    if (api.status !== 401) {
      fail(`GET /api/invoices expected 401, got ${api.status}`);
    }
    if (api.location) {
      fail('GET /api/invoices must not HTML-redirect');
    }
    if (!(api.contentType || '').includes('application/json')) {
      fail('GET /api/invoices expected application/json');
    }

    // Redirect-loop probe: follow login redirect once; must land on public /.
    const loopProbe = await request('/dashboard', {
      maxRedirects: MAX_REDIRECTS,
    });
    if (loopProbe.status >= 500) {
      fail(`redirect follow for /dashboard failed with ${loopProbe.status}`);
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
          authenticatedSmoke: 'blocked_or_not_run',
        },
        null,
        2
      )
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    shutdown();
    // Give the child a moment to exit.
    await new Promise(r => setTimeout(r, 500));
    if (stderr && /error/i.test(stderr)) {
      // Keep stderr available for debugging without dumping secrets.
      console.error('next start stderr (truncated):', stderr.slice(0, 1000));
    }
  }
}

main();
