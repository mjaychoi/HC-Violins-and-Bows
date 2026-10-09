#!/usr/bin/env python3
"""Run several coding agents in parallel, each in its own Git worktree.

One batch resolves `origin/main` to an exact SHA once, then gives every selected
task its own branch and worktree cut from that same SHA. Agents run
concurrently, their output is kept apart, each task's changed files are checked
against the ownership it declared in `tasks.yaml`, and local validation runs per
task. Commit, push, and PR creation are opt-in.

This tool never merges anything. See README.md.

Usage:
    python tools/parallel-agents/parallel_runner.py --tasks B,C --dry-run
    python tools/parallel-agents/parallel_runner.py --tasks B,C --run
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from runner_config import (  # noqa: E402
    BatchConfig,
    ConfigError,
    ScopeChecker,
    ScopeReport,
    TaskConfig,
    agent_command_uses_placeholder,
    expand_agent_command,
    filter_env,
    load_manifest,
    parse_agent_command,
    select_tasks,
    stripped_env_keys,
    topological_waves,
    unsatisfied_dependencies,
)
from runner_git import (  # noqa: E402
    GitError,
    GitWorktreeManager,
    WorktreeConflict,
    run_command,
)

# --------------------------------------------------------------------------- #
# statuses
# --------------------------------------------------------------------------- #

STATUS_DRY_RUN = "dry_run"
STATUS_PREPARED = "prepared"
STATUS_READY_FOR_PR = "ready_for_pr"
STATUS_FAILED_AGENT = "failed_agent"
STATUS_FAILED_VALIDATION = "failed_validation"
STATUS_SCOPE_VIOLATION = "scope_violation"
STATUS_TIMEOUT = "timeout"
STATUS_BLOCKED_DEPENDENCY = "blocked_dependency"
STATUS_WORKTREE_CONFLICT = "worktree_conflict"
STATUS_INTERRUPTED = "interrupted"
STATUS_ERROR = "error"

#: Only a fully clean task may be committed (validation pass + scope pass).
COMMITTABLE_STATUSES = frozenset({STATUS_READY_FOR_PR})

TERMINATE_GRACE_SECONDS = 10.0


# --------------------------------------------------------------------------- #
# secret-aware output handling
# --------------------------------------------------------------------------- #

_SECRETISH_KEY = re.compile(
    r"(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|SERVICE_ROLE|_KEY$|_DSN$)",
    re.IGNORECASE,
)

_SECRET_VALUE_PATTERNS = (
    re.compile(r"ghp_[A-Za-z0-9]{16,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gho_[A-Za-z0-9]{16,}"),
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
)

REDACTED = "***REDACTED***"


class Redactor:
    """Masks secret-looking text before it reaches the terminal or result JSON.

    Per-task log files on disk stay raw so failures remain debuggable; only the
    aggregated summary and result JSON go through here.
    """

    def __init__(self, env: Mapping[str, str] | None = None) -> None:
        source = os.environ if env is None else env
        self._values = sorted(
            (
                value
                for key, value in source.items()
                if _SECRETISH_KEY.search(key) and isinstance(value, str) and len(value) >= 8
            ),
            key=len,
            reverse=True,
        )

    def __call__(self, text: str) -> str:
        if not text:
            return text
        for value in self._values:
            if value in text:
                text = text.replace(value, REDACTED)
        for pattern in _SECRET_VALUE_PATTERNS:
            text = pattern.sub(REDACTED, text)
        return text


def tail_lines(text: str, limit: int = 20) -> str:
    lines = [line for line in text.splitlines() if line.strip()]
    return "\n".join(lines[-limit:])


# --------------------------------------------------------------------------- #
# result model
# --------------------------------------------------------------------------- #


@dataclass
class ValidationOutcome:
    command: str
    status: str  # pass | fail | skipped | error
    returncode: int | None = None
    duration_seconds: float = 0.0
    tail: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"command": self.command, "status": self.status}
        if self.returncode is not None:
            out["returncode"] = self.returncode
        out["duration_seconds"] = round(self.duration_seconds, 1)
        if self.tail:
            out["tail"] = self.tail
        return out


@dataclass
class TaskResult:
    id: str
    title: str
    status: str
    base_sha: str
    branch: str
    worktree: str | None = None
    depends_on: list[str] = field(default_factory=list)
    agent_exit_code: int | None = None
    timed_out: bool = False
    duration_seconds: float = 0.0
    changed_files: list[str] = field(default_factory=list)
    unexpected_files: list[str] = field(default_factory=list)
    forbidden_files_touched: list[str] = field(default_factory=list)
    scope_ok: bool | None = None
    validation: list[ValidationOutcome] = field(default_factory=list)
    hosted_e2e_required: bool = False
    commit: dict[str, Any] | None = None
    pr: dict[str, Any] | None = None
    logs: dict[str, str] = field(default_factory=dict)
    worktree_reused: bool | None = None
    error: str | None = None

    @property
    def validation_summary(self) -> str:
        if not self.validation:
            return "NONE"
        if any(item.status in {"fail", "error"} for item in self.validation):
            return "FAIL"
        if all(item.status == "skipped" for item in self.validation):
            return "SKIPPED"
        if any(item.status == "skipped" for item in self.validation):
            return "PARTIAL"
        return "PASS"

    @property
    def scope_summary(self) -> str:
        if self.scope_ok is None:
            return "n/a"
        return "PASS" if self.scope_ok else "FAIL"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "base_sha": self.base_sha,
            "branch": self.branch,
            "worktree": self.worktree,
            "depends_on": self.depends_on,
            "agent_exit_code": self.agent_exit_code,
            "timed_out": self.timed_out,
            "duration_seconds": round(self.duration_seconds, 1),
            "changed_files": self.changed_files,
            "scope_ok": self.scope_ok,
            "unexpected_files": self.unexpected_files,
            "forbidden_files_touched": self.forbidden_files_touched,
            "validation": [item.as_dict() for item in self.validation],
            "hosted_e2e_required": self.hosted_e2e_required,
            "commit": self.commit,
            "pr": self.pr,
            "logs": self.logs,
            "worktree_reused": self.worktree_reused,
            "error": self.error,
        }


def classify_status(
    *,
    timed_out: bool,
    agent_exit_code: int | None,
    scope_report: ScopeReport | None,
    validations: Sequence[ValidationOutcome],
) -> str:
    """Decide a task's terminal status.

    Execution outcomes come first because they explain *why* nothing else can be
    trusted; the SCOPE column still reports a violation independently.
    """
    if timed_out:
        return STATUS_TIMEOUT
    if agent_exit_code is None or agent_exit_code != 0:
        return STATUS_FAILED_AGENT
    if scope_report is not None and not scope_report.scope_ok:
        return STATUS_SCOPE_VIOLATION
    if any(item.status in {"fail", "error"} for item in validations):
        return STATUS_FAILED_VALIDATION
    return STATUS_READY_FOR_PR


# --------------------------------------------------------------------------- #
# progress reporting
# --------------------------------------------------------------------------- #


class Reporter:
    """Concise, interleaved, per-task progress lines on one stream."""

    def __init__(self, redact: Redactor, stream=None) -> None:
        self._redact = redact
        self._stream = stream or sys.stdout
        self._lock = asyncio.Lock()

    def emit(self, task_id: str, message: str) -> None:
        print(f"[{task_id}] {self._redact(message)}", file=self._stream, flush=True)

    async def say(self, task_id: str, message: str) -> None:
        async with self._lock:
            self.emit(task_id, message)


# --------------------------------------------------------------------------- #
# prompt composition
# --------------------------------------------------------------------------- #

PROMPT_RULES = """- Work only in this worktree. Do not touch other worktrees or the main checkout.
- Do not modify production or staging external resources (no AWS, Supabase,
  Vercel, GitHub secrets, or database mutations).
