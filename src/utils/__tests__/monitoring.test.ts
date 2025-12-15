import { captureEvent, captureException, captureWarn } from '../monitoring';
import { Logger } from '../logger';

jest.mock('../logger', () => {
  const original = jest.requireActual('../logger');
  return {
    ...original,
    Logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  };
});

describe('monitoring helpers', () => {
  it('routes exceptions to logger', () => {
    const error = new Error('boom');
    captureException(error, 'Test', { foo: 'bar' });
    expect(Logger.error).toHaveBeenCalledWith(
      'Captured exception',
      error,
      'Test',
      {
        foo: 'bar',
        errorType: 'Error',
        errorMessage: 'boom',
      }
    );
  });

  it('routes events and warnings to logger', () => {
    captureEvent('event', 'CTX', { a: 1 });
    expect(Logger.info).toHaveBeenCalledWith('event', 'CTX', { a: 1 });

    captureWarn('warn', 'CTX2', { b: 2 });
    expect(Logger.warn).toHaveBeenCalledWith('warn', 'CTX2', { b: 2 });
  });
});
