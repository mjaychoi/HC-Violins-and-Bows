export function generateInvocationId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `inv-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getOrCreateInvocationId(request: {
  headers?: Pick<Headers, 'get'> | null;
}): string {
  try {
    const existing = request.headers?.get('x-request-id')?.trim();
    return existing || generateInvocationId();
  } catch {
    return generateInvocationId();
  }
}
