/**
 * ✅ FIXED: 테스트용 render/renderHook 통일
 * 기본 Provider 포함으로 모든 테스트에서 일관된 환경 제공
 */
import '@testing-library/jest-dom'; // ✅ FIXED: jest-dom 타입 확장을 위해 import
import React from 'react';
import {
  render as rtlRender,
  RenderOptions,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import {
  renderHook as rtlRenderHook,
  RenderHookOptions,
} from '@testing-library/react';
import { TestProviders } from './TestProviders';

/**
 * Custom render function with default TestProviders wrapper
 */
export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return rtlRender(ui, { wrapper: TestProviders, ...options });
}

/**
 * Custom renderHook function with default TestProviders wrapper
 * If wrapper is provided in options, it will be used instead of TestProviders
 */
export function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: RenderHookOptions<TProps>
) {
  const wrapper = options?.wrapper || TestProviders;
  return rtlRenderHook(hook, { ...options, wrapper });
}

// ✅ FIXED: 명시적으로 export하여 TypeScript 타입 인식 보장
export { screen, act, fireEvent, waitFor, within };

// Re-export everything from @testing-library/react for convenience
export * from '@testing-library/react';
