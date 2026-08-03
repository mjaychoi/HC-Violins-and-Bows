/**
 * Narrow static scan: detect project-ref-shaped hard-codes and reconstruction
 * tricks in executable staging/auth-matrix guard paths.
 *
 * Does NOT know any real production project ref. Synthetic fixtures in unit
 * tests are out of scope — scan only the active guard/workflow surfaces listed
 * in DEFAULT_SCAN_TARGETS.
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

/** Supabase project refs are 10–32 lowercase alphanumeric characters. */
export const PROJECT_REF_SHAPE = /^[a-z0-9]{10,32}$/;

/**
 * Active executable surfaces that must not embed or reconstruct a concrete
 * production project ref. Keep this list narrow to avoid false positives on
 * unrelated hashes, fixtures, or archived docs.
 */
export const DEFAULT_SCAN_TARGETS = [
  '.github/workflows/hosted-staging-integration.yml',
  'scripts/staging/env-guard.ts',
  'scripts/staging/env-guard-cli.ts',
  'scripts/auth-matrix/seed-fixtures.ts',
  'scripts/auth-matrix/cleanup-fixtures.ts',
  'tests/integration/auth-matrix/env-guard.ts',
] as const;

export type HardcodedProjectRefFinding = {
  file: string;
  kind:
    | 'bare_project_ref_literal'
    | 'fragment_join_reconstruction'
    | 'encoded_reconstruction';
  detail: string;
};

