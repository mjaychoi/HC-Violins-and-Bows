import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import type { Database, TablesInsert } from '@/types/database';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const SEED_NAMESPACE = '7bff0876-8b5d-4f6b-8e7a-4a6d4f2d7771';
const SEED_MARKER = '[DEMO_SEED]';
const SEEDED_BY = 'demo-seed-script';
const DEFAULT_COUNTS = {
  instruments: 64,
  clients: 44,
  connections: 88,
  sales: 44,
  invoices: 38,
  maintenanceTasks: 76,
  contactLogs: 92,
  instrumentImages: 12,
  instrumentCertificates: 8,
};

type Args = {
  dryRun: boolean;
  reset: boolean;
  confirm: boolean;
  allowRemoteDev: boolean;
  doctor: boolean;
  createDemoIdentity: boolean;
  orgId?: string;
  userId?: string;
};

type SeedConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  userId: string;
  args: Args;
};

type DemoRows = {
  organization: TablesInsert<'organizations'>;
  clients: TablesInsert<'clients'>[];
  instruments: TablesInsert<'instruments'>[];
  connections: TablesInsert<'client_instruments'>[];
  sales: TablesInsert<'sales_history'>[];
  invoices: TablesInsert<'invoices'>[];
  invoiceItems: TablesInsert<'invoice_items'>[];
  maintenanceTasks: TablesInsert<'maintenance_tasks'>[];
  contactLogs: TablesInsert<'contact_logs'>[];
  invoiceSettings: TablesInsert<'invoice_settings'>;
  notificationSettings: TablesInsert<'notification_settings'>;
  instrumentImages: TablesInsert<'instrument_images'>[];
  instrumentCertificates: TablesInsert<'instrument_certificates'>[];
};

type Verification = Record<string, boolean | number | string>;
type DemoSupabaseClient = SupabaseClient<Database>;
type TableName = keyof Database['public']['Tables'];
type InsertRow<T extends TableName> = Database['public']['Tables'][T]['Insert'];
type InvoiceSettingsSummary = { id: string; business_name: string | null };
type NotificationSettingsSummary = {
  user_id?: string;
  email_notifications?: boolean | null;
  enabled?: boolean | null;
  notification_time?: string | null;
  days_before_due?: number[] | null;
};
type TargetIdentityStatus = {
  orgExists: boolean;
  userExists: boolean;
};

const dayMs = 24 * 60 * 60 * 1000;
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ymdFromOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);
}

function isoFromOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * dayMs).toISOString();
}

function uuidFor(key: string): string {
  const namespace = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(key).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const args: Args = {
    dryRun: false,
    reset: false,
    confirm: false,
    allowRemoteDev: false,
    doctor: false,
    createDemoIdentity: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--reset') args.reset = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--allow-remote-dev') args.allowRemoteDev = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--create-demo-identity') args.createDemoIdentity = true;
    else if (arg.startsWith('--org-id=')) args.orgId = arg.slice(9);
    else if (arg === '--org-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error('--org-id requires a UUID value.');
      args.orgId = value;
      index += 1;
    } else if (arg.startsWith('--user-id=')) args.userId = arg.slice(10);
    else if (arg === '--user-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error('--user-id requires a UUID value.');
      args.userId = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`
Usage:
  npm run seed:demo:doctor -- --org-id <uuid> --user-id <uuid>
  npm run seed:demo:identity -- --org-id <uuid> --user-id <uuid>
  npm run seed:demo:dry-run -- --org-id <uuid> --user-id <uuid>
  npm run seed:demo -- --confirm --org-id <uuid> --user-id <uuid>
  npm run seed:demo:reset -- --confirm --org-id <uuid> --user-id <uuid>

Required env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SEED_DEMO_ORG_ID or --org-id <uuid>
  SEED_DEMO_USER_ID or --user-id <uuid>

Remote Supabase URLs require --allow-remote-dev.
`);
}

function isLocalSupabaseUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
}

function safeSupabaseUrlSummary(rawUrl: string | undefined): string {
  if (!rawUrl) return 'missing';
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'invalid';
  }
}

function assertUuid(value: string, label: string): void {
  if (!uuidRegex.test(value)) {
    throw new Error(`${label} must be a valid UUID.`);
  }
}

function missingIdentityMessage(): string {
  return [
    'Target org/user IDs are required.',
    'Use env vars: SEED_DEMO_ORG_ID and SEED_DEMO_USER_ID.',
    'Or use CLI args: --org-id <uuid> --user-id <uuid>.',
  ].join(' ');
}

