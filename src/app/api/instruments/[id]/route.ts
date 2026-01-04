import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase-server';
import { validateUUID } from '@/utils/inputValidation';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';

async function patchHandlerInternal(
  request: NextRequest,
  _user: User,
  id: string
) {
  void _user;

  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid instrument ID format' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // TODO: 여기서 허용 필드 화이트리스트로 제한하는 게 안전함
  // 예: const allowed = pick(body, ['maker', 'year', ...])
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from('instruments')
    .update(body)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update instrument' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, user: User) => {
      return patchHandlerInternal(req, user, id);
    })
  );

  return handler(request);
}
