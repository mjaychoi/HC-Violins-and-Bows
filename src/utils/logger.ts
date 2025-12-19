// Structured logging utility
import { maskSensitiveInfo, isProduction } from './errorSanitization';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogContext {
  [key: string]: unknown;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  error?: {
    message: string;
    stack?: string;
    name?: string;
    code?: string | number;
  };
  metadata?: LogContext;
  environment: string;
  userAgent?: string;
  url?: string;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private isDevelopment: boolean;
  private isTest: boolean;
  private logHistory: StructuredLog[] = [];
  private maxHistorySize = 100;

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isTest = process.env.NODE_ENV === 'test';

    // Set log level based on environment
    const envLogLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase();
    this.logLevel =
      envLogLevel && Object.values(LogLevel).includes(envLogLevel as LogLevel)
        ? (envLogLevel as LogLevel)
        : this.isDevelopment
          ? LogLevel.DEBUG
          : LogLevel.INFO;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Reset instance (useful for testing)
  static resetInstance(): void {
    Logger.instance = undefined as unknown as Logger;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private formatError(error: unknown): StructuredLog['error'] {
    // 프로덕션 환경에서는 민감한 정보를 마스킹
    const shouldMask = isProduction();

    if (error instanceof Error) {
      const errorWithCode = error as Error & { code?: string | number };
      const result: StructuredLog['error'] = {
        message: shouldMask ? maskSensitiveInfo(error.message) : error.message,
        stack: shouldMask ? undefined : error.stack, // 프로덕션에서는 stack 제거
        name: error.name,
      };
      if (errorWithCode.code !== undefined) {
        result.code = errorWithCode.code;
      }
      return result;
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      const message = String(errorObj.message || 'Unknown error');
      const result: StructuredLog['error'] = {
        message: shouldMask ? maskSensitiveInfo(message) : message,
      };
      if (errorObj.stack && !shouldMask) {
        result.stack = String(errorObj.stack);
      }
      if (errorObj.name) {
        result.name = String(errorObj.name);
      }
      if (errorObj.code !== undefined) {
        result.code = errorObj.code as string | number;
      }
      return result;
    }

    const errorMessage = String(error);
    return {
      message: shouldMask ? maskSensitiveInfo(errorMessage) : errorMessage,
    };
  }

  private createStructuredLog(
    level: LogLevel,
    message: string,
    data?: unknown,
    context?: string,
    error?: unknown,
    metadata?: LogContext
  ): StructuredLog {
    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: process.env.NODE_ENV || 'unknown',
    };

    if (context) {
      log.context = context;
    }
    if (data !== undefined) {
      log.data = data;
    }
    if (error) {
      log.error = this.formatError(error);
    }
    if (metadata) {
      log.metadata = metadata;
    }

    // Add browser context in client-side
    if (typeof window !== 'undefined') {
      log.userAgent = window.navigator.userAgent;
      log.url = window.location.href;
    }

    return log;
  }

  private addToHistory(log: StructuredLog): void {
    this.logHistory.push(log);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  private outputLog(log: StructuredLog): void {
    if (!this.shouldLog(log.level)) {
      return;
    }

    this.addToHistory(log);

    // Keep history but suppress console noise during tests
    if (this.isTest) {
      return;
    }

    // In development, use pretty-printed format
    if (this.isDevelopment) {
      const prefix = `[${log.timestamp}] [${log.level}]${log.context ? ` [${log.context}]` : ''}`;

      switch (log.level) {
        case LogLevel.DEBUG:
          console.debug(prefix, log.message, log.data || log.error || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, log.message, log.data || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, log.message, log.data || '');
          break;
        case LogLevel.ERROR:
          if (log.error) {
            // Format error for better console display
            const errorMessage = log.error.message || 'Unknown error';
            const errorDetails = log.error.stack
              ? `\nStack: ${log.error.stack}`
              : log.error.code
                ? `\nCode: ${log.error.code}`
                : '';
            console.error(
              prefix,
              log.message,
              errorMessage + errorDetails,
              log.metadata || ''
            );
          } else {
            console.error(prefix, log.message, log.data || '');
          }
          break;
      }
    } else {
      // In production, print structured JSON directly to avoid recursive logging
      // Use console.log directly to avoid infinite recursion
      try {
        console.log(JSON.stringify(log));
      } catch {
        // If JSON.stringify fails (e.g., circular reference), use console.log with the log object directly
        console.log(
          '[LOG]',
          log.message,
          log.context || '',
          log.data || '',
          log.metadata || ''
        );
      }
    }
  }

  static error(
    message: string,
    error: unknown,
    context?: string,
    metadata?: LogContext
  ) {
    const logger = Logger.getInstance();
    const log = logger.createStructuredLog(
      LogLevel.ERROR,
      message,
      undefined,
      context,
      error,
      metadata
    );
    logger.outputLog(log);
  }

  static warn(message: string, context?: string, metadata?: LogContext) {
    const logger = Logger.getInstance();
    const log = logger.createStructuredLog(
      LogLevel.WARN,
      message,
      undefined,
      context,
      undefined,
      metadata
    );
    logger.outputLog(log);
  }

  static info(message: string, context?: string, metadata?: LogContext) {
    const logger = Logger.getInstance();
    const log = logger.createStructuredLog(
      LogLevel.INFO,
      message,
      undefined,
      context,
      undefined,
      metadata
    );
    logger.outputLog(log);
  }

  static debug(
    message: string,
    data?: unknown,
    context?: string,
    metadata?: LogContext
  ) {
    const logger = Logger.getInstance();
    const log = logger.createStructuredLog(
      LogLevel.DEBUG,
      message,
      data,
      context,
      undefined,
      metadata
    );
    logger.outputLog(log);
  }

  // Performance logging
  static performance(
    operation: string,
    duration: number,
    context?: string,
    metadata?: LogContext
  ) {
    const logger = Logger.getInstance();
    const combinedMetadata: LogContext = { performance: true };
    if (metadata) {
      Object.assign(combinedMetadata, metadata);
    }
    const log = logger.createStructuredLog(
      LogLevel.INFO,
      `Performance: ${operation}`,
      { duration, operation },
      context,
      undefined,
      combinedMetadata
    );
    logger.outputLog(log);
  }

  // API request logging
  static apiRequest(
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    context?: string,
    metadata?: LogContext
  ) {
    const logger = Logger.getInstance();
    const combinedMetadata: LogContext = { apiRequest: true };
    if (metadata) {
      Object.assign(combinedMetadata, metadata);
    }
    const log = logger.createStructuredLog(
      LogLevel.INFO,
      `API ${method} ${url}`,
      { method, url, statusCode, duration },
      context,
      undefined,
      combinedMetadata
    );
    logger.outputLog(log);
  }

  // Get log history (useful for debugging)
  getHistory(level?: LogLevel, limit?: number): StructuredLog[] {
    let logs = this.logHistory;

    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  // Clear log history
  clearHistory(): void {
    this.logHistory = [];
  }

  // Export logs as JSON (useful for error reporting)
  exportLogs(level?: LogLevel): string {
    const logs = this.getHistory(level);
    return JSON.stringify(logs, null, 2);
  }
}

// Convenience functions with enhanced signatures
export const logError = (
  message: string,
  error: unknown,
  context?: string,
  metadata?: LogContext
) => {
  Logger.error(message, error, context, metadata);
};

export const logWarn = (
  message: string,
  context?: string,
  metadata?: LogContext
) => {
  Logger.warn(message, context, metadata);
};

export const logInfo = (
  message: string,
  context?: string,
  metadata?: LogContext
) => {
  Logger.info(message, context, metadata);
};

export const logDebug = (
  message: string,
  data?: unknown,
  context?: string,
  metadata?: LogContext
) => {
  Logger.debug(message, data, context, metadata);
};

export const logPerformance = (
  operation: string,
  duration: number,
  context?: string,
  metadata?: LogContext
) => {
  Logger.performance(operation, duration, context, metadata);
};

export const logApiRequest = (
  method: string,
  url: string,
  statusCode?: number,
  duration?: number,
  context?: string,
  metadata?: LogContext
) => {
  Logger.apiRequest(method, url, statusCode, duration, context, metadata);
};

// Export Logger class for advanced usage
export { Logger };
