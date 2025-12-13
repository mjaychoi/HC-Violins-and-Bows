import { Logger, LogContext } from './logger';
import { AppError, ErrorSeverity } from '@/types/errors';

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
): Promise<void> {
  const config = getAlertConfig();
  if (!config.webhook?.enabled || !config.webhook.url) {
    return;
  }

  try {
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

    const response = await fetch(config.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorData),
    });

    if (!response.ok) {
      Logger.warn(
        `Webhook notification failed: ${response.status}`,
        'monitoring'
      );
    }
  } catch (webhookError) {
    // Don't throw - webhook failures shouldn't break the app
    Logger.warn(
      `Failed to send webhook notification: ${webhookError}`,
      'monitoring'
    );
  }
}

/**
 * Check if error severity meets threshold for alerting
 */
function shouldAlert(
  error: AppError | Error,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): boolean {
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
  // Log the exception
  Logger.error('Captured exception', error, context, metadata);

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

  // Send alert if severity threshold is met
  if (shouldAlert(appError, severity)) {
    sendToWebhook(appError, context, metadata).catch(() => {
      // Silently fail - webhook errors shouldn't break the app
    });
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