function loadConfig(args = parseArgs()): SeedConfig {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data when NODE_ENV=production.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orgId = args.orgId ?? process.env.SEED_DEMO_ORG_ID;
  const userId = args.userId ?? process.env.SEED_DEMO_USER_ID;

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
  if (!serviceRoleKey)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  if (!orgId || !userId) throw new Error(missingIdentityMessage());
  assertUuid(orgId, 'org_id');
  assertUuid(userId, 'user_id');
  if (
    !args.dryRun &&
    !args.confirm &&
    !args.reset &&
    !args.doctor &&
    !args.createDemoIdentity
  ) {
    throw new Error(
      'Pass --confirm to seed, --reset to reset, --doctor, --create-demo-identity, or --dry-run.'
    );
  }
  if (!isLocalSupabaseUrl(supabaseUrl) && !args.allowRemoteDev) {
    throw new Error(
      'Remote Supabase URLs require --allow-remote-dev. Verify this is not production.'
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    orgId,
    userId,
    args,
  };
}

function createClients(orgId: string): TablesInsert<'clients'>[] {
  const given = [
    'Ari',
    'Mina',
    'Theo',
    'Hana',
    'Jules',
    '서연',
    'Noah',
    'Iris',
    'Mateo',
    'Grace',
    'Yuna',
    'Eli',
    'Sofia',
    '준호',
    'Clara',
    'Owen',
    'Nari',
    'Felix',
    'Lena',
    'Miles',
    'Ava',
    '현우',
  ];
  const family = [
    'Kim',
    'Park',
    'Chen',
    'Rivera',
    'Singh',
    'Garcia',
    'Lee',
    'Morgan',
    'Rossi',
    'Nguyen',
    'Patel',
    'Brown',
    'Choi',
    'Wilson',
    'Kang',
    'Lopez',
    'Smith',
    'Bae',
    'Martin',
    'Oh',
  ];
  const tags = [
    ['buyer', 'violin'],
    ['consignor'],
    ['student', 'rental'],
    ['teacher', 'referral'],
    ['collector', 'high-value'],
    ['repair-only'],
    ['dealer'],
    ['orchestra'],
    ['follow-up'],
    ['bow'],
  ];

  return Array.from({ length: DEFAULT_COUNTS.clients }, (_, index) => {
    const fullName =
      index === 5
        ? '김서연'
        : index === 13
          ? '박준호'
          : `${given[index % given.length]} ${family[index % family.length]}`;
    const email =
      index % 11 === 0
        ? null
        : `demo.client.${String(index + 1).padStart(2, '0')}@example.test`;
    const phone =
      index % 13 === 0
        ? null
        : `555-01${String(index).padStart(2, '0')}-${String(2200 + index)}`;
    const note =
      index % 9 === 0
        ? `${SEED_MARKER} Long-running client with detailed preferences: prefers warm projection, narrow necks, flexible payment terms, weekend appointments, trade-in history, bow trials, certificate questions, and follow-up reminders.`
        : `${SEED_MARKER} Fake demo client generated by ${SEEDED_BY}.`;

    return {
      id: uuidFor(`client:${index}`),
      org_id: orgId,
      name: fullName,
      email,
      phone,
      client_number: `DCL-${String(index + 1).padStart(4, '0')}`,
      tags: tags[index % tags.length],
      interest: ['Active', 'Browsing', 'Collector', 'Repair', null][index % 5],
      note,
      created_at: isoFromOffset(-220 + index),
      updated_at: isoFromOffset(-20 + (index % 19)),
    };
  });
}

function createInstruments(orgId: string): TablesInsert<'instruments'>[] {
  const makers = [
    'Stradivari Workshop',
    'Guarneri del Gesu',
    'Amati School',
    'Vuillaume',
    'Hill & Sons',
    'Tourte',
    'Sartory',
    '현악공방 서울',
    'Lupot',
    'Gagliano',
    'Montagnana',
    'Very Long Maker Name & Sons, Cremona-London-New York Edition',
    'Pecatte',
    'Ruggeri',
    'Fagnola',
    'Modern Student Workshop',
  ];
  const types = ['Violin', 'Viola', 'Cello', 'Bow', 'Accessory'];
  const statuses = [
    'Available',
    'Booked',
    'Reserved',
    'Maintenance',
    'Sold',
    'Available',
    'Available',
    'Maintenance',
  ];

  return Array.from({ length: DEFAULT_COUNTS.instruments }, (_, index) => {
    const type = types[index % types.length];
    const status = statuses[index % statuses.length];
    const price =
      index === 2
        ? 125
        : index === 7
          ? 1_250_000
          : index % 17 === 0
            ? null
            : 850 + index * 975;

    return {
      id: uuidFor(`instrument:${index}`),
      org_id: orgId,
      type,
      maker: makers[index % makers.length],
      subtype:
        type === 'Bow'
          ? ['Violin Bow', 'Cello Bow', 'Viola Bow'][index % 3]
          : type === 'Accessory'
            ? ['Case', 'Shoulder Rest', 'Fine Tuner'][index % 3]
            : ['Soloist', 'Student', 'Baroque', null][index % 4],
      year: index === 3 ? 1685 : index % 10 === 0 ? null : 1720 + (index % 280),
      certificate: index % 3 === 0,
      cost_price: price ? Math.round(price * 0.62) : null,
      consignment_price:
        index % 6 === 0 && price ? Math.round(price * 0.8) : null,
      size:
        type === 'Cello'
          ? '4/4'
          : type === 'Viola'
            ? `${15 + (index % 3)}"`
            : '4/4',
      weight: type === 'Bow' ? `${58 + (index % 8)}g` : null,
      price,
      ownership:
        index % 6 === 0 ? 'Consignment' : index % 8 === 0 ? 'Shop owned' : null,
      note:
        index % 12 === 0
          ? `${SEED_MARKER} Edge note with punctuation !@#$%, unicode 송진, and newline-ready details.`
          : `${SEED_MARKER} Demo ${type.toLowerCase()} ${index + 1}.`,
      serial_number: `DEMOINST-${String(index + 1).padStart(4, '0')}`,
      status,
      reserved_reason: status === 'Reserved' ? 'Client trial hold' : null,
      reserved_by_user_id: null,
      reserved_connection_id: null,
      created_at: isoFromOffset(-260 + index),
      updated_at: isoFromOffset(-15 + (index % 13)),
    };
  });
}

function createConnections(
  orgId: string,
  clients: TablesInsert<'clients'>[],
  instruments: TablesInsert<'instruments'>[]
): TablesInsert<'client_instruments'>[] {
  const rows: TablesInsert<'client_instruments'>[] = [];
  const seen = new Set<string>();

  function add(
    clientIndex: number,
    instrumentIndex: number,
    relationshipType: string,
    displayOrder: number,
    note: string
  ) {
    const client = clients[clientIndex];
    const instrument = instruments[instrumentIndex];
    const key = `${client.id}:${instrument.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id: uuidFor(`connection:${rows.length}`),
      org_id: orgId,
      client_id: client.id,
      instrument_id: instrument.id,
      relationship_type: relationshipType,
      display_order: displayOrder,
      notes: `${SEED_MARKER} ${note}`,
      created_at: isoFromOffset(-180 + rows.length),
    });
  }

  add(0, 0, 'Owned', 0, 'Primary owner; multiple instruments client.');
  add(0, 1, 'Interested', 3, 'Interested in upgrade comparison.');
  add(0, 2, 'Booked', 1, 'Trial booked for this weekend.');
  add(
    0,
    4,
    'Interested',
    4,
    'Fourth instrument linked to high-activity client.'
  );
  add(0, 5, 'Booked', 5, 'Fifth instrument linked to high-activity client.');
  add(1, 0, 'Interested', 2, 'Second client linked to same instrument.');
  add(3, 0, 'Interested', 6, 'Third client linked to same instrument.');
  add(2, 3, 'Owned', 0, 'Owner record for cello.');

  let clientIndex = 0;
  let instrumentIndex = 0;
  while (rows.length < DEFAULT_COUNTS.connections) {
    clientIndex = (clientIndex + 3) % (clients.length - 4);
    instrumentIndex = (instrumentIndex + 5) % (instruments.length - 5);
    const relationshipType = ['Interested', 'Booked', 'Owned'][rows.length % 3];
    const alreadyOwned =
      relationshipType === 'Owned' &&
      rows.some(
        row =>
          row.instrument_id === instruments[instrumentIndex].id &&
          row.relationship_type === 'Owned'
      );
    add(
      clientIndex,
      instrumentIndex,
      alreadyOwned ? 'Interested' : relationshipType,
      rows.length % 9,
      rows.length % 4 === 0
        ? 'Older connection with detailed note for filter/search testing.'
        : 'Demo relationship for connection page sorting.'
    );
  }

  return rows;
}

function createSales(
  orgId: string,
  clients: TablesInsert<'clients'>[],
  instruments: TablesInsert<'instruments'>[]
): TablesInsert<'sales_history'>[] {
  const rows: TablesInsert<'sales_history'>[] = [];

  for (let index = 0; index < 40; index += 1) {
    const saleId = uuidFor(`sale:${index}`);
    rows.push({
      id: saleId,
      org_id: orgId,
      instrument_id: instruments[(index * 7) % (instruments.length - 5)].id,
      client_id:
        index % 9 === 0 ? null : clients[(index * 5) % clients.length].id,
      sale_price: index === 4 ? 145_000 : 650 + index * 725,
      sale_date:
        index < 12
          ? ymdFromOffset(-index)
          : index < 28
            ? ymdFromOffset(-35 - index)
            : ymdFromOffset(-420 + index),
      notes: `${SEED_MARKER} Demo sale ${index + 1}.`,
      entry_kind: 'sale',
      created_at: isoFromOffset(-90 + index),
    });
  }

  for (let index = 0; index < 4; index += 1) {
    const source = rows[index * 6 + 2];
    rows.push({
      id: uuidFor(`sale:refund:${index}`),
      org_id: orgId,
      instrument_id: source.instrument_id,
      client_id: source.client_id,
      sale_price: -Math.round(Number(source.sale_price) * 0.35),
      sale_date: ymdFromOffset(-2 - index * 8),
      notes: `${SEED_MARKER} Refund or adjustment for seeded sale.`,
      entry_kind: index === 3 ? 'adjustment' : 'refund',
      adjustment_of_sale_id: source.id,
      created_at: isoFromOffset(-5 - index),
    });
  }

  return rows;
}

function createInvoices(
  orgId: string,
  clients: TablesInsert<'clients'>[],
  instruments: TablesInsert<'instruments'>[]
) {
  const invoices: TablesInsert<'invoices'>[] = [];
  const invoiceItems: TablesInsert<'invoice_items'>[] = [];
  const statuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

  for (let index = 0; index < DEFAULT_COUNTS.invoices; index += 1) {
    const status = statuses[index % statuses.length];
    const itemCount = index % 7 === 0 ? 5 : index % 3 === 0 ? 3 : 1;
    let subtotal = 0;

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const rate = 120 + index * 18 + itemIndex * 75;
      const qty = itemIndex === 0 ? 1 : (itemIndex % 3) + 1;
      const amount = qty * rate;
      subtotal += amount;
      invoiceItems.push({
        id: uuidFor(`invoice-item:${index}:${itemIndex}`),
        org_id: orgId,
        invoice_id: uuidFor(`invoice:${index}`),
        instrument_id:
          itemIndex % 5 === 0
            ? null
            : instruments[(index * 3 + itemIndex) % instruments.length].id,
        description:
          itemIndex === 0
            ? `${SEED_MARKER} Instrument sale or service line`
            : `${SEED_MARKER} Accessory, setup, discount, or shipping line ${itemIndex}`,
        qty,
        rate,
        amount,
        image_url:
          itemIndex === 0 && index % 4 === 0
            ? 'https://example.test/demo-invoice-item.jpg'
            : null,
        display_order: itemIndex,
      });
    }

    const tax = index % 4 === 0 ? Math.round(subtotal * 0.0825 * 100) / 100 : 0;
    invoices.push({
      id: uuidFor(`invoice:${index}`),
      org_id: orgId,
      client_id:
        index % 10 === 0 ? null : clients[(index * 2) % clients.length].id,
      invoice_number: `DEMO-INV-${String(index + 1).padStart(4, '0')}`,
      invoice_date: ymdFromOffset(-45 + index),
      due_date:
        status === 'overdue'
          ? ymdFromOffset(index % 2 === 0 ? -1 : -38)
          : status === 'paid'
            ? ymdFromOffset(-10 + index)
            : ymdFromOffset(index % 6 === 0 ? 0 : 14 + index),
      subtotal,
      tax,
      total: subtotal + tax,
      currency: index % 8 === 0 ? 'KRW' : 'USD',
      status,
      notes: `${SEED_MARKER} Demo invoice with ${itemCount} line item(s).`,
      business_name: `${SEED_MARKER} HC Violins Demo Studio`,
      business_address: '123 Demo Workshop Lane, Suite 4, Example City',
      business_phone: '555-0100',
      business_email: 'billing@example.test',
      bank_account_holder: 'HC Demo Studio',
      bank_name: 'Demo Community Bank',
      bank_swift_code: 'DEMOUS33',
      bank_account_number: '000123456789',
      default_conditions:
        'Payment due according to invoice terms. Demo data only.',
      default_exchange_rate: '1.00',
      created_at: isoFromOffset(-70 + index),
    });
  }

  return { invoices, invoiceItems };
}

function createMaintenanceTasks(
  orgId: string,
  clients: TablesInsert<'clients'>[],
  instruments: TablesInsert<'instruments'>[]
): TablesInsert<'maintenance_tasks'>[] {
  const taskTypes = [
    'repair',
    'rehair',
    'maintenance',
    'inspection',
    'setup',
    'adjustment',
    'restoration',
  ];
  const statuses = ['pending', 'in_progress', 'completed', 'cancelled'];
  const priorities = ['low', 'medium', 'high', 'urgent'];

  return Array.from({ length: DEFAULT_COUNTS.maintenanceTasks }, (_, index) => {
    const status = statuses[index % statuses.length];
    const dueOffset =
      index < 12
        ? -index - 1
        : index < 22
          ? 0
          : index < 34
            ? 1 + (index % 6)
            : 14 + index;
    return {
      id: uuidFor(`maintenance:${index}`),
      org_id: orgId,
      instrument_id: instruments[(index * 4) % instruments.length].id!,
      client_id:
        index % 9 === 0 ? null : clients[(index * 6) % clients.length].id,
      task_type: taskTypes[index % taskTypes.length],
      title:
        index % 15 === 0
          ? `${SEED_MARKER} Dense calendar day setup ${index}`
          : `${SEED_MARKER} ${taskTypes[index % taskTypes.length]} task ${index + 1}`,
      description:
        index % 8 === 0
          ? 'Long description for calendar layout, search, and detail modal testing.'
          : 'Demo maintenance task.',
      status,
      priority: priorities[index % priorities.length],
      received_date: ymdFromOffset(-40 + index),
      due_date: ymdFromOffset(dueOffset),
      personal_due_date: index % 5 === 0 ? ymdFromOffset(dueOffset - 1) : null,
      scheduled_date:
        index % 6 === 0 ? ymdFromOffset(3) : ymdFromOffset(dueOffset + 2),
      completed_date:
        status === 'completed' ? ymdFromOffset(-1 - (index % 12)) : null,
      estimated_hours: (index % 10) + 1,
      actual_hours: status === 'completed' ? (index % 6) + 0.5 : null,
      cost: index % 4 === 0 ? 75 + index * 12 : null,
      notes: `${SEED_MARKER} priority/status/date edge case for calendar QA.`,
      created_at: isoFromOffset(-45 + index),
    };
  });
}

function createContactLogs(
  orgId: string,
  clients: TablesInsert<'clients'>[],
  instruments: TablesInsert<'instruments'>[]
): TablesInsert<'contact_logs'>[] {
  const contactTypes = ['email', 'phone', 'meeting', 'note', 'follow_up'];
  const purposes = [
    'quote',
    'follow_up',
    'maintenance',
    'sale',
    'inquiry',
    'other',
  ];

  return Array.from({ length: DEFAULT_COUNTS.contactLogs }, (_, index) => {
    const hasFollowUp = index % 3 === 0;
    const completed = hasFollowUp && index % 4 === 0;
    return {
      id: uuidFor(`contact:${index}`),
      org_id: orgId,
      client_id: clients[(index * 7) % clients.length].id,
      instrument_id:
        index % 6 === 0
          ? null
          : instruments[(index * 5) % instruments.length].id,
      contact_type: contactTypes[index % contactTypes.length],
      subject:
        index % 10 === 0
          ? null
          : `${SEED_MARKER} Follow-up subject ${index + 1}`,
      content:
        index % 14 === 0
          ? `${SEED_MARKER} 긴 한국어 메모와 detailed English notes for unicode/search testing.`
          : `${SEED_MARKER} Demo contact log. Direction: ${index % 2 === 0 ? 'incoming' : 'outgoing'}.`,
      contact_date: ymdFromOffset(-90 + index),
      next_follow_up_date: hasFollowUp
        ? ymdFromOffset(index % 2 === 0 ? -3 : 5 + (index % 12))
        : null,
      follow_up_completed_at: completed ? isoFromOffset(-1) : null,
      purpose: purposes[index % purposes.length],
      created_at: isoFromOffset(-90 + index),
    };
  });
}

function createInstrumentMedia(
  orgId: string,
  userId: string,
  instruments: TablesInsert<'instruments'>[]
) {
  const instrumentImages: TablesInsert<'instrument_images'>[] = Array.from(
    { length: DEFAULT_COUNTS.instrumentImages },
    (_, index) => ({
      id: uuidFor(`instrument-image:${index}`),
      instrument_id: instruments[index].id,
      image_url: `https://example.test/demo-instruments/${index + 1}.jpg`,
      storage_key: `${orgId}/demo-seed/instruments/${index + 1}.jpg`,
      file_name: `demo-instrument-${index + 1}.jpg`,
      file_size: 120_000 + index * 2500,
      mime_type: 'image/jpeg',
      display_order: index % 3,
      created_at: isoFromOffset(-30 + index),
    })
  );

  const instrumentCertificates: TablesInsert<'instrument_certificates'>[] =
    Array.from(
      { length: DEFAULT_COUNTS.instrumentCertificates },
      (_, index) => ({
        id: uuidFor(`instrument-certificate:${index}`),
        instrument_id: instruments[index * 2].id,
        storage_path: `${orgId}/demo-seed/certificates/${index + 1}.pdf`,
        original_name: `demo-certificate-${index + 1}.pdf`,
        mime_type: 'application/pdf',
        size: 54_000 + index * 2000,
        created_by: userId,
        is_primary: index % 2 === 0,
        version: 1,
        created_at: isoFromOffset(-25 + index),
      })
    );

  return { instrumentImages, instrumentCertificates };
}

