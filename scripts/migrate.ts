/**
 * Supabase 마이그레이션 통합 스크립트
 *
 * 이 스크립트는 다음 방법을 순서대로 시도합니다:
 * 1. PostgreSQL 직접 연결 (DATABASE_PASSWORD가 있으면)
 * 2. Supabase CLI (설치되어 있으면)
 * 3. 실패 시 수동 실행 안내
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.local' });

interface MigrationOptions {
  method?: 'postgres' | 'cli' | 'auto';
  verbose?: boolean;
}

async function migrate(options: MigrationOptions = {}) {
  const { method = 'auto', verbose = false } = options;

  try {
    console.log('🔄 Supabase 마이그레이션 실행...\n');

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

    console.log('📦 프로젝트:', projectRef);
    console.log('📋 Supabase URL:', supabaseUrl);
    console.log('');

    // 마이그레이션 파일 읽기
    const migrationPath = path.join(
      process.cwd(),
      'migration-maintenance-tasks.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    console.log('✅ 마이그레이션 파일 읽기 완료\n');

    // 방법 선택
    if (method === 'postgres' || (method === 'auto' && dbPassword)) {
      await migrateWithPostgreSQL(
        projectRef,
        dbPassword,
        migrationSQL,
        verbose
      );
      return;
    }

    if (method === 'cli' || method === 'auto') {
      const cliAvailable = await checkSupabaseCLI();
      if (cliAvailable) {
        await migrateWithCLI(projectRef, migrationPath, verbose);
        return;
      }
    }

    // 모든 방법이 실패하면 안내
    showManualInstructions(projectRef, migrationSQL);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;

    console.error('❌ 마이그레이션 실패:', errorMessage);
    if (errorCode) {
      console.error('   코드:', errorCode);
    }
    console.error('');

    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
      /https:\/\/([^.]+)\.supabase\.co/
    )?.[1];

    if (projectRef) {
      showManualInstructions(projectRef, '');
    }

    process.exit(1);
  }
}

/**
 * PostgreSQL 직접 연결을 통한 마이그레이션
 */
async function migrateWithPostgreSQL(
  projectRef: string,
  dbPassword: string | undefined,
  migrationSQL: string,
  verbose: boolean
): Promise<void> {
  if (!dbPassword) {
    throw new Error('DATABASE_PASSWORD 환경 변수가 필요합니다.');
  }

  console.log('🔐 PostgreSQL 직접 연결을 통한 마이그레이션 시도...\n');

  let client: Client | null = null;
  const regions = ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];

  for (const region of regions) {
    try {
      const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(
        dbPassword
      )}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;

      if (verbose) {
        console.log(`🔌 ${region} 지역 연결 시도...`);
      }

      client = new Client({
        connectionString: connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
      });

      await client.connect();
      console.log(`✅ ${region} 지역 연결 성공!\n`);

      // SQL 문 파싱 및 실행
      const statements = parseSQL(migrationSQL);

      if (verbose) {
        console.log(`📝 ${statements.length}개의 SQL 문 실행 중...\n`);
      }

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement || statement.trim().length === 0) continue;

        try {
          await client.query(statement);
          if (verbose) {
            console.log(`✅ ${i + 1}/${statements.length} 완료`);
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('already exists') ||
            errorMessage.includes('duplicate')
          ) {
            if (verbose) {
              console.log(
                `⚠️  ${i + 1}/${statements.length} 건너뜀 (이미 존재)`
              );
            }
          } else {
            throw error;
          }
        }
      }

      console.log('\n✅ 마이그레이션 완료!');
      console.log('🎉 maintenance_tasks 테이블이 생성되었습니다.');
      console.log(
        '📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다.\n'
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
        if (verbose) {
          console.log(`⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n`);
        }
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
      } else {
        throw error;
      }
    }
  }

  throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
}

/**
 * Supabase CLI를 통한 마이그레이션
 */
