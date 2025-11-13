/**
 * subtype 컬럼 추가 마이그레이션 스크립트
 *
 * 이 스크립트는 instruments 테이블에 subtype 컬럼을 추가합니다.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

async function migrateSubtype() {
  try {
    console.log('🔄 subtype 컬럼 추가 마이그레이션 실행...\n');

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.'
      );
    }

    if (!dbPassword) {
      console.log('⚠️  DATABASE_PASSWORD 환경 변수가 없습니다.');
      console.log('📝 Supabase 대시보드에서 수동 실행하세요:');
      console.log('   1. https://supabase.com/dashboard 접속');
      console.log('   2. SQL Editor 열기');
      console.log('   3. 다음 SQL 실행:');
      console.log('');
      console.log(
        '   ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;'
      );
      console.log('');
      return;
    }

    const projectRef = supabaseUrl.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    if (!projectRef) {
      throw new Error('프로젝트 참조를 찾을 수 없습니다.');
    }

    console.log('📦 프로젝트:', projectRef);
    console.log('📋 Supabase URL:', supabaseUrl);
    console.log('');

    // SQL 읽기
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20241112141803_add_subtype_column.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log('✅ 마이그레이션 파일 읽기 완료\n');

    // PostgreSQL 연결 시도 - Pooler 사용 (포트 5432)
    const regions = [
      'us-east-2',
      'us-east-1',
      'us-west-1',
      'eu-west-1',
      'ap-southeast-1',
    ];
    let client: Client | null = null;

    for (const region of regions) {
      try {
        console.log(`🔌 ${region} 지역 pooler 연결 시도...`);

        client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432, // Pooler는 포트 5432 사용
          user: `postgres.${projectRef}`, // 사용자 이름 형식: postgres.프로젝트참조
          password: dbPassword,
          database: 'postgres',
          ssl: {
            rejectUnauthorized: false,
          },
        });

        await client.connect();
        console.log(`✅ ${region} 지역 연결 성공!\n`);

        // SQL 실행
        console.log('🚀 마이그레이션 실행 중...\n');
        await client.query(migrationSQL);

        console.log('✅ 마이그레이션 완료!');
        console.log('🎉 subtype 컬럼이 instruments 테이블에 추가되었습니다.');
        console.log(
          '📝 이제 Dashboard 페이지에서 subtype 필드를 사용할 수 있습니다.\n'
        );

        await client.end();
        return;
      } catch (error: unknown) {
        if (client) {
          try {
            await client.end();
          } catch {
            // ignore
          }
          client = null;
        }

        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED')
        ) {
          console.log(`⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n`);
          continue;
        } else if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string' &&
          (error.message.includes('self-signed certificate') ||
            error.message.includes('certificate') ||
            error.message.includes('SSL'))
        ) {
          console.log(
            `⚠️  ${region} 지역 SSL 인증서 오류, 다음 지역 시도...\n`
          );
          continue;
        } else if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string' &&
          error.message.includes('password authentication failed')
        ) {
          console.log(`❌ 비밀번호 인증 실패\n`);
          break;
        } else if (
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string' &&
          (error.message.includes('already exists') ||
            error.message.includes('duplicate'))
        ) {
          console.log('⚠️  subtype 컬럼이 이미 존재합니다.');
          console.log('✅ 마이그레이션이 이미 완료된 것으로 보입니다.\n');
          return;
        } else {
          throw error;
        }
      }
    }

    throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ 마이그레이션 실패:', errorMessage);
    console.error('');

    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];

    if (projectRef) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 수동 실행 안내');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log(
        '1. https://supabase.com/dashboard/project/' +
          projectRef +
          '/sql/new 접속'
      );
      console.log('2. 다음 SQL 실행:');
      console.log('');
      console.log(
        '   ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;'
      );
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    process.exit(1);
  }
}

// 실행
migrateSubtype().catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

export { migrateSubtype };
