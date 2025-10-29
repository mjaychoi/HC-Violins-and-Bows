// tests/utils/flushPromises.ts
export const flushPromises = () =>
  new Promise<void>(resolve => queueMicrotask(resolve));
