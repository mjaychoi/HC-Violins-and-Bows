/**
 * 특정 UUID의 ownership 상태 확인
 * 
 * 실행: npx tsx scripts/check-specific-ownership.ts [UUID]
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

async function checkSpecificOwnership(uuid: string) {
  let client: Client | null = null;

  try {
    console.log(`🔍 Ownership UUID 확인: ${uuid}\n`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl || !dbPassword) {
      throw new Error('환경 변수가 설정되지 않았습니다.');
    }

    const projectRef = supabaseUrl.match(
      /https?:\/\/([^.]+)\.supabase\.co/
    )?.[1];
    if (!projectRef) {
      throw new Error('Supabase URL에서 프로젝트 참조를 추출할 수 없습니다.');
    }

    // Connect to database
    const regions = ['us-east-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];

    for (const region of regions) {
      try {
        client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,
          user: `postgres.${projectRef}`,
          password: dbPassword,
          database: 'postgres',
          ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        console.log(`✅ ${region} 지역 연결 성공!\n`);
        break;
      } catch {
        if (client) {
          try { await client.end(); } catch {}
          client = null;
        }
        continue;
      }
    }

    if (!client) {
      throw new Error('데이터베이스 연결 실패');
    }

    // 1. 해당 UUID를 가진 클라이언트 확인
    console.log('📊 1. 해당 UUID를 가진 클라이언트:');
    const clientResult = await client.query(
      'SELECT id, first_name, last_name, email, client_number FROM clients WHERE id::text = $1',
      [uuid]
    );
    
    if (clientResult.rows.length > 0) {
      console.log('   ✅ 클라이언트 존재:', clientResult.rows[0]);
    } else {
      console.log('   ❌ 클라이언트를 찾을 수 없습니다');
    }

    // 2. 해당 UUID를 ownership으로 가진 악기 확인
    console.log('\n📊 2. 해당 UUID를 ownership으로 가진 악기:');
    const instrumentResult = await client.query(
      'SELECT id, serial_number, type, maker, ownership, status FROM instruments WHERE ownership = $1',
      [uuid]
    );
    
    if (instrumentResult.rows.length > 0) {
      console.log(`   발견된 악기: ${instrumentResult.rows.length}개`);
      instrumentResult.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.serial_number} - ${row.type} (${row.maker}), Status: ${row.status}`);
      });
    } else {
      console.log('   ✅ 해당 UUID를 ownership으로 가진 악기가 없습니다');
    }

    // 3. 전체 통계
    console.log('\n📊 3. 전체 통계:');
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE i.ownership IS NULL) as null_count,
        COUNT(*) FILTER (WHERE i.ownership ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_count,
        COUNT(*) FILTER (WHERE i.ownership IS NOT NULL AND i.ownership !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as string_count
      FROM instruments i
    `);
    const stats = statsResult.rows[0];
    console.log(`   • NULL: ${stats.null_count}개`);
    console.log(`   • UUID: ${stats.uuid_count}개`);
    console.log(`   • 문자열: ${stats.string_count}개`);

    // 4. 클라이언트를 찾을 수 없는 UUID ownership
    console.log('\n📊 4. 클라이언트를 찾을 수 없는 UUID ownership:');
    const orphanedResult = await client.query(`
      SELECT i.serial_number, i.type, i.ownership
      FROM instruments i
      WHERE i.ownership ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id::text = i.ownership)
      LIMIT 10
    `);
    
    if (orphanedResult.rows.length > 0) {
      console.log(`   ⚠️  ${orphanedResult.rows.length}개 발견:`);
      orphanedResult.rows.forEach(row => {
        console.log(`      - ${row.serial_number}: ${row.ownership}`);
      });
    } else {
      console.log('   ✅ 모든 UUID ownership이 유효한 클라이언트를 참조합니다');
    }

  } catch (error) {
    console.error('❌ 에러:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

const uuid = process.argv[2] || '232646d3-8adf-4009-85f5-89a841a718f0';
checkSpecificOwnership(uuid);