- Do not merge anything. Do not run `gh pr merge`.
- Do not push or open a pull request; the runner does that only when asked.
- Do not modify files outside the allowed scope unless absolutely necessary.
- If an out-of-scope file is necessary, stop and explain why instead of
  modifying it. The runner fails the task closed on out-of-scope changes.
- Use the repo-pinned Node/npm versions (see .nvmrc and package.json).
- Never use `npm audit fix --force`.
- Do not weaken tests to make them pass.
- Do not use `test.skip` to hide failures.
- Leave your work uncommitted or committed on this branch; either is fine."""


def _bullets(items: Sequence[str], empty: str = "(none)") -> str:
    if not items:
        return empty
    return "\n".join(f"- {item}" for item in items)


def compose_prompt(
    task: TaskConfig, *, base_sha: str, worktree: Path, repository: str | None
) -> str:
    """Wrap the task prompt file in the shared safety header."""
    allowed = list(task.allowed_files) + [f"{prefix}** (prefix)" for prefix in task.allowed_file_prefixes]
    body = task.prompt_path.read_text(encoding="utf-8").strip()
    hosted = (
        "This task's end-to-end coverage runs against shared hosted staging in CI.\n"
        "Do NOT run the hosted E2E suite locally."
        if task.hosted_e2e_required
        else "No hosted E2E requirement recorded for this task."
    )
    return f"""You are working in an isolated Git worktree.

Repository:
{repository or "(unknown remote)"}

Task:
{task.id} — {task.title}

Resolved base SHA:
{base_sha}

Branch:
{task.branch}

Worktree:
{worktree}

Rules:
{PROMPT_RULES}

Allowed files:
{_bullets(allowed)}

Forbidden files (changing any of these fails the task closed):
{_bullets(list(task.forbidden_files))}

Local validation that must pass when you are done:
{_bullets(list(task.validate))}

Hosted E2E:
{hosted}

