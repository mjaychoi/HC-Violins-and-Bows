/**
 * Supabase Auth에 사용자를 생성합니다 (Admin API).
 *
 * 필요: .env.local에 SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL)
 *
 * 선택: BOOTSTRAP_ORG_ID=00000000-0000-4000-8000-000000000001 처럼 넣으면
 *       app_metadata에 org_id·role(admin)을 함께 설정합니다.
 *
 * 실행 예:
 *   npx tsx scripts/create-auth-user.ts
 *   npx tsx scripts/create-auth-user.ts test@tet.com test
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const email = (process.argv[2] || 'test@tet.com').trim();
const password = process.argv[3] || 'test';
const orgId = process.env.BOOTSTRAP_ORG_ID?.trim();

async function main() {
  if (!url || !serviceKey) {
    console.error(
      'NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL)와 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 필요합니다.'
    );
    process.exit(1);
  }

  if (!email || !password) {
    console.error('이메일·비밀번호가 비어 있습니다.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const app_metadata =
    orgId && /^[0-9a-f-]{36}$/i.test(orgId)
      ? { org_id: orgId, role: 'admin' as const }
      : undefined;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(app_metadata ? { app_metadata } : {}),
  });

  if (
    error &&
    /already registered|already exists|duplicate/i.test(error.message)
  ) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      console.error('기존 사용자 조회 실패:', listErr.message);
      process.exit(1);
    }
    const existing = list.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!existing) {
      console.error('생성 실패:', error.message);
      process.exit(1);
    }
    const { error: upErr } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password,
        email_confirm: true,
        ...(app_metadata ? { app_metadata } : {}),
      }
    );
    if (upErr) {
      console.error('업데이트 실패:', upErr.message);
      process.exit(1);
    }
    console.log('이미 있음 → 비밀번호·메타 갱신:', existing.id, existing.email);
    if (!app_metadata) {
      console.log(
        'app_metadata는 그대로입니다. BOOTSTRAP_ORG_ID를 넣고 다시 실행하면 org_id·admin이 반영됩니다.'
      );
    }
    return;
  }

  if (error) {
    console.error('생성 실패:', error.message);
    process.exit(1);
  }

  console.log('생성됨:', data.user?.id, data.user?.email);
  if (!app_metadata) {
    console.log(
      'app_metadata 미설정: 대시보드에서 org_id·role을 넣거나 BOOTSTRAP_ORG_ID를 .env.local에 추가 후 다시 실행하세요.'
    );
  }
}

main();
