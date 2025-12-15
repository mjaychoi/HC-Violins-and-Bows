import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

/**
 * Legacy Supabase entrypoint kept for backward compatibility.
 *
 * - Application 코드에서는 `supabase-client.ts` / `supabase-server.ts` 를 직접 사용합니다.
 * - 테스트와 예전 코드에서 `@/lib/supabase`를 mock/require 하기 때문에 이 파일은 남겨둡니다.
 */

/**
 * Async helper that delegates to getSupabaseClient().
 */
export async function getSupabase(): Promise<SupabaseClient> {
  return getSupabaseClient();
}

/**
 * Deprecated sync-style proxy client.
 *
 * - 실제 앱 코드에서는 사용하지 않아야 합니다.
 * - Jest 테스트에서 `require('../supabase').supabase` 가 존재하기만 하면 되기 때문에
 *   간단한 Proxy 래퍼를 유지합니다.
 */
let _supabaseProxyInstance: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseProxyInstance) {
      // initialize lazily; ignore 실패 (테스트에서 대부분 mock 됨)
      getSupabaseClient()
        .then(client => {
          _supabaseProxyInstance = client;
        })
        .catch(() => {
          // noop
        });
      // 첫 sync 접근 시에는 더미 객체를 반환해서 from 등을 안전하게 호출 가능하게 함
      return () => {
        throw new Error(
          'Supabase client not initialized yet. In production code, use async getSupabaseClient().'
        );
      };
    }
    const value = (
      _supabaseProxyInstance as unknown as Record<string, unknown>
    )[prop as string];
    if (typeof value === 'function') {
      return value.bind(_supabaseProxyInstance);
    }
    return value;
  },
}) as SupabaseClient;
