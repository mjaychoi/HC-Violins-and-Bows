# Parallel agent runner

Developer tooling. Runs several coding agents at once, each in its own Git
worktree cut from one exact `origin/main` SHA, then collects structured results.

It parallelizes **coding**. It deliberately does not parallelize merging or
hosted-staging E2E, and it cannot merge anything at all.

```
             resolve origin/main -> one SHA, shared by the whole batch
                                 |
   +----------------+------------+------------+----------------+
   |                |                         |                |
worktree b      worktree c                worktree g1      worktree h1
branch           branch                    branch           branch
agent            agent                     agent            agent
validate         validate                  validate         validate
scope check      scope check               scope check      scope check
   |                |                         |                |
   +----------------+------------+------------+----------------+
                                 |
                   results/<batch-id>/{B,C,...}/result.json
                              + summary.json
```

## What it does, and where it stops

```
prepare worktree
run agent
run local validation
validate changed-file scope
optionally commit      (--commit)
optionally push        (--push)
optionally open PR     (--open-pr)
collect result
```

It never merges a PR, deletes a remote branch, touches a production database,
triggers a production deploy, or changes GitHub / Vercel / Supabase settings.
There is no `--merge` flag and no code path that could add one by accident — a
test asserts the only `gh pr` subcommand in the source is `create`.

## Install

The repo is a Node/TypeScript project; this tool is the only Python in it. Keep
its one dependency in a throwaway virtualenv rather than anywhere global.

```bash
cd HC-Violins-and-Bows

python3 -m venv .venv-parallel
source .venv-parallel/bin/activate
pip install -r tools/parallel-agents/requirements.txt
```

## Use

Point the runner at a coding agent. The command is split with `shlex` and
executed without a shell, so no vendor is baked in:

```bash
export PARALLEL_AGENT_COMMAND='claude -p'
# later, or instead:
# export PARALLEL_AGENT_COMMAND='codex exec'
```

Always dry-run first. It creates nothing:

```bash
python tools/parallel-agents/parallel_runner.py \
  --tasks B,C,D,E,F,G1,H1 \
  --dry-run
```

Then run the batch. Default side effects are none beyond the worktrees:

```bash
python tools/parallel-agents/parallel_runner.py \
  --tasks B,C,D,E,F,G1,H1 \
  --run
```

Review the diffs yourself, then opt in to publishing:

```bash
python tools/parallel-agents/parallel_runner.py \
  --tasks B,C,D,E,F,G1,H1 \
  --run --commit --push --open-pr
```

Re-run one task, reusing its worktree and the work already in it:

```bash
python tools/parallel-agents/parallel_runner.py --tasks D --run --resume
```

### Modes and flags

| Flag                                                                                   | Effect                                                                      |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `--dry-run`                                                                            | Print the plan and exit. Creates no branch, worktree, or results directory. |
| `--prepare-only`                                                                       | Create branches and worktrees. Run no agent.                                |
| `--run`                                                                                | Prepare, run agents, validate, scope-check.                                 |
| `--commit`                                                                             | Commit tasks that passed validation **and** scope.                          |
| `--push`                                                                               | Push those branches (requires `--commit`).                                  |
| `--open-pr`                                                                            | Open one PR per pushed branch (requires `--push`).                          |
| `--resume`                                                                             | Reuse an existing worktree/branch instead of refusing.                      |
| `--tasks B,D`                                                                          | Select tasks (default: every enabled task).                                 |
| `--base-ref`                                                                           | Override `defaults.base_ref`.                                               |
| `--worktree-root`, `--results-root`, `--max-parallel`, `--agent-command`, `--batch-id` | Override manifest/env values.                                               |
| `--no-fetch`                                                                           | Resolve the base ref from local refs without fetching.                      |
| `--no-strip-env`                                                                       | Pass the full environment to children (see Security).                       |

Exactly one of `--dry-run` / `--prepare-only` / `--run` is required: launching
seven agents is not something that should happen from a bare invocation.

