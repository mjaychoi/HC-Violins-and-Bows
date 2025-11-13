import {
  Logger,
  LogLevel,
  logError,
  logWarn,
  logInfo,
  logDebug,
  logPerformance,
  logApiRequest,
} from '../logger';

describe('Logger', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    // Reset logger instance to pick up new NODE_ENV
    Logger.resetInstance();

    // Set to development mode for most tests
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true,
    });

    // Clear history before each test
    Logger.getInstance().clearHistory();
  });

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Logger.getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Logger.error', () => {
    it('should log error without context', () => {
      const error = new Error('Test error');
      Logger.error('Error message', error);

      expect(console.error).toHaveBeenCalled();
    });

    it('should log error with context', () => {
      const error = new Error('Test error');
      Logger.error('Error message', error, 'TestContext');

      expect(console.error).toHaveBeenCalled();
    });

    it('should log error with metadata', () => {
      const error = new Error('Test error');
      Logger.error('Error message', error, 'TestContext', { userId: '123' });

      expect(console.error).toHaveBeenCalled();
    });

    it('should handle unknown error type', () => {
      const error = 'String error';
      Logger.error('Error message', error);

      expect(console.error).toHaveBeenCalled();
    });

    it('should format Error objects correctly', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      Logger.error('Error message', error);

      const history = Logger.getInstance().getHistory(LogLevel.ERROR);
      expect(history).toHaveLength(1);
      expect(history[0].error?.message).toBe('Test error');
      expect(history[0].error?.stack).toBe('Error stack trace');
    });
  });

  describe('Logger.warn', () => {
    it('should log warning without context', () => {
      Logger.warn('Warning message');

      expect(console.warn).toHaveBeenCalled();
    });

    it('should log warning with context', () => {
      Logger.warn('Warning message', 'TestContext');

      expect(console.warn).toHaveBeenCalled();
    });

    it('should log warning with metadata', () => {
      Logger.warn('Warning message', 'TestContext', { action: 'retry' });

      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('Logger.info', () => {
    it('should log info without context', () => {
      Logger.info('Info message');

      expect(console.info).toHaveBeenCalled();
    });

    it('should log info with context', () => {
      Logger.info('Info message', 'TestContext');

      expect(console.info).toHaveBeenCalled();
    });

    it('should log info with metadata', () => {
      Logger.info('Info message', 'TestContext', { action: 'create' });

      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Logger.debug', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      jest.resetModules();
    });

    afterEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true,
      });
    });

    it('should log debug in development mode', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      Logger.debug('Debug message');

      expect(console.debug).toHaveBeenCalled();
    });

    it('should log debug with data in development mode', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      const data = { key: 'value' };
      Logger.debug('Debug message', data);

      expect(console.debug).toHaveBeenCalled();
    });

    it('should log debug with context in development mode', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      Logger.debug('Debug message', undefined, 'TestContext');

      expect(console.debug).toHaveBeenCalled();
    });

    it('should not log debug in production mode', () => {
      Logger.resetInstance();
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      Logger.debug('Debug message');

      expect(console.debug).not.toHaveBeenCalled();
    });
  });

  describe('Logger.performance', () => {
    it('should log performance metrics', () => {
      Logger.performance('Database query', 150, 'Database');

      expect(console.info).toHaveBeenCalled();

      const history = Logger.getInstance().getHistory(LogLevel.INFO);
      const perfLog = history.find(log => log.metadata?.performance);
      expect(perfLog).toBeDefined();
      expect(perfLog?.data).toMatchObject({
        duration: 150,
        operation: 'Database query',
      });
    });
  });

  describe('Logger.apiRequest', () => {
    it('should log API request', () => {
      Logger.apiRequest('GET', '/api/clients', 200, 50, 'API');

      expect(console.info).toHaveBeenCalled();

      const history = Logger.getInstance().getHistory(LogLevel.INFO);
      const apiLog = history.find(log => log.metadata?.apiRequest);
      expect(apiLog).toBeDefined();
      expect(apiLog?.data).toMatchObject({
        method: 'GET',
        url: '/api/clients',
        statusCode: 200,
        duration: 50,
      });
    });
  });

  describe('Log history', () => {
    it('should maintain log history', () => {
      Logger.info('Info 1');
      Logger.warn('Warn 1');
      Logger.error('Error 1', new Error('Test'));

      const history = Logger.getInstance().getHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter history by level', () => {
      Logger.info('Info 1');
      Logger.warn('Warn 1');
      Logger.error('Error 1', new Error('Test'));

      const errorHistory = Logger.getInstance().getHistory(LogLevel.ERROR);
      expect(errorHistory.every(log => log.level === LogLevel.ERROR)).toBe(
        true
      );
    });

    it('should limit history size', () => {
      const logger = Logger.getInstance();

      // Add more logs than maxHistorySize
      for (let i = 0; i < 150; i++) {
        Logger.info(`Info ${i}`);
      }

      const history = logger.getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should clear history', () => {
      Logger.info('Info 1');
      Logger.warn('Warn 1');

      const logger = Logger.getInstance();
      expect(logger.getHistory().length).toBeGreaterThan(0);

      logger.clearHistory();
      expect(logger.getHistory().length).toBe(0);
    });

    it('should export logs as JSON', () => {
      Logger.info('Info 1');
      Logger.error('Error 1', new Error('Test'));

      const logger = Logger.getInstance();
      const json = logger.exportLogs();

      expect(() => JSON.parse(json)).not.toThrow();
      const logs = JSON.parse(json);
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Structured log format', () => {
    it('should include timestamp in logs', () => {
      Logger.info('Test message');

      const history = Logger.getInstance().getHistory();
      expect(history[0].timestamp).toBeDefined();
      expect(typeof history[0].timestamp).toBe('string');
    });

    it('should include environment in logs', () => {
      Logger.info('Test message');

      const history = Logger.getInstance().getHistory();
      expect(history[0].environment).toBeDefined();
    });

    it('should include level in logs', () => {
      Logger.info('Test message');

      const history = Logger.getInstance().getHistory();
      expect(history[0].level).toBe(LogLevel.INFO);
    });
  });

  describe('convenience functions', () => {
    it('should log error via logError', () => {
      const error = new Error('Test error');
      logError('Error message', error, 'TestContext');

      expect(console.error).toHaveBeenCalled();
    });

    it('should log warning via logWarn', () => {
      logWarn('Warning message', 'TestContext');

      expect(console.warn).toHaveBeenCalled();
    });

    it('should log info via logInfo', () => {
      logInfo('Info message', 'TestContext');

      expect(console.info).toHaveBeenCalled();
    });

    it('should log debug via logDebug in development', () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      const data = { key: 'value' };
      logDebug('Debug message', data, 'TestContext');

      expect(console.debug).toHaveBeenCalled();

      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true,
      });
    });

    it('should log performance via logPerformance', () => {
      logPerformance('Operation', 100, 'Context');

      expect(console.info).toHaveBeenCalled();
    });

    it('should log API request via logApiRequest', () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      logApiRequest('POST', '/api/test', 201, 200, 'API');

      expect(console.info).toHaveBeenCalled();

      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true,
      });
    });
  });
});
