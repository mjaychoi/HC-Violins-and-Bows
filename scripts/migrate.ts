/**
 * Supabase 마이그레이션 통합 스크립트
 *
 * 이 스크립트는 다음 방법을 순서대로 시도합니다:
 * 1. PostgreSQL 연결 (권장: DATABASE_URL에 Transaction Pooler 연결 문자열 사용)
 * 2. PostgreSQL 직접 연결 (DATABASE_PASSWORD가 있으면 direct host fallback 사용)
 * 2. Supabase CLI (설치되어 있으면)
 * 3. 실패 시 수동 실행 안내
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { logInfo, logError } from '@/utils/logger';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.local' });

const LOG_CONTEXT = 'migrate';
const info = (...msg: unknown[]) =>
  logInfo(
    msg
      .map(m => (typeof m === 'string' ? m : String(m)))
      .join(' ')
      .trim(),
    LOG_CONTEXT
  );
const err = (message: string, error?: unknown) =>
  logError(message, error, LOG_CONTEXT);

interface MigrationOptions {
  method?: 'postgres' | 'cli' | 'auto';
  verbose?: boolean;
}

function getProjectRefFromSupabaseUrl(supabaseUrl: string): string {
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('프로젝트 참조를 찾을 수 없습니다.');
  }
  return projectRef;
}

function buildDirectConnectionString(
  projectRef: string,
  dbPassword: string
): string {
  return `postgresql://postgres:${encodeURIComponent(
    dbPassword
  )}@db.${projectRef}.supabase.co:5432/postgres`;
}

function sanitizeConnectionString(rawConnectionString: string): string {
  const url = new URL(rawConnectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

async function migrate(options: MigrationOptions = {}) {
  const { method = 'auto', verbose = false } = options;

  try {
    info('🔄 Supabase 마이그레이션 실행...\n');

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const databaseUrl = process.env.DATABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.'
      );
    }

    const projectRef = getProjectRefFromSupabaseUrl(supabaseUrl);

    info('📦 프로젝트:', projectRef);
    info('📋 Supabase URL:', supabaseUrl);
    if (databaseUrl) {
      info('📋 DATABASE_URL 감지됨: pooler/direct override 사용');
    }
    info('');

    // 마이그레이션 파일 읽기
    const migrationPath = path.join(
      process.cwd(),
      'migration-maintenance-tasks.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    info('✅ 마이그레이션 파일 읽기 완료\n');

    // 방법 선택
    if (
      method === 'postgres' ||
      (method === 'auto' && (databaseUrl || dbPassword))
    ) {
      await migrateWithPostgreSQL(
        projectRef,
        databaseUrl,
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

    err('❌ 마이그레이션 실패:', errorMessage);
    if (errorCode) {
      err('   코드:', errorCode);
    }
    err('');

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
  databaseUrl: string | undefined,
  dbPassword: string | undefined,
  migrationSQL: string,
  verbose: boolean
): Promise<void> {
  if (!databaseUrl && !dbPassword) {
    throw new Error(
      'DATABASE_URL 또는 DATABASE_PASSWORD 환경 변수가 필요합니다.'
    );
  }

  info('🔐 PostgreSQL 직접 연결을 통한 마이그레이션 시도...\n');

  let client: Client | null = null;
  try {
    const rawConnectionString =
      databaseUrl ??
      buildDirectConnectionString(projectRef, dbPassword as string);
    const connectionString = sanitizeConnectionString(rawConnectionString);

    if (verbose) {
      info(
        databaseUrl
          ? '🔌 DATABASE_URL로 직접 연결 시도...'
          : '🔌 Supabase direct host로 연결 시도...'
      );
    }

    client = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await client.connect();
    info('✅ 데이터베이스 연결 성공!\n');

    if (verbose) {
      info('📝 마이그레이션 SQL 전체를 한 번에 실행 중...\n');
    }

    try {
      await client.query(migrationSQL);
      if (verbose) {
        info('✅ 마이그레이션 SQL 실행 완료');
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('duplicate')
      ) {
        info('⚠️  마이그레이션 중 이미 존재하는 객체가 감지되었습니다.');
        if (verbose) {
          info(`   상세: ${errorMessage}`);
        }
      } else {
        throw error;
      }
    }

    info('\n✅ 마이그레이션 완료!');
    info('🎉 maintenance_tasks 테이블이 생성되었습니다.');
    info('📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다.\n');
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('password authentication failed')
    ) {
      info('❌ 비밀번호 인증 실패\n');
    }
    throw error;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Supabase CLI를 통한 마이그레이션
 */
