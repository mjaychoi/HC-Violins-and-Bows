/** @jest-environment node */

import { BoundedTimeoutError, withBoundedTimeout } from '../withBoundedTimeout';

describe('withBoundedTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    await expect(
      withBoundedTimeout(Promise.resolve('ok'), 50, 'example')
    ).resolves.toBe('ok');
  });

  it('rejects with BoundedTimeoutError and does not hang', async () => {
    const pending = new Promise<string>(() => undefined);

    await expect(withBoundedTimeout(pending, 20, 'example')).rejects.toEqual(
      expect.objectContaining({
        name: 'BoundedTimeoutError',
        code: 'BOUNDED_TIMEOUT',
        check: 'example',
      })
    );
  });

  it('does not leave an unhandled rejection when the original promise later fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    let rejectLater: ((error: Error) => void) | undefined;
    const delayed = new Promise<string>((_, reject) => {
      rejectLater = reject;
    });

    await expect(
      withBoundedTimeout(delayed, 10, 'example')
    ).rejects.toBeInstanceOf(BoundedTimeoutError);

    rejectLater?.(new Error('late failure'));
    await new Promise(resolve => setTimeout(resolve, 20));

    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toHaveLength(0);
  });
});
