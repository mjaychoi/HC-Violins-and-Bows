/**
 * 예시 데이터 생성 스크립트
 * 
 * 이 스크립트는 Supabase 데이터베이스에 테스트용 예시 데이터를 생성합니다.
 * - 클라이언트 (10명)
 * - 악기 (20개)
 * - 클라이언트-악기 관계 (15개)
 * - 유지보수 작업 (30개)
 * - 판매 이력 (5개)
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

// 샘플 데이터
const sampleClients = [
  { first_name: 'Julie', last_name: 'Chung', email: 'julie.chung@example.com', contact_number: '010-1234-5678', tags: ['Owner', 'Musician'], interest: 'Active' },
  { first_name: 'Michael', last_name: 'Kim', email: 'michael.kim@example.com', contact_number: '010-2345-6789', tags: ['Dealer'], interest: 'Active' },
  { first_name: 'Sarah', last_name: 'Park', email: 'sarah.park@example.com', contact_number: '010-3456-7890', tags: ['Collector'], interest: 'Passive' },
  { first_name: 'David', last_name: 'Lee', email: 'david.lee@example.com', contact_number: '010-4567-8901', tags: ['Owner'], interest: null },
  { first_name: 'Emily', last_name: 'Yoon', email: 'emily.yoon@example.com', contact_number: '010-5678-9012', tags: ['Musician'], interest: 'Active' },
  { first_name: 'James', last_name: 'Jung', email: 'james.jung@example.com', contact_number: '010-6789-0123', tags: ['Dealer', 'Collector'], interest: 'Active' },
  { first_name: 'Lisa', last_name: 'Han', email: 'lisa.han@example.com', contact_number: '010-7890-1234', tags: ['Owner'], interest: null },
  { first_name: 'Robert', last_name: 'Choi', email: 'robert.choi@example.com', contact_number: '010-8901-2345', tags: ['Musician'], interest: 'Active' },
  { first_name: 'Anna', last_name: 'Kang', email: 'anna.kang@example.com', contact_number: '010-9012-3456', tags: ['Collector'], interest: 'Passive' },
  { first_name: 'Tom', last_name: 'Shin', email: 'tom.shin@example.com', contact_number: '010-0123-4567', tags: ['Dealer'], interest: 'Active' },
];

const sampleInstruments = [
  { type: 'Violin', maker: 'Stradivarius', year: 1720, status: 'Available', price: 5000000, certificate: true, ownership: 'Julie Chung' },
  { type: 'Violin', maker: 'Guarneri', year: 1740, status: 'Booked', price: 3000000, certificate: true, ownership: 'Michael Kim' },
  { type: 'Viola', maker: 'Amati', year: 1680, status: 'Available', price: 2000000, certificate: true, ownership: null },
  { type: 'Cello', maker: 'Montagnana', year: 1750, status: 'Sold', price: 8000000, certificate: true, ownership: 'Sarah Park' },
  { type: 'Violin', maker: 'Bergonzi', year: 1730, status: 'Reserved', price: 4000000, certificate: true, ownership: 'David Lee' },
  { type: 'Bow', maker: 'Tourte', year: 1800, status: 'Available', price: 500000, certificate: false, ownership: null },
  { type: 'Violin', maker: 'Gagliano', year: 1760, status: 'Maintenance', price: 1500000, certificate: true, ownership: 'Emily Yoon' },
  { type: 'Viola', maker: 'Guadagnini', year: 1780, status: 'Available', price: 2500000, certificate: true, ownership: null },
  { type: 'Cello', maker: 'Ruggeri', year: 1700, status: 'Booked', price: 6000000, certificate: true, ownership: 'James Jung' },
  { type: 'Violin', maker: 'Storioni', year: 1790, status: 'Available', price: 1800000, certificate: true, ownership: null },
  { type: 'Bow', maker: 'Pecatte', year: 1850, status: 'Available', price: 300000, certificate: false, ownership: 'Lisa Han' },
  { type: 'Violin', maker: 'Pressenda', year: 1820, status: 'Available', price: 1200000, certificate: true, ownership: null },
  { type: 'Viola', maker: 'Rocca', year: 1900, status: 'Booked', price: 800000, certificate: false, ownership: 'Robert Choi' },
  { type: 'Cello', maker: 'Goffriller', year: 1720, status: 'Available', price: 7000000, certificate: true, ownership: null },
  { type: 'Violin', maker: 'Vuillaume', year: 1860, status: 'Reserved', price: 1000000, certificate: true, ownership: 'Anna Kang' },
  { type: 'Bow', maker: 'Sartory', year: 1920, status: 'Available', price: 400000, certificate: false, ownership: null },
  { type: 'Violin', maker: 'Landolfi', year: 1750, status: 'Available', price: 2200000, certificate: true, ownership: null },
  { type: 'Viola', maker: 'Testore', year: 1730, status: 'Maintenance', price: 1500000, certificate: true, ownership: 'Tom Shin' },
  { type: 'Cello', maker: 'Cremonese', year: 1690, status: 'Available', price: 5500000, certificate: true, ownership: null },
  { type: 'Bow', maker: 'Lamy', year: 1880, status: 'Available', price: 350000, certificate: false, ownership: null },
];

const sampleTaskTypes = ['repair', 'rehair', 'maintenance', 'inspection', 'setup', 'adjustment', 'restoration'] as const;
const sampleStatuses = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
const samplePriorities = ['low', 'medium', 'high', 'urgent'] as const;

function getRandomDate(start: Date, end: Date): string {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const randomTime = startTime + Math.random() * (endTime - startTime);
  return new Date(randomTime).toISOString().split('T')[0];
}

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedSampleData() {
  let client: Client | null = null;

  try {
    console.log('🌱 예시 데이터 생성 시작...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const dbPassword = process.env.DATABASE_PASSWORD;

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다.');
    }

    if (!dbPassword) {
      throw new Error('DATABASE_PASSWORD 환경 변수가 설정되지 않았습니다.');
    }

    // Extract project reference from URL
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('Supabase URL에서 프로젝트 참조를 추출할 수 없습니다.');
    }

    // Connect to database
    const regions = ['us-east-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];
    
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
        console.log(`⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n`);
        continue;
      }
    }

    if (!client) {
      throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
    }

    // 1. 기존 데이터 확인
    console.log('📊 기존 데이터 확인 중...');
    const existingClients = await client.query('SELECT COUNT(*) as count FROM clients');
    const existingInstruments = await client.query('SELECT COUNT(*) as count FROM instruments');
    const existingTasks = await client.query('SELECT COUNT(*) as count FROM maintenance_tasks');
    
    console.log(`  • 클라이언트: ${existingClients.rows[0].count}개`);
    console.log(`  • 악기: ${existingInstruments.rows[0].count}개`);
    console.log(`  • 작업: ${existingTasks.rows[0].count}개\n`);

    // 2. 기존 클라이언트 번호 가져오기
    console.log('📋 기존 클라이언트 번호 확인 중...');
    const existingClientsResult = await client.query(
      'SELECT client_number FROM clients WHERE client_number IS NOT NULL'
    );
    const existingClientNumbers = existingClientsResult.rows.map(r => r.client_number);
    console.log(`  • 기존 클라이언트 번호: ${existingClientNumbers.length}개\n`);

    // 3. 클라이언트 생성
    console.log('👥 클라이언트 생성 중...');
    const clientIds: string[] = [];
    const newClientNumbers: string[] = [];

    function generateClientNumber(existing: string[]): string {
      const prefix = 'CL';
      const samePrefixNumbers = existing
        .filter(num => num && num.toUpperCase().startsWith(prefix))
        .map(num => {
          const match = num.match(/\d+$/);
          return match ? parseInt(match[0], 10) : 0;
        });
      const maxNumber = samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
      const nextNumber = maxNumber + 1;
      return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
    }

    for (const clientData of sampleClients) {
      // Generate unique client number
      const allClientNumbers = [...existingClientNumbers, ...newClientNumbers];
      const clientNumber = generateClientNumber(allClientNumbers);
      newClientNumbers.push(clientNumber);

      const result = await client.query(
        `INSERT INTO clients (first_name, last_name, email, contact_number, tags, interest, client_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          clientData.first_name,
          clientData.last_name,
          clientData.email,
          clientData.contact_number,
          clientData.tags,
          clientData.interest,
          clientNumber,
        ]
      );
      clientIds.push(result.rows[0].id);
      console.log(`  ✓ ${clientData.first_name} ${clientData.last_name} (${clientNumber})`);
    }
    console.log(`✅ ${clientIds.length}개의 클라이언트 생성 완료\n`);

    // 4. 기존 악기 번호 가져오기
    console.log('📋 기존 악기 번호 확인 중...');
    const existingInstrumentsResult = await client.query(
      'SELECT serial_number FROM instruments WHERE serial_number IS NOT NULL'
    );
    const existingSerialNumbers = existingInstrumentsResult.rows.map(r => r.serial_number);
    console.log(`  • 기존 악기 번호: ${existingSerialNumbers.length}개\n`);

    // 5. 악기 생성
    console.log('🎻 악기 생성 중...');
    const instrumentIds: string[] = [];
    const newSerialNumbers: string[] = [];

    function getInstrumentPrefix(type: string | null): string {
      if (!type) return 'IN';
      const normalizedType = type.toLowerCase().trim();
      if (normalizedType.includes('violin')) return 'VI';
      if (normalizedType.includes('viola')) return 'VA';
      if (normalizedType.includes('cello')) return 'CE';
      if (normalizedType.includes('bow')) return 'BO';
      return 'IN';
    }

    function generateInstrumentSerialNumber(
      type: string | null,
      existing: string[]
    ): string {
      const prefix = getInstrumentPrefix(type);
      const samePrefixNumbers = existing
        .filter(num => num && num.toUpperCase().startsWith(prefix))
        .map(num => {
          const match = num.match(/\d+$/);
          return match ? parseInt(match[0], 10) : 0;
        });
      const maxNumber = samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
      const nextNumber = maxNumber + 1;
      return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
    }

    for (const instrumentData of sampleInstruments) {
      // Generate unique serial number
      const allSerialNumbers = [...existingSerialNumbers, ...newSerialNumbers];
      const serialNumber = generateInstrumentSerialNumber(instrumentData.type, allSerialNumbers);
      newSerialNumbers.push(serialNumber);

      const result = await client.query(
        `INSERT INTO instruments (type, maker, year, status, price, certificate, ownership, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          instrumentData.type,
          instrumentData.maker,
          instrumentData.year,
          instrumentData.status,
          instrumentData.price,
          instrumentData.certificate,
          instrumentData.ownership,
          serialNumber,
        ]
      );
      instrumentIds.push(result.rows[0].id);
      console.log(`  ✓ ${instrumentData.type} - ${instrumentData.maker} (${serialNumber})`);
    }
    console.log(`✅ ${instrumentIds.length}개의 악기 생성 완료\n`);

    // 6. 클라이언트-악기 관계 생성
    console.log('🔗 클라이언트-악기 관계 생성 중...');
    const relationshipTypes = ['Interested', 'Sold', 'Booked', 'Owned'];
    let relationshipCount = 0;

    for (let i = 0; i < 15; i++) {
      const clientId = getRandomElement(clientIds);
      const instrumentId = getRandomElement(instrumentIds);
      const relationshipType = getRandomElement(relationshipTypes);

      // Check if relationship already exists
      const existing = await client.query(
        'SELECT id FROM client_instruments WHERE client_id = $1 AND instrument_id = $2',
        [clientId, instrumentId]
      );

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO client_instruments (client_id, instrument_id, relationship_type)
           VALUES ($1, $2, $3)`,
          [clientId, instrumentId, relationshipType]
        );
        relationshipCount++;
      }
    }
    console.log(`✅ ${relationshipCount}개의 관계 생성 완료\n`);

    // 7. 유지보수 작업 생성
    console.log('🔧 유지보수 작업 생성 중...');
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const taskTitles = [
      '바이올린 현 교체',
      '활털 갈기',
      '브릿지 조정',
      '네크 수리',
      '바이올린 전체 점검',
      '첼로 현 교체',
      '활털 교체',
      '바이올린 바니시 수리',
      '사운드 포스트 조정',
      '바이올린 세팅',
      '비올라 현 교체',
      '활털 갈기 및 정리',
      '바이올린 구조 점검',
      '첼로 브릿지 교체',
      '바이올린 네크 수리',
      '활털 교체 및 정리',
      '바이올린 전체 복원',
      '첼로 현 교체 및 조정',
      '바이올린 바니시 복원',
      '활털 갈기 및 교체',
      '바이올린 사운드 포스트 조정',
      '첼로 전체 점검',
      '바이올린 현 교체 및 조정',
      '활털 교체 및 정리',
      '바이올린 브릿지 수리',
      '첼로 바니시 수리',
      '바이올린 네크 조정',
      '활털 갈기 및 교체',
      '바이올린 전체 세팅',
      '첼로 현 교체 및 조정',
    ];

    let taskCount = 0;
    for (let i = 0; i < 30; i++) {
      const instrumentId = getRandomElement(instrumentIds);
      const clientId = Math.random() > 0.3 ? getRandomElement(clientIds) : null; // 70% 확률로 클라이언트 연결
      const taskType = getRandomElement([...sampleTaskTypes]);
      const status = getRandomElement([...sampleStatuses]);
      const priority = getRandomElement([...samplePriorities]);
      const title = taskTitles[i % taskTitles.length];

      const receivedDate = getRandomDate(threeMonthsAgo, now);
      const dueDate = status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const personalDueDate = status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const scheduledDate = status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const completedDate = status === 'completed' ? getRandomDate(new Date(receivedDate), now) : null;

      const estimatedHours = getRandomInt(1, 8);
      const actualHours = status === 'completed' ? getRandomInt(estimatedHours - 2, estimatedHours + 3) : null;
      const cost = status === 'completed' ? getRandomInt(50000, 500000) : null;

      await client.query(
        `INSERT INTO maintenance_tasks (
          instrument_id, client_id, task_type, title, description, status,
          received_date, due_date, personal_due_date, scheduled_date, completed_date,
          priority, estimated_hours, actual_hours, cost, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          instrumentId,
          clientId,
          taskType,
          title,
          `${title}에 대한 상세 설명입니다.`,
          status,
          receivedDate,
          dueDate,
          personalDueDate,
          scheduledDate,
          completedDate,
          priority,
          estimatedHours,
          actualHours,
          cost,
          status === 'completed' ? '작업 완료되었습니다.' : null,
        ]
      );
      taskCount++;
      console.log(`  ✓ ${title} (${status}, ${priority})`);
    }
    console.log(`✅ ${taskCount}개의 작업 생성 완료\n`);

    // 8. 판매 이력 생성
    console.log('💰 판매 이력 생성 중...');
    let salesCount = 0;
    for (let i = 0; i < 5; i++) {
      const instrumentId = getRandomElement(instrumentIds);
      const clientId = getRandomElement(clientIds);
      const salePrice = getRandomInt(1000000, 10000000);
      const saleDate = getRandomDate(threeMonthsAgo, now);

      await client.query(
        `INSERT INTO sales_history (instrument_id, client_id, sale_price, sale_date, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          instrumentId,
          clientId,
          salePrice,
          saleDate,
          `판매 완료: ${saleDate}`,
        ]
      );
      salesCount++;
      console.log(`  ✓ 판매: ${salePrice.toLocaleString()}원 (${saleDate})`);
    }
    console.log(`✅ ${salesCount}개의 판매 이력 생성 완료\n`);

    // 7. 최종 통계
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 예시 데이터 생성 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 생성된 데이터:`);
    console.log(`  • 클라이언트: ${clientIds.length}개`);
    console.log(`  • 악기: ${instrumentIds.length}개`);
    console.log(`  • 클라이언트-악기 관계: ${relationshipCount}개`);
    console.log(`  • 유지보수 작업: ${taskCount}개`);
    console.log(`  • 판매 이력: ${salesCount}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 에러 발생:', error);
    if (error instanceof Error) {
      console.error('   메시지:', error.message);
      console.error('   스택:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

seedSampleData().catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

export { seedSampleData };

