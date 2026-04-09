export function getSafeNextDestination(
  rawNext: string | null | undefined,
  fallback: string
): string {
  if (!rawNext) return fallback;

  const decoded = decodeURIComponent(rawNext);
  if (!decoded.startsWith('/') || decoded.startsWith('//')) {
    return fallback;
  }

  return decoded;
}

export function buildLoginRedirect(nextDestination: string): string {
  const safeNext = nextDestination.startsWith('/') ? nextDestination : '/';
  return `/?next=${encodeURIComponent(safeNext)}`;
}

export function buildOnboardingRedirect(nextDestination: string): string {
  const safeNext = nextDestination.startsWith('/')
    ? nextDestination
    : '/dashboard';
  return `/onboarding/organization?next=${encodeURIComponent(safeNext)}`;
}
