#!/usr/bin/env tsx
/**
 * Hosted image optimizer acceptance check (read-only GETs against staging).
 *
 * Usage:
 *   STAGING_APP_BASE_URL=https://<staging-host> npx tsx scripts/staging/verify-image-optimizer.ts
 *   npx tsx scripts/staging/verify-image-optimizer.ts https://<staging-host>
 *
 * Exits nonzero on the first failed assertion.
 */

import {
  HASHED_STATIC_CACHE_DIRECTIVES,
  OPTIMIZER_SOURCE_URL,
  SMOKE_FIXTURE_PATH,
  type HttpSnapshot,
  findStaticAssetPath,
  resolveBaseUrl,
  validateOptimizedNegotiation,
  validateSourceFixture,
  validateStaticAssetCache,
  validateWebpResize,
} from './image-optimizer-acceptance';

async function fetchSnapshot(
  base: URL,
  path: string,
  headers: Record<string, string> = {}
): Promise<HttpSnapshot> {
  const response = await fetch(new URL(path, base), {
    headers,
    cache: 'no-store',
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'),
    vary: response.headers.get('vary'),
    body: Buffer.from(await response.arrayBuffer()),
  };
}

async function main(): Promise<void> {
  const base = resolveBaseUrl(process.env, process.argv.slice(2));

  // A. Unhashed source fixture.
  const source = await fetchSnapshot(base, SMOKE_FIXTURE_PATH);
  const sourceEvidence = validateSourceFixture(source);

  // B. Default modern-format negotiation.
  const negotiated = await fetchSnapshot(base, OPTIMIZER_SOURCE_URL, {
    Accept: 'image/avif,image/webp,*/*',
  });
  const negotiatedEvidence = validateOptimizedNegotiation(
    negotiated,
    source.body
  );

  // C. WebP-only request to verify the 640px resize deterministically.
  const webp = await fetchSnapshot(base, OPTIMIZER_SOURCE_URL, {
    Accept: 'image/webp',
  });
  const webpEvidence = validateWebpResize(webp);

  // D. Hashed Next static asset emitted by the home page.
  const home = await fetchSnapshot(base, '/');
  if (home.status !== 200) {
    throw new Error(`home page: expected HTTP 200, got ${home.status}`);
  }
  const staticPath = findStaticAssetPath(home.body.toString('utf8'));
  const staticAsset = await fetchSnapshot(base, staticPath);
  const staticEvidence = validateStaticAssetCache(staticAsset);

  console.log(
    JSON.stringify(
      {
        ok: true,
        classification: 'HOSTED_IMAGE_OPTIMIZER_ACCEPTANCE_PASS',
        baseHost: base.hostname,
        source: {
          path: SMOKE_FIXTURE_PATH,
          contentType: sourceEvidence.contentType,
          bytes: sourceEvidence.bytes,
          width: sourceEvidence.width,
          height: sourceEvidence.height,
          cacheControl: sourceEvidence.cacheControl,
        },
        negotiated: {
          contentType: negotiatedEvidence.contentType,
          bytes: negotiatedEvidence.bytes,
          vary: negotiatedEvidence.vary,
        },
        webpResize: {
          contentType: webpEvidence.contentType,
          bytes: webpEvidence.bytes,
          width: webpEvidence.width,
          height: webpEvidence.height,
        },
        staticAsset: {
          path: staticPath,
          cacheControl: staticEvidence.cacheControl,
          requiredDirectives: HASHED_STATIC_CACHE_DIRECTIVES,
        },
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      ok: false,
      classification: 'HOSTED_IMAGE_OPTIMIZER_ACCEPTANCE_FAIL',
      error: message,
    })
  );
  process.exit(1);
});
