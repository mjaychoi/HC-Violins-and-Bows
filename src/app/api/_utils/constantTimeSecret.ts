import { createHash, timingSafeEqual } from 'node:crypto';

function digestSecret(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function constantTimeSecretEqual(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (
    provided == null ||
    provided === '' ||
    expected == null ||
    expected === ''
  ) {
    return false;
  }

  try {
    return timingSafeEqual(digestSecret(provided), digestSecret(expected));
  } catch {
    return false;
  }
}
