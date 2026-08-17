const MAX_SAFE_MESSAGE = 180;

const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/hcv-sb-auth(?:\.\d+)?=[^;\s]*/gi, 'hcv-sb-auth=[redacted]'],
  [/Cookie:\s*[^\r\n]+/gi, 'Cookie: [redacted]'],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[redacted]"'],
  [/"refresh_token"\s*:\s*"[^"]*"/gi, '"refresh_token":"[redacted]"'],
  [/"password"\s*:\s*"[^"]*"/gi, '"password":"[redacted]"'],
];

export function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = redactSensitiveText(raw).replace(/\s+/g, ' ').trim();
  if (redacted.length <= MAX_SAFE_MESSAGE) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_SAFE_MESSAGE)}…`;
}

export function boundSafeText(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const redacted = redactSensitiveText(value).replace(/\s+/g, ' ').trim();
  if (!redacted) return undefined;
  return redacted.length <= MAX_SAFE_MESSAGE
    ? redacted
    : `${redacted.slice(0, MAX_SAFE_MESSAGE)}…`;
}
