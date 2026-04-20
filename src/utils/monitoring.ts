import { Logger, LogContext } from './logger';
import { AppError, ErrorSeverity } from '@/types/errors';
import * as Sentry from '@sentry/nextjs';

export interface WebhookConfig {
  url?: string;
  enabled: boolean;
  severityThreshold: ErrorSeverity;
}

export interface AlertConfig {
  webhook?: WebhookConfig;
  email?: {
    enabled: boolean;
    recipients: string[];
    severityThreshold: ErrorSeverity;
  };
}

type WebhookDeliveryResult = {
  delivered: boolean;
  attempts: number;
  statusCode?: number;
  retryable: boolean;
  errorMessage?: string;
};

/**
 * Get alert configuration from environment variables
 * SECURITY: Webhook URL should NOT use NEXT_PUBLIC_ prefix to avoid client-side exposure
 * Use server-only environment variables (ERROR_WEBHOOK_URL)
 */
function getAlertConfig(): AlertConfig {
  // SECURITY FIX: Use server-only env vars (not NEXT_PUBLIC_)
  // This prevents webhook URL from being exposed in client bundle
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  const webhookEnabled = process.env.ERROR_WEBHOOK_ENABLED === 'true';
  const severityThreshold =
    (process.env.ERROR_SEVERITY_THRESHOLD as ErrorSeverity) ||
    ErrorSeverity.HIGH;

  // Only enable webhook on server-side (not in browser)
  const isBrowser = typeof window !== 'undefined';
  const shouldEnable = !isBrowser && webhookEnabled && !!webhookUrl;

  return {
    webhook: {
      url: webhookUrl,
      enabled: shouldEnable,
      severityThreshold,
    },
    email: {
      enabled: false, // Email alerts can be implemented later
      recipients: [],
      severityThreshold: ErrorSeverity.CRITICAL,
    },
  };
}

/**
 * Send error to webhook
 */
async function sendToWebhook(
  error: AppError | Error,
  context?: string,
  metadata?: LogContext
): Promise<WebhookDeliveryResult> {
  const config = getAlertConfig();
  if (!config.webhook?.enabled || !config.webhook.url) {
    return {
      delivered: false,
      attempts: 0,
      retryable: false,
      errorMessage: 'WEBHOOK_DISABLED',
    };
  }

  const errorData = {
    message:
      error instanceof Error ? error.message : (error as AppError).message,
    code: (error as AppError).code || 'UNKNOWN_ERROR',
    stack: error instanceof Error ? error.stack : (error as AppError).details,
    context,
    metadata,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent:
      typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
  };

  const maxAttempts = 3;
  let lastStatusCode: number | undefined;
  let lastErrorMessage: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(config.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData),
      });

      if (response.ok) {
        return {
          delivered: true,
          attempts: attempt,
          retryable: false,
        };
      }

      lastStatusCode = response.status;
      lastErrorMessage = `HTTP_${response.status}`;
    } catch (webhookError) {
      lastErrorMessage =
        webhookError instanceof Error
          ? webhookError.message
          : String(webhookError);
    }

    if (attempt < maxAttempts) {
      const backoffMs = attempt * 250;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  return {
    delivered: false,
    attempts: maxAttempts,
    statusCode: lastStatusCode,
    retryable: true,
    errorMessage: lastErrorMessage || 'WEBHOOK_DELIVERY_FAILED',
  };
}

/**
 * Check if error severity meets threshold for alerting
 */
function shouldAlert(severity: ErrorSeverity = ErrorSeverity.MEDIUM): boolean {
  const config = getAlertConfig();
  const severityLevels = [
    ErrorSeverity.LOW,
    ErrorSeverity.MEDIUM,
    ErrorSeverity.HIGH,
    ErrorSeverity.CRITICAL,
  ];

  const errorSeverityLevel = severityLevels.indexOf(severity);
  const thresholdLevel = severityLevels.indexOf(
    config.webhook?.severityThreshold || ErrorSeverity.HIGH
  );

  return errorSeverityLevel >= thresholdLevel;
}

