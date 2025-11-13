/**
 * maintenance_tasks 테이블 생성 마이그레이션 스크립트
 * 
 * 이 스크립트는 maintenance_tasks 테이블을 생성합니다.
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

async function migrateMaintenanceTasks() {
  try {
    console.log('🔄 maintenance_tasks 테이블 생성 마이그레이션 실행...\n');

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.');
    }

    if (!dbPassword) {
      console.log('⚠️  DATABASE_PASSWORD 환경 변수가 없습니다.');
      console.log('📝 Supabase 대시보드에서 수동 실행하세요:');
      console.log('   1. https://supabase.com/dashboard 접속');
      console.log('   2. SQL Editor 열기');
      console.log('   3. 다음 마이그레이션 파일 실행:');
      console.log('      - supabase/migrations/20251109150920_maintenance_tasks.sql');
      console.log('      - supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql');
      console.log('');
      return;
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('프로젝트 참조를 찾을 수 없습니다.');
    }

    console.log('📦 프로젝트:', projectRef);
    console.log('📋 Supabase URL:', supabaseUrl);
    console.log('');

    // 마이그레이션 파일 읽기
    const migrationFiles = [
      'supabase/migrations/20251109150920_maintenance_tasks.sql',
      'supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql',
    ];

    const migrations: string[] = [];
    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(process.cwd(), migrationFile);
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
      }
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      migrations.push(migrationSQL);
      console.log(`✅ ${migrationFile} 읽기 완료`);
    }
    console.log('');

    // PostgreSQL 연결 시도 - Pooler 사용 (포트 5432)
    const regions = ['us-east-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];
    let client: Client | null = null;

    for (const region of regions) {
      try {
        console.log(`🔌 ${region} 지역 pooler 연결 시도...`);

        client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,  // Pooler는 포트 5432 사용
          user: `postgres.${projectRef}`,  // 사용자 이름 형식: postgres.프로젝트참조
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
        for (let i = 0; i < migrations.length; i++) {
          try {
            await client.query(migrations[i]);
            console.log(`✅ 마이그레이션 ${i + 1}/${migrations.length} 완료`);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (
              errorMessage.includes('already exists') ||
              errorMessage.includes('duplicate') ||
              errorMessage.includes('already has')
            ) {
              console.log(`⚠️  마이그레이션 ${i + 1}/${migrations.length} 건너뜀 (이미 존재)`);
            } else {
              throw error;
            }
          }
        }

        console.log('\n✅ 마이그레이션 완료!');
        console.log('🎉 maintenance_tasks 테이블이 생성되었습니다.');
        console.log('📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다.\n');

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
          console.log(`⚠️  ${region} 지역 SSL 인증서 오류, 다음 지역 시도...\n`);
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
          (error.message.includes('already exists') || error.message.includes('duplicate'))
        ) {
          console.log('⚠️  maintenance_tasks 테이블이 이미 존재합니다.');
          console.log('✅ 마이그레이션이 이미 완료된 것으로 보입니다.\n');
          return;
        } else {
          throw error;
        }
      }
    }

    throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
      console.log('1. https://supabase.com/dashboard/project/' + projectRef + '/sql/new 접속');
      console.log('2. 다음 마이그레이션 파일들을 순서대로 실행:');
      console.log('');
      console.log('   파일 1: supabase/migrations/20251109150920_maintenance_tasks.sql');
      console.log('   파일 2: supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    process.exit(1);
  }
}

// 실행
migrateMaintenanceTasks().catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

export { migrateMaintenanceTasks };

