import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'scripts/**/*.js', // Ignore JS files in scripts folder (migration scripts)
    ],
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'tests/**/*.{ts,tsx}',
      'src/**/__tests__/**/*.{ts,tsx}',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: [
      '**/*.config.{js,cjs,mjs,ts}',
      'jest.setup.js',
      'jest.config.js',
      'next.config.ts',
      'playwright.config.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}', 'src/contexts/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/__tests__/**/*',
      // AuthContext must use the Supabase client directly for auth subscriptions
      // and session management — these cannot be proxied through apiFetch routes.
      'src/contexts/AuthContext.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase-client',
              message:
                'Use apiFetch-based API routes instead of direct Supabase access in hooks/contexts.',
            },
            {
              name: '@/utils/apiClient',
              message:
                'Use apiFetch-based API routes instead of deprecated apiClient in hooks/contexts.',
            },
            {
              name: '@/utils/supabaseHelpers',
              message:
                'Use apiFetch-based API routes instead of SupabaseHelpers in hooks/contexts.',
            },
            {
              name: '@/services/dataService',
              message:
                'Use apiFetch-based API routes instead of deprecated dataService in hooks/contexts.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