To retry a failed task: fix what it needs, then
`--tasks <id> --run --resume`. The runner never retries anything by itself.

## The task manifest

`tasks.yaml` defines the batch. Supported fields:

```yaml
version: 1

defaults:
  base_ref: origin/main # resolved once per batch
  worktree_root: /tmp/hc-parallel-agents
  max_parallel: 7
  timeout_minutes: 45
  repository: owner/repo # shown to the agent; falls back to origin's URL
  agent_command: null # PARALLEL_AGENT_COMMAND / --agent-command win
  validate: [...] # baseline, used only when a task omits its own
  forbidden_files: [...] # merged into every task
  strip_env_patterns: [...] # see Security
  commit_no_verify: true # see Commit behaviour

tasks:
  - id: B
    title: Connections CRUD critical
    branch: test/e2e-connections-critical
    prompt: prompts/B-connections.md
    depends_on: []
    allowed_files: [tests/e2e/connections.critical.spec.ts]
    allowed_file_prefixes: []
    forbidden_files: [tests/e2e/critical-path.spec.ts]
    validate:
      - npm run type-check
      - npm run lint
    hosted_e2e_required: true
    # optional
    enabled: true
    timeout_minutes: 45
    agent: null # per-task agent command override
    commit_message: 'test(e2e): add connections critical coverage'
```

The manifest is validated at load time and fails closed on: an unsupported
version, a duplicate id or branch, `main` as a branch, a missing prompt file, an
unknown or self-referential dependency, a dependency cycle, an absolute or
`..`-escaping path, a file listed as both allowed and forbidden, an unknown key,
a validation command containing shell metacharacters, and a validation command
that would need hosted staging or mutate external state.

### Scope ownership

A changed file is in scope when it matches `allowed_files` (exact match or
`fnmatch` glob — note `*` crosses `/`) or starts with one of
`allowed_file_prefixes`.

`forbidden_files` **wins over both**, so a broad prefix can never re-open a
frozen file. In this manifest `G1` may edit `.github/workflows/` but `ci.yml`
stays frozen for every task, because hosted-staging CI concurrency is a separate
coordination PR.

Changed files are collected from commits, the index, unstaged edits, **and**
untracked files, so an agent cannot dodge the check by leaving work uncommitted:

```bash
git diff --name-only <base_sha> HEAD
git diff --name-only --cached
git diff --name-only
git ls-files --others --exclude-standard
```

Anything out of scope sets `status = scope_violation`. The runner reports it and
**never reverts, resets, or deletes** the agent's work — a human decides.

### Dependencies

`depends_on` is supported for future batches (`G2: {depends_on: [G1]}`). A task
whose dependency did not reach `ready_for_pr`, or whose dependency was left out
of `--tasks`, gets `status = blocked_dependency` and is never started: no
worktree, no branch, no agent. Nothing is retried automatically.

## Statuses

| Status               | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `ready_for_pr`       | Agent exited 0, validation passed, scope passed.                  |
| `failed_agent`       | Agent exited non-zero. Validation skipped.                        |
| `failed_validation`  | Agent exited 0 but a `validate` command failed.                   |
| `scope_violation`    | Changed a forbidden or undeclared file.                           |
| `timeout`            | Exceeded `timeout_minutes`; process group terminated then killed. |
| `blocked_dependency` | An upstream task did not pass, or was not selected.               |
| `worktree_conflict`  | On-disk git state did not match expectations. Refused.            |
| `prepared`           | `--prepare-only` finished.                                        |
| `interrupted`        | Ctrl-C.                                                           |
| `error`              | Unexpected runner-side failure for that one task.                 |

A failure, timeout, or crash in one worker never cancels its siblings. The batch
exit code is non-zero if any task did not pass.

## Validation

An agent exiting 0 is not success. Each task's `validate` commands run in order
in its own worktree; the first failure marks the task failed and the rest are
reported `skipped`.

