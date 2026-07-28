import { timingSafeEqual } from 'https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts';
import { Sha256 } from 'https://deno.land/std@0.168.0/hash/sha256.ts';

function digestSecret(value: string): Uint8Array {
  const sha = new Sha256();
  sha.update(new TextEncoder().encode(value));
  return sha.digest();
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
