import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// During build time, allow missing env vars (they'll be provided at runtime)
// Only throw error in runtime (client-side or server-side rendering)
const isBuildTime =
  typeof window === 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!isBuildTime && (!supabaseUrl || !supabaseAnonKey)) {
  // In dev, explode fast. In prod you could throw a custom AppError.
  throw new Error(
    'Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// Create a dummy client during build time if env vars are missing
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(finalUrl, finalKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
