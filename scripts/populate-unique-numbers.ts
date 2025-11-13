/**
 * 기존 데이터에 고유 번호 추가 스크립트
 * 
 * 이 스크립트는 기존 instruments와 clients 데이터에
 * serial_number와 client_number를 자동으로 생성하여 추가합니다.
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

// 고유 번호 생성 함수들
function getInstrumentPrefix(type: string | null): string {
  if (!type) return 'IN';
  
  const normalizedType = type.toLowerCase().trim();
  
  if (normalizedType.includes('violin') || normalizedType.includes('바이올린')) {
    return 'VI';
  }
  if (normalizedType.includes('viola') || normalizedType.includes('비올라')) {
    return 'VA';
  }
  if (normalizedType.includes('cello') || normalizedType.includes('첼로')) {
    return 'CE';
  }
  if (normalizedType.includes('bass') || normalizedType.includes('베이스')) {
    return 'DB';
  }
  if (normalizedType.includes('bow') || normalizedType.includes('활')) {
    return 'BO';
  }
  
  return 'IN';
}

function generateInstrumentSerialNumber(
  type: string | null,
  existingNumbers: string[]
): string {
  const prefix = getInstrumentPrefix(type);
  
  const samePrefixNumbers = existingNumbers
    .filter(num => num && num.toUpperCase().startsWith(prefix))
    .map(num => {
      const match = num.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });
  
  const maxNumber = samePrefixNumbers.length > 0 
    ? Math.max(...samePrefixNumbers) 
    : 0;
  const nextNumber = maxNumber + 1;
  const paddedNumber = nextNumber.toString().padStart(3, '0');
  
  return `${prefix}${paddedNumber}`;
}

function generateClientNumber(existingNumbers: string[]): string {
  const prefix = 'CL';
  
  const samePrefixNumbers = existingNumbers
    .filter(num => num && num.toUpperCase().startsWith(prefix))
    .map(num => {
      const match = num.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });
  
  const maxNumber = samePrefixNumbers.length > 0 
    ? Math.max(...samePrefixNumbers) 
    : 0;
  const nextNumber = maxNumber + 1;
  const paddedNumber = nextNumber.toString().padStart(3, '0');
  
  return `${prefix}${paddedNumber}`;
}

async function populateUniqueNumbers() {
  try {
    console.log('🔄 기존 데이터에 고유 번호 추가 중...\n');

    // 환경 변수 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.');
    }

    if (!dbPassword) {
      throw new Error('DATABASE_PASSWORD 환경 변수가 설정되지 않았습니다.');
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('프로젝트 참조를 찾을 수 없습니다.');
    }

    console.log('📦 프로젝트:', projectRef);
    console.log('📋 Supabase URL:', supabaseUrl);
    console.log('');

    // PostgreSQL 연결
    const regions = ['us-east-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];
    let client: Client | null = null;

    for (const region of regions) {
      try {
        console.log(`🔌 ${region} 지역 pooler 연결 시도...`);

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
        console.log(`✅ ${region} 지역 연결 성공!\n`);
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
        continue;
      }
    }

    if (!client) {
      throw new Error('데이터베이스 연결에 실패했습니다.');
    }

    // 1. 먼저 마이그레이션 실행 (컬럼이 없으면 추가)
    console.log('📝 마이그레이션 확인 중...');
    try {
      await client.query(`
        ALTER TABLE instruments
        ADD COLUMN IF NOT EXISTS serial_number TEXT;
      `);
      console.log('✅ instruments.serial_number 컬럼 확인 완료');

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_serial_number 
        ON instruments(serial_number) 
        WHERE serial_number IS NOT NULL;
      `);
      console.log('✅ instruments.serial_number 인덱스 확인 완료');

      await client.query(`
        ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS client_number TEXT;
      `);
      console.log('✅ clients.client_number 컬럼 확인 완료');

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_client_number 
        ON clients(client_number) 
        WHERE client_number IS NOT NULL;
      `);
      console.log('✅ clients.client_number 인덱스 확인 완료\n');
    } catch (error) {
      console.log('⚠️  마이그레이션 실행 중 오류 (이미 존재할 수 있음):', error instanceof Error ? error.message : String(error));
    }

    // 2. 기존 클라이언트 번호 가져오기
    console.log('📊 기존 데이터 조회 중...');
    const clientsResult = await client.query(`
      SELECT id, client_number 
      FROM clients 
      ORDER BY created_at ASC
    `);
    const clientsData = clientsResult.rows;
    console.log(`✅ ${clientsData.length}개의 클라이언트 발견`);

    const existingClientNumbers = clientsData
      .map(c => c.client_number)
      .filter((num): num is string => num !== null && num !== undefined);

    // 3. 기존 악기 번호 가져오기
    const instrumentsResult = await client.query(`
      SELECT id, type, serial_number 
      FROM instruments 
      ORDER BY created_at ASC
    `);
    const instrumentsData = instrumentsResult.rows;
    console.log(`✅ ${instrumentsData.length}개의 악기 발견\n`);

    const existingSerialNumbers = instrumentsData
      .map(i => i.serial_number)
      .filter((num): num is string => num !== null && num !== undefined);

    // 4. 클라이언트 번호 생성 및 업데이트
    console.log('🔢 클라이언트 번호 생성 중...');
    let clientUpdated = 0;
    for (const clientRecord of clientsData) {
      if (!clientRecord.client_number) {
        const newNumber = generateClientNumber(existingClientNumbers);
        existingClientNumbers.push(newNumber);
        
        await client.query(
          `UPDATE clients SET client_number = $1 WHERE id = $2`,
          [newNumber, clientRecord.id]
        );
        clientUpdated++;
        console.log(`  ✓ ${clientRecord.id.substring(0, 8)}... → ${newNumber}`);
      }
    }
    console.log(`✅ ${clientUpdated}개의 클라이언트 번호 생성 완료\n`);

    // 5. 악기 번호 생성 및 업데이트
    console.log('🔢 악기 번호 생성 중...');
    let instrumentUpdated = 0;
    for (const instrumentRecord of instrumentsData) {
      if (!instrumentRecord.serial_number) {
        const newNumber = generateInstrumentSerialNumber(
          instrumentRecord.type,
          existingSerialNumbers
        );
        existingSerialNumbers.push(newNumber);
        
        await client.query(
          `UPDATE instruments SET serial_number = $1 WHERE id = $2`,
          [newNumber, instrumentRecord.id]
        );
        instrumentUpdated++;
        console.log(`  ✓ ${instrumentRecord.id.substring(0, 8)}... (${instrumentRecord.type || 'N/A'}) → ${newNumber}`);
      }
    }
    console.log(`✅ ${instrumentUpdated}개의 악기 번호 생성 완료\n`);

    // 6. 결과 요약
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 고유 번호 추가 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 클라이언트: ${clientUpdated}개 번호 생성`);
    console.log(`📊 악기: ${instrumentUpdated}개 번호 생성`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ 오류:', errorMessage);
    process.exit(1);
  }
}

// 실행
populateUniqueNumbers().catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

