import * as dotenv from 'dotenv';

import { cleanupCurrentRunScope } from './run-scoped-fixtures';
import { logInfo } from '../../src/utils/logger';

dotenv.config({ path: '.env.local' });

/**
 * Removes this run's org, data, and users after the suite, pass or fail.
 * CI repeats the same cleanup in an `if: always()` step for the cases
 * Playwright skips teardown (e.g. globalSetup failed part-way).
 */
async function globalTeardown() {
  const summary = await cleanupCurrentRunScope();
  if (!summary) return;

  logInfo(
    'Run-scoped E2E fixtures cleaned up',
    'PlaywrightGlobalTeardown',
    summary
  );
}

export default globalTeardown;
