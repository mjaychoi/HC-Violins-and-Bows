/**
 * Ownership UUID 수정 스크립트
 * 
 * 기존에 문자열로 저장된 ownership을 UUID로 변환하거나,
 * UUID가 있지만 클라이언트를 찾을 수 없는 경우를 처리합니다.
 * 
 * 실행: npx tsx scripts/fix-ownership-uuids.ts
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { logError, logInfo } from '@/utils/logger';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

async function fixOwnershipUUIDs() {
  let client: Client | null = null;

  try {
    logInfo('🔧 Ownership UUID 수정 시작...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.');
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
        if (client) {
          try {
            await client.end();
          } catch {
            // ignore
          }
          client = null;
        }
        logError(`⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n`, undefined, 'fixOwnershipUUIDs');
        continue;
      }
    }

    if (!client) {
      throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
    }

    // 1. 현재 상태 확인
    logInfo('📊 현재 상태 확인...\n');
    
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE i.ownership IS NULL) as null_count,
        COUNT(*) FILTER (WHERE i.ownership ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_count,
        COUNT(*) FILTER (WHERE i.ownership IS NOT NULL AND i.ownership !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as string_count,
        COUNT(*) as total
      FROM instruments i
    `);
    
    const stats = statsResult.rows[0];
    logInfo(`  • NULL ownership: ${stats.null_count}개`);
    logInfo(`  • UUID ownership: ${stats.uuid_count}개`);
    logInfo(`  • 문자열 ownership: ${stats.string_count}개`);
    logInfo(`  • 총 악기: ${stats.total}개\n`);

    // 2. UUID로 저장되었지만 클라이언트가 없는 경우 찾기
    logInfo('🔍 UUID로 저장되었지만 클라이언트를 찾을 수 없는 경우 확인...\n');
    
    const orphanedResult = await client.query(`
      SELECT 
        i.id,
        i.serial_number,
        i.type,
        i.maker,
        i.ownership
      FROM instruments i
      WHERE i.ownership ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
          SELECT 1 FROM clients c WHERE c.id::text = i.ownership
        )
      LIMIT 20
    `);
    
    logInfo(`  • 클라이언트를 찾을 수 없는 UUID ownership: ${orphanedResult.rows.length}개\n`);
    
    if (orphanedResult.rows.length > 0) {
      logInfo('  발견된 악기들:');
      orphanedResult.rows.forEach(row => {
        logInfo(`    - ${row.serial_number} (${row.type}): ${row.ownership}`);
      });
      logInfo('');
      
      logInfo('⚠️  이 UUID들은 클라이언트 테이블에 존재하지 않습니다.');
      logInfo('   다음 옵션 중 선택하세요:');
      logInfo('   1. NULL로 설정 (ownership 제거)');
      logInfo('   2. 그대로 유지 (나중에 클라이언트가 추가될 수 있음)');
      logInfo('');
      logInfo('   현재는 NULL로 설정하지 않고 그대로 유지합니다.\n');
    }

    // 3. 문자열로 저장된 ownership을 UUID로 변환 (클라이언트 이름 → UUID)
    logInfo('🔄 문자열 ownership을 UUID로 변환 시도...\n');
    
    // 모든 클라이언트를 가져와서 이름 → ID 매핑 생성
    const clientsResult = await client.query(`
      SELECT id, first_name, last_name, email
      FROM clients
    `);
    
    const nameToIdMap = new Map<string, string>();
    clientsResult.rows.forEach(client => {
      const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
      if (fullName) {
        nameToIdMap.set(fullName, client.id);
      }
    });
    
    logInfo(`  • 클라이언트 이름 → ID 매핑: ${nameToIdMap.size}개 생성됨\n`);
    
    // 문자열 ownership을 가진 악기들 찾기
    const stringOwnershipResult = await client.query(`
      SELECT id, serial_number, type, ownership
      FROM instruments
      WHERE ownership IS NOT NULL 
        AND ownership !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      LIMIT 100
    `);
    
    logInfo(`  • 문자열 ownership을 가진 악기: ${stringOwnershipResult.rows.length}개\n`);
    
    let convertedCount = 0;
    let failedCount = 0;
    
    for (const row of stringOwnershipResult.rows) {
      const clientId = nameToIdMap.get(row.ownership);
      
      if (clientId) {
        await client.query(
          'UPDATE instruments SET ownership = $1 WHERE id = $2',
          [clientId, row.id]
        );
        convertedCount++;
        logInfo(`  ✓ ${row.serial_number}: "${row.ownership}" → ${clientId}`);
      } else {
        failedCount++;
        logInfo(`  ✗ ${row.serial_number}: "${row.ownership}" (클라이언트를 찾을 수 없음)`);
      }
    }
    
    logInfo(`\n✅ 변환 완료:`);
    logInfo(`  • 성공: ${convertedCount}개`);
    logInfo(`  • 실패: ${failedCount}개\n`);
    
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logInfo('✅ Ownership UUID 수정 완료!');
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    logError('❌ 에러 발생:', error, 'fixOwnershipUUIDs');
    if (error instanceof Error) {
      logError('   메시지:', error.message, 'fixOwnershipUUIDs');
      logError('   스택:', error.stack, 'fixOwnershipUUIDs');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

fixOwnershipUUIDs().catch(error => {
  logError('❌ 에러:', error, 'fixOwnershipUUIDs');
  process.exit(1);
});

export { fixOwnershipUUIDs };
