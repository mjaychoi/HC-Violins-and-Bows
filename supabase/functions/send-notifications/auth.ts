import { constantTimeSecretEqual } from '../_shared/constantTimeSecret.ts';

export function extractSendNotificationsSecret(
  req: Pick<Request, 'headers'>
): string | undefined {
  return req.headers.get('x-send-notifications-secret')?.trim();
}

export function isSendNotificationsAuthorized(
  providedSecret: string | null | undefined,
  configuredSecret: string | undefined
): boolean {
  if (!configuredSecret) {
    return false;
  }
  return constantTimeSecretEqual(providedSecret, configuredSecret);
}

export function hasValidInvocationSecret(
  req: Pick<Request, 'headers'>,
  configuredSecret: string | undefined
): boolean {
  return isSendNotificationsAuthorized(
    extractSendNotificationsSecret(req),
    configuredSecret
  );
}
