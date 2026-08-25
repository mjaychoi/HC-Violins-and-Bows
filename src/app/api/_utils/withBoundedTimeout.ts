export class BoundedTimeoutError extends Error {
  readonly code = 'BOUNDED_TIMEOUT';
  readonly check: string;

  constructor(check: string) {
    super(`${check}_timeout`);
    this.name = 'BoundedTimeoutError';
    this.check = check;
  }
}

export async function withBoundedTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  check: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new BoundedTimeoutError(check));
    }, timeoutMs);
  });

  // Keep a listener on the original work so a late rejection after timeout
  // cannot become an unhandledRejection.
  void promise.catch(() => undefined);

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
