type CookieEntry = {
  name: string;
  value: string;
};

type CookieStoreLike = {
  getAll(): CookieEntry[];
};

const COOKIE_CHUNK_SIZE = 3500;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const SUPABASE_AUTH_STORAGE_KEY = 'hcv-sb-auth';

export interface PersistedSupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
}

function splitIntoChunks(value: string, chunkSize: number): string[] {
  if (!value) return [''];

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  return chunks;
}

function parseDocumentCookie(cookieString: string): CookieEntry[] {
  if (!cookieString.trim()) return [];

  return cookieString
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return { name: part, value: '' };
      }

      return {
        name: part.slice(0, separatorIndex),
        value: part.slice(separatorIndex + 1),
      };
    });
}

function getCookieEntries(
  source?: CookieStoreLike | string | null
): CookieEntry[] {
  if (!source) return [];
  if (typeof source === 'string') return parseDocumentCookie(source);
  return source.getAll();
}

function getChunkCookieNames(storageKey: string, chunkCount: number): string[] {
  if (chunkCount <= 1) {
    return [storageKey];
  }

  return Array.from({ length: chunkCount }, (_unused, index) => {
    return `${storageKey}.${index}`;
  });
}

function readStoredValue(
  storageKey: string,
  cookieEntries: CookieEntry[]
): string | null {
  const exactMatch = cookieEntries.find(cookie => cookie.name === storageKey);
  if (exactMatch) {
    try {
      return decodeURIComponent(exactMatch.value);
    } catch {
      return exactMatch.value;
    }
  }

  const chunkPrefix = `${storageKey}.`;
  const chunkEntries = cookieEntries
    .filter(cookie => cookie.name.startsWith(chunkPrefix))
    .map(cookie => {
      const suffix = cookie.name.slice(chunkPrefix.length);
      const index = Number.parseInt(suffix, 10);
      return Number.isFinite(index)
        ? { index, value: cookie.value }
        : { index: Number.NaN, value: cookie.value };
    })
    .filter(chunk => Number.isFinite(chunk.index))
    .sort((a, b) => a.index - b.index);

  if (chunkEntries.length === 0) {
    return null;
  }

  try {
    return chunkEntries.map(chunk => decodeURIComponent(chunk.value)).join('');
  } catch {
    return chunkEntries.map(chunk => chunk.value).join('');
  }
}

export function serializeSupabaseAuthCookieChunks(
  rawValue: string,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): CookieEntry[] {
  const chunks = splitIntoChunks(rawValue, COOKIE_CHUNK_SIZE);
  const names = getChunkCookieNames(storageKey, chunks.length);

  return names.map((name, index) => ({
    name,
    value: encodeURIComponent(chunks[index] ?? ''),
  }));
}

export function readSupabaseAuthCookieValue(
  source?: CookieStoreLike | string | null,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): string | null {
  return readStoredValue(storageKey, getCookieEntries(source));
}

export function readSupabaseAuthSession(
  source?: CookieStoreLike | string | null,
  storageKey: string = SUPABASE_AUTH_STORAGE_KEY
): PersistedSupabaseSession | null {
  const rawValue = readSupabaseAuthCookieValue(source, storageKey);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as PersistedSupabaseSession;
    if (!parsed || typeof parsed.access_token !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function cookieSecurityAttributes(): string {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  return `; Path=/; SameSite=Lax${secure}`;
}

function expireCookie(name: string): void {
  document.cookie = `${name}=; Max-Age=0${cookieSecurityAttributes()}`;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; Max-Age=${COOKIE_MAX_AGE_SECONDS}${cookieSecurityAttributes()}`;
}

export function createBrowserCookieStorage(
  defaultStorageKey: string = SUPABASE_AUTH_STORAGE_KEY
) {
  const removeItem = (storageKey: string = defaultStorageKey) => {
    if (typeof document === 'undefined') return;

    const cookieEntries = parseDocumentCookie(document.cookie);
    const cookieNames = cookieEntries
      .map(cookie => cookie.name)
      .filter(name => name === storageKey || name.startsWith(`${storageKey}.`));

    for (const name of cookieNames) {
      expireCookie(name);
    }
  };

  return {
    getItem(storageKey: string = defaultStorageKey): string | null {
      if (typeof document === 'undefined') return null;
      return readSupabaseAuthCookieValue(document.cookie, storageKey);
    },
    setItem(storageKey: string = defaultStorageKey, value: string): void {
      if (typeof document === 'undefined') return;

      removeItem(storageKey);
      const cookieChunks = serializeSupabaseAuthCookieChunks(value, storageKey);
      for (const chunk of cookieChunks) {
        writeCookie(chunk.name, chunk.value);
      }
    },
    removeItem,
  };
}
