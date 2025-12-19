/**
 * ✅ FIXED: 테스트 환경 설정
 *
 * ⚠️ Important: jest.mock() calls should be in jest.setup.js (root level)
 * This file is for TypeScript/ESM imports only
 *
 * All jest.mock() calls are now in jest.setup.js to prevent runtime errors
 * when test files are imported in non-test contexts
 */
