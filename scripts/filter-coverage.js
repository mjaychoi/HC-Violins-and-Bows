#!/usr/bin/env node

/**
 * 커버리지 리포트에서 레거시/Deprecated 파일을 제외하는 스크립트
 *
 * Next.js의 createJestConfig가 coveragePathIgnorePatterns를 덮어쓰는 문제를 해결하기 위해
 * 테스트 실행 후 커버리지 리포트를 후처리합니다.
 */

const fs = require('fs');
const path = require('path');
const { logInfo, logWarn } = require('../src/utils/logger');
const { logError } = require('../src/utils/logger');

const COVERAGE_DIR = path.join(__dirname, '..', 'coverage');
const COVERAGE_SUMMARY = path.join(COVERAGE_DIR, 'coverage-summary.json');
const COVERAGE_FINAL = path.join(COVERAGE_DIR, 'coverage-final.json');

// 제외할 레거시 파일 패턴
const LEGACY_FILES = [
  'AuthContext.tsx',
  'DataContext.tsx',
  'supabase.ts',
  'customer/page.tsx',
  'signup/page.tsx',
];

function isLegacyFile(filePath) {
  return LEGACY_FILES.some(legacy => filePath.includes(legacy));
}

function filterCoverageSummary() {
  // coverage-summary.json 또는 coverage-final.json 사용
  let coverageFile = COVERAGE_SUMMARY;
  if (!fs.existsSync(COVERAGE_SUMMARY) && fs.existsSync(COVERAGE_FINAL)) {
    coverageFile = COVERAGE_FINAL;
  }

  if (!fs.existsSync(coverageFile)) {
    logWarn('⚠️  커버리지 리포트 파일을 찾을 수 없습니다:', COVERAGE_SUMMARY);
    return;
  }

  const data = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  const originalTotal = { ...data.total };

  // 레거시 파일 제거 및 통계 재계산
  const filteredEntries = {};
  let totalLines = 0;
  let coveredLines = 0;
  let totalStatements = 0;
  let coveredStatements = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;

  for (const [filePath, stats] of Object.entries(data)) {
    if (filePath === 'total') {
      continue;
    }

    if (isLegacyFile(filePath)) {
      logInfo(`  제외: ${filePath.replace(process.cwd() + '/', '')}`);
      continue;
    }

    filteredEntries[filePath] = stats;

    // 통계 누적
    totalLines += stats.lines.total;
    coveredLines += stats.lines.covered;
    totalStatements += stats.statements.total;
    coveredStatements += stats.statements.covered;
    totalBranches += stats.branches.total;
    coveredBranches += stats.branches.covered;
    totalFunctions += stats.functions.total;
    coveredFunctions += stats.functions.covered;
  }

  // 새로운 total 계산
  const newTotal = {
    lines: {
      total: totalLines,
      covered: coveredLines,
      skipped: 0,
      pct: totalLines > 0 ? (coveredLines / totalLines) * 100 : 100,
    },
    statements: {
      total: totalStatements,
      covered: coveredStatements,
      skipped: 0,
      pct:
        totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 100,
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      skipped: 0,
      pct: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100,
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      skipped: 0,
      pct: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 100,
    },
    branchesTrue: originalTotal.branchesTrue || {
      total: 0,
      covered: 0,
      skipped: 0,
      pct: 100,
    },
  };

  // 필터링된 데이터 저장
  const filteredData = {
    total: newTotal,
    ...filteredEntries,
  };

  // coverage-summary.json과 coverage-final.json 모두 업데이트
  fs.writeFileSync(
    COVERAGE_SUMMARY,
    JSON.stringify(filteredData, null, 2),
    'utf8'
  );
  if (fs.existsSync(COVERAGE_FINAL)) {
    fs.writeFileSync(
      COVERAGE_FINAL,
      JSON.stringify(filteredData, null, 2),
      'utf8'
    );
  }

  // 결과 출력
  logInfo('\n✅ 커버리지 리포트 필터링 완료');
  logInfo(`\n📊 레거시 파일 제외 후 커버리지:`);
  logInfo(
    `  Statements: ${newTotal.statements.pct.toFixed(2)}% (${coveredStatements}/${totalStatements})`
  );
  logInfo(
    `  Branches:   ${newTotal.branches.pct.toFixed(2)}% (${coveredBranches}/${totalBranches})`
  );
  logInfo(
    `  Functions:  ${newTotal.functions.pct.toFixed(2)}% (${coveredFunctions}/${totalFunctions})`
  );
  logInfo(
    `  Lines:      ${newTotal.lines.pct.toFixed(2)}% (${coveredLines}/${totalLines})`
  );
  logInfo(
    `\n  (이전: ${originalTotal.lines.pct.toFixed(2)}% → 현재: ${newTotal.lines.pct.toFixed(2)}%)`
  );
}

// 실행
try {
  filterCoverageSummary();
} catch (error) {
  logError('❌ 커버리지 필터링 중 오류 발생:', error.message);
  process.exit(1);
}
