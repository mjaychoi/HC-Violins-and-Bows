import type { NextRequest } from 'next/server';

/**
 * Detailed migration/RLS diagnostics require HEALTH_CHECK_SECRET.
 * Without a secret, diagnostics stay available outside production so local/CI
 * keep working; production returns liveness-only payloads.
 *
 * Auth contract: `Authorization: Bearer <exact-secret>`
 * - Secret is trimmed once from env configuration only.
 * - Request tokens are compared with strict equality (no partial / whitespace match).
 */
export function canViewHealthDiagnostics(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const secret = env.HEALTH_CHECK_SECRET?.trim();
  if (!secret) {
    return env.NODE_ENV !== 'production';
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return false;
  }

  const token = header.slice('Bearer '.length);
  return token.length > 0 && token === secret;
}
