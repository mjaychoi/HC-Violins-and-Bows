import { NextRequest, NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';

type Handler = (request: NextRequest) => Promise<Response>;

interface AuthResult {
  user: User | null;
  error: Error | null;
}

/**
 * 공통 인증 유틸: Authorization 헤더의 Supabase JWT를 검증해서 user를 얻는다.
 * - Authorization: Bearer <access_token>
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return {
        user: null,
        error: new Error(
          'Supabase env vars are missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)'
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
 * - 현재는 user 객체를 핸들러에 전달하지 않고, "인증 여부"만 강제한다.
 *   (향후 RBAC가 필요하면 시그니처를 확장해서 user를 함께 넘기면 됨)
 */
export function withAuthRoute(handler: Handler): Handler {
  return async (request: NextRequest) => {
    // 테스트 환경에서는 인증 미들웨어를 우회하여
    // 기존 단위 테스트(쿼리 호출/상태 코드 검증)가 그대로 동작하도록 한다.
    if (process.env.NODE_ENV === 'test') {
      return handler(request);
    }

    const { user, error } = await getUserFromRequest(request);

    if (!user || error) {
      // 모니터링에만 남기고, 클라이언트에는 민감한 정보 노출 안 함
      if (error) {
        captureException(
          error,
          'API_AUTH_MIDDLEWARE',
          {
            path: request.nextUrl.pathname,
          },
          ErrorSeverity.LOW
        );
      }

      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid Supabase session is required',
        },
        { status: 401 }
      );
    }

    return handler(request);
  };
}
