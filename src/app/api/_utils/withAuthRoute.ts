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
 * 공통 인증 유틸: Authorization 헤더의 Supabase JWT를 검증해서 user를 얻는다.
 * - Authorization: Bearer <access_token>
 * - 서버에서는 가능하면 서버 전용 env(SUPABASE_URL / SUPABASE_ANON_KEY)를 우선 사용
 */
async function getUserFromRequest(request: NextRequest): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return {
        user: null,
        error: new Error('Missing authorization header'),
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return {
        user: null,
        error: new Error('Empty bearer token'),
      };
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
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error,
    } = await userSupabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        error: new Error(error?.message || 'Invalid token'),
      };
    }

    return { user, error: null };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { user: null, error: err };
  }
}

/**
 * API 라우트용 인증 미들웨어
 * - 유효한 Supabase 사용자 세션이 없으면 401 반환
 * - 유효한 경우 user 객체를 핸들러에 함께 전달 (향후 RBAC / 소유권 체크 등에 사용)
 * - 테스트 및 E2E 환경에서는 명시적인 플래그/헤더로 우회 가능
 * - 프로덕션 환경에서는 절대 우회 불가 (운영 안전장치)
 */
const TEST_USER = { id: 'test-user' } as User;

export function withAuthRoute(
  handler: AuthedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const isProd = process.env.NODE_ENV === 'production';

    // 1) Jest 유닛 테스트 환경에서는 항상 우회 (기존 route 테스트 보존)
    if (process.env.NODE_ENV === 'test') {
      return handler(request, TEST_USER);
    }

    // 2) 프로덕션에서는 절대 우회 불가 (운영 안전장치)
    // E2E_BYPASS_AUTH도 프로덕션에서는 무시 (실수로 prod env에 들어가도 무력화)
    if (!isProd && process.env.E2E_BYPASS_AUTH === 'true') {
      return handler(request, TEST_USER);
    }

    // 비프로덕션 환경에서만 허용하는 헤더 기반 우회 (x-e2e-bypass: 1)
    if (!isProd) {
      const bypassHeader = request.headers.get('x-e2e-bypass') === '1';
      if (bypassHeader) {
        return handler(request, TEST_USER);
      }
    }

    const { user, error } = await getUserFromRequest(request);

    if (!user || error) {
      // 일반적인 401 케이스(헤더 없음/토큰 불일치)는 Sentry 노이즈가 될 수 있으므로 캡처 생략
      if (error) {
        const msg = error.message || '';
        const isBenignAuthError =
          msg === 'Missing authorization header' ||
          msg === 'Empty bearer token' ||
          msg === 'Invalid token';

        if (!isBenignAuthError) {
          // 환경 변수 누락 등 비정상적인 인증 에러만 모니터링
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
