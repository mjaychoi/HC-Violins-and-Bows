/**
 * ✅ FIXED: 테스트 환경에서 Toast 컴포넌트 mock
 * ToastProvider의 disableHost와 함께 사용하여 테스트 안정성 향상
 */

// ErrorToast와 SuccessToasts 컴포넌트를 mock하여 테스트 환경에서 안정적으로 동작하도록 함
jest.mock('@/components/ErrorToast', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/common/feedback/SuccessToasts', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));
