const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const activeDir = path.join(repoRoot, 'supabase', 'migrations');
const timestampedMigrationPattern = /^\d{14}_[a-z0-9_]+\.sql$/;
const bannedFilenames = new Set([
  'unified.sql',
  'secondary.sql',
  'add_organizations_table.sql',
]);
const overrideToken = 'migration-guard: allow-true-policy';
const bannedPredicatePatterns = [
  {
    label: 'USING (true)',
    regex: /\busing\s*\(\s*true\s*\)/gi,
  },
  {
    label: 'WITH CHECK (true)',
    regex: /\bwith\s+check\s*\(\s*true\s*\)/gi,
  },
];

function fail(message) {
  console.error(`Migration guard failed: ${message}`);
  process.exit(1);
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function hasOverrideComment(lines, lineNumber) {
  const candidateLines = [
    lines[lineNumber - 2] || '',
    lines[lineNumber - 1] || '',
  ];

  return candidateLines.some(line =>
    line.toLowerCase().includes(overrideToken)
  );
}

if (!fs.existsSync(activeDir)) {
  fail(`Active migrations directory not found: ${activeDir}`);
}

const activeFiles = fs
  .readdirSync(activeDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
  .map(entry => entry.name)
  .sort();

for (const file of activeFiles) {
  if (bannedFilenames.has(file)) {
    fail(`banned legacy migration is still in active path: ${file}`);
  }

  if (!timestampedMigrationPattern.test(file)) {
    fail(
      `non-versioned migration found in active path: ${file}. Only timestamp-prefixed migrations are deployable.`
    );
  }

  const fullPath = path.join(activeDir, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  const lines = sql.split('\n');

  for (const { label, regex } of bannedPredicatePatterns) {
    const matches = [...sql.matchAll(regex)];
    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      const lineNumber = getLineNumber(sql, matchIndex);

      if (hasOverrideComment(lines, lineNumber)) {
        continue;
      }

      fail(
        `unsafe predicate "${label}" found in active migration: ${file}:${lineNumber}. ` +
          `Add "-- ${overrideToken}" immediately above only if this is intentionally fail-open.`
      );
    }
  }
}

console.log(
  `Migration guard passed: ${activeFiles.length} active versioned migrations checked.`
);
