// common logging utility
export class Logger {
  private static instance: Logger;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  constructor() {
    // Simple logger implementation
  }

  static error(message: string, error: unknown, context?: string) {
    console.error(`${context ? `[${context}] ` : ''}${message}:`, error);
  }

  static warn(message: string, context?: string) {
    console.warn(`${context ? `[${context}] ` : ''}${message}`);
  }

  static info(message: string, context?: string) {
    console.info(`${context ? `[${context}] ` : ''}${message}`);
  }

  static debug(message: string, data?: unknown, context?: string) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`${context ? `[${context}] ` : ''}${message}`, data);
    }
  }
}

// convenience functions
export const logError = (message: string, error: unknown, context?: string) => {
  Logger.error(message, error, context);
};

export const logWarn = (message: string, context?: string) => {
  Logger.warn(message, context);
};

export const logInfo = (message: string, context?: string) => {
  Logger.info(message, context);
};

export const logDebug = (message: string, data?: unknown, context?: string) => {
  Logger.debug(message, data, context);
};
