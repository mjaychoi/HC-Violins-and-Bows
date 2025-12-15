/**
 * Render template with variable substitution
 * Missing variables are left as {var_name} so they're visible to the user
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string | undefined>
): { rendered: string; missing: string[] } {
  const missing = new Set<string>();

  const rendered = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const val = vars[key];
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
 */
export function buildMailto(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

/**
 * Build SMS deep link
 * Works on iOS/macOS and Android
 */
export function buildSmsLink(phone: string, body: string): string {
  return `sms:${encodeURIComponent(phone)}?&body=${encodeURIComponent(body)}`;
}
