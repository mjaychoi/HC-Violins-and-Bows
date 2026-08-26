import { assertPostDeployTargetAllowlisted } from './allowlist';
import { waitForReady } from './wait-for-ready';
import { redactSensitiveText } from '../auth-matrix/secret-redact';
import type { FetchLike } from './types';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const { baseUrl } = assertPostDeployTargetAllowlisted(process.env);
  const result = await waitForReady({
    baseUrl,
    fetchImpl: fetch as unknown as FetchLike,
    totalMs: parsePositiveInt(process.env.POSTDEPLOY_READY_TIMEOUT_MS, 120_000),
    requestTimeoutMs: parsePositiveInt(
      process.env.POSTDEPLOY_REQUEST_TIMEOUT_MS,
      5_000
    ),
    intervalMs: parsePositiveInt(
      process.env.POSTDEPLOY_READY_INTERVAL_MS,
      2_000
    ),
    logger: {
      info: message => console.log(redactSensitiveText(message)),
      error: message => console.error(redactSensitiveText(message)),
    },
  });

  if (!result.ready) {
    console.error(
      `readiness wait failed after ${result.attempts} attempt(s); last HTTP ${result.lastStatus ?? 'none'}`
    );
    process.exit(1);
  }

  console.log(`ready after ${result.attempts} attempt(s)`);
  process.exit(0);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSensitiveText(message));
  process.exit(1);
});
