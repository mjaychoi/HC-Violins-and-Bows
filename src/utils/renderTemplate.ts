/**
 * Render template with variable substitution
 * Missing variables are left as {var_name} so they're visible to the user
 * ✅ FIXED: Safe property access to prevent prototype pollution
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string | number | boolean | null | undefined>
): { rendered: string; missing: string[] } {
  const missing = new Set<string>();

  const rendered = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    // ✅ FIXED: Use hasOwnProperty to safely check for key existence
    const has = Object.prototype.hasOwnProperty.call(vars, key);
    const val = has ? vars[key] : undefined;

    // Treat null/undefined and empty-string as missing
    if (val == null || (typeof val === 'string' && val === '')) {
      missing.add(key);
      return `{${key}}`;
    }

    // ✅ FIXED: replace callback must return string
    return String(val);
  });

  return { rendered, missing: Array.from(missing) };
}

/**
 * Build mailto link with subject and body
 * Note: Email address (to) is typically safe and doesn't need encoding
 * URLSearchParams already handles encoding for subject/body
 */
export function buildMailto(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${to}?${params.toString()}`;
}

/**
 * ✅ FIXED: Build SMS deep link with platform-specific separator
 * iOS uses & separator, Android uses ? separator
 */
export function buildSmsLink(phone: string, body: string): string {
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const normalizedPhone = phone.replace(/[^\d+]/g, '');
  const sep = isIOS ? '&' : '?';
  return `sms:${normalizedPhone}${sep}body=${encodeURIComponent(body)}`;
}
