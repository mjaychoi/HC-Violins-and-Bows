import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

// Node.js runtime required for process.uptime() and process.env access
export const runtime = 'nodejs';

const bootTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.round(process.uptime());

  return NextResponse.json({
    status: 'ok',
    version: packageJson.version ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'unknown',
    uptimeSeconds,
    startedAt: new Date(bootTime).toISOString(),
    timestamp: new Date().toISOString(),
  });
}