/** Quoted string literals that look like a complete Supabase project ref. */
const QUOTED_PROJECT_REF_LITERAL = /(['"`])([a-z0-9]{10,32})\1/g;

/**
 * Arrays of short alphanumeric fragments joined at runtime — a common way to
 * hide a contiguous project-ref literal from naive grep.
 */
const FRAGMENT_JOIN_PATTERNS: RegExp[] = [
  /(?:''|"")\.join\(\s*\[[^\]]*(?:['"`][a-z0-9]{2,8}['"`]\s*,\s*){2,}[^\]]*\]/i,
  /\[[^\]]*(?:['"`][a-z0-9]{2,8}['"`]\s*,\s*){2,}[^\]]*\]\s*\.join\(\s*(?:''|"")\s*\)/i,
  /\.join\(\s*\[[^\]]*(?:['"`][a-z0-9]{2,8}['"`]\s*,\s*){2,}[^\]]*\]\s*\)/i,
];

/** Encoding tricks that could reconstruct a concrete ref without a bare literal. */
const ENCODED_RECONSTRUCTION_PATTERNS: RegExp[] = [
  /Buffer\.from\s*\(\s*['"`][A-Za-z0-9+/=]{12,}['"`]\s*,\s*['"`]base64['"`]\s*\)/i,
  /atob\s*\(\s*['"`][A-Za-z0-9+/=]{12,}['"`]\s*\)/,
  /String\.fromCharCode\s*\(\s*(?:\d+\s*,\s*){9,}\d+\s*\)/,
  /\.split\s*\(\s*['"`]['"`]\s*\)\s*\.reverse\s*\(\s*\)\s*\.join\s*\(\s*['"`]['"`]\s*\)/,
];

export type BareLiteralScanMode =
  /** Flag every project-ref-shaped quoted literal (workflow YAML). */
  | 'strict'
  /** Flag shaped literals only in project-ref binding/comparison contexts. */
  | 'contextual'
  /** Skip bare-literal checks (seed/cleanup table names, etc.). */
  | 'reconstruction-only';

export type ScanSourceOptions = {
  bareLiteralMode?: BareLiteralScanMode;
};

function isCommentOnlyMatch(source: string, matchIndex: number): boolean {
  const lineStart = source.lastIndexOf('\n', matchIndex) + 1;
  const trimmed = source.slice(lineStart, matchIndex).trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return true;
  }
  const before = source.slice(0, matchIndex);
  const lastBlockOpen = before.lastIndexOf('/*');
  const lastBlockClose = before.lastIndexOf('*/');
  return lastBlockOpen > lastBlockClose;
}

/**
 * True when a shaped literal is bound/compared as a project-ref value — not when
 * it merely appears as a table name, NODE_ENV flag, or unrelated string.
 */
function isProjectRefBindingContext(
  source: string,
  matchIndex: number
): boolean {
  const before = source.slice(Math.max(0, matchIndex - 180), matchIndex);
  const compactBefore = before.replace(/\s+/g, ' ');

  if (
    /(?:productionProjectRef|approvedProjectRef|projectRef|PRODUCTION_SUPABASE_PROJECT_REF|STAGING_SUPABASE_PROJECT_REF|STAGING_PROJECT_REF)\s*(?:===|==|!==|!=)\s*$/i.test(
      compactBefore
    )
  ) {
    return true;
  }

  if (
    /(?:productionProjectRef|approvedProjectRef|projectRef|PRODUCTION_SUPABASE_PROJECT_REF|STAGING_SUPABASE_PROJECT_REF|STAGING_PROJECT_REF)\s*[:=]\s*$/i.test(
      compactBefore
    )
  ) {
    return true;
  }

  if (
    /(?:PRODUCTION_SUPABASE_PROJECT_REF|STAGING_SUPABASE_PROJECT_REF|STAGING_PROJECT_REF|productionProjectRef|approvedProjectRef)[\w.]*\s*(?:\?\?|\|\|)\s*$/i.test(
      compactBefore
    )
  ) {
    return true;
  }

  return false;
}

function resolveBareLiteralMode(
  fileLabel: string,
  explicit?: BareLiteralScanMode
): BareLiteralScanMode {
  if (explicit) {
    return explicit;
  }
  if (/\.ya?ml$/i.test(fileLabel)) {
    return 'strict';
  }
  if (/seed-fixtures|cleanup-fixtures/i.test(fileLabel)) {
    return 'reconstruction-only';
  }
  return 'contextual';
}

export function scanSourceForHardcodedProjectRefs(
  source: string,
  fileLabel: string,
  options: ScanSourceOptions = {}
): HardcodedProjectRefFinding[] {
  const findings: HardcodedProjectRefFinding[] = [];
  const bareLiteralMode = resolveBareLiteralMode(
    fileLabel,
    options.bareLiteralMode
  );

  if (bareLiteralMode !== 'reconstruction-only') {
    for (const match of source.matchAll(QUOTED_PROJECT_REF_LITERAL)) {
      const literal = match[2];
      if (!PROJECT_REF_SHAPE.test(literal)) {
        continue;
      }
      const index = match.index ?? 0;
      if (isCommentOnlyMatch(source, index)) {
        continue;
      }
      if (
        bareLiteralMode === 'contextual' &&
        !isProjectRefBindingContext(source, index)
      ) {
        continue;
      }
      findings.push({
        file: fileLabel,
        kind: 'bare_project_ref_literal',
        detail: `Quoted project-ref-shaped literal "${literal}"`,
      });
    }
  }

  for (const pattern of FRAGMENT_JOIN_PATTERNS) {
    const match = pattern.exec(source);
    if (match && !isCommentOnlyMatch(source, match.index)) {
      findings.push({
        file: fileLabel,
        kind: 'fragment_join_reconstruction',
        detail: `Fragment-join reconstruction near: ${match[0].slice(0, 80)}`,
      });
    }
  }

  for (const pattern of ENCODED_RECONSTRUCTION_PATTERNS) {
    const match = pattern.exec(source);
    if (match && !isCommentOnlyMatch(source, match.index)) {
      findings.push({
        file: fileLabel,
        kind: 'encoded_reconstruction',
        detail: `Encoded reconstruction near: ${match[0].slice(0, 80)}`,
      });
    }
  }

  return findings;
}

export function scanFilesForHardcodedProjectRefs(
  repoRoot: string,
  relativePaths: readonly string[] = DEFAULT_SCAN_TARGETS
): HardcodedProjectRefFinding[] {
  const findings: HardcodedProjectRefFinding[] = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      findings.push({
        file: relativePath,
        kind: 'bare_project_ref_literal',
        detail: `Expected scan target missing: ${relativePath}`,
      });
      continue;
    }
    const source = fs.readFileSync(absolutePath, 'utf8');
    findings.push(...scanSourceForHardcodedProjectRefs(source, relativePath));
  }

  return findings;
}

/**
 * Structural workflow contract: variable mapping only — no real ref values.
 */
export type WorkflowContractViolation = {
  code: string;
  message: string;
};

export function assertHostedStagingWorkflowContract(
  workflowSource: string
): WorkflowContractViolation[] {
  const violations: WorkflowContractViolation[] = [];

  if (/secrets\.AUTH_MATRIX_/.test(workflowSource)) {
    violations.push({
      code: 'auth_matrix_secrets',
      message:
        'Workflow must not read AUTH_MATRIX_* values from GitHub secrets.',
    });
  }

  if (
    !/PRODUCTION_SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.PRODUCTION_SUPABASE_PROJECT_REF\s*\}\}/.test(
      workflowSource
    )
  ) {
    violations.push({
      code: 'vars_mapping',
      message:
        'Workflow must map PRODUCTION_SUPABASE_PROJECT_REF from vars.PRODUCTION_SUPABASE_PROJECT_REF.',
    });
  }

  if (
    /PRODUCTION_SUPABASE_PROJECT_REF:\s*\$\{\{\s*secrets\./.test(workflowSource)
  ) {
    violations.push({
      code: 'secrets_source',
      message:
        'PRODUCTION_SUPABASE_PROJECT_REF must not be sourced from secrets.*.',
    });
  }

  // Fallback literals: assignment of a bare shaped ref, or shell default
  // ${PRODUCTION_SUPABASE_PROJECT_REF:-something}
  if (
    /PRODUCTION_SUPABASE_PROJECT_REF:\s*['"]?[a-z0-9]{10,32}['"]?\s*$/m.test(
      workflowSource
    ) ||
    /\$\{PRODUCTION_SUPABASE_PROJECT_REF:-[^}]+\}/.test(workflowSource)
  ) {
    violations.push({
      code: 'static_fallback',
      message:
        'Workflow must not define a static fallback production project ref.',
    });
  }

  if (!/environment:\s*hosted-staging/.test(workflowSource)) {
    violations.push({
      code: 'hosted_staging_environment',
      message: 'Hosted jobs must use environment: hosted-staging.',
    });
  }

  if (!/npx tsx scripts\/staging\/env-guard-cli\.ts/.test(workflowSource)) {
    violations.push({
      code: 'missing_guard_cli',
      message:
        'Hosted jobs must invoke scripts/staging/env-guard-cli.ts before hosted work.',
    });
  }

  // Hosted DB job: env-guard-cli must appear before migration-set / audits / health.
  const hostedJobMatch = workflowSource.match(
    /hosted-db-validation:[\s\S]*?(?=\n  [a-z0-9_-]+:|\n*$)/
  );
  if (hostedJobMatch) {
    const job = hostedJobMatch[0];
    const guardIdx = job.indexOf('scripts/staging/env-guard-cli.ts');
    const migrationSetIdx = job.indexOf(
      'scripts/staging/verify-migration-set.ts'
    );
    const auditsIdx = job.indexOf('scripts/staging/run-pr58-audits.sh');
    const healthIdx = job.indexOf('/api/health');
    if (guardIdx < 0) {
      violations.push({
        code: 'hosted_guard_order',
        message: 'hosted-db-validation must run env-guard-cli.ts.',
      });
    } else {
      for (const [label, idx] of [
        ['verify-migration-set', migrationSetIdx],
        ['run-pr58-audits', auditsIdx],
        ['health', healthIdx],
      ] as const) {
        if (idx >= 0 && idx < guardIdx) {
          violations.push({
            code: 'hosted_guard_order',
            message: `hosted-db-validation runs ${label} before env-guard-cli.ts.`,
          });
        }
      }
    }
  }

  if (/workflow_call/.test(workflowSource)) {
    violations.push({
      code: 'workflow_call',
      message: 'Hosted staging workflow must not expose workflow_call.',
    });
  }

  if (/secrets\.PRODUCTION_/.test(workflowSource)) {
    violations.push({
      code: 'production_secrets',
      message: 'Workflow must not reference secrets.PRODUCTION_*.',
    });
  }

  // No production deploy / database mutation path beyond staging secrets.
  if (
    /production[_-]deploy|deploy[_-]production|supabase\s+db\s+push|db\s+push\s+--linked/i.test(
      workflowSource
    )
  ) {
    violations.push({
      code: 'production_deploy_path',
      message:
        'Workflow must not contain a production database or deploy path.',
    });
  }

  // pull_request must not run hosted jobs (hosted jobs gated on workflow_dispatch).
  if (!/github\.event_name\s*==\s*'workflow_dispatch'/.test(workflowSource)) {
    violations.push({
      code: 'dispatch_gate',
      message:
        'Hosted jobs must be gated on github.event_name == workflow_dispatch.',
    });
  }

  return violations;
}

export function assertGuardCalledBeforeCreateClient(
  source: string,
  guardSymbol: string
): string | null {
  const guardIdx = source.indexOf(guardSymbol);
  const createIdx = source.search(/createClient\s*\(/);
  if (guardIdx < 0) {
    return `Missing ${guardSymbol} invocation.`;
  }
  if (createIdx < 0) {
    return 'Missing createClient invocation.';
  }
  if (createIdx < guardIdx) {
    return `${guardSymbol} must execute before createClient.`;
  }
  return null;
}

export function runHardcodedProjectRefGuard(repoRoot = process.cwd()): void {
  const findings = scanFilesForHardcodedProjectRefs(repoRoot);
  const workflowPath = path.join(
    repoRoot,
    '.github/workflows/hosted-staging-integration.yml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const contractViolations = assertHostedStagingWorkflowContract(workflow);

  if (findings.length > 0 || contractViolations.length > 0) {
    for (const finding of findings) {
      console.error(
        `[hardcoded-ref] ${finding.file}: ${finding.kind}: ${finding.detail}`
      );
    }
    for (const violation of contractViolations) {
      console.error(
        `[workflow-contract] ${violation.code}: ${violation.message}`
      );
    }
    process.exit(1);
  }

  console.log(
    'No hard-coded project-ref literals/reconstructions; workflow contract OK.'
  );
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (process.env.NODE_ENV !== 'test' && isDirectRun()) {
  runHardcodedProjectRefGuard();
}
