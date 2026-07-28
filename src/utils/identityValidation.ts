export const INSTRUMENT_IDENTITY_ERROR = 'Enter a maker or type.';
export const CLIENT_NAME_REQUIRED_ERROR = 'Client name is required';
export const MAX_CERTIFICATE_NAME_LENGTH = 200;

export function hasPresentText(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return String(value).trim() !== '';
}

export function hasInstrumentIdentity(input: {
  maker?: unknown;
  type?: unknown;
}): boolean {
  return hasPresentText(input.maker) || hasPresentText(input.type);
}

export function hasClientIdentity(input: {
  first_name?: unknown;
  last_name?: unknown;
}): boolean {
  return hasPresentText(input.first_name) || hasPresentText(input.last_name);
}

export function getInstrumentIdentityError(input: {
  maker?: unknown;
  type?: unknown;
}): string | null {
  return hasInstrumentIdentity(input) ? null : INSTRUMENT_IDENTITY_ERROR;
}

export function getClientIdentityError(input: {
  first_name?: unknown;
  last_name?: unknown;
}): string | null {
  return hasClientIdentity(input) ? null : CLIENT_NAME_REQUIRED_ERROR;
}
