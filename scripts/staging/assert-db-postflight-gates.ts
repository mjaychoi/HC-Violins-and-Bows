#!/usr/bin/env tsx
/**
 * CLI for the hosted staging database postflight classifier.
 *
 * Usage:
 *   tsx scripts/staging/assert-db-postflight-gates.ts classify
 *
 * Prints one classification token on stdout. Does not connect to Postgres.
 */
import { pathToFileURL } from 'url';
import {
  classifyDbPostflight,
  DB_POSTFLIGHT_ENV,
  isDbPostflightClassification,
  parsePostflightCount,
} from './db-postflight-gates';

function envOrEmpty(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function classify(): void {
  const classification = classifyDbPostflight({
    guardOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.guardOutcome),
    caOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.caOutcome),
    equalityOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.equalityOutcome),
    catalogOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.catalogOutcome),
    catalogPassed: envOrEmpty(DB_POSTFLIGHT_ENV.catalogPassed) === 'true',
    objectsOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.objectsOutcome),
    sqlAuditsOutcome: envOrEmpty(DB_POSTFLIGHT_ENV.sqlAuditsOutcome),
    remoteOnly: parsePostflightCount(envOrEmpty(DB_POSTFLIGHT_ENV.remoteOnly)),
    localOnly: parsePostflightCount(envOrEmpty(DB_POSTFLIGHT_ENV.localOnly)),
    remoteCount: parsePostflightCount(
      envOrEmpty(DB_POSTFLIGHT_ENV.remoteCount)
    ),
    localCount: parsePostflightCount(envOrEmpty(DB_POSTFLIGHT_ENV.localCount)),
  });
  if (!isDbPostflightClassification(classification)) {
    throw new Error(
      'Database postflight classification was not one of the allowed values.'
    );
  }
  process.stdout.write(`${classification}\n`);
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== 'classify') {
    throw new Error(`Unknown mode "${mode ?? ''}". Expected: classify.`);
  }
  classify();
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
