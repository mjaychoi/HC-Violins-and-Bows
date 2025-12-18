'use client';

import { ReactNode } from 'react';
import RootProviders from '@/components/providers/RootProviders';

/**
 * App Router 최상위에서 사용하는 클라이언트 전용 Providers 래퍼
 * - Next.js 권장 패턴: 서버 레이아웃에서 직접 client component 를 감쌀 때 사용
 */
export default function Providers({ children }: { children: ReactNode }) {
  return <RootProviders>{children}</RootProviders>;
}
