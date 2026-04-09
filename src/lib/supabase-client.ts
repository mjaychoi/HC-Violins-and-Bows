import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  createBrowserCookieStorage,
  SUPABASE_AUTH_STORAGE_KEY,
} from '@/lib/supabase-auth-cookie';

type AppSupabaseClient = SupabaseClient<Database>;

const GLOBAL_KEY = '__hcv_supabase_client__';

type GlobalWithClient = typeof globalThis & {
  [GLOBAL_KEY]?: AppSupabaseClient | null;
};

let cachedClient: AppSupabaseClient | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '',
  };
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function setGlobalClient(client: AppSupabaseClient | null): void {
  (globalThis as GlobalWithClient)[GLOBAL_KEY] = client;
}

function getGlobalClient(): AppSupabaseClient | null {
  return (globalThis as GlobalWithClient)[GLOBAL_KEY] ?? null;
}

function buildClient(url: string, key: string): AppSupabaseClient {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      storage: createBrowserCookieStorage(SUPABASE_AUTH_STORAGE_KEY),
    },
    global: {
      fetch: (...args) => fetch(...args),
    },
  });
}

function initialize(): AppSupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const globalClient = getGlobalClient();
  if (globalClient) {
    cachedClient = globalClient;
    return globalClient;
  }

  if (!isBrowser()) {
    return null;
  }

  const { url, key } = getEnv();

  if (!url || !key) {
    console.error('Supabase environment variables not set');
    return null;
  }

  if (!isValidUrl(url)) {
    console.error('Invalid Supabase URL format');
    return null;
  }

  const client = buildClient(url, key);

  cachedClient = client;
  setGlobalClient(client);

  return client;
}

export function getSupabaseClientSync(): AppSupabaseClient | null {
  return initialize();
}

export async function getSupabaseClient(): Promise<AppSupabaseClient> {
  const client = getSupabaseClientSync();

  if (!client) {
    if (!isBrowser()) {
      throw new Error('Supabase browser client is unavailable on the server');
    }
    throw new Error('Missing Supabase environment variables');
  }

  return client;
}

export function __resetSupabaseClientForTests(): void {
  cachedClient = null;
  setGlobalClient(null);
}
