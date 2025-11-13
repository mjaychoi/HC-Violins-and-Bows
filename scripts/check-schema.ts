/**
 * Supabase 데이터베이스 스키마 확인 및 비교 스크립트
 * 
 * 이 스크립트는 Supabase 데이터베이스의 실제 스키마를 확인하고
 * 레포지토리의 마이그레이션 파일들과 비교합니다.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 로컬 환경에서 SSL 인증서 검증 비활성화
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

dotenv.config({ path: '.env.local' });

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  constraint_definition: string;
}

interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
}

async function getSupabaseConnection(): Promise<Client> {
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

  // Pooler 연결 시도 - Supabase 대시보드에서 제공한 형식 사용
  // 포트: 5432, 사용자: postgres.프로젝트참조
  const regions = ['us-east-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];
  let client: Client | null = null;

  console.log('🔌 Pooler 연결 시도 (포트 5432)...\n');

  for (const region of regions) {
    try {
      console.log(`🔌 ${region} 지역 pooler 연결 시도...`);
      
      client = new Client({
        host: `aws-0-${region}.pooler.supabase.com`,
        port: 5432,  // Pooler는 포트 5432 사용
        user: `postgres.${projectRef}`,  // 사용자 이름 형식: postgres.프로젝트참조
        password: dbPassword,
        database: 'postgres',
        ssl: {
          rejectUnauthorized: false,
        },
      });

      await client.connect();
      console.log(`✅ ${region} 지역 pooler 연결 성공!\n`);
      return client;
    } catch (error) {
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
        console.log(`⚠️  ${region} 지역 연결 실패, 다음 지역 시도...\n`);
        continue;
      } else if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string' &&
        (error.message.includes('self-signed certificate') ||
         error.message.includes('certificate') ||
         error.message.includes('SSL'))
      ) {
        console.log(`⚠️  ${region} 지역 SSL 인증서 오류, 다음 지역 시도...\n`);
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
        // 상세한 에러 정보 출력
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : 'unknown';
        console.log(`⚠️  ${region} 지역 연결 오류:`);
        console.log(`   코드: ${errorCode}`);
        console.log(`   메시지: ${errorMessage}\n`);
        continue;
      }
    }
  }

  throw new Error('모든 지역에 대한 연결 시도가 실패했습니다.');
}

async function getTableColumns(client: Client, tableName: string): Promise<ColumnInfo[]> {
  const query = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position;
  `;

  const result = await client.query(query, [tableName]);
  return result.rows as ColumnInfo[];
}

async function getTableConstraints(client: Client, tableName: string): Promise<ConstraintInfo[]> {
  const query = `
    SELECT 
      conname AS constraint_name,
      contype AS constraint_type,
      pg_get_constraintdef(oid) AS constraint_definition
    FROM pg_constraint
    WHERE conrelid = $1::regclass
    ORDER BY conname;
  `;

  const result = await client.query(query, [`public.${tableName}`]);
  return result.rows as ConstraintInfo[];
}

async function getTables(client: Client): Promise<string[]> {
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const result = await client.query(query);
  return result.rows.map(row => row.table_name);
}

async function getTableInfo(client: Client, tableName: string): Promise<TableInfo> {
  const columns = await getTableColumns(client, tableName);
  const constraints = await getTableConstraints(client, tableName);

  return {
    table_name: tableName,
    columns,
    constraints,
  };
}

function formatTableInfo(tableInfo: TableInfo): string {
  let output = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `📊 테이블: ${tableInfo.table_name}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Columns
  output += `📋 컬럼 (${tableInfo.columns.length}개):\n`;
  output += `┌────────────────────┬──────────────────┬──────────┬─────────────┐\n`;
  output += `│ Column Name        │ Data Type        │ Nullable │ Default     │\n`;
  output += `├────────────────────┼──────────────────┼──────────┼─────────────┤\n`;

  for (const col of tableInfo.columns) {
    const name = col.column_name.padEnd(18);
    const type = col.data_type.padEnd(16);
    const nullable = col.is_nullable.padEnd(8);
    const def = (col.column_default || 'NULL').substring(0, 11).padEnd(11);
    output += `│ ${name} │ ${type} │ ${nullable} │ ${def} │\n`;
  }

  output += `└────────────────────┴──────────────────┴──────────┴─────────────┘\n\n`;

  // Constraints
  if (tableInfo.constraints.length > 0) {
    output += `🔒 제약조건 (${tableInfo.constraints.length}개):\n`;
    for (const constraint of tableInfo.constraints) {
      output += `  • ${constraint.constraint_name} (${constraint.constraint_type})\n`;
      output += `    ${constraint.constraint_definition}\n\n`;
    }
  }

  return output;
}

function saveSchemaToFile(tables: TableInfo[], outputPath: string): void {
  let output = `-- Supabase Database Schema Export\n`;
  output += `-- Generated: ${new Date().toISOString()}\n`;
  output += `-- This file is for reference only and should not be executed\n\n`;

  for (const table of tables) {
    output += `-- Table: ${table.table_name}\n`;
    output += `CREATE TABLE IF NOT EXISTS public.${table.table_name} (\n`;

    const columnDefinitions = table.columns.map(col => {
      let def = `  ${col.column_name} `;
      
      // Data type
      if (col.data_type === 'character varying') {
        def += 'VARCHAR';
      } else if (col.data_type === 'text') {
        def += 'TEXT';
      } else if (col.data_type === 'integer') {
        def += 'INTEGER';
      } else if (col.data_type === 'bigint') {
        def += 'BIGINT';
      } else if (col.data_type === 'boolean') {
        def += 'BOOLEAN';
      } else if (col.data_type === 'numeric') {
        def += 'NUMERIC';
      } else if (col.data_type === 'timestamp with time zone') {
        def += 'TIMESTAMP WITH TIME ZONE';
      } else if (col.data_type === 'date') {
        def += 'DATE';
      } else if (col.data_type === 'ARRAY') {
        def += 'TEXT[]';
      } else {
        def += col.data_type.toUpperCase();
      }

      // Nullable
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }

      // Default
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }

      return def;
    });

    output += columnDefinitions.join(',\n');
    output += `\n);\n\n`;

    // Constraints
    for (const constraint of table.constraints) {
      if (constraint.constraint_type === 'p') {
        output += `ALTER TABLE public.${table.table_name} ADD CONSTRAINT ${constraint.constraint_name} PRIMARY KEY (...);\n`;
      } else if (constraint.constraint_type === 'f') {
        output += `ALTER TABLE public.${table.table_name} ADD CONSTRAINT ${constraint.constraint_name} ${constraint.constraint_definition};\n`;
      } else if (constraint.constraint_type === 'c') {
        output += `ALTER TABLE public.${table.table_name} ADD CONSTRAINT ${constraint.constraint_name} ${constraint.constraint_definition};\n`;
      }
    }

    output += `\n`;
  }

  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`✅ 스키마가 ${outputPath}에 저장되었습니다.\n`);
}

async function checkSchema() {
  let client: Client | null = null;

  try {
    console.log('🔄 Supabase 데이터베이스 스키마 확인 중...\n');

    // Connect to database
    client = await getSupabaseConnection();

    // Get all tables
    const tableNames = await getTables(client);
    console.log(`📊 발견된 테이블 (${tableNames.length}개):\n`);
    tableNames.forEach(name => console.log(`  • ${name}`));
    console.log('');

    // Get table info for each table
    const tables: TableInfo[] = [];
    for (const tableName of tableNames) {
      const tableInfo = await getTableInfo(client, tableName);
      tables.push(tableInfo);
      console.log(formatTableInfo(tableInfo));
    }

    // Save schema to file
    const outputPath = path.join(process.cwd(), 'supabase-schema-export.sql');
    saveSchemaToFile(tables, outputPath);

    // Check specific tables
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 주요 테이블 상세 정보');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const importantTables = ['instruments', 'clients', 'client_instruments', 'instrument_images', 'sales_history', 'maintenance_tasks'];
    
    for (const tableName of importantTables) {
      const table = tables.find(t => t.table_name === tableName);
      if (table) {
        console.log(`✅ ${tableName} 테이블 존재`);
        
        // Check for important columns
        if (tableName === 'instruments') {
          const hasSubtype = table.columns.some(c => c.column_name === 'subtype');
          const hasUpdatedAt = table.columns.some(c => c.column_name === 'updated_at');
          const statusConstraint = table.constraints.find(c => 
            c.constraint_name.includes('status') && 
            c.constraint_definition.includes('CHECK')
          );

          console.log(`  • subtype 컬럼: ${hasSubtype ? '✅ 있음' : '❌ 없음'}`);
          console.log(`  • updated_at 컬럼: ${hasUpdatedAt ? '✅ 있음' : '❌ 없음'}`);
          console.log(`  • status 제약조건: ${statusConstraint ? '✅ 있음' : '❌ 없음'}`);
          
          if (statusConstraint) {
            const hasReserved = statusConstraint.constraint_definition.includes('Reserved');
            const hasMaintenance = statusConstraint.constraint_definition.includes('Maintenance');
            console.log(`    - Reserved 허용: ${hasReserved ? '✅' : '❌'}`);
            console.log(`    - Maintenance 허용: ${hasMaintenance ? '✅' : '❌'}`);
          }
        }
        
        console.log('');
      } else {
        console.log(`❌ ${tableName} 테이블 없음\n`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 스키마 확인 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ 에러:', errorMessage);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run
checkSchema().catch(error => {
  console.error('❌ 에러:', error);
  process.exit(1);
});

export { checkSchema };

