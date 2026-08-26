import { NextRequest } from 'next/server';
import { handleReadyGet } from '@/app/api/_utils/handleReadyGet';

export async function GET(request: NextRequest) {
  return handleReadyGet(request, process.env);
}

export const dynamic = 'force-dynamic';