function buildDemoRows(config: Pick<SeedConfig, 'orgId' | 'userId'>): DemoRows {
  const clients = createClients(config.orgId);
  const instruments = createInstruments(config.orgId);
  const connections = createConnections(config.orgId, clients, instruments);
  const sales = createSales(config.orgId, clients, instruments);
  const { invoices, invoiceItems } = createInvoices(
    config.orgId,
    clients,
    instruments
  );
  const maintenanceTasks = createMaintenanceTasks(
    config.orgId,
    clients,
    instruments
  );
  const contactLogs = createContactLogs(config.orgId, clients, instruments);
  const { instrumentImages, instrumentCertificates } = createInstrumentMedia(
    config.orgId,
    config.userId,
    instruments
  );

  return {
    organization: {
      id: config.orgId,
      name: `${SEED_MARKER} HC Violins Demo Organization`,
    },
    clients,
    instruments,
    connections,
    sales,
    invoices,
    invoiceItems,
    maintenanceTasks,
    contactLogs,
    invoiceSettings: {
      id: uuidFor(`invoice-settings:${config.orgId}`),
      org_id: config.orgId,
      business_name: `${SEED_MARKER} HC Violins Demo Studio`,
      business_address: '123 Demo Workshop Lane, Suite 4, Example City',
      business_phone: '555-0100',
      business_email: 'billing@example.test',
      bank_account_holder: 'HC Demo Studio',
      bank_name: 'Demo Community Bank',
      bank_swift_code: 'DEMOUS33',
      bank_account_number: '000123456789',
      default_conditions:
        'Demo terms: payment due within 14 days. Generated fake data only.',
      default_exchange_rate: 1,
      default_currency: 'USD',
      address: '123 Demo Workshop Lane, Suite 4, Example City',
      phone: '555-0100',
      email: 'billing@example.test',
    },
    notificationSettings: {
      org_id: config.orgId,
      user_id: config.userId,
      email_notifications: false,
      enabled: false,
      notification_time: '10:30',
      days_before_due: [7, 3, 1, 0],
      last_notification_sent_at: null,
    },
    instrumentImages,
    instrumentCertificates,
  };
}

