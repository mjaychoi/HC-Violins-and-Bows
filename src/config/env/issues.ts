import { SECRET_ENV_KEYS } from './keys';

export type EnvMap = Record<string, string | undefined>;

export type EnvIssue = {
  key: string;
  message: string;
};

export type EnvValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; issues: EnvIssue[]; warnings: string[] };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip any secret values that accidentally appear in a diagnostic string.
 * Never include env values in messages in the first place; this is a backstop.
 */
export function redactSecretValues(text: string, env: EnvMap): string {
  let redacted = text;
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key]?.trim();
    if (!value || value.length < 4) continue;
    redacted = redacted.replace(
      new RegExp(escapeRegExp(value), 'g'),
      '[redacted]'
    );
  }
  return redacted;
}

export function formatEnvIssues(issues: readonly EnvIssue[]): string {
  const lines = issues.map(issue => `- ${issue.key}: ${issue.message}`);
  return ['Production environment validation failed:', ...lines].join('\n');
}

export function formatEnvWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) return '';
  return [
    'Production environment validation warnings:',
    ...warnings.map(w => `- ${w}`),
  ].join('\n');
}

export function formatProductionEnvResult(
  result: EnvValidationResult,
  env: EnvMap
): { stdout: string; stderr: string } {
  if (result.ok) {
    const warningText = formatEnvWarnings(result.warnings);
    const stdout = warningText
      ? `Production environment validation passed with warnings.\n${warningText}`
      : 'Production environment validation passed.';
    return { stdout: redactSecretValues(stdout, env), stderr: '' };
  }

  const stderr = redactSecretValues(
    [formatEnvIssues(result.issues), formatEnvWarnings(result.warnings)]
      .filter(Boolean)
      .join('\n'),
    env
  );
  return { stdout: '', stderr };
}
