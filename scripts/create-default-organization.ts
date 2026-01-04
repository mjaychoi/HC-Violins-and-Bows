/**
 * 기본 Organization 생성 스크립트
 *
 * 첫 번째 organization을 생성하고, 그 ID를 반환합니다.
 * 이 ID를 사용자의 metadata에 설정하거나 DEFAULT_ORG_ID로 사용할 수 있습니다.
 *
 * 사용법:
 *   npm run create:default-org
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { logInfo, logError } from '@/utils/logger';

dotenv.config({ path: '.env.local' });

const LOG_CONTEXT = 'create-default-org';

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

async function createDefaultOrganization() {
  try {
    info('🔄 기본 Organization 생성 시작...\n');

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

    if (!dbPassword) {
      throw new Error(
        'DATABASE_PASSWORD 환경 변수가 필요합니다. .env.local 파일에 DATABASE_PASSWORD를 추가하세요.'
      );
    }

    info('📦 프로젝트:', projectRef);
    info('');

    // PostgreSQL 연결
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
        info(`🔌 ${region} 지역 pooler 연결 시도...`);

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
        continue;
      }
    }

    if (!client) {
      throw new Error('데이터베이스 연결에 실패했습니다.');
    }

    try {
      // 기존 organization 확인
      info('📊 기존 organization 확인 중...');
      const existingOrgsResult = await client.query(`
        SELECT id, name, created_at
        FROM organizations
        ORDER BY created_at ASC
        LIMIT 5
      `);

      if (existingOrgsResult.rows.length > 0) {
        info('   기존 organization 발견:');
        for (const row of existingOrgsResult.rows) {
          info(`   - ${row.name} (ID: ${row.id}, Created: ${row.created_at})`);
        }
        info('');
        info('✅ 이미 organization이 존재합니다. 위의 ID를 사용하세요.');
        await client.end();
        return;
      }

      // 새 organization 생성
      info('📝 새 organization 생성 중...');
      const insertResult = await client.query(`
        INSERT INTO organizations (name)
        VALUES ('Default Organization')
        RETURNING id, name, created_at
      `);

      const org = insertResult.rows[0];
      info('');
      info('✅ Organization 생성 완료!');
      info('');
      info('📋 생성된 Organization 정보:');
      info(`   Name: ${org.name}`);
      info(`   ID: ${org.id}`);
      info(`   Created: ${org.created_at}`);
      info('');
      info('💡 다음 단계:');
      info(`   1. .env.local 파일에 추가: DEFAULT_ORG_ID=${org.id}`);
      info(`   2. 또는 Supabase 대시보드 > Authentication > Users에서`);
      info(`      사용자의 User Metadata에 다음을 추가:`);
      info(`      { "org_id": "${org.id}" }`);
      info('');
    } catch (error) {
      await client.end();
      throw error;
    }

    await client.end();
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    err('생성 실패:', errorMessage);

    // 조직 테이블이 없는 경우 안내
    if (
      errorMessage.includes('organizations') ||
      errorMessage.includes('does not exist')
    ) {
      err('');
      err('💡 organizations 테이블이 없는 것 같습니다.');
      err('   먼저 마이그레이션을 실행하세요:');
      err('   npm run migrate:unified');
    }

    process.exit(1);
  }
}

// 실행
createDefaultOrganization().catch(error => {
  err('예상치 못한 에러:', error);
  process.exit(1);
});