/**
 * Capture exception with integrated error handling and alerting
 */
export function captureException(
  error: unknown,
  context?: string,
  metadata?: LogContext,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): void {
  // Log the exception with detailed information
  const errorMessage =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Unknown error';
  Logger.error(
    'Captured exception',
    error instanceof Error ? error : new Error(errorMessage),
    context,
    {
      ...metadata,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
    }
  );

  // Convert to AppError if needed
  let appError: AppError | Error;
  if (error instanceof Error) {
    appError = error;
  } else if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error
  ) {
    appError = error as AppError;
  } else {
    appError = new Error(
      error instanceof Error ? error.message : String(error)
    );
  }

  // Report to Sentry (HIGH 이상만 전송, best-effort)
  if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
    try {
      const sentryLevel: Sentry.SeverityLevel =
        severity === ErrorSeverity.CRITICAL ? 'fatal' : 'error';

      Sentry.captureException(appError, {
        level: sentryLevel,
        tags: context ? { context } : undefined,
        extra: metadata,
      });
    } catch {
      // Sentry 미설정/로딩 실패 시에도 조용히 무시
    }
  }

  // Send alert if severity threshold is met
  captureExceptionWithSeverityFilter(appError, context, metadata, severity);

  if (shouldAlert(severity)) {
    sendToWebhook(appError, context, metadata)
      .then(result => {
        if (!result.delivered && result.attempts > 0) {
          Logger.error(
            'Webhook delivery failed after retries',
            new Error(result.errorMessage || 'WEBHOOK_DELIVERY_FAILED'),
            'monitoring',
            {
              ...metadata,
              retryable: result.retryable,
              attempts: result.attempts,
              statusCode: result.statusCode,
              context,
              signal: 'WEBHOOK_RETRY_REQUIRED',
            }
          );
        }
      })
      .catch(unexpectedWebhookError => {
        Logger.error(
          'Unexpected webhook dispatch failure',
          unexpectedWebhookError,
          'monitoring',
          {
            ...metadata,
            context,
            signal: 'WEBHOOK_RETRY_REQUIRED',
          }
        );
      });
  }
}

function resolveSentryLevel(severity: ErrorSeverity): Sentry.SeverityLevel {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return 'fatal';
    case ErrorSeverity.HIGH:
      return 'error';
    case ErrorSeverity.MEDIUM:
      return 'warning';
    case ErrorSeverity.LOW:
    default:
      return 'info';
  }
}

function shouldSendToSentry(severity: ErrorSeverity): boolean {
  const minLevelRaw = (process.env.SENTRY_MIN_LEVEL || 'error').toLowerCase();
  const rank: Record<Sentry.SeverityLevel, number> = {
    debug: 0,
    info: 1,
    log: 1,
    warning: 2,
    error: 3,
    fatal: 4,
  };
  const minLevel =
    minLevelRaw === 'fatal' ||
    minLevelRaw === 'error' ||
    minLevelRaw === 'warning' ||
    minLevelRaw === 'info' ||
    minLevelRaw === 'debug'
      ? (minLevelRaw as Sentry.SeverityLevel)
      : ('error' as Sentry.SeverityLevel);
  const sentryLevel = resolveSentryLevel(severity);
  return rank[sentryLevel] >= rank[minLevel];
}

export function captureExceptionWithSeverityFilter(
  appError: AppError | Error,
  context?: string,
  metadata?: LogContext,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): void {
  if (!shouldSendToSentry(severity)) {
    return;
  }

  try {
    Sentry.captureException(appError, {
      level: resolveSentryLevel(severity),
      tags: context ? { context } : undefined,
      extra: metadata,
    });
  } catch {
    // Sentry 미설정/로딩 실패 시에도 조용히 무시
  }
}

export function captureEvent(
  message: string,
  context?: string,
  metadata?: LogContext
) {
  Logger.info(message, context, metadata);
}

export function captureWarn(
  message: string,
  context?: string,
  metadata?: LogContext
) {
  Logger.warn(message, context, metadata);
}
