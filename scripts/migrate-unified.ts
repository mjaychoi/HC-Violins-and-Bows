/**
 * Unified SQL 마이그레이션 실행 스크립트
 *
 * unified.sql 파일을 Supabase 데이터베이스에 실행합니다.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logInfo, logError } from '@/utils/logger';
dotenv.config({ path: '.env.local' });

const LOG_CONTEXT = 'migrate-unified';

function info(...msg: unknown[]) {
  logInfo(
    msg
      .map(m => (typeof m === 'string' ? m : String(m)))
      .join(' ')
      .trim(),
    LOG_CONTEXT
  );
}

function err(message: string, error?: unknown) {
  logError(`[${LOG_CONTEXT}] ❌ ${message}`, error, LOG_CONTEXT);
  if (error) {
    logError(
      error instanceof Error ? error.message : String(error),
      LOG_CONTEXT
    );
  }
}

async function migrateUnified() {
  try {
    info('🔄 Unified SQL 마이그레이션 실행...\n');

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.'
      );
    }

    const projectRef = supabaseUrl.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    if (!projectRef) {
      throw new Error('프로젝트 참조를 찾을 수 없습니다.');
    }

    info('📦 프로젝트:', projectRef);
    info('📋 Supabase URL:', supabaseUrl);
    info('');

    // unified.sql 파일 읽기
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      'unified.sql'
    );

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    info('✅ 마이그레이션 파일 읽기 완료\n');

    // PostgreSQL 직접 연결
    if (!dbPassword) {
      throw new Error(
        'DATABASE_PASSWORD 환경 변수가 필요합니다. .env.local 파일에 DATABASE_PASSWORD를 추가하세요.'
      );
    }

    info('🔐 PostgreSQL 직접 연결을 통한 마이그레이션 시도...\n');

    let client: Client | null = null;
    const regions = [
      'us-east-2',
      'us-east-1',
      'us-west-1',
      'eu-west-1',
      'ap-southeast-1',
    ];

    for (const region of regions) {
      try {
        info(`🔌 ${region} 지역 pooler 연결 시도 (포트 5432)...`);

        client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${projectRef}`,
          password: dbPassword,
          database: 'postgres',
          ssl: {
            rejectUnauthorized: false,
          },
          connectionTimeoutMillis: 10000,
        });

        await client.connect();
        info(`✅ ${region} 지역에 연결 성공!\n`);
        break;
      } catch (error) {
        if (client) {
          try {
            await client.end();
          } catch {
            // ignore
          }
          client = null;
        }
        if (region === regions[regions.length - 1]) {
          throw new Error(
            `모든 지역 연결 실패. 마지막 에러: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        // 다음 지역 시도
        continue;
      }
    }

    if (!client) {
      throw new Error('데이터베이스 연결에 실패했습니다.');
    }

    try {
      // SQL 실행
      info('🚀 마이그레이션 SQL 실행 중...\n');

      // unified.sql은 여러 개의 SQL 문으로 구성되어 있으므로 전체를 실행
      await client.query(migrationSQL);

      info('\n✅ 마이그레이션 완료!');
      info('🎉 unified.sql이 성공적으로 실행되었습니다.');
    } finally {
      await client.end();
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    err('마이그레이션 실패:', errorMessage);
    err('\n💡 수동 실행 방법:');
    err('   1. Supabase 대시보드 접속: https://supabase.com/dashboard');
    err('   2. SQL Editor 열기');
    err('   3. supabase/migrations/unified.sql 파일 내용 복사');
    err('   4. 붙여넣기 후 Run 클릭');

    process.exit(1);
  }
}

// 실행
migrateUnified().catch(error => {
  err('예상치 못한 에러:', error);
  process.exit(1);
});
