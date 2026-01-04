import { renderTemplate, buildMailto, buildSmsLink } from '../renderTemplate';

describe('renderTemplate', () => {
  it('should replace variables in template', () => {
    const text = 'Hello {name}, welcome to {place}!';
    const vars = { name: 'John', place: 'Home' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello John, welcome to Home!');
    expect(result.missing).toEqual([]);
  });

  it('should keep missing variables in template', () => {
    const text = 'Hello {name}, welcome to {place}!';
    const vars = { name: 'John' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello John, welcome to {place}!');
    expect(result.missing).toEqual(['place']);
  });

  it('should handle empty string values as missing', () => {
    const text = 'Hello {name}!';
    const vars = { name: '' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello {name}!');
    expect(result.missing).toEqual(['name']);
  });

  it('should handle undefined values as missing', () => {
    const text = 'Hello {name}!';
    const vars: Record<string, string | undefined> = { name: undefined };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello {name}!');
    expect(result.missing).toEqual(['name']);
  });

  it('should handle null values as missing', () => {
    const text = 'Hello {name}!';
    const vars: Record<string, string | undefined> = {
      name: null as unknown as string,
    };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello {name}!');
    expect(result.missing).toEqual(['name']);
  });

  it('should handle multiple variables', () => {
    const text = '{greeting} {name}, you have {count} messages.';
    const vars = { greeting: 'Hi', name: 'Alice', count: '5' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hi Alice, you have 5 messages.');
    expect(result.missing).toEqual([]);
  });

  it('should handle template with no variables', () => {
    const text = 'This is a simple text.';
    const vars = {};
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('This is a simple text.');
    expect(result.missing).toEqual([]);
  });

  it('should handle empty template', () => {
    const text = '';
    const vars = { name: 'John' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('');
    expect(result.missing).toEqual([]);
  });

  it('should prevent prototype pollution', () => {
    const text = 'Hello {__proto__}, {constructor}!';
    const vars: Record<string, string | undefined> = {};
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello {__proto__}, {constructor}!');
    expect(result.missing).toEqual(['__proto__', 'constructor']);
  });

  it('should handle variable names with numbers', () => {
    const text = 'Version {version1} and {version2}';
    const vars = { version1: '1.0', version2: '2.0' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Version 1.0 and 2.0');
    expect(result.missing).toEqual([]);
  });

  it('should handle variable names with underscores', () => {
    const text = 'Hello {user_name}!';
    const vars = { user_name: 'test_user' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('Hello test_user!');
    expect(result.missing).toEqual([]);
  });

  it('should handle duplicate variable names', () => {
    const text = '{name} and {name} are the same.';
    const vars = { name: 'John' };
    const result = renderTemplate(text, vars);

    expect(result.rendered).toBe('John and John are the same.');
    expect(result.missing).toEqual([]);
  });
});

describe('buildMailto', () => {
  it('should build mailto link with subject and body', () => {
    const result = buildMailto('test@example.com', 'Test Subject', 'Test Body');

    expect(result).toBe(
      'mailto:test@example.com?subject=Test+Subject&body=Test+Body'
    );
  });

  it('should encode special characters in subject and body', () => {
    const result = buildMailto(
      'test@example.com',
      'Hello & World',
      'Line 1\nLine 2'
    );

    expect(result).toContain('mailto:test@example.com');
    expect(result).toContain('subject=');
    expect(result).toContain('body=');
  });

  it('should handle empty subject and body', () => {
    const result = buildMailto('test@example.com', '', '');

    expect(result).toBe('mailto:test@example.com?subject=&body=');
  });

  it('should handle email with plus sign', () => {
    const result = buildMailto('test+tag@example.com', 'Subject', 'Body');

    expect(result).toContain('test+tag@example.com');
  });
});

describe('buildSmsLink', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Mock navigator for iOS detection
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.navigator = originalNavigator;
  });

  it('should build SMS link for iOS with & separator', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('+1-404-555-1234', 'Hello World');

    expect(result).toBe('sms:+14045551234&body=Hello%20World');
  });

  it('should build SMS link for Android with ? separator', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('+1-404-555-1234', 'Hello World');

    expect(result).toBe('sms:+14045551234?body=Hello%20World');
  });

  it('should normalize phone number by removing non-digit characters', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('(404) 555-1234', 'Test');

    expect(result).toBe('sms:4045551234&body=Test');
  });

  it('should preserve plus sign in phone number', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('+1 (404) 555-1234', 'Test');

    expect(result).toBe('sms:+14045551234&body=Test');
  });

  it('should encode body text', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('1234567890', 'Hello & World');

    expect(result).toBe('sms:1234567890&body=Hello%20%26%20World');
  });

  it('should handle empty body', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      },
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('1234567890', '');

    expect(result).toBe('sms:1234567890&body=');
  });

  it('should default to Android format when navigator is undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const result = buildSmsLink('1234567890', 'Test');

    expect(result).toBe('sms:1234567890?body=Test');
  });
});
