/**
 * Invoice org_id 수정 스크립트
 *
 * 기존 invoice들의 org_id가 NULL이거나 잘못된 경우,
 * 현재 사용자의 org_id로 업데이트합니다.
 *
 * 사용법:
 *   npm run fix:invoice-org-ids
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { logInfo, logError } from '@/utils/logger';

dotenv.config({ path: '.env.local' });

const LOG_CONTEXT = 'fix-invoice-org-ids';

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

async function fixInvoiceOrgIds() {
  try {
    info('🔄 Invoice org_id 수정 시작...\n');

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
      // 1. NULL org_id를 가진 invoices 확인
      info('📊 org_id가 NULL인 invoice 확인 중...');
      const nullCheckResult = await client.query(`
        SELECT COUNT(*) as count
        FROM invoices
        WHERE org_id IS NULL
      `);
      const nullCount = parseInt(nullCheckResult.rows[0]?.count || '0', 10);
      info(`   발견: ${nullCount}개\n`);

      if (nullCount === 0) {
        info('✅ org_id가 NULL인 invoice가 없습니다.');

        // 2. org_id 분포 확인
        info('\n📊 org_id 분포 확인 중...');
        const distributionResult = await client.query(`
          SELECT 
            org_id,
            COUNT(*) as count
          FROM invoices
          GROUP BY org_id
          ORDER BY count DESC
          LIMIT 10
        `);

        info('   Top org_id 분포:');
        for (const row of distributionResult.rows) {
          const orgId = row.org_id || '(NULL)';
          const count = row.count;
          info(`   - ${orgId}: ${count}개`);
        }
        info('');

        await client.end();
        return;
      }

      // 3. 사용자에게 업데이트 여부 확인
      info('⚠️  주의: org_id가 NULL인 invoice들을 업데이트할 수 있습니다.');
      info('   하지만 어떤 org_id로 설정할지 결정해야 합니다.\n');
      info('💡 권장 방법:');
      info('   1. Supabase 대시보드에서 SQL Editor 열기');
      info('   2. 아래 SQL 쿼리를 실행하여 특정 org_id로 업데이트:');
      info('');
      info('   -- 예시: 특정 org_id로 업데이트');
      info('   UPDATE invoices');
      info("   SET org_id = 'YOUR-ORG-ID-HERE'::UUID");
      info('   WHERE org_id IS NULL;');
      info('');
      info('   -- 또는 가장 많이 사용된 org_id로 업데이트 (주의 필요)');
      info('   UPDATE invoices');
      info('   SET org_id = (');
      info('     SELECT org_id');
      info('     FROM invoices');
      info('     WHERE org_id IS NOT NULL');
      info('     GROUP BY org_id');
      info('     ORDER BY COUNT(*) DESC');
      info('     LIMIT 1');
      info('   )');
      info('   WHERE org_id IS NULL;');
      info('');

      // 4. org_id가 있는 invoice들의 org_id 분포 확인
      info('📊 org_id가 있는 invoice들의 분포:');
      const existingOrgIdsResult = await client.query(`
        SELECT 
          org_id,
          COUNT(*) as count
        FROM invoices
        WHERE org_id IS NOT NULL
        GROUP BY org_id
        ORDER BY count DESC
        LIMIT 5
      `);

      if (existingOrgIdsResult.rows.length > 0) {
        info('   기존 org_id 분포:');
        for (const row of existingOrgIdsResult.rows) {
          info(`   - ${row.org_id}: ${row.count}개`);
        }
      } else {
        info('   ⚠️  org_id가 설정된 invoice가 없습니다.');
        info('   모든 invoice의 org_id가 NULL입니다.');
      }
      info('');

      // 5. 샘플 invoice 확인
      info('📋 org_id가 NULL인 invoice 샘플 (최대 5개):');
      const sampleResult = await client.query(`
        SELECT 
          id,
          invoice_number,
          org_id,
          client_id,
          invoice_date,
          created_at
        FROM invoices
        WHERE org_id IS NULL
        ORDER BY created_at DESC
        LIMIT 5
      `);

      for (const row of sampleResult.rows) {
        info(
          `   - Invoice #${row.invoice_number} (ID: ${row.id}, Created: ${row.created_at})`
        );
      }
      info('');

      await client.end();

      info('✅ 분석 완료!');
      info(
        '💡 위의 SQL 쿼리를 Supabase 대시보드에서 실행하여 org_id를 업데이트하세요.'
      );
    } catch (error) {
      await client.end();
      throw error;
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    err('수정 실패:', errorMessage);
    process.exit(1);
  }
}

// 실행
fixInvoiceOrgIds().catch(error => {
  err('예상치 못한 에러:', error);
  process.exit(1);
});
