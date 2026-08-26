import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const SENSITIVE_ROUTE_FILES = [
  'src/app/api/sales/route.ts',
  'src/app/api/clients/route.ts',
  'src/app/api/clients/filter-options/route.ts',
  'src/app/api/clients/analytics/route.ts',
  'src/app/api/instruments/route.ts',
  'src/app/api/invoices/[id]/pdf/route.ts',
  'src/app/api/connections/route.ts',
];

const PROCESS_LOCAL_LIMITER =
  /_rateLimitMap|function checkRateLimit|interface RateEntry/;

describe('no process-local rate-limit state', () => {
  it('middleware does not keep an in-process request counter', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/middleware.ts'), 'utf8');
    expect(src).not.toMatch(PROCESS_LOCAL_LIMITER);
    expect(src).not.toMatch(/export=true/);
    expect(src).toMatch(/rateLimit\.ts/);
  });

  it('sensitive routes delegate to the shared Upstash helper', () => {
    for (const relative of SENSITIVE_ROUTE_FILES) {
      const src = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(src).toMatch(/applyScopedRateLimit/);
      expect(src).not.toMatch(PROCESS_LOCAL_LIMITER);
      expect(src).not.toMatch(/applyRateLimit\(/);
    }
  });
});