async function migrateWithCLI(
  projectRef: string,
  migrationPath: string,
  verbose: boolean
): Promise<void> {
  console.log('🔧 Supabase CLI를 통한 마이그레이션 시도...\n');

  try {
    // CLI 버전 확인
    const version = execSync('supabase --version', {
      encoding: 'utf-8',
    }).trim();
    if (verbose) {
      console.log(`✅ Supabase CLI: ${version}\n`);
    }

    // 로그인 확인
    try {
      execSync('supabase projects list', { stdio: 'ignore' });
    } catch {
      throw new Error(
        'Supabase CLI에 로그인되어 있지 않습니다. `supabase login`을 실행하세요.'
      );
    }

    // 마이그레이션 파일 준비
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .split('.')[0];
    const migrationFile = path.join(
      migrationsDir,
      `${timestamp}_maintenance_tasks.sql`
    );

    fs.copyFileSync(migrationPath, migrationFile);
    if (verbose) {
      console.log(`✅ 마이그레이션 파일 준비: ${migrationFile}\n`);
    }

    // 프로젝트 링크
    try {
      execSync(`supabase link --project-ref ${projectRef}`, {
        stdio: 'ignore',
      });
    } catch {
      // 이미 링크되어 있을 수 있음
      if (verbose) {
        console.log('⚠️  프로젝트 링크 실패 (이미 링크되어 있을 수 있음)\n');
      }
    }

    // 마이그레이션 실행
    console.log('🚀 마이그레이션 실행 중...\n');
    execSync('supabase db push --include-all', {
      stdio: 'inherit',
      timeout: 60000,
    });

    console.log('\n✅ 마이그레이션 완료!');
    console.log('🎉 maintenance_tasks 테이블이 생성되었습니다.');
    console.log(
      '📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다.\n'
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('로그인')) {
      throw error;
    }
    throw new Error('Supabase CLI 마이그레이션 실패');
  }
}

/**
 * Supabase CLI 설치 여부 확인
 */
async function checkSupabaseCLI(): Promise<boolean> {
  try {
    execSync('supabase --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * SQL 문 파싱
 */
function parseSQL(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(
      s =>
        s.length > 0 &&
        !s.startsWith('--') &&
        !s.startsWith('COMMENT') &&
        !s.startsWith('COMMENT ON')
    );
}

/**
 * 수동 실행 안내
 */
function showManualInstructions(
  projectRef: string,
  migrationSQL: string
): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 수동 실행 안내');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(
    '자동 마이그레이션이 불가능합니다. 다음 방법 중 하나를 사용하세요:'
  );
  console.log('');
  console.log('방법 1: Supabase 대시보드 (가장 빠름, 추천)');
  console.log('──────────────────────────────────────────────────────');
  console.log(
    `1. https://supabase.com/dashboard/project/${projectRef}/sql/new 접속`
  );
  console.log('2. migration-maintenance-tasks.sql 파일 내용 복사');
  console.log('3. SQL Editor에 붙여넣기');
  console.log('4. "Run" 버튼 클릭 (Ctrl+Enter / Cmd+Enter)');
  console.log('');
  console.log('방법 2: 데이터베이스 비밀번호 사용 (자동 실행)');
  console.log('──────────────────────────────────────────────────────');
  console.log('1. Supabase Dashboard > Settings > Database 접속');
  console.log('2. "Database password" 확인');
  console.log('3. .env.local에 추가:');
  console.log('   DATABASE_PASSWORD=your_password');
  console.log('4. npm run migrate 실행');
  console.log('');
  console.log('방법 3: Supabase CLI 사용');
  console.log('──────────────────────────────────────────────────────');
  console.log(
    '1. brew install supabase/tap/supabase (또는 npm install -g supabase)'
  );
  console.log('2. supabase login');
  console.log('3. npm run migrate:cli 실행');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📄 마이그레이션 파일: migration-maintenance-tasks.sql');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (migrationSQL) {
    console.log(migrationSQL.substring(0, 300) + '...');
    console.log('');
    console.log(
      '(전체 내용은 migration-maintenance-tasks.sql 파일을 참고하세요)'
    );
  }
  console.log('');
}

// CLI 실행 (직접 실행 시에만)
// tsx나 node로 직접 실행할 때는 항상 실행됨
const args = process.argv.slice(2);
const method = args.includes('--postgres')
  ? 'postgres'
  : args.includes('--cli')
    ? 'cli'
    : 'auto';
const verbose = args.includes('--verbose') || args.includes('-v');

migrate({ method, verbose }).catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

export { migrate };
