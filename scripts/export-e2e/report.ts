import { REQUIRED_EXPORT_CASE_IDS, type ExportCaseResult } from './constants';

export function classifyExportRun(cases: ExportCaseResult[]): {
  classification: 'EXPORT_STAGING_E2E_PASS' | 'EXPORT_STAGING_E2E_FAIL';
  missing: string[];
} {
  const byId = new Map(cases.map(item => [item.id, item]));
  const missing = REQUIRED_EXPORT_CASE_IDS.filter(id => !byId.get(id)?.ok);
  return {
    classification:
      missing.length === 0
        ? 'EXPORT_STAGING_E2E_PASS'
        : 'EXPORT_STAGING_E2E_FAIL',
    missing: [...missing],
  };
}

export function redactSecrets(text: string, secrets: string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    redacted = redacted.split(secret).join('[redacted]');
  }
  return redacted;
}
