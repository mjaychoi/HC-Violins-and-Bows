/**
 * Render template with variable substitution
 * Missing variables are left as {var_name} so they're visible to the user
 * ✅ FIXED: Safe property access to prevent prototype pollution
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string | undefined>
): { rendered: string; missing: string[] } {
  const missing = new Set<string>();

  const rendered = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    // ✅ FIXED: Use hasOwnProperty to safely check for key existence
    // Prevents prototype pollution (e.g., __proto__, constructor, etc.)
    const has = Object.prototype.hasOwnProperty.call(vars, key);
    const val = has ? vars[key] : undefined;
    if (val == null || val === '') {
      missing.add(key);
      return `{${key}}`; // Keep visible so user can spot missing vars
    }
    return val;
  });

  return { rendered, missing: Array.from(missing) };
}

/**
 * Build mailto link with subject and body
 * Note: Email address (to) is typically safe and doesn't need encoding
 * URLSearchParams already handles encoding for subject/body
 */
export function buildMailto(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    subject,
    body,
  });
  // Email address is typically safe and doesn't need encoding
  return `mailto:${to}?${params.toString()}`;
}

/**
 * ✅ FIXED: Build SMS deep link with platform-specific separator
 * iOS uses & separator, Android uses ? separator
 * Cross-platform compatible implementation
 *
 * Note: Phone number is normalized (digits/plus only) and not encoded
 * to ensure consistent interpretation across devices
 * Body is encoded to handle special characters safely
 */
export function buildSmsLink(phone: string, body: string): string {
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ✅ FIXED: Normalize phone number (digits/plus only) instead of encoding
  // Encoding phone numbers can cause inconsistent interpretation across devices
  // Example: "+1 (404) 555-1234" -> "+14045551234"
  const normalizedPhone = phone.replace(/[^\d+]/g, '');

  const sep = isIOS ? '&' : '?';
  return `sms:${normalizedPhone}${sep}body=${encodeURIComponent(body)}`;
}
