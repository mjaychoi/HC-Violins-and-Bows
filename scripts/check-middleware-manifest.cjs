#!/usr/bin/env node
/**
 * CI-safe guard: a production build must register application middleware.
 *
 * Usage (after `next build`):
 *   node scripts/check-middleware-manifest.mjs
 *
 * Fails when `.next/server/middleware-manifest.json` has an empty middleware map.
 * Avoids pinning volatile internal fields beyond matcher presence.
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  process.cwd(),
  '.next',
  'server',
  'middleware-manifest.json'
);

function fail(message) {
  console.error(`middleware-manifest check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) {
  fail(`missing ${manifestPath}. Run a production build first.`);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`unable to parse ${manifestPath}: ${error.message}`);
}

const middlewareMap = manifest?.middleware;
if (!middlewareMap || typeof middlewareMap !== 'object') {
  fail('manifest.middleware is missing or not an object');
}

const entries = Object.entries(middlewareMap);
if (entries.length === 0) {
  fail(
    'manifest.middleware is empty — application middleware was not registered. ' +
      'With src/app, place middleware at src/middleware.ts (same level as app/).'
  );
}

const [, firstEntry] = entries[0];
const matchers = firstEntry?.matchers;
if (!Array.isArray(matchers) || matchers.length === 0) {
  fail('registered middleware entry has no matchers');
}

const hasCatchAllMatcher = matchers.some(matcher => {
  const regexp = typeof matcher?.regexp === 'string' ? matcher.regexp : '';
  const original =
    typeof matcher?.originalSource === 'string' ? matcher.originalSource : '';
  return (
    regexp.includes('.*') ||
    original.includes('.*') ||
    original.includes('_next/static')
  );
});

if (!hasCatchAllMatcher) {
  fail(
    'registered middleware matchers do not look like the app catch-all matcher'
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      registeredEntries: entries.map(([key]) => key),
      matcherCount: matchers.length,
    },
    null,
    2
  )
);