Task-specific instructions:
{body}
"""


# --------------------------------------------------------------------------- #
# agent invocation
# --------------------------------------------------------------------------- #


@dataclass
class AgentRun:
    exit_code: int | None
    timed_out: bool
    duration_seconds: float


async def _terminate_tree(proc: asyncio.subprocess.Process) -> None:
    """Stop an agent and anything it spawned, politely then firmly."""
    if proc.returncode is not None:
        return
    try:
        pgid = os.getpgid(proc.pid)
    except (ProcessLookupError, PermissionError, OSError):
        pgid = None

    with contextlib.suppress(ProcessLookupError, PermissionError, OSError):
        if pgid is not None:
            os.killpg(pgid, 15)  # SIGTERM
        else:
            proc.terminate()

    with contextlib.suppress(asyncio.TimeoutError):
        await asyncio.wait_for(proc.wait(), timeout=TERMINATE_GRACE_SECONDS)
        return

    with contextlib.suppress(ProcessLookupError, PermissionError, OSError):
        if pgid is not None:
            os.killpg(pgid, 9)  # SIGKILL
        else:
            proc.kill()
    with contextlib.suppress(asyncio.TimeoutError):
        await asyncio.wait_for(proc.wait(), timeout=TERMINATE_GRACE_SECONDS)


class AgentRunner:
    """Invokes the configured coding agent for one task.

    The command comes from PARALLEL_AGENT_COMMAND / --agent-command / the
    manifest, is split with shlex, and is executed without a shell. If it
    contains a documented placeholder the composed prompt is written to a file
    and substituted; otherwise it is piped to the child's stdin.
    """

    def __init__(self, argv: Sequence[str], child_env: Mapping[str, str]) -> None:
        self.argv = list(argv)
        self.child_env = dict(child_env)
        self.uses_placeholder = agent_command_uses_placeholder(self.argv)

    def resolve_argv(self, task: TaskConfig, worktree: Path, base_sha: str, prompt_file: Path) -> list[str]:
        if not self.uses_placeholder:
            return list(self.argv)
        return expand_agent_command(
            self.argv,
            {
                "prompt_file": str(prompt_file),
                "worktree": str(worktree),
                "task_id": task.id,
                "branch": task.branch,
                "base_sha": base_sha,
            },
        )

    async def run(
        self,
        *,
        task: TaskConfig,
        worktree: Path,
        base_sha: str,
        prompt_text: str,
        log_dir: Path,
        timeout_seconds: float,
    ) -> AgentRun:
        prompt_file = log_dir / "prompt.md"
        prompt_file.write_text(prompt_text, encoding="utf-8")
        argv = self.resolve_argv(task, worktree, base_sha, prompt_file)

        started = time.monotonic()
        stdout_path = log_dir / "agent.stdout.log"
        stderr_path = log_dir / "agent.stderr.log"

        with stdout_path.open("wb") as out, stderr_path.open("wb") as err:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=str(worktree),
                env=self.child_env,
                stdin=asyncio.subprocess.PIPE if not self.uses_placeholder else asyncio.subprocess.DEVNULL,
                stdout=out,
                stderr=err,
                start_new_session=True,  # own process group, so timeouts kill the tree
            )
            try:
                if not self.uses_placeholder and proc.stdin is not None:
                    proc.stdin.write(prompt_text.encode("utf-8"))
                    with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                        await proc.stdin.drain()
                    with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                        proc.stdin.close()
                await asyncio.wait_for(proc.wait(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                await _terminate_tree(proc)
                return AgentRun(
                    exit_code=proc.returncode, timed_out=True,
                    duration_seconds=time.monotonic() - started,
                )
            except asyncio.CancelledError:
                await _terminate_tree(proc)
                raise

        return AgentRun(
            exit_code=proc.returncode, timed_out=False, duration_seconds=time.monotonic() - started
        )


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #


class Validator:
    """Runs a task's declared validation commands in order, in its worktree.

    The manifest is the source of truth. A non-zero exit marks the task failed
    even when the agent exited 0; remaining commands are then skipped.
    """

    def __init__(self, child_env: Mapping[str, str], redact: Redactor) -> None:
        self.child_env = dict(child_env)
        self._redact = redact

    async def run(
        self,
        *,
        task: TaskConfig,
        worktree: Path,
        log_dir: Path,
        timeout_seconds: float,
        reporter: Reporter | None = None,
    ) -> list[ValidationOutcome]:
        import shlex

        outcomes: list[ValidationOutcome] = []
        log_path = log_dir / "validation.log"
        failed = False

        with log_path.open("a", encoding="utf-8") as log:
            for command in task.validate:
                if failed:
                    outcomes.append(ValidationOutcome(command=command, status="skipped"))
                    log.write(f"\n=== SKIPPED (earlier command failed): {command} ===\n")
                    continue

                argv = shlex.split(command)
                log.write(f"\n=== RUN: {command} ===\n")
                started = time.monotonic()
                try:
                    result = await run_command(
                        argv, cwd=worktree, env=self.child_env, timeout=timeout_seconds
                    )
                except FileNotFoundError as exc:
                    duration = time.monotonic() - started
                    log.write(f"--- not executable: {exc}\n")
                    outcomes.append(
                        ValidationOutcome(
                            command=command, status="error", duration_seconds=duration,
                            tail=self._redact(str(exc)),
                        )
                    )
                    failed = True
                    if reporter:
                        await reporter.say(task.id, f"validation: {command} ERROR (not executable)")
                    continue
                except GitError as exc:  # run_command timeout
                    duration = time.monotonic() - started
                    log.write(f"--- timed out: {exc}\n")
                    outcomes.append(
                        ValidationOutcome(
                            command=command, status="error", duration_seconds=duration,
                            tail=self._redact(str(exc)),
                        )
                    )
                    failed = True
                    if reporter:
                        await reporter.say(task.id, f"validation: {command} TIMEOUT")
                    continue

                duration = time.monotonic() - started
                log.write(result.stdout)
                if result.stderr:
                    log.write("\n--- stderr ---\n")
                    log.write(result.stderr)
                log.write(f"\n=== EXIT {result.returncode} ({duration:.1f}s) ===\n")

                passed = result.ok
                outcomes.append(
                    ValidationOutcome(
                        command=command,
                        status="pass" if passed else "fail",
                        returncode=result.returncode,
                        duration_seconds=duration,
                        tail=None if passed else self._redact(tail_lines(result.stdout + "\n" + result.stderr)),
                    )
                )
                if not passed:
                    failed = True
                if reporter:
                    await reporter.say(
                        task.id, f"validation: {command} {'PASS' if passed else 'FAIL'}"
                    )

        return outcomes


# --------------------------------------------------------------------------- #
# PR body
# --------------------------------------------------------------------------- #


def build_pr_body(result: TaskResult, *, repository: str | None, agent_report: str | None = None) -> str:
    validation_lines = (
        "\n".join(f"- {item.command}: {item.status.upper()}" for item in result.validation)
        or "- (no validation commands declared)"
    )
    hosted = (
        "PENDING — requires GitHub CI against shared hosted staging."
        if result.hosted_e2e_required
        else "Not required for this task."
    )
    body = f"""## Parallel agent task

