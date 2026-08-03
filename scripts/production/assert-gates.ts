#!/usr/bin/env tsx
/**
 * CLI wrapper around the pure operator-gate assertions in
 * db-deploy-guards.ts. Invoked only from
 * .github/workflows/production-db-deploy.yml.
 *
 * Usage:
 *   tsx scripts/production/assert-gates.ts sha
 *   tsx scripts/production/assert-gates.ts ack <label> <envVarName>
 *   tsx scripts/production/assert-gates.ts pending-count
 */
import {
  assertOperatorAcknowledgement,
  assertPendingCountMatches,
  assertShaMatches,
  parseNonNegativeInteger,
} from './db-deploy-guards';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function main(): void {
  const mode = process.argv[2];

  if (mode === 'sha') {
    assertShaMatches(requireEnv('CONFIRMED_SHA'), requireEnv('ACTUAL_SHA'));
    console.log('SHA acknowledgement OK.');
    return;
  }

  if (mode === 'ack') {
    const label = process.argv[3];
    const envVarName = process.argv[4];
    if (!label || !envVarName) {
      throw new Error('Usage: assert-gates.ts ack <label> <envVarName>');
    }
    assertOperatorAcknowledgement(requireEnv(envVarName), label);
    console.log(`Operator acknowledgement OK: ${label}.`);
    return;
  }

  if (mode === 'pending-count') {
    const reviewed = parseNonNegativeInteger(
      requireEnv('CONFIRMED_PENDING_COUNT'),
      'Reviewed pending migration count'
    );
    const actual = parseNonNegativeInteger(
      requireEnv('ACTUAL_PENDING_COUNT'),
      'Actual pending migration count'
    );
    assertPendingCountMatches(reviewed, actual);
    console.log(
      `Pending migration count acknowledgement OK: ${actual} pending.`
    );
    return;
  }

  throw new Error(
    `Unknown mode "${mode}". Expected one of: sha, ack, pending-count.`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
