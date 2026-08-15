const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testTimeout: 10000, // 10 seconds default timeout
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(isows|@supabase/realtime-js|@supabase/supabase-js|@supabase|react-dnd|react-dnd-html5-backend|@dnd-kit|@upstash/redis|@upstash/ratelimit|uncrypto)/)',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.next/standalone',
    '<rootDir>/.tmp-',
    '<rootDir>/.health-pr-push',
    '<rootDir>/.claude',
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/.tmp-',
    '<rootDir>/.health-pr-push/',
    '<rootDir>/.claude/',
    '<rootDir>/tests/e2e/',
    '<rootDir>/src/app/calendar/__tests__/page.test.tsx',
    // Spin up a real, isolated local Postgres (embedded-postgres) per file —
    // run explicitly via `npm run test:production-guards-integration`
    // (wired into ci.yml as its own step), not part of the default fast
    // `npm test` loop. The pure-unit guard tests in
    // tests/integration/production/db-deploy-guards.test.ts are unaffected
    // and still run under plain `npm test`.
    '<rootDir>/tests/integration/production/.*\\.integration\\.test\\.ts$',
    // Same reasoning as the production integration tests above: spins up
    // its own real, isolated local Postgres (embedded-postgres) via
    // `npm run test:sale-transition-migration-consolidation`, not part of
    // the default fast `npm test` loop.
    '<rootDir>/tests/integration/migrations/.*\\.integration\\.test\\.ts$',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    // Deprecated / legacy entrypoints and pages that are not used in runtime
    '!src/contexts/AuthContext.tsx',
    '!src/contexts/DataContext.tsx',
    '!src/lib/supabase.ts',
    '!src/app/customer/page.tsx',
    '!src/app/signup/page.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
  coverageReporters: ['text', 'text-summary', 'html', 'json', 'json-summary'],
};

// Create Jest config using Next.js helper
const jestConfig = createJestConfig(customJestConfig);

// Mutate the final config to append legacy file ignores
// This is necessary because createJestConfig re-reads/merges defaults,
// which can reset coveragePathIgnorePatterns
jestConfig.coveragePathIgnorePatterns = [
  ...(jestConfig.coveragePathIgnorePatterns ?? []),
  // Legacy/deprecated files that are not used in runtime
  // Use regex patterns to match file paths
  '/src/contexts/AuthContext\\.tsx$',
  '/src/contexts/DataContext\\.tsx$',
  '/src/lib/supabase\\.ts$',
  '/src/app/customer/page\\.tsx$',
  '/src/app/signup/page\\.tsx$',
];

// Also ensure collectCoverageFrom excludes legacy files
if (jestConfig.collectCoverageFrom) {
  jestConfig.collectCoverageFrom = [
    ...jestConfig.collectCoverageFrom,
    '!src/contexts/AuthContext.tsx',
    '!src/contexts/DataContext.tsx',
    '!src/lib/supabase.ts',
    '!src/app/customer/page.tsx',
    '!src/app/signup/page.tsx',
  ];
}

module.exports = jestConfig;