async function migrateWithCLI(
  projectRef: string,
  migrationPath: string,
  verbose: boolean
): Promise<void> {
  info('🔧 Supabase CLI를 통한 마이그레이션 시도...\n');

  try {
    // CLI 버전 확인
    const version = execSync('supabase --version', {
      encoding: 'utf-8',
    }).trim();
    if (verbose) {
      info(`✅ Supabase CLI: ${version}\n`);
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
      info(`✅ 마이그레이션 파일 준비: ${migrationFile}\n`);
    }

    // 프로젝트 링크
    try {
      execSync(`supabase link --project-ref ${projectRef}`, {
        stdio: 'ignore',
      });
    } catch {
      // 이미 링크되어 있을 수 있음
      if (verbose) {
        info('⚠️  프로젝트 링크 실패 (이미 링크되어 있을 수 있음)\n');
      }
    }

    // 마이그레이션 실행
    info('🚀 마이그레이션 실행 중...\n');
    execSync('supabase db push --include-all', {
      stdio: 'inherit',
      timeout: 60000,
    });

    info('\n✅ 마이그레이션 완료!');
    info('🎉 maintenance_tasks 테이블이 생성되었습니다.');
    info('📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다.\n');
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
 * 수동 실행 안내
 */
function showManualInstructions(
  projectRef: string,
  migrationSQL: string
): void {
  info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  info('📝 수동 실행 안내');
  info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  info('');
  info('자동 마이그레이션이 불가능합니다. 다음 방법 중 하나를 사용하세요:');
  info('');
  info('방법 1: Transaction Pooler 연결 문자열 사용 (가장 쉬움, 추천)');
  info('──────────────────────────────────────────────────────');
  info('1. Supabase Dashboard > Connect > Transaction Pooler 선택');
  info(
    `2. 연결 문자열 복사: postgresql://postgres.${projectRef}:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:6543/postgres`
  );
  info('3. .env.local에 추가:');
  info(
    `   DATABASE_URL=postgresql://postgres.${projectRef}:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:6543/postgres`
  );
  info('4. npm run migrate 실행');
  info('');
  info('방법 2: Supabase 대시보드 SQL Editor 사용');
  info('──────────────────────────────────────────────────────');
  info(`1. https://supabase.com/dashboard/project/${projectRef}/sql/new 접속`);
  info('2. migration-maintenance-tasks.sql 파일 내용 복사');
  info('3. SQL Editor에 붙여넣기');
  info('4. "Run" 버튼 클릭 (Ctrl+Enter / Cmd+Enter)');
  info('');
  info('방법 3: direct host + 데이터베이스 비밀번호 사용');
  info('──────────────────────────────────────────────────────');
  info('1. Supabase Dashboard > Settings > Database 접속');
  info('2. "Database password" 확인 후 direct connection 사용');
  info('3. .env.local에 추가:');
  info('   DATABASE_PASSWORD=your_password');
  info('4. npm run migrate 실행');
  info('');
  info('방법 4: Supabase CLI 사용');
  info('──────────────────────────────────────────────────────');
  info('1. brew install supabase/tap/supabase (또는 npm install -g supabase)');
  info('2. supabase login');
  info('3. npm run migrate:cli 실행');
  info('');
  info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  info('📄 마이그레이션 파일: migration-maintenance-tasks.sql');
  info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (migrationSQL) {
    info(migrationSQL.substring(0, 300) + '...');
    info('');
    info('(전체 내용은 migration-maintenance-tasks.sql 파일을 참고하세요)');
  }
  info('');
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
  err('❌ 에러:', error);
  process.exit(1);
});

export { migrate };
