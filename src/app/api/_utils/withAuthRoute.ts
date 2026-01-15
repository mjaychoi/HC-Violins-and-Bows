import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';

type AuthedHandler = (request: NextRequest, user: User) => Promise<Response>;

interface AuthResult {
  user: User | null;
  error: Error | null;
}

/**
 * Extract bearer token from Authorization header ("Bearer <token>")
 */
function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  const match = authHeader.match(/^bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

/**
 * 공통 인증 유틸: Authorization 헤더 또는 쿠키 기반 토큰으로 user를 얻는다.
 * - Authorization: Bearer <access_token>
 * - 쿠키 키는 환경별로 다를 수 있어 최소한의 fallback만 둠
 *
 * ⚠️ 장기적으로는 supabase auth helper(서버) 사용 권장
 */
function getHeaderValue(request: NextRequest, key: string): string | null {
  try {
    const headers = request.headers as
      | Headers
      | Record<string, string | undefined>
      | undefined;

    if (!headers) return null;

    if (typeof headers.get === 'function') {
      return headers.get(key) ?? null;
    }

    const normalizedKey = key.toLowerCase();
    const record = headers as Record<string, string | undefined>;
    return record[key] ?? record[normalizedKey] ?? null;
  } catch {
    return null;
  }
}

function getCookieValue(request: NextRequest, key: string): string | null {
  try {
    const cookies = request.cookies;
    if (!cookies || typeof cookies.get !== 'function') return null;
    return cookies.get(key)?.value ?? null;
  } catch {
    return null;
  }
}

async function getUserFromRequest(request: NextRequest): Promise<AuthResult> {
  try {
    const rawHeader =
      getHeaderValue(request, 'authorization') ??
      getHeaderValue(request, 'Authorization') ??
      '';
    const bearerToken = extractBearerToken(rawHeader);

    // Cookie fallbacks (환경에 따라 다를 수 있음)
    const cookieToken =
      getCookieValue(request, 'sb-access-token') ||
      getCookieValue(request, 'sb:access-token') ||
      getCookieValue(request, 'sb-token') ||
      '';

    const token = (bearerToken || cookieToken).trim();

    if (!token) {
      return { user: null, error: new Error('Missing authorization token') };
    }

    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return {
        user: null,
        error: new Error(
          'Supabase env vars are missing (SUPABASE_URL / SUPABASE_ANON_KEY)'
        ),
      };
    }

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await userSupabase.auth.getSession();

    const sessionUser = data?.session?.user ?? null;

    if (error || !sessionUser) {
      return {
        user: null,
        error: new Error(error?.message || 'Invalid token'),
      };
    }

    return { user: sessionUser, error: null };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { user: null, error: err };
  }
}

/**
 * API 라우트용 인증 미들웨어
 * - 유효한 Supabase 사용자 세션이 없으면 401 반환
 * - 유효한 경우 user 객체를 핸들러에 함께 전달
 * - 테스트 및 E2E 환경에서는 명시적인 플래그/헤더로 우회 가능
 * - 프로덕션 환경에서는 절대 우회 불가
 */
const TEST_USER: User = {
  id: 'test-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.com',
  created_at: new Date(0).toISOString(),
  app_metadata: {},
  user_metadata: {},
} as User;

export function withAuthRoute(
  handler: AuthedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const isProd = process.env.NODE_ENV === 'production';

    // 1) Jest 유닛 테스트 환경에서는 항상 우회
    if (process.env.NODE_ENV === 'test') {
      return handler(request, TEST_USER);
    }

    // 2) 프로덕션에서는 절대 우회 불가
    if (!isProd && process.env.E2E_BYPASS_AUTH === 'true') {
      return handler(request, TEST_USER);
    }

    // 3) 비프로덕션 환경에서만 허용하는 헤더 기반 우회
    if (!isProd && getHeaderValue(request, 'x-e2e-bypass') === '1') {
      return handler(request, TEST_USER);
    }

    const { user, error } = await getUserFromRequest(request);

    if (!user || error) {
      if (error) {
        const msg = error.message || '';
        const lower = msg.toLowerCase();

        // "예상 가능한" 인증 실패는 noisy하므로 모니터링 제외
        const isBenignAuthError =
          msg === 'Missing authorization token' ||
          msg === 'Invalid token' ||
          lower.includes('jwt') ||
          lower.includes('unauthorized') ||
          lower.includes('invalid token') ||
          lower.includes('auth session missing');

        if (!isBenignAuthError) {
          captureException(
            error,
            'API_AUTH_MIDDLEWARE',
            {
              path: request.nextUrl.pathname,
            },
            ErrorSeverity.LOW
          );
        }
      }

      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid Supabase session is required',
        },
        { status: 401 }
      );
    }

    return handler(request, user);
  };
}