Task: {result.id} — {result.title}

Base SHA:
`{result.base_sha}`

Changed files:
{_bullets(result.changed_files)}

Local validation:
{validation_lines}

Hosted E2E:
{hosted}

## Safety

- No production mutation
- No auto-merge
- Worktree-isolated task
- Changed files validated against declared task scope
"""
    if agent_report:
        body += f"\n## Agent report\n\n{agent_report.strip()}\n"
    return body


async def gh_available() -> tuple[bool, str]:
    version = await run_command(["gh", "--version"], timeout=30.0)
    if not version.ok:
        return False, "`gh --version` failed; GitHub CLI is not usable here."
    auth = await run_command(["gh", "auth", "status"], timeout=60.0)
    if not auth.ok:
        return False, "`gh auth status` reports no authenticated account."
    return True, version.stdout.splitlines()[0] if version.stdout else "gh available"


# --------------------------------------------------------------------------- #
# batch execution
# --------------------------------------------------------------------------- #


@dataclass
class RunOptions:
    mode: str  # dry-run | prepare | run
    commit: bool = False
    push: bool = False
    open_pr: bool = False
    resume: bool = False
    max_parallel: int = 7
    base_ref: str = "origin/main"
    fetch: bool = True

    @property
    def would_commit(self) -> bool:
        return self.commit

    @property
    def would_push(self) -> bool:
        return self.commit and self.push

    @property
    def would_open_pr(self) -> bool:
        return self.commit and self.push and self.open_pr


@dataclass
class Batch:
    batch_id: str
    base_sha: str
    base_ref: str
    repository: str | None
    results_dir: Path
    worktree_root: Path
    options: RunOptions
    selected: tuple[TaskConfig, ...]
    started_at: str
    commit_no_verify: bool = True
    results: dict[str, TaskResult] = field(default_factory=dict)

    def summary_dict(self, finished_at: str | None = None) -> dict[str, Any]:
        order = {task.id: index for index, task in enumerate(self.selected)}
        tasks = sorted(self.results.values(), key=lambda r: order.get(r.id, 999))
        return {
            "batch_id": self.batch_id,
            "repository": self.repository,
            "base_ref": self.base_ref,
            "base_sha": self.base_sha,
            "worktree_root": str(self.worktree_root),
            "mode": self.options.mode,
            "commit": self.options.commit,
            "push": self.options.would_push,
            "open_pr": self.options.would_open_pr,
            "started_at": self.started_at,
            "finished_at": finished_at,
            "tasks": [result.as_dict() for result in tasks],
        }


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


async def commit_push_and_pr(
    *,
    task: TaskConfig,
    batch: Batch,
    manager: GitWorktreeManager,
    reporter: Reporter,
    result: TaskResult,
    worktree: Path,
    log_dir: Path,
    gh_ready: tuple[bool, str] | None,
) -> None:
    """Commit, optionally push, optionally open a PR for one clean task.

    Reached only for a task whose validation and scope checks both passed. Push
    and PR are additionally gated on the branch actually being ahead of the
    batch base, so an empty branch is never published.
    """
    dirty = await manager.is_dirty(worktree)
    head_before = await manager.head_sha(worktree)

    if not dirty and head_before == batch.base_sha:
        result.commit = {"status": "skipped", "reason": "no changes to commit"}
        await reporter.say(task.id, "commit skipped: no changes")
    else:
        sha = await manager.commit_all(worktree, task.commit_message, no_verify=batch.commit_no_verify)
        head_after = sha or head_before
        result.commit = {
            "sha": head_after,
            "message": task.commit_message,
            "created": bool(sha),
        }
        await reporter.say(task.id, f"commit {head_after[:12]} {task.commit_message!r}")

    head_now = await manager.head_sha(worktree)
    ahead_of_base = head_now != batch.base_sha
    if not batch.options.push:
        return
    if not ahead_of_base:
        result.pr = {"status": "skipped", "reason": "branch has no commits ahead of base"}
        await reporter.say(task.id, "push skipped: branch has no commits ahead of base")
        return

    await manager.push_branch(worktree, task.branch)
    await reporter.say(task.id, f"pushed {task.branch} to origin")
    result.commit["pushed"] = True

    if not batch.options.open_pr:
        return
    if not (gh_ready and gh_ready[0]):
        result.pr = {
            "status": "skipped",
            "reason": gh_ready[1] if gh_ready else "gh availability was not checked",
        }
        return

    body_file = log_dir / "pr-body.md"
    body_file.write_text(build_pr_body(result, repository=batch.repository), encoding="utf-8")
    base_branch = batch.base_ref.split("/", 1)[-1]
    pr = await run_command(
        [
            "gh", "pr", "create",
            "--base", base_branch,
            "--head", task.branch,
            "--title", task.commit_message,
            "--body-file", str(body_file),
        ],
        cwd=worktree,
        timeout=180.0,
    )
    if pr.ok:
        url = pr.stdout.strip().splitlines()[-1] if pr.stdout.strip() else None
        result.pr = {"url": url, "body_file": str(body_file)}
        await reporter.say(task.id, f"PR opened: {url}")
    else:
        result.pr = {"status": "failed", "reason": tail_lines(pr.stderr or pr.stdout, 5)}
        await reporter.say(task.id, "PR creation failed (see result.json)")


async def execute_task(
    *,
    task: TaskConfig,
    batch: Batch,
    manager: GitWorktreeManager,
    agent: AgentRunner,
    validator: Validator,
    reporter: Reporter,
    semaphore: asyncio.Semaphore,
    dependency_results: Mapping[str, asyncio.Task[TaskResult]],
    gh_ready: tuple[bool, str] | None,
) -> TaskResult:
    """Run one task end to end. Always returns a TaskResult, never raises."""
    result = TaskResult(
        id=task.id,
        title=task.title,
        status=STATUS_ERROR,
        base_sha=batch.base_sha,
        branch=task.branch,
        depends_on=list(task.depends_on),
        hosted_e2e_required=task.hosted_e2e_required,
    )
    log_dir = batch.results_dir / task.id
    started = time.monotonic()

    def finish(status: str) -> TaskResult:
        result.status = status
        result.duration_seconds = time.monotonic() - started
        _write_json(log_dir / "result.json", result.as_dict())
        batch.results[task.id] = result
        return result

    try:
        # ---- dependencies: never run downstream work on a failed upstream ----
        unsatisfied = unsatisfied_dependencies(task, [t.id for t in batch.selected])
        if unsatisfied:
            log_dir.mkdir(parents=True, exist_ok=True)
            result.error = (
                f"dependency {unsatisfied} not part of this batch selection; "
                "add them to --tasks or run them first"
            )
            await reporter.say(task.id, f"blocked: {result.error}")
            return finish(STATUS_BLOCKED_DEPENDENCY)

        for dep_id in task.depends_on:
            dep_result = await dependency_results[dep_id]
            if dep_result.status not in COMMITTABLE_STATUSES:
                log_dir.mkdir(parents=True, exist_ok=True)
                result.error = f"dependency {dep_id} finished with status {dep_result.status}"
                await reporter.say(task.id, f"blocked: {result.error}")
                return finish(STATUS_BLOCKED_DEPENDENCY)

        async with semaphore:
            log_dir.mkdir(parents=True, exist_ok=True)

            # ---- worktree ----
            worktree_path = task.worktree_path(batch.worktree_root)
            try:
                prepared = await manager.prepare(
                    branch=task.branch,
                    path=worktree_path,
                    base_sha=batch.base_sha,
                    resume=batch.options.resume,
                )
            except (WorktreeConflict, GitError) as exc:
                result.worktree = str(worktree_path)
                result.error = str(exc)
                await reporter.say(task.id, f"worktree conflict: {exc}")
                return finish(STATUS_WORKTREE_CONFLICT)

            result.worktree = str(prepared.path)
            result.worktree_reused = prepared.reused
            await reporter.say(
                task.id,
                f"worktree {'reused' if prepared.reused else 'created'} at {prepared.path} "
                f"on {task.branch} @ {batch.base_sha[:12]}",
            )

            if batch.options.mode == "prepare":
                result.changed_files = await manager.changed_files(prepared.path, batch.base_sha)
                return finish(STATUS_PREPARED)

            # ---- agent ----
            prompt_text = compose_prompt(
                task, base_sha=batch.base_sha, worktree=prepared.path, repository=batch.repository
            )
            await reporter.say(task.id, "agent started")
            run = await agent.run(
                task=task,
                worktree=prepared.path,
                base_sha=batch.base_sha,
                prompt_text=prompt_text,
                log_dir=log_dir,
                timeout_seconds=task.timeout_minutes * 60,
            )
            result.agent_exit_code = run.exit_code
            result.timed_out = run.timed_out
            result.logs = {
                "agent_stdout": str(log_dir / "agent.stdout.log"),
                "agent_stderr": str(log_dir / "agent.stderr.log"),
                "prompt": str(log_dir / "prompt.md"),
            }
            await reporter.say(
                task.id,
                f"agent {'TIMEOUT' if run.timed_out else f'exited {run.exit_code}'} "
                f"after {run.duration_seconds:.0f}s",
            )

            # ---- validation (skipped when the agent did not finish cleanly) ----
            if not run.timed_out and run.exit_code == 0 and task.validate:
                result.validation = await validator.run(
                    task=task,
                    worktree=prepared.path,
                    log_dir=log_dir,
                    timeout_seconds=task.timeout_minutes * 60,
                    reporter=reporter,
                )
                result.logs["validation"] = str(log_dir / "validation.log")
            elif task.validate:
                result.validation = [
                    ValidationOutcome(command=command, status="skipped")
                    for command in task.validate
                ]

            # ---- scope: always checked, fails closed ----
            changed = await manager.changed_files(prepared.path, batch.base_sha)
            scope_report = ScopeChecker(task).check(changed)
            result.changed_files = list(scope_report.changed_files)
            result.unexpected_files = list(scope_report.unexpected_files)
            result.forbidden_files_touched = list(scope_report.forbidden_files_touched)
            result.scope_ok = scope_report.scope_ok
            if not scope_report.scope_ok:
                await reporter.say(
                    task.id,
                    "scope violation — forbidden="
                    f"{result.forbidden_files_touched} unexpected={result.unexpected_files}",
                )

            status = classify_status(
                timed_out=run.timed_out,
                agent_exit_code=run.exit_code,
                scope_report=scope_report,
                validations=result.validation,
            )

            # ---- commit / push / PR, only for a fully clean task ----
            if status in COMMITTABLE_STATUSES and batch.options.commit:
                await commit_push_and_pr(
                    task=task,
                    batch=batch,
                    manager=manager,
                    reporter=reporter,
                    result=result,
                    worktree=prepared.path,
                    log_dir=log_dir,
                    gh_ready=gh_ready,
                )
            elif batch.options.commit:
                result.commit = {
                    "status": "skipped",
                    "reason": f"task status {status}: commit requires validation pass and scope pass",
                }

            return finish(status)

    except asyncio.CancelledError:
        log_dir.mkdir(parents=True, exist_ok=True)
        result.error = "interrupted"
        finish(STATUS_INTERRUPTED)
        raise
    except Exception as exc:  # one worker's crash must not take down the batch
        log_dir.mkdir(parents=True, exist_ok=True)
        result.error = f"{type(exc).__name__}: {exc}"
        await reporter.say(task.id, f"error: {result.error}")
        return finish(STATUS_ERROR)


async def execute_batch(
    *,
    batch: Batch,
    manager: GitWorktreeManager,
    agent: AgentRunner,
    validator: Validator,
    reporter: Reporter,
    gh_ready: tuple[bool, str] | None,
) -> dict[str, TaskResult]:
    """Run every selected task, honouring dependencies and max_parallel.

    Each task is an independent asyncio task. A failure, timeout, or crash in
    one never cancels its siblings; dependents see the upstream status and are
    marked blocked instead of being retried.
    """
    semaphore = asyncio.Semaphore(batch.options.max_parallel)
    # Every task is registered in `pending` before the loop gets a chance to run
    # any of them (the registration loop never awaits), so a dependent task can
    # await its dependency regardless of manifest order.
    pending: dict[str, asyncio.Task[TaskResult]] = {}

    loop_tasks: list[asyncio.Task[TaskResult]] = []
    for task in batch.selected:
        coro = execute_task(
            task=task,
            batch=batch,
            manager=manager,
            agent=agent,
            validator=validator,
            reporter=reporter,
            semaphore=semaphore,
            dependency_results=pending,
            gh_ready=gh_ready,
        )
        async_task = asyncio.ensure_future(coro)
        pending[task.id] = async_task
        loop_tasks.append(async_task)

    await asyncio.gather(*loop_tasks, return_exceptions=True)
    return batch.results


# --------------------------------------------------------------------------- #
# reporting
# --------------------------------------------------------------------------- #


def render_table(batch: Batch) -> str:
    order = {task.id: index for index, task in enumerate(batch.selected)}
    rows = [
        (
            result.id,
            result.status,
            result.validation_summary,
            result.scope_summary,
            result.branch,
        )
        for result in sorted(batch.results.values(), key=lambda r: order.get(r.id, 999))
    ]
    headers = ("TASK", "STATUS", "VALIDATION", "SCOPE", "BRANCH")
    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows)) if rows else len(headers[index])
        for index in range(len(headers))
    ]

    def line(cells: Sequence[str]) -> str:
        return "  ".join(cell.ljust(widths[index]) for index, cell in enumerate(cells)).rstrip()

    return "\n".join([line(headers), *(line(row) for row in rows)])


def render_dry_run(batch: Batch, agent_argv: Sequence[str], stripped_keys: Sequence[str]) -> str:
    waves = topological_waves(batch.selected)
    lines = [
        "DRY RUN — no branch, worktree, commit, push, or PR will be created.",
        "",
        f"repository:        {batch.repository or '(unknown remote)'}",
        f"base ref:          {batch.base_ref}",
        f"resolved base SHA: {batch.base_sha}",
        f"worktree root:     {batch.worktree_root}",
        f"results dir:       {batch.results_dir}  (not created in dry run)",
        f"max parallel:      {batch.options.max_parallel}",
        f"agent command:     {' '.join(agent_argv)}",
        f"prompt delivery:   {'placeholder substitution' if agent_command_uses_placeholder(agent_argv) else 'agent stdin'}",
        f"resume:            {batch.options.resume}",
        "",
        f"dependency waves:  {' -> '.join('[' + ', '.join(wave) + ']' for wave in waves)}",
        "",
        "would commit:      " + ("yes" if batch.options.would_commit else "no"),
        "would push:        " + ("yes" if batch.options.would_push else "no"),
        "would open PR:     " + ("yes" if batch.options.would_open_pr else "no"),
        "would merge:       no (never implemented)",
        "",
        f"env keys stripped from child processes ({len(stripped_keys)}): "
        + (", ".join(stripped_keys) if stripped_keys else "(none present)"),
        "",
        f"selected tasks ({len(batch.selected)}):",
    ]
    for task in batch.selected:
        lines += [
            "",
            f"  {task.id} — {task.title}",
            f"    branch:          {task.branch}",
            f"    worktree:        {task.worktree_path(batch.worktree_root)}",
            f"    prompt:          {task.prompt_path}",
            f"    depends_on:      {list(task.depends_on) or '[]'}",
            f"    timeout:         {task.timeout_minutes} min",
            f"    allowed_files:   {list(task.allowed_files) or '[]'}",
            f"    allowed_prefix:  {list(task.allowed_file_prefixes) or '[]'}",
            f"    forbidden_files: {list(task.forbidden_files) or '[]'}",
            f"    validate:        {list(task.validate) or '[]'}",
            f"    hosted_e2e:      {task.hosted_e2e_required}",
            f"    commit_message:  {task.commit_message}",
        ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="parallel_runner.py",
        description="Run coding agents in parallel, one isolated Git worktree each.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "This tool never merges. --commit/--push/--open-pr are opt-in and apply only to\n"
            "tasks whose validation and scope checks both passed."
        ),
    )
    parser.add_argument(
        "--manifest",
        default=str(HERE / "tasks.yaml"),
        help="path to tasks.yaml (default: alongside this script)",
    )
    parser.add_argument(
        "--tasks",
        help="comma-separated task ids (default: every enabled task in the manifest)",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="print the plan and exit; creates nothing")
    mode.add_argument(
        "--prepare-only", action="store_true", help="create branches/worktrees but run no agent"
    )
    mode.add_argument("--run", action="store_true", help="prepare, run agents, then validate")

    parser.add_argument("--commit", action="store_true", help="commit clean tasks in their worktree")
    parser.add_argument("--push", action="store_true", help="push committed task branches (needs --commit)")
    parser.add_argument("--open-pr", action="store_true", help="open a PR per pushed branch (needs --push)")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="reuse an existing worktree/branch for a task instead of refusing",
    )
    parser.add_argument("--base-ref", help="base ref to resolve (default: manifest defaults.base_ref)")
    parser.add_argument("--worktree-root", help="override defaults.worktree_root")
    parser.add_argument("--results-root", default=str(HERE / "results"), help="where per-task logs go")
    parser.add_argument("--max-parallel", type=int, help="override defaults.max_parallel")
    parser.add_argument(
        "--agent-command",
        help="agent command (overrides PARALLEL_AGENT_COMMAND and defaults.agent_command)",
    )
    parser.add_argument("--batch-id", help="override the generated batch id")
    parser.add_argument("--no-fetch", action="store_true", help="skip `git fetch` before resolving the base ref")
    parser.add_argument(
        "--no-strip-env",
        action="store_true",
        help="pass the full environment to children (default: strip known secret env vars)",
    )
    return parser


def resolve_mode(args: argparse.Namespace) -> str:
    if args.dry_run:
        return "dry-run"
    if args.prepare_only:
        return "prepare"
    return "run"


def validate_cli(args: argparse.Namespace) -> None:
    mode = resolve_mode(args)
    if args.push and not args.commit:
        raise ConfigError("--push requires --commit")
    if args.open_pr and not args.push:
        raise ConfigError("--open-pr requires --push")
    if mode == "prepare" and (args.commit or args.push or args.open_pr):
        raise ConfigError("--prepare-only cannot be combined with --commit/--push/--open-pr")
    if args.max_parallel is not None and args.max_parallel < 1:
        raise ConfigError("--max-parallel must be at least 1")


async def async_main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    validate_cli(args)
    mode = resolve_mode(args)

    config: BatchConfig = load_manifest(Path(args.manifest))
    selected = select_tasks(config, args.tasks.split(",") if args.tasks else None)

    base_ref = args.base_ref or config.defaults.base_ref
    worktree_root = Path(args.worktree_root or config.defaults.worktree_root)
    max_parallel = args.max_parallel or config.defaults.max_parallel

    agent_argv = parse_agent_command(
        args.agent_command
        or os.environ.get("PARALLEL_AGENT_COMMAND")
        or config.defaults.agent_command
    )

    repo_root = Path(
        (await run_command(["git", "rev-parse", "--show-toplevel"], cwd=config.manifest_path.parent)).stdout.strip()
        or config.manifest_path.parent
    )
    manager = GitWorktreeManager(repo_root=repo_root, worktree_root=worktree_root)

    if args.no_fetch:
        print(f"(skipping git fetch; resolving {base_ref} from local refs)")
    else:
        await manager.fetch(base_ref)
    base_sha = await manager.resolve_sha(base_ref)
    repository = config.defaults.repository or await manager.repository_slug()

    batch_id = args.batch_id or (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + base_sha[:7]
    )
    options = RunOptions(
        mode=mode,
        commit=args.commit,
        push=args.push,
        open_pr=args.open_pr,
        resume=args.resume,
        max_parallel=max_parallel,
        base_ref=base_ref,
        fetch=not args.no_fetch,
    )
    batch = Batch(
        batch_id=batch_id,
        base_sha=base_sha,
        base_ref=base_ref,
        repository=repository,
        results_dir=Path(args.results_root) / batch_id,
        worktree_root=worktree_root,
        options=options,
        selected=selected,
        started_at=datetime.now(timezone.utc).isoformat(),
        commit_no_verify=config.defaults.commit_no_verify,
    )

    strip_patterns = () if args.no_strip_env else config.defaults.strip_env_patterns
    stripped = stripped_env_keys(os.environ, strip_patterns) if strip_patterns else []
    child_env = filter_env(os.environ, strip_patterns) if strip_patterns else dict(os.environ)

    if mode == "dry-run":
        print(render_dry_run(batch, agent_argv, stripped))
        return 0

    redact = Redactor(os.environ)
    reporter = Reporter(redact)
    agent = AgentRunner(agent_argv, child_env)
    validator = Validator(child_env, redact)

    gh_ready: tuple[bool, str] | None = None
    if options.would_open_pr:
        gh_ready = await gh_available()
        print(f"gh preflight: {'ok — ' if gh_ready[0] else 'unavailable — '}{gh_ready[1]}")

    batch.results_dir.mkdir(parents=True, exist_ok=True)
    print(f"batch {batch_id}: {len(selected)} task(s) at base {base_sha} (max parallel {max_parallel})")
    if stripped:
        print(f"stripping {len(stripped)} secret env var(s) from child processes")

    interrupted = False
    try:
        await execute_batch(
            batch=batch,
            manager=manager,
            agent=agent,
            validator=validator,
            reporter=reporter,
            gh_ready=gh_ready,
        )
    except (KeyboardInterrupt, asyncio.CancelledError):
        interrupted = True
        print("\ninterrupted — agents terminated, results flushed, worktrees and branches preserved")

    for task in selected:
        batch.results.setdefault(
            task.id,
            TaskResult(
                id=task.id,
                title=task.title,
                status=STATUS_INTERRUPTED if interrupted else STATUS_ERROR,
                base_sha=base_sha,
                branch=task.branch,
                depends_on=list(task.depends_on),
                hosted_e2e_required=task.hosted_e2e_required,
                error="task did not produce a result",
            ),
        )

    summary_path = batch.results_dir / "summary.json"
    _write_json(summary_path, batch.summary_dict(datetime.now(timezone.utc).isoformat()))

    print()
    print(render_table(batch))
    print()
    print(f"results: {batch.results_dir}")
    if any(result.hosted_e2e_required for result in batch.results.values()):
        print(
            "hosted E2E: PENDING for one or more tasks — run it in CI, serially, "
            "against shared hosted staging. This runner never runs it."
        )

    if interrupted:
        return 130
    failures = [
        result for result in batch.results.values() if result.status not in {STATUS_READY_FOR_PR, STATUS_PREPARED}
    ]
    return 1 if failures else 0


def main(argv: Sequence[str] | None = None) -> int:
    try:
        return asyncio.run(async_main(argv))
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2
    except (GitError, WorktreeConflict) as exc:
        print(f"git error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
