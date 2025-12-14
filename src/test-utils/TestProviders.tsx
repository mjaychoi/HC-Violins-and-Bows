/**
 * ✅ FIXED: 테스트용 Provider 통일
 * 모든 테스트에서 일관된 Provider 환경 제공
 * disableHost로 ToastHost 렌더링 비활성화 (테스트 안정성 향상)
 */
import React from 'react';
import { ToastProvider } from '@/contexts/ToastContext';

export function TestProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider disableHost>{children}</ToastProvider>;
}
