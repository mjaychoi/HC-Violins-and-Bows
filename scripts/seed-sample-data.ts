/**
 * 예시 데이터 생성 스크립트
 *
 * 이 스크립트는 Supabase 데이터베이스에 테스트용 예시 데이터를 생성합니다.
 * - 클라이언트 (50명)
 * - 악기 (100개)
 * - 클라이언트-악기 관계 (150개)
 * - 유지보수 작업 (200개)
 * - 판매 이력 (30개)
 *
 * 실행: npm run seed:data
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { logError, logInfo } from '@/utils/logger';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

// 샘플 데이터
const sampleClients = [
  {
    first_name: 'Julie',
    last_name: 'Chung',
    email: 'julie.chung@example.com',
    contact_number: '010-1234-5678',
    tags: ['Owner', 'Musician'],
    interest: 'Active',
  },
  {
    first_name: 'Michael',
    last_name: 'Kim',
    email: 'michael.kim@example.com',
    contact_number: '010-2345-6789',
    tags: ['Dealer'],
    interest: 'Active',
  },
  {
    first_name: 'Sarah',
    last_name: 'Park',
    email: 'sarah.park@example.com',
    contact_number: '010-3456-7890',
    tags: ['Collector'],
    interest: 'Passive',
  },
  {
    first_name: 'David',
    last_name: 'Lee',
    email: 'david.lee@example.com',
    contact_number: '010-4567-8901',
    tags: ['Owner'],
    interest: null,
  },
  {
    first_name: 'Emily',
    last_name: 'Yoon',
    email: 'emily.yoon@example.com',
    contact_number: '010-5678-9012',
    tags: ['Musician'],
    interest: 'Active',
  },
  {
    first_name: 'James',
    last_name: 'Jung',
    email: 'james.jung@example.com',
    contact_number: '010-6789-0123',
    tags: ['Dealer', 'Collector'],
    interest: 'Active',
  },
  {
    first_name: 'Lisa',
    last_name: 'Han',
    email: 'lisa.han@example.com',
    contact_number: '010-7890-1234',
    tags: ['Owner'],
    interest: null,
  },
  {
    first_name: 'Robert',
    last_name: 'Choi',
    email: 'robert.choi@example.com',
    contact_number: '010-8901-2345',
    tags: ['Musician'],
    interest: 'Active',
  },
  {
    first_name: 'Anna',
    last_name: 'Kang',
    email: 'anna.kang@example.com',
    contact_number: '010-9012-3456',
    tags: ['Collector'],
    interest: 'Passive',
  },
  {
    first_name: 'Tom',
    last_name: 'Shin',
    email: 'tom.shin@example.com',
    contact_number: '010-0123-4567',
    tags: ['Dealer'],
    interest: 'Active',
  },
];

const sampleInstruments = [
  {
    type: 'Violin',
    maker: 'Stradivarius',
    year: 1720,
    status: 'Available',
    price: 5000000,
    certificate: true,
    ownership: 'Julie Chung',
  },
  {
    type: 'Violin',
    maker: 'Guarneri',
    year: 1740,
    status: 'Booked',
    price: 3000000,
    certificate: true,
    ownership: 'Michael Kim',
  },
  {
    type: 'Viola',
    maker: 'Amati',
    year: 1680,
    status: 'Available',
    price: 2000000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Cello',
    maker: 'Montagnana',
    year: 1750,
    status: 'Sold',
    price: 8000000,
    certificate: true,
    ownership: 'Sarah Park',
  },
  {
    type: 'Violin',
    maker: 'Bergonzi',
    year: 1730,
    status: 'Reserved',
    price: 4000000,
    certificate: true,
    ownership: 'David Lee',
  },
  {
    type: 'Bow',
    maker: 'Tourte',
    year: 1800,
    status: 'Available',
    price: 500000,
    certificate: false,
    ownership: null,
  },
  {
    type: 'Violin',
    maker: 'Gagliano',
    year: 1760,
    status: 'Maintenance',
    price: 1500000,
    certificate: true,
    ownership: 'Emily Yoon',
  },
  {
    type: 'Viola',
    maker: 'Guadagnini',
    year: 1780,
    status: 'Available',
    price: 2500000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Cello',
    maker: 'Ruggeri',
    year: 1700,
    status: 'Booked',
    price: 6000000,
    certificate: true,
    ownership: 'James Jung',
  },
  {
    type: 'Violin',
    maker: 'Storioni',
    year: 1790,
    status: 'Available',
    price: 1800000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Bow',
    maker: 'Pecatte',
    year: 1850,
    status: 'Available',
    price: 300000,
    certificate: false,
    ownership: 'Lisa Han',
  },
  {
    type: 'Violin',
    maker: 'Pressenda',
    year: 1820,
    status: 'Available',
    price: 1200000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Viola',
    maker: 'Rocca',
    year: 1900,
    status: 'Booked',
    price: 800000,
    certificate: false,
    ownership: 'Robert Choi',
  },
  {
    type: 'Cello',
    maker: 'Goffriller',
    year: 1720,
    status: 'Available',
    price: 7000000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Violin',
    maker: 'Vuillaume',
    year: 1860,
    status: 'Reserved',
    price: 1000000,
    certificate: true,
    ownership: 'Anna Kang',
  },
  {
    type: 'Bow',
    maker: 'Sartory',
    year: 1920,
    status: 'Available',
    price: 400000,
    certificate: false,
    ownership: null,
  },
  {
    type: 'Violin',
    maker: 'Landolfi',
    year: 1750,
    status: 'Available',
    price: 2200000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Viola',
    maker: 'Testore',
    year: 1730,
    status: 'Maintenance',
    price: 1500000,
    certificate: true,
    ownership: 'Tom Shin',
  },
  {
    type: 'Cello',
    maker: 'Cremonese',
    year: 1690,
    status: 'Available',
    price: 5500000,
    certificate: true,
    ownership: null,
  },
  {
    type: 'Bow',
    maker: 'Lamy',
    year: 1880,
    status: 'Available',
    price: 350000,
    certificate: false,
    ownership: null,
  },
];

const sampleTaskTypes = [
  'repair',
  'rehair',
  'maintenance',
  'inspection',
  'setup',
  'adjustment',
  'restoration',
] as const;
const sampleStatuses = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
] as const;
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
    logInfo('🌱 예시 데이터 생성 시작...\n');

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
        if (client) {
          try {
            await client.end();
          } catch {
            // ignore
          }
          client = null;
        }
        logError(
          '⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n',
          undefined,
          'seedSampleData'
        );
        continue;
      }
    }

    if (!client) {
      throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
    }

    // 1. 기존 데이터 확인
    logInfo('📊 기존 데이터 확인 중...', 'seedSampleData');
    const existingClients = await client.query(
      'SELECT COUNT(*) as count FROM clients'
    );
    const existingInstruments = await client.query(
      'SELECT COUNT(*) as count FROM instruments'
    );
    const existingTasks = await client.query(
      'SELECT COUNT(*) as count FROM maintenance_tasks'
    );

    logInfo(
      `  • 클라이언트: ${existingClients.rows[0].count}개`,
      'seedSampleData'
    );
    logInfo(
      `  • 악기: ${existingInstruments.rows[0].count}개`,
      'seedSampleData'
    );
    logInfo(`  • 작업: ${existingTasks.rows[0].count}개\n`, 'seedSampleData');

    // 2. 기존 클라이언트 번호 가져오기
    logInfo('📋 기존 클라이언트 번호 확인 중...', 'seedSampleData');
    const existingClientsResult = await client.query(
      'SELECT client_number FROM clients WHERE client_number IS NOT NULL'
    );
    const existingClientNumbers = existingClientsResult.rows.map(
      r => r.client_number
    );
    logInfo(`  • 기존 클라이언트 번호: ${existingClientNumbers.length}개\n`);

    // 3. 클라이언트 생성
    logInfo('👥 클라이언트 생성 중...', 'seedSampleData');
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
      const maxNumber =
        samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
      const nextNumber = maxNumber + 1;
      return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
    }

    // 샘플 클라이언트를 기반으로 더 많은 클라이언트 생성 (50개)
    const firstNames = [
      'James',
      'Mary',
      'John',
      'Patricia',
      'Robert',
      'Jennifer',
      'Michael',
      'Linda',
      'William',
      'Elizabeth',
      'David',
      'Barbara',
      'Richard',
      'Susan',
      'Joseph',
      'Jessica',
      'Thomas',
      'Sarah',
      'Charles',
      'Karen',
      'Christopher',
      'Nancy',
      'Daniel',
      'Lisa',
      'Matthew',
      'Betty',
      'Anthony',
      'Margaret',
      'Mark',
      'Sandra',
      'Donald',
      'Ashley',
      'Steven',
      'Kimberly',
      'Paul',
      'Emily',
      'Andrew',
      'Donna',
      'Joshua',
      'Michelle',
      'Kenneth',
      'Carol',
      'Kevin',
      'Amanda',
      'Brian',
      'Dorothy',
      'George',
      'Melissa',
      'Edward',
      'Deborah',
    ];
    const lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
      'Hernandez',
      'Lopez',
      'Wilson',
      'Anderson',
      'Thomas',
      'Taylor',
      'Moore',
      'Jackson',
      'Martin',
      'Lee',
      'Thompson',
      'White',
      'Harris',
      'Sanchez',
      'Clark',
      'Ramirez',
      'Lewis',
      'Robinson',
      'Walker',
      'Young',
      'Allen',
      'King',
      'Wright',
      'Scott',
      'Torres',
      'Nguyen',
      'Hill',
      'Flores',
      'Green',
      'Adams',
      'Nelson',
      'Baker',
      'Hall',
      'Rivera',
      'Campbell',
      'Mitchell',
      'Carter',
      'Roberts',
      'Gomez',
      'Phillips',
    ];
    const tagsOptions = [
      ['Owner'],
      ['Musician'],
      ['Dealer'],
      ['Collector'],
      ['Owner', 'Musician'],
      ['Dealer', 'Collector'],
      ['Owner', 'Dealer'],
    ];
    const interestOptions = ['Active', 'Passive', null];

    // 기존 이메일 확인
    const existingEmailsResult = await client.query(
      'SELECT email FROM clients WHERE email IS NOT NULL'
    );
    const existingEmails = new Set(
      existingEmailsResult.rows.map(r => r.email?.toLowerCase())
    );

    // 기존 샘플 클라이언트 먼저 생성
    // 클라이언트 이름 -> ID 매핑 (나중에 악기의 ownership 변환에 사용)
    const clientNameToIdMap = new Map<string, string>();

    for (const clientData of sampleClients) {
      // 이메일 중복 체크 - 이미 존재하는 경우 기존 클라이언트 ID 조회
      if (existingEmails.has(clientData.email.toLowerCase())) {
        logInfo(
          `  ⚠️  ${clientData.first_name} ${clientData.last_name} - 이메일 중복으로 스킵 (${clientData.email})`
        );
        // 기존 클라이언트 ID 조회하여 매핑에 추가
        const existingClientResult = await client.query(
          'SELECT id FROM clients WHERE email = $1',
          [clientData.email]
        );
        if (existingClientResult.rows.length > 0) {
          const fullName = `${clientData.first_name} ${clientData.last_name}`;
          clientNameToIdMap.set(fullName, existingClientResult.rows[0].id);
        }
        continue;
      }

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
      const clientId = result.rows[0].id;
      clientIds.push(clientId);
      existingEmails.add(clientData.email.toLowerCase());

      // 클라이언트 이름 -> ID 매핑 추가
      const fullName = `${clientData.first_name} ${clientData.last_name}`;
      clientNameToIdMap.set(fullName, clientId);

      logInfo(
        `  ✓ ${clientData.first_name} ${clientData.last_name} (${clientNumber})`
      );
    }

    // 추가 클라이언트 생성 (총 50개)
    for (let i = sampleClients.length; clientIds.length < 50; i++) {
      const allClientNumbers = [...existingClientNumbers, ...newClientNumbers];
      const clientNumber = generateClientNumber(allClientNumbers);
      newClientNumbers.push(clientNumber);

      const firstName = getRandomElement(firstNames);
      const lastName = getRandomElement(lastNames);
      // 고유한 이메일 생성 (중복 방지)
      let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
      let emailAttempts = 0;
      while (existingEmails.has(email.toLowerCase()) && emailAttempts < 10) {
        email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}${emailAttempts}@example.com`;
        emailAttempts++;
      }

      if (existingEmails.has(email.toLowerCase())) {
        logInfo(`  ⚠️  이메일 생성 실패, 다음 클라이언트로 건너뜀`);
        continue;
      }

      const contactNumber = `010-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      const tags = getRandomElement(tagsOptions);
      const interest = getRandomElement(interestOptions);

      const result = await client.query(
        `INSERT INTO clients (first_name, last_name, email, contact_number, tags, interest, client_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          firstName,
          lastName,
          email,
          contactNumber,
          tags,
          interest,
          clientNumber,
        ]
      );
      clientIds.push(result.rows[0].id);
      existingEmails.add(email.toLowerCase());
      logInfo(`  ✓ ${firstName} ${lastName} (${clientNumber})`);
    }
    logInfo(
      `✅ ${clientIds.length}개의 클라이언트 생성 완료\n`,
      'seedSampleData'
    );

    // 4. 기존 악기 번호 가져오기
    logInfo('📋 기존 악기 번호 확인 중...', 'seedSampleData');
    const existingInstrumentsResult = await client.query(
      'SELECT serial_number FROM instruments WHERE serial_number IS NOT NULL'
    );
    const existingSerialNumbers = existingInstrumentsResult.rows.map(
      r => r.serial_number
    );
    logInfo(
      `  • 기존 악기 번호: ${existingSerialNumbers.length}개\n`,
      'seedSampleData'
    );

    // 5. 악기 생성
    logInfo('🎻 악기 생성 중...', 'seedSampleData');
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
      const maxNumber =
        samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
      const nextNumber = maxNumber + 1;
      // 애플리케이션과 동일하게 7자리 숫자 사용 (예: VI0000001)
      return `${prefix}${nextNumber.toString().padStart(7, '0')}`;
    }

    // 기존 샘플 악기 먼저 생성
    for (const instrumentData of sampleInstruments) {
      // Generate unique serial number
      const allSerialNumbers = [...existingSerialNumbers, ...newSerialNumbers];
      const serialNumber = generateInstrumentSerialNumber(
        instrumentData.type,
        allSerialNumbers
      );
      newSerialNumbers.push(serialNumber);

      // Convert ownership from client name to client ID (UUID)
      let ownershipValue = instrumentData.ownership;
      if (ownershipValue && typeof ownershipValue === 'string') {
        const clientId = clientNameToIdMap.get(ownershipValue);
        if (clientId) {
          ownershipValue = clientId;
        } else {
          // If client name not found, set to null or keep as string?
          // Setting to null for consistency - ownership should be UUID or null
          logInfo(
            `  ⚠️  클라이언트 이름 "${ownershipValue}"을 찾을 수 없어 ownership을 null로 설정`
          );
          ownershipValue = null;
        }
      }

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
          ownershipValue,
          serialNumber,
        ]
      );
      instrumentIds.push(result.rows[0].id);
      logInfo(
        `  ✓ ${instrumentData.type} - ${instrumentData.maker} (${serialNumber})`
      );
    }

    // 추가 악기 생성 (총 100개)
    const instrumentTypes = ['Violin', 'Viola', 'Cello', 'Bow'];
    const makers = [
      'Stradivarius',
      'Guarneri',
      'Amati',
      'Montagnana',
      'Bergonzi',
      'Tourte',
      'Gagliano',
      'Guadagnini',
      'Ruggeri',
      'Storioni',
      'Pecatte',
      'Pressenda',
      'Rocca',
      'Goffriller',
      'Vuillaume',
      'Sartory',
      'Landolfi',
      'Testore',
      'Cremonese',
      'Lamy',
      'Dodd',
      'Hill',
      'Voirin',
      'Persoit',
      'Lupot',
      'Chanot',
      'Silvestre',
      'Panormo',
      'Forster',
      'Stainer',
    ];
    const statuses = ['Available', 'Booked', 'Sold', 'Reserved', 'Maintenance'];
    const ownershipOptions = [...clientIds.map(id => id), null];

    for (let i = sampleInstruments.length; i < 100; i++) {
      const allSerialNumbers = [...existingSerialNumbers, ...newSerialNumbers];
      const type = getRandomElement(instrumentTypes);
      const serialNumber = generateInstrumentSerialNumber(
        type,
        allSerialNumbers
      );
      newSerialNumbers.push(serialNumber);

      const maker = getRandomElement(makers);
      const year = getRandomInt(1650, 1950);
      const status = getRandomElement(statuses);
      const price = getRandomInt(100000, 10000000);
      const certificate = Math.random() > 0.3; // 70% 확률로 인증서 있음
      const ownership =
        status === 'Sold' || status === 'Booked' || status === 'Reserved'
          ? getRandomElement(ownershipOptions)
          : null;

      const result = await client.query(
        `INSERT INTO instruments (type, maker, year, status, price, certificate, ownership, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [type, maker, year, status, price, certificate, ownership, serialNumber]
      );
      instrumentIds.push(result.rows[0].id);
      logInfo(`  ✓ ${type} - ${maker} (${serialNumber})`);
    }
    logInfo(
      `✅ ${instrumentIds.length}개의 악기 생성 완료\n`,
      'seedSampleData'
    );

    // 6. 클라이언트-악기 관계 생성
    logInfo('🔗 클라이언트-악기 관계 생성 중...', 'seedSampleData');
    const relationshipTypes = ['Interested', 'Sold', 'Booked', 'Owned'];
    let relationshipCount = 0;

    // 더 많은 관계 생성 (150개)
    for (let i = 0; i < 150; i++) {
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
    logInfo(`✅ ${relationshipCount}개의 관계 생성 완료\n`, 'seedSampleData');

    // 7. 유지보수 작업 생성
    logInfo('🔧 유지보수 작업 생성 중...', 'seedSampleData');
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
    // 더 많은 작업 생성 (200개)
    for (let i = 0; i < 200; i++) {
      const instrumentId = getRandomElement(instrumentIds);
      const clientId = Math.random() > 0.3 ? getRandomElement(clientIds) : null; // 70% 확률로 클라이언트 연결
      const taskType = getRandomElement([...sampleTaskTypes]);
      const status = getRandomElement([...sampleStatuses]);
      const priority = getRandomElement([...samplePriorities]);
      const title = taskTitles[i % taskTitles.length];

      const receivedDate = getRandomDate(threeMonthsAgo, now);
      const dueDate =
        status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const personalDueDate =
        status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const scheduledDate =
        status === 'completed' ? null : getRandomDate(now, threeMonthsLater);
      const completedDate =
        status === 'completed'
          ? getRandomDate(new Date(receivedDate), now)
          : null;

      const estimatedHours = getRandomInt(1, 8);
      const actualHours =
        status === 'completed'
          ? getRandomInt(estimatedHours - 2, estimatedHours + 3)
          : null;
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
      logInfo(`  ✓ ${title} (${status}, ${priority})`, 'seedSampleData');
    }
    logInfo(`✅ ${taskCount}개의 작업 생성 완료\n`, 'seedSampleData');

    // 8. 판매 이력 생성
    logInfo('💰 판매 이력 생성 중...', 'seedSampleData');
    let salesCount = 0;
    // 더 많은 판매 이력 생성 (30개)
    for (let i = 0; i < 30; i++) {
      const instrumentId = getRandomElement(instrumentIds);
      const clientId = getRandomElement(clientIds);
      const salePrice = getRandomInt(1000000, 10000000);
      const saleDate = getRandomDate(threeMonthsAgo, now);

      await client.query(
        `INSERT INTO sales_history (instrument_id, client_id, sale_price, sale_date, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [instrumentId, clientId, salePrice, saleDate, `판매 완료: ${saleDate}`]
      );
      salesCount++;
      logInfo(
        `  ✓ 판매: ${salePrice.toLocaleString()}원 (${saleDate})`,
        'seedSampleData'
      );
    }
    logInfo(`✅ ${salesCount}개의 판매 이력 생성 완료\n`, 'seedSampleData');

    // 7. 최종 통계
    logInfo(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'seedSampleData'
    );
    logInfo('✅ 예시 데이터 생성 완료!', 'seedSampleData');
    logInfo(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'seedSampleData'
    );
    logInfo(`📊 생성된 데이터:`, 'seedSampleData');
    logInfo(`  • 클라이언트: ${clientIds.length}개`, 'seedSampleData');
    logInfo(`  • 악기: ${instrumentIds.length}개`, 'seedSampleData');
    logInfo(
      `  • 클라이언트-악기 관계: ${relationshipCount}개`,
      'seedSampleData'
    );
    logInfo(`  • 유지보수 작업: ${taskCount}개`, 'seedSampleData');
    logInfo(`  • 판매 이력: ${salesCount}개`, 'seedSampleData');
    logInfo(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
      'seedSampleData'
    );
  } catch (error) {
    logError('❌ 에러 발생:', error, 'seedSampleData');
    if (error instanceof Error) {
      logError('   메시지:', error.message, 'seedSampleData');
      logError('   스택:', error.stack, 'seedSampleData');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

seedSampleData().catch(error => {
  logError('❌ 에러:', error, 'seedSampleData');
  process.exit(1);
});

export { seedSampleData };
