import { constantTimeSecretEqual } from '../_shared/constantTimeSecret.ts';

export function extractCleanupInvoiceImageUploadsSecret(
  req: Pick<Request, 'headers'>
): string | undefined {
  return req.headers.get('x-cleanup-invoice-image-uploads-secret')?.trim();
}

export function isCleanupInvoiceImageUploadsAuthorized(
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
  return isCleanupInvoiceImageUploadsAuthorized(
    extractCleanupInvoiceImageUploadsSecret(req),
    configuredSecret
  );
}