Hosted E2E (`npm run test:e2e:critical`) is **never** run locally — the manifest
loader rejects it as a validation command. Tasks that need it carry
`hosted_e2e_required: true`, which is surfaced in the result JSON, the terminal
summary, and the PR body.

### Hosted staging is serial; only local coding is parallel

```
Local coding is parallel.
Hosted staging E2E should remain serialized because tasks share staging
Supabase identities/data.
```

B/C/D/E/F/H1 all exercise the same staging Supabase project and the same seeded
E2E identities. Running their E2E suites concurrently would have them fight over
shared rows. This runner never triggers hosted E2E, and this tool's PR
deliberately does not touch `.github/workflows/ci.yml` concurrency — that is a
separate CI coordination change.

## Results and logging

Per-worker output is never interleaved:

```
results/<batch-id>/
  summary.json
  B/
    prompt.md              composed prompt the agent received
    agent.stdout.log
    agent.stderr.log
    validation.log
    result.json
    pr-body.md             only with --open-pr
```

`results/` is gitignored. The terminal gets concise progress
(`[B] agent started`, `[D] validation: npm run lint FAIL`) plus a final table:

```
TASK  STATUS           VALIDATION  SCOPE  BRANCH
B     ready_for_pr     PASS        PASS   test/e2e-connections-critical
C     ready_for_pr     PASS        PASS   test/e2e-member-authz-critical
D     failed_agent     SKIPPED     PASS   test/e2e-sale-lifecycle-critical
E     scope_violation  PASS        FAIL   test/e2e-maintenance-critical
```

## Worktree lifecycle

One worktree per task at `<worktree_root>/<task-id-lowercase>`.

- no worktree, no branch → `git worktree add -b <branch> <path> <base_sha>`
- expected worktree on the expected branch → reused **only** with `--resume`
- branch exists with no worktree → re-attached **only** with `--resume`
- anything else → refuse

Refused cases include: a worktree on a different or detached branch, a non-empty
unregistered directory, a stale/prunable registration, a branch already checked
out elsewhere, and — importantly — a worktree whose HEAD does not descend from
this batch's base SHA (a leftover from an older batch).

Prior `result.json` files are never trusted as state; the runner reads real git
state every time.

`git worktree remove --force`, `git branch -D`, `git reset --hard`, and
`git push --force` are not used anywhere, by design or by accident. Clean up
worktrees yourself:

```bash
git worktree list
git worktree remove /tmp/hc-parallel-agents/b
```

### Shared base SHA

`origin/main` is resolved to a full SHA **once** per batch, and every task
branches from that SHA. If `main` advances mid-batch, the running batch does not
notice. Review diffs against the `base_sha` recorded in `summary.json`.

## Commit behaviour

`--commit` only touches a task whose validation **and** scope both passed.
Push and PR additionally require the branch to be ahead of the base, so an empty
branch is never published. The message comes from `commit_message`, or is
derived from the branch prefix and title.

Commits are made with `--no-verify` (`defaults.commit_no_verify`). The runner
already ran the task's real validation explicitly, and a `lint-staged` pre-commit
hook can rewrite files _after_ the scope check has passed. Set it to `false` if
you would rather run the hooks.

`--open-pr` preflights `gh --version` and `gh auth status`, then runs
`gh pr create` with a generated body (base SHA, changed files, validation
results, hosted-E2E status, safety notes). If `gh` is unusable the PR is
recorded as skipped and the push still stands.

## Agent invocation

The prompt the agent receives is the task's prompt file prefixed with a shared
header: repository, task, resolved base SHA, branch, worktree, the allowed and
forbidden file lists, the validation commands, hosted-E2E status, and the shared
rules (work only in this worktree; touch no external resources; do not merge; do
not push or open a PR; stop and explain instead of going out of scope; use the
pinned Node/npm; never `npm audit fix --force`; do not weaken tests; no
`test.skip`).