function printPlan(config: SeedConfig, rows: DemoRows) {
  console.log('Demo seed target');
  console.log(`  Supabase URL: ${config.supabaseUrl}`);
  console.log(`  org_id:       ${config.orgId}`);
  console.log(`  user_id:      ${config.userId}`);
  console.log(`  reset:        ${config.args.reset}`);
  console.log(`  dry-run:      ${config.args.dryRun}`);
  console.log('Rows planned');
  console.table({
    instruments: rows.instruments.length,
    clients: rows.clients.length,
    connections: rows.connections.length,
    sales: rows.sales.length,
    invoices: rows.invoices.length,
    invoice_items: rows.invoiceItems.length,
    maintenance_tasks: rows.maintenanceTasks.length,
    contact_logs: rows.contactLogs.length,
    instrument_images: rows.instrumentImages.length,
    instrument_certificates: rows.instrumentCertificates.length,
    invoice_settings: 1,
    notification_settings: 1,
  });
}

function restTableUrl(
  config: SeedConfig,
  table: TableName,
  query = ''
): string {
  const base = config.supabaseUrl.replace(/\/$/, '');
  return `${base}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

async function restRequest<T>(
  config: SeedConfig,
  action: string,
  table: TableName,
  query: string,
  init: RequestInit
): Promise<{ data: T | null; response: Response }> {
  const response = await fetch(restTableUrl(config, table, query), {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `${action} failed: ${response.status} ${await response.text()}`
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? ((await response.json()) as T)
    : null;

  return { data, response };
}

async function selectFirst<T>(
  config: SeedConfig,
  table: TableName,
  query: string
): Promise<T | null> {
  const { data } = await restRequest<T[]>(
    config,
    `select ${table}`,
    table,
    `${query}&limit=1`,
    { method: 'GET' }
  );

  return data?.[0] ?? null;
}

async function targetIdentityStatus(
  config: SeedConfig
): Promise<TargetIdentityStatus> {
  const org = await selectFirst<{ id: string }>(
    config,
    'organizations',
    `select=id&id=eq.${config.orgId}`
  );
  const supabase: DemoSupabaseClient = createClient<Database>(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
  const user = await supabase.auth.admin.getUserById(config.userId);

  return {
    orgExists: Boolean(org),
    userExists: !user.error && Boolean(user.data.user),
  };
}

function assertLocalIdentityMode(config: SeedConfig): void {
  if (!isLocalSupabaseUrl(config.supabaseUrl) && !config.args.allowRemoteDev) {
    throw new Error(
      'Demo identity creation is local-only by default. Pass --allow-remote-dev only for a non-production hosted development project.'
    );
  }
}

async function runDoctor(
  config: SeedConfig
): Promise<TargetIdentityStatus | null> {
  console.log('Demo seed doctor');
  console.log(
    `  NODE_ENV:                    ${process.env.NODE_ENV ?? '(unset)'}`
  );
  console.log(
    `  Supabase URL:                ${safeSupabaseUrlSummary(config.supabaseUrl)}`
  );
  console.log(
    `  Local Supabase URL:          ${isLocalSupabaseUrl(config.supabaseUrl)}`
  );
  console.log(
    `  SUPABASE_SERVICE_ROLE_KEY:   ${config.serviceRoleKey ? 'present' : 'missing'}`
  );
  console.log(`  org_id:                      ${config.orgId}`);
  console.log(`  user_id:                     ${config.userId}`);

  try {
    const status = await targetIdentityStatus(config);
    console.log(`  organization exists:         ${status.orgExists}`);
    console.log(`  auth user exists:            ${status.userExists}`);
    if (!status.orgExists || !status.userExists) {
      console.log(
        'Next step: run npm run seed:demo:identity first, or provide existing local org/user IDs.'
      );
    }
    return status;
  } catch (error) {
    console.log(
      `  identity check failed:       ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function createDemoIdentity(
  config: SeedConfig
): Promise<TargetIdentityStatus> {
  assertLocalIdentityMode(config);

  const supabase: DemoSupabaseClient = createClient<Database>(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  await upsertRows(config, 'organizations', [
    {
      id: config.orgId,
      name: `${SEED_MARKER} HC Violins Demo Organization`,
    },
  ]);

  const appMetadata = {
    org_id: config.orgId,
    organization_id: config.orgId,
    role: 'admin',
    app_role: 'admin',
    seeded_by: SEEDED_BY,
  };
  const existingUser = await supabase.auth.admin.getUserById(config.userId);
  if (existingUser.data.user && !existingUser.error) {
    const { error } = await supabase.auth.admin.updateUserById(config.userId, {
      email: 'demo-seed-user@example.test',
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: {
        name: 'Demo Seed User',
        seeded_by: SEEDED_BY,
      },
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.auth.admin.createUser({
      id: config.userId,
      email: 'demo-seed-user@example.test',
      password: `${uuidFor(`demo-password:${config.userId}`)}A1!`,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: {
        name: 'Demo Seed User',
        seeded_by: SEEDED_BY,
      },
    });
    if (error) throw error;
  }

  const status = await targetIdentityStatus(config);
  if (!status.orgExists || !status.userExists) {
    throw new Error(
      'Demo identity setup did not create the expected org/user rows.'
    );
  }

  console.log('Demo identity ready');
  console.log(`  org_id:  ${config.orgId}`);
  console.log(`  user_id: ${config.userId}`);
  return status;
}

async function assertTargetIdentityExists(config: SeedConfig): Promise<void> {
  const status = await targetIdentityStatus(config);
  if (!status.orgExists || !status.userExists) {
    throw new Error(
      'Target org/user does not exist. Run npm run seed:demo:identity first, or provide existing local org/user IDs.'
    );
  }
}

async function upsertRows<T extends TableName>(
  config: SeedConfig,
  table: T,
  rows: InsertRow<T>[],
  onConflict = 'id'
) {
  if (rows.length === 0) return;
  const normalizedRows = normalizeBulkRows(rows);
  await restRequest(
    config,
    `upsert ${table}`,
    table,
    `on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(normalizedRows),
    }
  );
}

function normalizeBulkRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  const keys = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set<string>())
  );

  return rows.map(row => {
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      normalized[key] = Object.prototype.hasOwnProperty.call(row, key)
        ? row[key]
        : null;
    }
    return normalized as T;
  });
}

async function deleteByIds<T extends TableName>(
  config: SeedConfig,
  table: T,
  ids: (string | undefined | null)[]
) {
  const cleanIds = ids.filter((id): id is string => Boolean(id));
  if (cleanIds.length === 0) return;
  await restRequest(
    config,
    `delete ${table}`,
    table,
    `id=in.(${cleanIds.join(',')})`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    }
  );
}

async function resetSeededRows(
  config: SeedConfig,
  rows: DemoRows,
  orgId: string,
  userId: string
) {
  await deleteByIds(
    config,
    'invoice_items',
    rows.invoiceItems.map(row => row.id)
  );
  await deleteByIds(
    config,
    'invoices',
    rows.invoices.map(row => row.id)
  );
  await deleteByIds(
    config,
    'contact_logs',
    rows.contactLogs.map(row => row.id)
  );
  await deleteByIds(
    config,
    'maintenance_tasks',
    rows.maintenanceTasks.map(row => row.id)
  );
  await deleteByIds(
    config,
    'sales_history',
    rows.sales.map(row => row.id).reverse()
  );
  await deleteByIds(
    config,
    'instrument_certificates',
    rows.instrumentCertificates.map(row => row.id)
  );
  await deleteByIds(
    config,
    'instrument_images',
    rows.instrumentImages.map(row => row.id)
  );
  await deleteByIds(
    config,
    'client_instruments',
    rows.connections.map(row => row.id)
  );
  await deleteByIds(
    config,
    'instruments',
    rows.instruments.map(row => row.id)
  );
  await deleteByIds(
    config,
    'clients',
    rows.clients.map(row => row.id)
  );

  const invoiceSettings = await selectFirst<InvoiceSettingsSummary>(
    config,
    'invoice_settings',
    `select=id,business_name&org_id=eq.${orgId}`
  );
  if (
    invoiceSettings &&
    invoiceSettings.id === rows.invoiceSettings.id &&
    String(invoiceSettings.business_name ?? '').includes(SEED_MARKER)
  ) {
    await deleteByIds(config, 'invoice_settings', [rows.invoiceSettings.id]);
  }

  const notificationData = await selectFirst<NotificationSettingsSummary>(
    config,
    'notification_settings',
    [
      'select=email_notifications,enabled,notification_time,days_before_due',
      `org_id=eq.${orgId}`,
      `user_id=eq.${userId}`,
    ].join('&')
  );
  if (
    notificationData &&
    notificationData.email_notifications === false &&
    notificationData.enabled === false &&
    notificationData.notification_time === '10:30:00' &&
    JSON.stringify(notificationData.days_before_due) ===
      JSON.stringify([7, 3, 1, 0])
  ) {
    await restRequest(
      config,
      'delete notification_settings',
      'notification_settings',
      `org_id=eq.${orgId}&user_id=eq.${userId}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      }
    );
  }
}

async function seedRows(config: SeedConfig, rows: DemoRows) {
  if (!rows.organization.id) {
    throw new Error('Seed organization id is required.');
  }

  await upsertRows(config, 'clients', rows.clients);
  await upsertRows(config, 'instruments', rows.instruments);
  await upsertRows(config, 'client_instruments', rows.connections);
  await upsertRows(config, 'sales_history', rows.sales);
  await upsertRows(config, 'invoices', rows.invoices);
  await upsertRows(config, 'invoice_items', rows.invoiceItems);
  await upsertRows(config, 'maintenance_tasks', rows.maintenanceTasks);
  await upsertRows(config, 'contact_logs', rows.contactLogs);
  await upsertRows(config, 'instrument_images', rows.instrumentImages);
  await upsertRows(
    config,
    'instrument_certificates',
    rows.instrumentCertificates
  );

  const orgId = rows.organization.id;
  const existingSettings = await selectFirst<InvoiceSettingsSummary>(
    config,
    'invoice_settings',
    `select=id,business_name&org_id=eq.${orgId}`
  );
  if (
    !existingSettings ||
    existingSettings.id === rows.invoiceSettings.id ||
    String(existingSettings.business_name ?? '').includes(SEED_MARKER)
  ) {
    await upsertRows(
      config,
      'invoice_settings',
      [rows.invoiceSettings],
      'org_id'
    );
  } else {
    console.log(
      'Skipped invoice_settings: existing non-demo settings row found.'
    );
  }

  const existingNotifications = await selectFirst<NotificationSettingsSummary>(
    config,
    'notification_settings',
    [
      'select=user_id',
      `org_id=eq.${orgId}`,
      `user_id=eq.${rows.notificationSettings.user_id}`,
    ].join('&')
  );
  if (!existingNotifications) {
    await upsertRows(
      config,
      'notification_settings',
      [rows.notificationSettings],
      'org_id,user_id'
    );
  } else {
    console.log(
      'Skipped notification_settings: existing user settings row found.'
    );
  }
}

async function countBySeedIds<T extends TableName>(
  config: SeedConfig,
  table: T,
  ids: (string | null | undefined)[]
): Promise<number> {
  const cleanIds = ids.filter((id): id is string => Boolean(id));
  const { response } = await restRequest<unknown[]>(
    config,
    `verify ${table}`,
    table,
    `select=id&id=in.(${cleanIds.join(',')})`,
    {
      method: 'GET',
      headers: {
        Prefer: 'count=exact',
        Range: '0-0',
      },
    }
  );
  const contentRange = response.headers.get('content-range') ?? '';
  const count = Number(contentRange.split('/').at(1));
  return Number.isFinite(count) ? count : 0;
}

async function verifySeed(
  config: SeedConfig,
  rows: DemoRows,
  orgId: string,
  userId: string
): Promise<Verification> {
  const [
    instruments,
    clients,
    connections,
    sales,
    invoices,
    invoiceItems,
    maintenanceTasks,
    contactLogs,
    instrumentImages,
    instrumentCertificates,
  ] = await Promise.all([
    countBySeedIds(
      config,
      'instruments',
      rows.instruments.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'clients',
      rows.clients.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'client_instruments',
      rows.connections.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'sales_history',
      rows.sales.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'invoices',
      rows.invoices.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'invoice_items',
      rows.invoiceItems.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'maintenance_tasks',
      rows.maintenanceTasks.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'contact_logs',
      rows.contactLogs.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'instrument_images',
      rows.instrumentImages.map(row => row.id)
    ),
    countBySeedIds(
      config,
      'instrument_certificates',
      rows.instrumentCertificates.map(row => row.id)
    ),
  ]);

  const invoiceSettings = await selectFirst<InvoiceSettingsSummary>(
    config,
    'invoice_settings',
    `select=id,business_name&org_id=eq.${orgId}`
  );
  const notificationSettings = await selectFirst<NotificationSettingsSummary>(
    config,
    'notification_settings',
    `select=user_id&org_id=eq.${orgId}&user_id=eq.${userId}`
  );

  const multiClientInstrument = rows.connections.some((row, _, all) => {
    const clientsForInstrument = new Set(
      all
        .filter(candidate => candidate.instrument_id === row.instrument_id)
        .map(candidate => candidate.client_id)
    );
    return clientsForInstrument.size > 1;
  });
  const multiInstrumentClient = rows.connections.some((row, _, all) => {
    const instrumentsForClient = new Set(
      all
        .filter(candidate => candidate.client_id === row.client_id)
        .map(candidate => candidate.instrument_id)
    );
    return instrumentsForClient.size > 1;
  });
  const connectedClientIds = new Set(
    rows.connections.map(row => row.client_id)
  );
  const connectedInstrumentIds = new Set(
    rows.connections.map(row => row.instrument_id)
  );

  return {
    instruments,
    clients,
    connections,
    sales,
    invoices,
    invoiceItems,
    maintenanceTasks,
    contactLogs,
    instrumentImages,
    instrumentCertificates,
    invoiceSettingsExists: Boolean(invoiceSettings),
    notificationSettingsExists: Boolean(notificationSettings),
    multiClientInstrument,
    multiInstrumentClient,
    clientWithNoInstruments: rows.clients.some(
      row => !connectedClientIds.has(row.id)
    ),
    instrumentWithNoClient: rows.instruments.some(
      row => !connectedInstrumentIds.has(row.id)
    ),
    overdueInvoiceExists: rows.invoices.some(
      row =>
        row.status === 'overdue' &&
        row.due_date &&
        row.due_date < ymdFromOffset(0)
    ),
    overdueMaintenanceTaskExists: rows.maintenanceTasks.some(
      row =>
        row.status !== 'completed' &&
        row.status !== 'cancelled' &&
        row.due_date &&
        row.due_date < ymdFromOffset(0)
    ),
    refundedOrAdjustedSaleExists: rows.sales.some(
      row => row.entry_kind === 'refund' || row.entry_kind === 'adjustment'
    ),
    invoicePdfCandidate: `/api/invoices/${rows.invoices[0].id}/pdf`,
  };
}

async function run() {
  const args = parseArgs();
  const config = loadConfig(args);
  const rows = buildDemoRows(config);

  if (config.args.doctor) {
    await runDoctor(config);
    return;
  }

  if (config.args.createDemoIdentity) {
    await createDemoIdentity(config);
    return;
  }

  printPlan(config, rows);

  if (config.args.dryRun) {
    const status = await targetIdentityStatus(config);
    if (!status.orgExists || !status.userExists) {
      console.warn(
        'Warning: target org/user does not exist. Dry run can continue, but confirmed seed requires identity setup.'
      );
    }
    console.log('Dry run complete. No database writes were performed.');
    return;
  }

  await assertTargetIdentityExists(config);

  if (config.args.reset) {
    console.log('Resetting previously seeded demo rows only...');
    await resetSeededRows(config, rows, config.orgId, config.userId);
    const verification = await verifySeed(
      config,
      rows,
      config.orgId,
      config.userId
    );
    console.log('Verification after reset');
    console.table(verification);
    return;
  }

  console.log('Seeding demo rows...');
  await seedRows(config, rows);

  const verification = await verifySeed(
    config,
    rows,
    config.orgId,
    config.userId
  );
  console.log('Verification');
  console.table(verification);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (process.env.NODE_ENV !== 'test' && isDirectRun()) {
  run().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export {
  DEFAULT_COUNTS,
  SEED_MARKER,
  buildDemoRows,
  createDemoIdentity,
  isLocalSupabaseUrl,
  loadConfig,
  parseArgs,
  runDoctor,
  targetIdentityStatus,
  uuidFor,
};
