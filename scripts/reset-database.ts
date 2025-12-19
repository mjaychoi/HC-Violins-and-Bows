/**
 * 데이터베이스 전체 초기화 스크립트
 *
 * 모든 데이터를 삭제하고 테이블을 깨끗한 상태로 만듭니다.
 * 주의: 이 스크립트는 모든 데이터를 삭제합니다!
 *
 * 실행: npm run reset:db
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { logInfo, logError } from '@/utils/logger';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

// 삭제 순서는 외래키 제약조건을 고려해야 함
const TABLES_TO_TRUNCATE = [
  'contact_logs',
  'sales_history',
  'maintenance_tasks',
  'connections',
  'instruments',
  'clients',
];

async function resetDatabase() {
  let client: Client | null = null;

  try {
    logInfo('🗑️  데이터베이스 초기화 시작...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.'
      );
    }

    if (!dbPassword) {
      throw new Error('DATABASE_PASSWORD 환경 변수가 설정되지 않았습니다.');
    }

    // Extract project reference from URL
    const projectRef = supabaseUrl.match(
      /https?:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    if (!projectRef) {
      throw new Error('Supabase URL에서 프로젝트 참조를 추출할 수 없습니다.');
    }

    // Connect to database
    const regions = [
      'us-east-2',
      'us-east-1',
      'us-west-1',
      'eu-west-1',
      'ap-southeast-1',
    ];

    for (const region of regions) {
      try {
        logInfo(`🔌 ${region} 지역 pooler 연결 시도...`);
        client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${projectRef}`,
          password: dbPassword,
          database: 'postgres',
          ssl: {
            rejectUnauthorized: false,
          },
        });
        await client.connect();
        logInfo(`✅ ${region} 지역 연결 성공!\n`);
        break;
      } catch {
        logInfo(`❌ ${region} 지역 연결 실패, 다음 지역 시도...`);
        if (client) {
          await client.end();
          client = null;
        }
      }
    }

    if (!client) {
      throw new Error('모든 지역 연결 실패');
    }

    logInfo('⚠️  모든 데이터를 삭제합니다...\n');

    // TRUNCATE CASCADE를 사용하여 외래키 제약조건 무시하고 모든 데이터 삭제
    for (const table of TABLES_TO_TRUNCATE) {
      try {
        logInfo(`🗑️  ${table} 테이블 데이터 삭제 중...`);
        await client.query(`TRUNCATE TABLE ${table} CASCADE;`);
        logInfo(`✅ ${table} 테이블 데이터 삭제 완료`);
      } catch (error) {
        // 테이블이 없거나 다른 오류가 있을 수 있음
        logInfo(
          `⚠️  ${table} 테이블 삭제 실패: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    logInfo('\n✅ 데이터베이스 초기화 완료!');
    logInfo(
      '이제 npm run seed:data를 실행하여 샘플 데이터를 생성할 수 있습니다.\n'
    );
  } catch (error) {
    logError('❌ 에러 발생:', error, 'resetDatabase');
    if (error instanceof Error) {
      logError('   메시지:', error.message, 'resetDatabase');
      logError('   스택:', error.stack, 'resetDatabase');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

resetDatabase().catch(error => {
  logError('❌ 에러:', error, 'resetDatabase');
  process.exit(1);
});
