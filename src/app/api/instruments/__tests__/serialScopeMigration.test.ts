import fs from 'fs';
import path from 'path';

describe('instrument serial uniqueness migration', () => {
  it('scopes serial uniqueness to org_id', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260422130702_instruments_org_scoped_serial_unique.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /DROP INDEX IF EXISTS public\.idx_instruments_serial_number;/
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_org_serial/i
    );
    expect(sql).toMatch(/ON public\.instruments\(org_id, serial_number\)/i);
    expect(sql).toMatch(/HAVING COUNT\(\*\) > 1/i);
  });
});