Delivery is stdin by default. If the command contains a placeholder —
`{prompt_file}`, `{worktree}`, `{task_id}`, `{branch}`, `{base_sha}` — the
prompt is written to a file and the placeholder substituted instead:

```bash
export PARALLEL_AGENT_COMMAND='myagent --prompt-file {prompt_file} --cwd {worktree}'
```

Agents run with `cwd` set to their worktree, in their own process group so a
timeout kills the whole tree. `shell=True` is never used.

## Timeouts and Ctrl-C

On timeout: `SIGTERM` to the process group, 10s grace, then `SIGKILL`; the task
is marked `timeout` and other workers keep running.

On Ctrl-C: children are terminated, results are flushed (each `result.json` is
written as its task finishes, so nothing in flight is lost), and **worktrees,
branches, and remote branches are all preserved**.

## Security

> **The agent subprocess inherits this shell's environment.** Anything exported
> in your shell — cloud credentials, database URLs, service-role keys — is
> visible to the agent you launch and to anything it runs.

As a partial mitigation the runner strips obviously-unnecessary secrets from
child environments (`defaults.strip_env_patterns`): AWS keys, `GITHUB_TOKEN` /
`GH_TOKEN`, Vercel/npm/Codecov tokens, Supabase access and service-role keys,
`*_DB_PASSWORD`, `PRODUCTION_*`, `PROD_*`. The count is reported at startup.
`--no-strip-env` disables it.

This is a reduction, not a sandbox. It is not a substitute for running agents
with credentials they actually need and nothing more. The agent's own API key
(e.g. `ANTHROPIC_API_KEY`) is deliberately **not** stripped, or it could not run.

Terminal output and `result.json` go through a redactor that masks the values of
secret-looking environment variables and token-shaped strings (`ghp_`,
`github_pat_`, `sk-ant-`, `AKIA…`, JWTs). Per-task log files on disk are kept
raw so failures stay debuggable — treat `results/` as sensitive.

Secret-looking agent output is never copied into the aggregate summary.

## Tests

No test touches the real repository, GitHub, hosted staging, or production. Each
builds a throwaway git repo in a temp directory and uses
`tests/fake_agent.py` — a deterministic stand-in driven by `FAKE_AGENT_PLAN` —
instead of a real agent.

```bash
cd tools/parallel-agents
python3 -m unittest discover -s tests -t tests
```

Covered: manifest parsing and every rejection case, task selection, dependency
ordering and cycles, dependency blocking, allowed/forbidden file classification,
agent command parsing and placeholder expansion, env stripping, redaction,
worktree fresh/resume/refuse paths, changed-file collection, commit gating,
timeout classification and process termination, dry-run creating nothing, worker
isolation and concurrency, failure isolation, and the absence of any merge path.

A narrated end-to-end demonstration:

```bash
python3 tools/parallel-agents/tests/demo_fake_batch.py
```

## Scope of this tool

Single machine, standard library plus PyYAML, `asyncio` for concurrency. No
LangChain, no LangGraph, no Redis, no Celery, no database, no web dashboard, no
container orchestration, no distributed workers, no automatic review agent, no
merge queue, no deploys.

The structure (`TaskConfig`, `GitWorktreeManager`, `AgentRunner`, `Validator`,
`ScopeChecker`, `execute_task`, `execute_batch`) is boring on purpose, so it
could later be driven by a graph framework without rewriting the git and safety
logic. That is not this version's problem.

## Files

```
tools/parallel-agents/
  parallel_runner.py   CLI, agent invocation, validation, orchestration, reporting
  runner_config.py     manifest schema, dependency resolution, scope rules
  runner_git.py        worktree lifecycle, change collection, commit/push
  tasks.yaml           the batch definition
  requirements.txt     PyYAML
  prompts/             one prompt per task
  tests/               unit + integration tests, fake agent, demo
  results/             runtime output (gitignored)
```
