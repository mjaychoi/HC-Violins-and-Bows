import {
  runPostDeploySynthetic,
  mintSyntheticCookieSession,
} from './synthetic';
import { redactSensitiveText } from '../auth-matrix/secret-redact';
import type { FetchLike } from './types';

function logger() {
  return {
    info: (message: string) => {
      console.log(redactSensitiveText(message));
    },
    error: (message: string) => {
      console.error(redactSensitiveText(message));
    },
  };
}

async function main() {
  const result = await runPostDeploySynthetic(process.env, {
    fetchImpl: fetch as unknown as FetchLike,
    authenticate: mintSyntheticCookieSession,
    logger: logger(),
  });
  console.log(result.summary);
  process.exit(result.exitCode);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSensitiveText(message));
  process.exit(1);
});
