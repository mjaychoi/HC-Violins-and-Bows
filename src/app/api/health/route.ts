import { NextRequest } from 'next/server';
import { handleHealthGet } from '@/app/api/_utils/handleHealthGet';

export async function GET(request: NextRequest) {
  return handleHealthGet(request, process.env);
}
