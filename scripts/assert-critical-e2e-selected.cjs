#!/usr/bin/env node
/**
 * Fail closed when the critical Playwright suite would select zero tests.
 * Reads the same @critical tags the PLAYWRIGHT_SUITE=critical grep uses.
 */
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(process.cwd(), 'tests', 'e2e');
const TAG_RE = /tag:\s*(?:\[\s*)?['"]@critical['"]/;

if (!fs.existsSync(TEST_DIR)) {
  console.error(`Critical E2E suite selected zero tests: missing ${TEST_DIR}`);
  process.exit(1);
}

function collectSpecFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSpecFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.spec\.ts$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const specFiles = collectSpecFiles(TEST_DIR);
let taggedTests = 0;

for (const file of specFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const matches = source.match(new RegExp(TAG_RE, 'g')) || [];
  taggedTests += matches.length;
}

if (taggedTests < 1) {
  console.error(
    "Critical E2E suite selected zero tests. Add tests with tag: '@critical' before running the blocking gate."
  );
  process.exit(1);
}

console.log(`Critical E2E suite selected ${taggedTests} tagged test(s).`);
