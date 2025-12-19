/**
 * ✅ FIXED: 테스트용 render/renderHook 통일
 * 기본 Provider 포함으로 모든 테스트에서 일관된 환경 제공
 *
 * ⚠️ Important: Only exports what's needed to prevent direct RTL imports
 * This ensures all tests use the unified render/renderHook with TestProviders
 */
import '@testing-library/jest-dom'; // ✅ FIXED: jest-dom 타입 확장을 위해 import
import React from 'react';
import {
  render as rtlRender,
  type RenderOptions,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import {
  renderHook as rtlRenderHook,
  type RenderHookOptions,
  type RenderHookResult,
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
 * ✅ FIXED: Custom renderHook function with default TestProviders wrapper
 * Stable import from @testing-library/react (works across versions)
 * If wrapper is provided in options, it will be used instead of TestProviders
 */
export function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: RenderHookOptions<TProps>
): RenderHookResult<TResult, TProps> {
  const wrapper = options?.wrapper || TestProviders;
  return rtlRenderHook(hook, { ...options, wrapper });
}

// ✅ FIXED: Only export what's needed (no wildcard export)
// This prevents direct imports from @testing-library/react
// All tests should use these unified functions with TestProviders
export { screen, act, fireEvent, waitFor, within };

// Re-export commonly used types for convenience
export type { RenderOptions, RenderHookResult, RenderHookOptions };
