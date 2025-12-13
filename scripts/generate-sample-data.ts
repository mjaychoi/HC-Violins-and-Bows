/**
 * 간단한 샘플 데이터를 생성하여 JSON 파일로 저장합니다.
 * 개발 초기 화면이나 테스트에 사용할 수 있는 더미 데이터입니다.
 *
 * 실행: npm run generate:sample-data
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Client = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_number: string;
  tags: string[];
  interest: 'Active' | 'Passive' | null;
  client_number: string;
};

type Instrument = {
  id: string;
  type: string;
  maker: string;
  year: number;
  status: string;
  price: number;
  certificate: boolean;
  ownership: string | null;
  serial_number: string;
};

type ClientInstrument = {
  client_id: string;
  instrument_id: string;
  relationship_type: 'Interested' | 'Booked' | 'Sold' | 'Owned';
};

type MaintenanceTask = {
  id: string;
  instrument_id: string;
  client_id: string | null;
  task_type: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  received_date: string;
  due_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  estimated_hours: number;
  actual_hours: number | null;
  cost: number | null;
  notes: string | null;
};

type TradeRecord = {
  id: string;
  instrument_id: string;
  client_id: string;
  sale_price: number;
  sale_date: string;
  notes: string;
};

type BaseClientTemplate = {
  first_name: string;
  last_name: string;
  tags: string[];
  interest: Client['interest'];
};

const baseClients: BaseClientTemplate[] = [
  { first_name: 'Julie', last_name: 'Chung', tags: ['Owner', 'Musician'], interest: 'Active' },
  { first_name: 'Michael', last_name: 'Kim', tags: ['Dealer'], interest: 'Active' },
  { first_name: 'Sarah', last_name: 'Park', tags: ['Collector'], interest: 'Passive' },
  { first_name: 'David', last_name: 'Lee', tags: ['Owner'], interest: null },
  { first_name: 'Emily', last_name: 'Yoon', tags: ['Musician'], interest: 'Active' },
  { first_name: 'James', last_name: 'Jung', tags: ['Dealer', 'Collector'], interest: 'Active' },
  { first_name: 'Lisa', last_name: 'Han', tags: ['Owner'], interest: null },
  { first_name: 'Robert', last_name: 'Choi', tags: ['Musician'], interest: 'Active' },
  { first_name: 'Anna', last_name: 'Kang', tags: ['Collector'], interest: 'Passive' },
  { first_name: 'Tom', last_name: 'Shin', tags: ['Dealer'], interest: 'Active' },
];

const baseInstruments = [
  { type: 'Violin', maker: 'Stradivarius', year: 1720, status: 'Available', price: 5000000, certificate: true },
  { type: 'Violin', maker: 'Guarneri', year: 1740, status: 'Booked', price: 3000000, certificate: true },
  { type: 'Viola', maker: 'Amati', year: 1680, status: 'Available', price: 2000000, certificate: true },
  { type: 'Cello', maker: 'Montagnana', year: 1750, status: 'Sold', price: 8000000, certificate: true },
  { type: 'Bow', maker: 'Tourte', year: 1800, status: 'Available', price: 500000, certificate: false },
  { type: 'Violin', maker: 'Gagliano', year: 1760, status: 'Maintenance', price: 1500000, certificate: true },
  { type: 'Viola', maker: 'Guadagnini', year: 1780, status: 'Available', price: 2500000, certificate: true },
  { type: 'Cello', maker: 'Ruggeri', year: 1700, status: 'Booked', price: 6000000, certificate: true },
];

const firstNames = [
  'Hannah',
  'Eunji',
  'Minho',
  'Soohyun',
  'Ryan',
  'Edward',
  'Mina',
  'Noah',
  'Yeseul',
  'Daniel',
  'Grace',
  'Isaac',
  'Jisoo',
  'Leo',
  'Lena',
  'Oliver',
  'Nora',
  'Owen',
  'Rachel',
  'Theo',
];

const lastNames = [
  'Kim',
  'Lee',
  'Park',
  'Choi',
  'Jung',
  'Cho',
  'Ahn',
  'Song',
  'Kang',
  'Yoon',
  'Yu',
  'Seo',
  'Shin',
  'Ryu',
  'Bae',
  'Han',
  'Oh',
  'Jang',
  'Hwang',
  'Lim',
];

const instrumentTypes = ['Violin', 'Viola', 'Cello', 'Bow'];
const instrumentMakers = [
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
];

const relationshipTypes = ['Interested', 'Booked', 'Sold', 'Owned'] as const;
const taskTypes = ['repair', 'rehair', 'adjustment', 'maintenance', 'inspection', 'setup'];
const taskStatuses = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const;

function getRandomElement<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function randomDateWithinDays(daysAgo: number, forwardDays = 0): string {
  const now = Date.now();
  const start = now - daysAgo * 24 * 60 * 60 * 1000;
  const end = now + forwardDays * 24 * 60 * 60 * 1000;
  return formatDate(new Date(getRandomInt(start, end)));
}

function createIdGenerator(prefix: string) {
  let sequence = 0;
  return () => `${prefix}-${String(++sequence).padStart(3, '0')}`;
}

const createClientId = createIdGenerator('client');
const createInstrumentId = createIdGenerator('instrument');
const createTaskId = createIdGenerator('task');
const createTradeId = createIdGenerator('trade');

function buildClients(): Client[] {
  const clients: Client[] = baseClients.map((template, index) => {
    const id = createClientId();
    return {
      id,
      name: `${template.first_name} ${template.last_name}`,
      first_name: template.first_name,
      last_name: template.last_name,
      email: `${template.first_name.toLowerCase()}.${template.last_name.toLowerCase()}@example.com`,
      contact_number: `010-${String(getRandomInt(0, 9999)).padStart(4, '0')}-${String(
        getRandomInt(0, 9999)
      ).padStart(4, '0')}`,
      tags: template.tags,
      interest: template.interest,
      client_number: `CL${String(index + 1).padStart(3, '0')}`,
    };
  });

  for (let i = clients.length; i < 20; i++) {
    const first_name = getRandomElement(firstNames);
    const last_name = getRandomElement(lastNames);
    const id = createClientId();
    clients.push({
      id,
      name: `${first_name} ${last_name}`,
      first_name,
      last_name,
      email: `${first_name.toLowerCase()}.${last_name.toLowerCase()}${i}@example.com`,
      contact_number: `010-${String(getRandomInt(0, 9999)).padStart(4, '0')}-${String(
        getRandomInt(0, 9999)
      ).padStart(4, '0')}`,
      tags: [getRandomElement(['Owner', 'Musician', 'Dealer', 'Collector'])],
      interest: getRandomElement(['Active', 'Passive', null]),
      client_number: `CL${String(i + 1).padStart(3, '0')}`,
    });
  }

  return clients;
}

function buildInstruments(clients: Client[]): Instrument[] {
  const instruments: Instrument[] = baseInstruments.map((template, index) => {
    const id = createInstrumentId();
    return {
      id,
      type: template.type,
      maker: template.maker,
      year: template.year,
      status: template.status,
      price: template.price,
      certificate: template.certificate,
      ownership: getRandomElement(clients).id,
      serial_number: `SER${String(index + 1).padStart(5, '0')}`,
    };
  });

  for (let i = instruments.length; i < 30; i++) {
    const type = getRandomElement(instrumentTypes);
    const maker = getRandomElement(instrumentMakers);
    const ownership =
      Math.random() > 0.4 ? getRandomElement(clients).id : null;
    instruments.push({
      id: createInstrumentId(),
      type,
      maker,
      year: getRandomInt(1650, 1950),
      status: getRandomElement(['Available', 'Booked', 'Sold', 'Reserved', 'Maintenance']),
      price: getRandomInt(500000, 10000000),
      certificate: Math.random() > 0.3,
      ownership,
      serial_number: `SER${String(i + 1).padStart(5, '0')}`,
    });
  }

  return instruments;
}

function buildRelationships(clients: Client[], instruments: Instrument[]): ClientInstrument[] {
  const relationships: ClientInstrument[] = [];
  const seen = new Set<string>();

  while (relationships.length < 30) {
    const client_id = getRandomElement(clients).id;
    const instrument_id = getRandomElement(instruments).id;
    const key = `${client_id}-${instrument_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      client_id,
      instrument_id,
      relationship_type: getRandomElement([...relationshipTypes]),
    });
  }

  return relationships;
}

function buildTasks(clients: Client[], instruments: Instrument[]): MaintenanceTask[] {
  const tasks: MaintenanceTask[] = [];

  for (let i = 0; i < 40; i++) {
    const status = getRandomElement([...taskStatuses]);
    const received_date = randomDateWithinDays(90, 0);
    const due_date = status === 'completed' ? null : randomDateWithinDays(0, 60);
    const scheduled_date = status === 'completed' ? null : randomDateWithinDays(0, 60);
    const completed_date = status === 'completed' ? randomDateWithinDays(10, 0) : null;

    tasks.push({
      id: createTaskId(),
      instrument_id: getRandomElement(instruments).id,
      client_id: Math.random() > 0.3 ? getRandomElement(clients).id : null,
      task_type: getRandomElement(taskTypes),
      title: `작업 ${i + 1} - ${getRandomElement(['현 교체', '활털 정리', '브릿지 조정', '네크 수리'])}`,
      status,
      priority: getRandomElement([...taskPriorities]),
      received_date,
      due_date,
      scheduled_date,
      completed_date,
      estimated_hours: getRandomInt(1, 8),
      actual_hours: status === 'completed' ? getRandomInt(1, 10) : null,
      cost: status === 'completed' ? getRandomInt(50000, 400000) : null,
      notes: status === 'completed' ? '작업 완료.' : '진행 중.',
    });
  }

  return tasks;
}

function buildSales(clients: Client[], instruments: Instrument[]): TradeRecord[] {
  const sales: TradeRecord[] = [];

  for (let i = 0; i < 15; i++) {
    const instrument = getRandomElement(instruments);
    const client = getRandomElement(clients);
    sales.push({
      id: createTradeId(),
      instrument_id: instrument.id,
      client_id: client.id,
      sale_price: getRandomInt(1000000, 9000000),
      sale_date: randomDateWithinDays(60, 0),
      notes: `${instrument.type} 판매 (${i + 1})`,
    });
  }

  return sales;
}

async function main() {
  const clients = buildClients();
  const instruments = buildInstruments(clients);
  const relationships = buildRelationships(clients, instruments);
  const tasks = buildTasks(clients, instruments);
  const sales_history = buildSales(clients, instruments);

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      clientCount: clients.length,
      instrumentCount: instruments.length,
      taskCount: tasks.length,
      salesCount: sales_history.length,
    },
    clients,
    instruments,
    clientRelationships: relationships,
    maintenanceTasks: tasks,
    salesHistory: sales_history,
  };

  const outputDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(outputDir, 'sample-data.json');

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ 샘플 데이터를 ${outputPath}으로 저장했습니다.`);
}

main().catch(error => {
  console.error('❌ 샘플 데이터 생성 중 오류 발생:', error);
  process.exit(1);
});
