/**
 * CI safety net for run-scoped hosted E2E: deletes exactly this run's
 * organization, data, and auth users (derived from E2E_RUN_SCOPE), then
 * verifies nothing remains. Idempotent — after Playwright's globalTeardown it
 * finds nothing and exits 0. Never logs keys, passwords, or sessions.
 *
 * Lives under tests/ (not scripts/) because .vercelignore drops tests/: a
 * scripts/ file importing tests/ breaks the Vercel `next build` type-check.
 */
import { cleanupCurrentRunScope } from './run-scoped-fixtures';

async function main(): Promise<void> {
  const summary = await cleanupCurrentRunScope();
  if (!summary) {
    console.log(
      JSON.stringify({ cleanup: 'skipped', reason: 'E2E_RUN_SCOPE not set' })
    );
    return;
  }
  console.log(JSON.stringify({ cleanup: 'ran', ...summary }));
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Run-scoped E2E cleanup failed.'
  );
  process.exit(1);
});
