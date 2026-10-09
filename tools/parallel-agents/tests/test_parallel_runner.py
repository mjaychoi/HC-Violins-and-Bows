"""End-to-end runner behaviour, driven by a deterministic fake agent.

Nothing here touches the real HC repository, GitHub, hosted staging, or
production: every test builds a throwaway git repo in a temp directory, uses
`--base-ref main --no-fetch`, and runs `tests/fake_agent.py` as the agent.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import (  # noqa: F401  (sys.path setup)
    BASIC_MANIFEST,
    DEPENDENCY_MANIFEST,
    FAKE_AGENT_COMMAND,
    RUNNER_DIR,
    git,
    make_repo,
    write_manifest,
)

import parallel_runner
from parallel_runner import (
    STATUS_BLOCKED_DEPENDENCY,
    STATUS_FAILED_AGENT,
    STATUS_FAILED_VALIDATION,
    STATUS_READY_FOR_PR,
    STATUS_SCOPE_VIOLATION,
    STATUS_TIMEOUT,
    AgentRunner,
    Redactor,
    ValidationOutcome,
    build_pr_body,
    classify_status,
    compose_prompt,
)
from runner_config import ScopeChecker, TaskConfig, load_manifest


class BatchHarness:
    """A temp repo, a manifest, and a way to invoke the real CLI against them."""

    def __init__(self, tmp: Path, manifest_body: str = BASIC_MANIFEST, prompts=("B", "C", "D", "E")):
        self.root = tmp
        self.repo = make_repo(tmp / "repo")
        self.worktrees = tmp / "worktrees"
        self.results = tmp / "results"
        self.cwd_log = tmp / "agent-events.log"
        self.manifest = write_manifest(
            self.repo / "agents",
            manifest_body.format(worktree_root=self.worktrees),
            prompts=[f"{name}.md" for name in prompts],
        )
        self.base_sha = git("rev-parse", "main", cwd=self.repo)

    def run(self, *extra: str, plan: str = "", sleep_before: str = "0", default: str = "write") -> tuple[int, str]:
        argv = [
            "--manifest", str(self.manifest),
            "--base-ref", "main",
            "--no-fetch",
            "--worktree-root", str(self.worktrees),
            "--results-root", str(self.results),
            "--agent-command", FAKE_AGENT_COMMAND,
            *extra,
        ]
        env = {
            "FAKE_AGENT_PLAN": plan,
            "FAKE_AGENT_DEFAULT": default,
            "FAKE_AGENT_SLEEP_BEFORE": sleep_before,
            "FAKE_AGENT_CWD_LOG": str(self.cwd_log),
        }
        buffer = io.StringIO()
        with mock.patch.dict(os.environ, env, clear=False):
            with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
                code = parallel_runner.main(argv)
        return code, buffer.getvalue()

    def summary(self) -> dict:
        batches = sorted(self.results.iterdir())
        assert batches, "no batch directory was created"
        return json.loads((batches[-1] / "summary.json").read_text(encoding="utf-8"))

    def statuses(self) -> dict[str, str]:
        return {task["id"]: task["status"] for task in self.summary()["tasks"]}

    def task(self, task_id: str) -> dict:
        return next(t for t in self.summary()["tasks"] if t["id"] == task_id)

    def branches(self) -> list[str]:
        out = git("branch", "--format=%(refname:short)", cwd=self.repo)
        return [line.strip() for line in out.splitlines() if line.strip()]

    def events(self) -> list[tuple[str, str, str, float]]:
        """Parsed "<event> <task> <cwd> <monotonic>" lines from the fake agents."""
        if not self.cwd_log.exists():
            return []
        parsed = []
        for line in self.cwd_log.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            parts = line.split(" ")
            event, task_id, stamp = parts[0], parts[1], float(parts[-1])
            cwd = str(Path(" ".join(parts[2:-1])).resolve())
            parsed.append((event, task_id, cwd, stamp))
        return parsed


class TempRepoTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()


# --------------------------------------------------------------------------- #
# dry run
# --------------------------------------------------------------------------- #


class DryRunTests(TempRepoTestCase):
    def test_dry_run_creates_no_branch_worktree_or_results(self) -> None:
        harness = BatchHarness(self.tmp)
        before = harness.branches()

        code, output = harness.run("--tasks", "B,C,D,E", "--dry-run")

        self.assertEqual(code, 0)
        self.assertEqual(harness.branches(), before)
        self.assertFalse(harness.worktrees.exists(), "dry run created a worktree root")
        self.assertFalse(harness.results.exists(), "dry run created a results directory")
        self.assertNotIn("agent started", output)

    def test_dry_run_reports_the_plan(self) -> None:
        harness = BatchHarness(self.tmp)
        _, output = harness.run("--tasks", "B,C,D,E", "--dry-run")

        self.assertIn("DRY RUN", output)
        self.assertIn(harness.base_sha, output)
        self.assertIn("test/e2e-connections-critical", output)
        self.assertIn(str(harness.worktrees / "b"), output)
        self.assertIn("/bin/echo type-check-ok", output)
        for task_id in ("B", "C", "D", "E"):
            self.assertRegex(output, rf"\n  {task_id} — ")

    def test_dry_run_states_that_commit_push_and_pr_would_not_happen(self) -> None:
        harness = BatchHarness(self.tmp)
        _, output = harness.run("--tasks", "B", "--dry-run")
        self.assertIn("would commit:      no", output)
        self.assertIn("would push:        no", output)
        self.assertIn("would open PR:     no", output)
        self.assertIn("would merge:       no (never implemented)", output)

    def test_dry_run_echoes_the_requested_side_effects_without_doing_them(self) -> None:
        harness = BatchHarness(self.tmp)
        _, output = harness.run("--tasks", "B", "--dry-run", "--commit", "--push", "--open-pr")
        self.assertIn("would commit:      yes", output)
        self.assertIn("would push:        yes", output)
        self.assertIn("would open PR:     yes", output)
        self.assertFalse(harness.worktrees.exists())
        self.assertNotIn("test/e2e-connections-critical", harness.branches())

    def test_dry_run_shows_dependency_waves(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        _, output = harness.run("--tasks", "G1,G2", "--dry-run")
        self.assertIn("[G1] -> [G2]", output)


# --------------------------------------------------------------------------- #
# isolation and shared base
# --------------------------------------------------------------------------- #


class IsolationTests(TempRepoTestCase):
    def test_concurrent_workers_run_in_separate_worktrees_at_the_same_time(self) -> None:
        harness = BatchHarness(self.tmp)
        code, output = harness.run("--tasks", "B,C", "--run", sleep_before="1.0")

        self.assertEqual(code, 0)
        self.assertEqual(harness.statuses(), {"B": STATUS_READY_FOR_PR, "C": STATUS_READY_FOR_PR})

        events = harness.events()
        cwds = {task_id: cwd for event, task_id, cwd, _ in events if event == "start"}
        self.assertEqual(
            cwds,
            {
                "B": str((harness.worktrees / "b").resolve()),
                "C": str((harness.worktrees / "c").resolve()),
            },
        )
        self.assertEqual(len(set(cwds.values())), 2, "workers shared a working directory")

        spans = {}
        for event, task_id, _, stamp in events:
            spans.setdefault(task_id, {})[event] = stamp
        b, c = spans["B"], spans["C"]
        self.assertLess(b["start"], c["end"])
        self.assertLess(c["start"], b["end"])

    def test_each_task_writes_only_into_its_own_worktree(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B,C", "--run")

        self.assertTrue((harness.worktrees / "b" / "tests/e2e/connections.critical.spec.ts").exists())
        self.assertFalse((harness.worktrees / "b" / "tests/e2e/member-authz.critical.spec.ts").exists())
        self.assertTrue((harness.worktrees / "c" / "tests/e2e/member-authz.critical.spec.ts").exists())
        self.assertFalse((harness.worktrees / "c" / "tests/e2e/connections.critical.spec.ts").exists())
        # The shared checkout is untouched.
        self.assertFalse((harness.repo / "tests/e2e/connections.critical.spec.ts").exists())

    def test_every_task_in_a_batch_uses_the_identical_base_sha(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B,C,D,E", "--run")
        summary = harness.summary()

        self.assertEqual(summary["base_sha"], harness.base_sha)
        self.assertEqual({task["base_sha"] for task in summary["tasks"]}, {harness.base_sha})
        for task_id, slug in (("B", "b"), ("C", "c"), ("D", "d"), ("E", "e")):
            merge_base = git("merge-base", harness.base_sha, "HEAD", cwd=harness.worktrees / slug)
            self.assertEqual(merge_base, harness.base_sha, task_id)

    def test_worker_logs_are_kept_apart(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B,C", "--run")
        batch_dir = sorted(harness.results.iterdir())[-1]

        for task_id in ("B", "C"):
            stdout = (batch_dir / task_id / "agent.stdout.log").read_text(encoding="utf-8")
            self.assertIn(f"task={task_id}", stdout)
            other = "C" if task_id == "B" else "B"
            self.assertNotIn(f"task={other}", stdout)
            self.assertTrue((batch_dir / task_id / "agent.stderr.log").exists())
            self.assertTrue((batch_dir / task_id / "validation.log").exists())
            self.assertTrue((batch_dir / task_id / "result.json").exists())


# --------------------------------------------------------------------------- #
# failure isolation
# --------------------------------------------------------------------------- #


class FailureIsolationTests(TempRepoTestCase):
    def test_one_failing_worker_does_not_cancel_its_siblings(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B,C,D,E", "--run", plan="D=exit:1")

        self.assertEqual(code, 1, "a failing task must make the batch exit non-zero")
        self.assertEqual(
            harness.statuses(),
            {
                "B": STATUS_READY_FOR_PR,
                "C": STATUS_READY_FOR_PR,
                "D": STATUS_FAILED_AGENT,
                "E": STATUS_READY_FOR_PR,
            },
        )
        self.assertEqual(harness.task("D")["agent_exit_code"], 1)

    def test_a_failed_agent_skips_validation_rather_than_reporting_a_pass(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B,D", "--run", plan="D=exit:1")
        self.assertEqual(
            [item["status"] for item in harness.task("D")["validation"]], ["skipped"]
        )
        self.assertEqual(
            [item["status"] for item in harness.task("B")["validation"]], ["pass", "pass"]
        )

    def test_failing_validation_fails_the_task_even_though_the_agent_exited_zero(self) -> None:
        harness = BatchHarness(self.tmp)
        manifest = harness.manifest.read_text(encoding="utf-8").replace(
            "      - /bin/echo lint-ok", "      - /usr/bin/false"
        )
        harness.manifest.write_text(manifest, encoding="utf-8")

        code, _ = harness.run("--tasks", "B,C", "--run")

        self.assertEqual(code, 1)
        self.assertEqual(harness.task("B")["status"], STATUS_FAILED_VALIDATION)
        self.assertEqual(harness.task("B")["agent_exit_code"], 0)
        self.assertEqual(harness.task("C")["status"], STATUS_READY_FOR_PR)

    def test_a_crashing_worker_is_reported_and_siblings_still_finish(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B,C", "--run", plan="B=bogus-action")
        self.assertEqual(code, 1)
        self.assertEqual(harness.task("B")["status"], STATUS_FAILED_AGENT)
        self.assertEqual(harness.task("C")["status"], STATUS_READY_FOR_PR)


# --------------------------------------------------------------------------- #
# scope enforcement
# --------------------------------------------------------------------------- #


class ScopeGuardTests(TempRepoTestCase):
    def test_touching_a_forbidden_file_is_a_scope_violation(self) -> None:
        harness = BatchHarness(self.tmp)
        code, output = harness.run(
            "--tasks", "B,C", "--run", plan="B=touch:tests/e2e/critical-path.spec.ts"
        )

        self.assertEqual(code, 1)
        b = harness.task("B")
        self.assertEqual(b["status"], STATUS_SCOPE_VIOLATION)
        self.assertFalse(b["scope_ok"])
        self.assertEqual(b["forbidden_files_touched"], ["tests/e2e/critical-path.spec.ts"])
        self.assertEqual(b["unexpected_files"], [])
        self.assertIn("scope violation", output)
        # A sibling is unaffected.
        self.assertEqual(harness.task("C")["status"], STATUS_READY_FOR_PR)

    def test_a_scope_violation_is_never_reverted_or_deleted(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run", plan="B=touch:tests/e2e/critical-path.spec.ts")

        offending = harness.worktrees / "b" / "tests/e2e/critical-path.spec.ts"
        self.assertIn("fake agent output", offending.read_text(encoding="utf-8"))
        self.assertIn("test/e2e-connections-critical", harness.branches())

    def test_an_undeclared_file_is_a_scope_violation_too(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "D", "--run", plan="D=touch:src/app/api/sales/route.ts")

        d = harness.task("D")
        self.assertEqual(d["status"], STATUS_SCOPE_VIOLATION)
        self.assertEqual(d["unexpected_files"], ["src/app/api/sales/route.ts"])
        self.assertEqual(d["forbidden_files_touched"], [])

    def test_uncommitted_out_of_scope_work_is_still_caught(self) -> None:
        """The agent leaves everything uncommitted; scope must still see it."""
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run", plan="B=touch:tests/e2e/critical-path.spec.ts")

        worktree = harness.worktrees / "b"
        self.assertEqual(git("rev-parse", "HEAD", cwd=worktree), harness.base_sha)
        self.assertEqual(harness.task("B")["status"], STATUS_SCOPE_VIOLATION)

    def test_an_in_scope_task_passes_the_scope_check(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run")
        b = harness.task("B")
        self.assertTrue(b["scope_ok"])
        self.assertEqual(b["changed_files"], ["tests/e2e/connections.critical.spec.ts"])


# --------------------------------------------------------------------------- #
# dependencies
# --------------------------------------------------------------------------- #


class DependencyTests(TempRepoTestCase):
    def test_a_failed_dependency_blocks_its_downstream_task(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        code, _ = harness.run("--tasks", "G1,G2", "--run", plan="G1=exit:1")

        self.assertEqual(code, 1)
        self.assertEqual(
            harness.statuses(), {"G1": STATUS_FAILED_AGENT, "G2": STATUS_BLOCKED_DEPENDENCY}
        )
        self.assertIn("G1", harness.task("G2")["error"])

    def test_a_blocked_task_never_gets_a_worktree_or_a_branch(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        harness.run("--tasks", "G1,G2", "--run", plan="G1=exit:1")

        self.assertFalse((harness.worktrees / "g2").exists())
        self.assertNotIn("ops/e2e-staging-storage-consumer", harness.branches())
        self.assertIsNone(harness.task("G2")["worktree"])

    def test_a_blocked_task_is_not_retried_automatically(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        harness.run("--tasks", "G1,G2", "--run", plan="G1=exit:1")
        events = [task_id for event, task_id, _, _ in harness.events() if event == "start"]
        self.assertEqual(events.count("G2"), 0)
        self.assertEqual(events.count("G1"), 1)

    def test_a_satisfied_dependency_lets_the_downstream_task_run(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        code, _ = harness.run("--tasks", "G1,G2", "--run")

        self.assertEqual(code, 0)
        self.assertEqual(
            harness.statuses(), {"G1": STATUS_READY_FOR_PR, "G2": STATUS_READY_FOR_PR}
        )
        spans: dict[str, dict[str, float]] = {}
        for event, task_id, _, stamp in harness.events():
            spans.setdefault(task_id, {})[event] = stamp
        self.assertLess(spans["G1"]["end"], spans["G2"]["start"], "G2 must wait for G1")

    def test_a_dependency_left_out_of_the_selection_blocks_rather_than_runs(self) -> None:
        harness = BatchHarness(self.tmp, DEPENDENCY_MANIFEST, prompts=("G1", "G2"))
        code, _ = harness.run("--tasks", "G2", "--run")

        self.assertEqual(code, 1)
        self.assertEqual(harness.statuses(), {"G2": STATUS_BLOCKED_DEPENDENCY})
        self.assertFalse((harness.worktrees / "g2").exists())


# --------------------------------------------------------------------------- #
# worktree reuse
# --------------------------------------------------------------------------- #


class ResumeTests(TempRepoTestCase):
    def test_a_second_run_without_resume_refuses_the_existing_worktree(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run")
        code, _ = harness.run("--tasks", "B", "--run")

        self.assertEqual(code, 1)
        self.assertEqual(harness.task("B")["status"], "worktree_conflict")
        self.assertIn("--resume", harness.task("B")["error"])

    def test_resume_reuses_the_worktree_and_keeps_prior_work(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run")
        marker = harness.worktrees / "b" / "tests/e2e/connections.critical.spec.ts"
        first = marker.read_text(encoding="utf-8")

        code, _ = harness.run("--tasks", "B", "--run", "--resume")

        self.assertEqual(code, 0)
        self.assertTrue(harness.task("B")["worktree_reused"])
        self.assertTrue(marker.read_text(encoding="utf-8").startswith(first))

    def test_prepare_only_creates_the_worktree_but_runs_no_agent(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B", "--prepare-only")

        self.assertEqual(code, 0)
        self.assertEqual(harness.task("B")["status"], "prepared")
        self.assertIsNone(harness.task("B")["agent_exit_code"])
        self.assertEqual(harness.events(), [])
        self.assertIn("test/e2e-connections-critical", harness.branches())


# --------------------------------------------------------------------------- #
# commit gating
# --------------------------------------------------------------------------- #


class CommitGateTests(TempRepoTestCase):
    def test_a_clean_task_is_committed_with_its_manifest_message(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B", "--run", "--commit")

        self.assertEqual(code, 0)
        commit = harness.task("B")["commit"]
        self.assertTrue(commit["created"])
        # The fixture manifest declares no commit_message, so the runner derives
        # one from the branch prefix and title.
        self.assertEqual(
            git("log", "-1", "--pretty=%s", cwd=harness.worktrees / "b"),
            "test(e2e): connections CRUD critical",
        )
        self.assertEqual(commit["message"], "test(e2e): connections CRUD critical")

    def test_the_shipped_manifest_declares_explicit_commit_messages(self) -> None:
        config = load_manifest(RUNNER_DIR / "tasks.yaml")
        self.assertEqual(
            config.by_id["B"].commit_message, "test(e2e): add connections critical coverage"
        )
        self.assertEqual(
            config.by_id["G1"].commit_message,
            "ops: define staging storage contract and fail-closed CI wiring",
        )

    def test_a_scope_violating_task_is_not_committed(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run(
            "--tasks", "B", "--run", "--commit", plan="B=touch:tests/e2e/critical-path.spec.ts"
        )

        self.assertEqual(harness.task("B")["commit"]["status"], "skipped")
        self.assertIn("scope", harness.task("B")["commit"]["reason"])
        self.assertEqual(git("rev-parse", "HEAD", cwd=harness.worktrees / "b"), harness.base_sha)

    def test_a_validation_failure_is_not_committed(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.manifest.write_text(
            harness.manifest.read_text(encoding="utf-8").replace(
                "      - /bin/echo lint-ok", "      - /usr/bin/false"
            ),
            encoding="utf-8",
        )
        harness.run("--tasks", "B", "--run", "--commit")

        self.assertEqual(harness.task("B")["commit"]["status"], "skipped")
        self.assertEqual(git("rev-parse", "HEAD", cwd=harness.worktrees / "b"), harness.base_sha)

    def test_a_task_that_changed_nothing_is_not_committed(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run", "--commit", plan="B=noop")

        self.assertEqual(harness.task("B")["commit"]["status"], "skipped")
        self.assertIn("no changes", harness.task("B")["commit"]["reason"])

    def test_commit_is_opt_in(self) -> None:
        harness = BatchHarness(self.tmp)
        harness.run("--tasks", "B", "--run")
        self.assertIsNone(harness.task("B")["commit"])
        self.assertIsNone(harness.task("B")["pr"])
        self.assertEqual(git("rev-parse", "HEAD", cwd=harness.worktrees / "b"), harness.base_sha)


# --------------------------------------------------------------------------- #
# CLI argument safety
# --------------------------------------------------------------------------- #


class CliSafetyTests(TempRepoTestCase):
    def _run_raw(self, *argv: str) -> int:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            return parallel_runner.main(list(argv))

    def test_push_requires_commit(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B", "--run", "--push")
        self.assertEqual(code, 2)

    def test_open_pr_requires_push(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B", "--run", "--commit", "--open-pr")
        self.assertEqual(code, 2)

    def test_prepare_only_cannot_commit(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "B", "--prepare-only", "--commit")
        self.assertEqual(code, 2)

    def test_a_mode_must_be_chosen_explicitly(self) -> None:
        harness = BatchHarness(self.tmp)
        with self.assertRaises(SystemExit) as raised:
            self._run_raw("--manifest", str(harness.manifest), "--tasks", "B")
        self.assertEqual(raised.exception.code, 2)

    def test_an_unknown_task_id_is_a_configuration_error(self) -> None:
        harness = BatchHarness(self.tmp)
        code, _ = harness.run("--tasks", "ZZ", "--run")
        self.assertEqual(code, 2)

    def test_a_missing_agent_command_is_a_configuration_error(self) -> None:
        harness = BatchHarness(self.tmp)
        with mock.patch.dict(os.environ, {"PARALLEL_AGENT_COMMAND": ""}, clear=False):
            code = self._run_raw(
                "--manifest", str(harness.manifest),
                "--tasks", "B", "--run", "--base-ref", "main", "--no-fetch",
                "--worktree-root", str(harness.worktrees),
                "--results-root", str(harness.results),
            )
        self.assertEqual(code, 2)
        self.assertFalse(harness.worktrees.exists())


# --------------------------------------------------------------------------- #
# timeout
# --------------------------------------------------------------------------- #


class TimeoutTests(TempRepoTestCase):
    def test_a_hung_agent_is_classified_as_a_timeout_and_killed(self) -> None:
        harness = BatchHarness(self.tmp)
        config = load_manifest(harness.manifest)
        task = config.by_id["B"]
        prepared_dir = self.tmp / "wt-timeout"
        prepared_dir.mkdir()
        log_dir = self.tmp / "logs-timeout"
        log_dir.mkdir()

        runner = AgentRunner(
            parallel_runner.parse_agent_command(FAKE_AGENT_COMMAND),
            {
                **os.environ,
                "FAKE_AGENT_PLAN": "B=sleep:120",
                "FAKE_AGENT_CWD_LOG": str(harness.cwd_log),
            },
        )
        prompt = compose_prompt(
            task, base_sha=harness.base_sha, worktree=prepared_dir, repository="x/y"
        )
        run = asyncio.run(
            runner.run(
                task=task,
                worktree=prepared_dir,
                base_sha=harness.base_sha,
                prompt_text=prompt,
                log_dir=log_dir,
                timeout_seconds=1.0,
            )
        )

        self.assertTrue(run.timed_out)
        self.assertLess(run.duration_seconds, 60)
        self.assertEqual(
            classify_status(
                timed_out=True, agent_exit_code=None, scope_report=None, validations=[]
            ),
            STATUS_TIMEOUT,
        )
        # The child was terminated, so it never logged its "end" event.
        events = harness.cwd_log.read_text(encoding="utf-8") if harness.cwd_log.exists() else ""
        self.assertIn("start B", events)
        self.assertNotIn("end B", events)


class StatusClassificationTests(unittest.TestCase):
    def _scope(self, ok: bool):
        return ScopeChecker(
            TaskConfig(
                id="B", title="t", branch="test/b", prompt_path=Path("/dev/null"),
                allowed_files=("a.ts",),
            )
        ).check(["a.ts"] if ok else ["b.ts"])

    def test_timeout_beats_everything(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=True, agent_exit_code=0, scope_report=self._scope(False),
                validations=[ValidationOutcome("x", "fail")],
            ),
            STATUS_TIMEOUT,
        )

    def test_a_nonzero_agent_exit_fails_the_task(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=False, agent_exit_code=3, scope_report=self._scope(True), validations=[]
            ),
            STATUS_FAILED_AGENT,
        )

    def test_a_missing_exit_code_fails_closed(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=False, agent_exit_code=None, scope_report=self._scope(True), validations=[]
            ),
            STATUS_FAILED_AGENT,
        )

    def test_scope_violation_beats_a_validation_pass(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=False, agent_exit_code=0, scope_report=self._scope(False),
                validations=[ValidationOutcome("x", "pass")],
            ),
            STATUS_SCOPE_VIOLATION,
        )

    def test_validation_failure_with_clean_scope(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=False, agent_exit_code=0, scope_report=self._scope(True),
                validations=[ValidationOutcome("x", "pass"), ValidationOutcome("y", "fail")],
            ),
            STATUS_FAILED_VALIDATION,
        )

    def test_all_clear_is_ready_for_pr(self) -> None:
        self.assertEqual(
            classify_status(
                timed_out=False, agent_exit_code=0, scope_report=self._scope(True),
                validations=[ValidationOutcome("x", "pass")],
            ),
            STATUS_READY_FOR_PR,
        )


# --------------------------------------------------------------------------- #
# prompts, PR body, redaction, and the no-merge guarantee
# --------------------------------------------------------------------------- #


class PromptCompositionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_manifest(RUNNER_DIR / "tasks.yaml")

    def test_header_carries_base_sha_branch_scope_and_rules(self) -> None:
        task = self.config.by_id["B"]
        prompt = compose_prompt(
            task, base_sha="a" * 40, worktree=Path("/tmp/wt/b"), repository="mjaychoi/HC-Violins-and-Bows"
        )

        self.assertIn("mjaychoi/HC-Violins-and-Bows", prompt)
        self.assertIn("a" * 40, prompt)
        self.assertIn("test/e2e-connections-critical", prompt)
        self.assertIn("tests/e2e/connections.critical.spec.ts", prompt)
        self.assertIn("tests/e2e/critical-path.spec.ts", prompt)
        self.assertIn("Do not merge anything", prompt)
        self.assertIn("npm audit fix --force", prompt)
        self.assertIn("test.skip", prompt)
        self.assertIn("stop and explain why", prompt)
        # The task-specific body is appended.
        self.assertIn("Connections API lifecycle", prompt)

    def test_prefixes_are_shown_as_prefixes(self) -> None:
        prompt = compose_prompt(
            self.config.by_id["F"], base_sha="b" * 40, worktree=Path("/tmp/wt/f"), repository=None
        )
        self.assertIn("tests/e2e/cross-tenant/** (prefix)", prompt)


class PrBodyTests(unittest.TestCase):
    def test_body_records_evidence_and_claims_no_merge(self) -> None:
        result = parallel_runner.TaskResult(
            id="B", title="Connections CRUD critical coverage", status=STATUS_READY_FOR_PR,
            base_sha="c" * 40, branch="test/e2e-connections-critical",
            changed_files=["tests/e2e/connections.critical.spec.ts"],
            validation=[ValidationOutcome("npm run type-check", "pass"),
                        ValidationOutcome("npm run lint", "pass")],
            hosted_e2e_required=True,
        )
        body = build_pr_body(result, repository="mjaychoi/HC-Violins-and-Bows")

        self.assertIn("## Parallel agent task", body)
        self.assertIn("c" * 40, body)
        self.assertIn("- npm run type-check: PASS", body)
        self.assertIn("PENDING — requires GitHub CI against shared hosted staging.", body)
        self.assertIn("No auto-merge", body)
        self.assertIn("No production mutation", body)


class RedactionTests(unittest.TestCase):
    def test_masks_values_of_secretish_env_vars(self) -> None:
        redact = Redactor({"GITHUB_TOKEN": "supersecrettoken123", "HOME": "/Users/me"})
        self.assertEqual(redact("auth=supersecrettoken123"), "auth=***REDACTED***")
        self.assertEqual(redact("home=/Users/me"), "home=/Users/me")

    def test_masks_token_shaped_strings_even_if_not_in_the_env(self) -> None:
        redact = Redactor({})
        self.assertNotIn("ghp_", redact("token ghp_abcdefghijklmnopqrstuvwxyz"))
        self.assertNotIn("AKIA", redact("key AKIAIOSFODNN7EXAMPLE"))
        self.assertNotIn(
            "eyJhbGciOiJIUzI1NiJ9", redact("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk")
        )

    def test_short_values_are_not_treated_as_secrets(self) -> None:
        redact = Redactor({"API_KEY": "short"})
        self.assertEqual(redact("value short"), "value short")


class NoAutoMergeTests(unittest.TestCase):
    """The headline safety property: this tool cannot merge anything."""

    SOURCES = (
        "parallel_runner.py",
        "runner_config.py",
        "runner_git.py",
        "tests/fake_agent.py",
    )

    def test_no_source_file_builds_a_merge_argv(self) -> None:
        """Prose may mention merging; no argv may ever contain it."""
        banned = (
            re.compile(r"""["']pr["']\s*,\s*["']merge["']"""),
            re.compile(r"""["']merge["']\s*,"""),
            re.compile(r"""["']--admin["']"""),
            re.compile(r"""["']--squash["']"""),
            re.compile(r"""["']--auto["']"""),
            re.compile(r"""["']--rebase["']"""),
        )
        for name in self.SOURCES:
            source = (RUNNER_DIR / name).read_text(encoding="utf-8")
            for pattern in banned:
                self.assertIsNone(
                    pattern.search(source), f"{name} matches banned merge pattern {pattern.pattern}"
                )

    def test_the_only_gh_subcommands_used_are_read_only_or_pr_create(self) -> None:
        source = (RUNNER_DIR / "parallel_runner.py").read_text(encoding="utf-8")
        pr_subcommands = re.findall(r'"gh",\s*"pr",\s*"([a-z-]+)"', source)
        self.assertEqual(pr_subcommands, ["create"], "gh pr is used for something other than create")

        gh_subcommands = set(re.findall(r'"gh",\s*"([a-z-]+)"', source))
        self.assertLessEqual(gh_subcommands, {"pr", "--version", "auth"}, gh_subcommands)

    def test_the_prompt_tells_the_agent_not_to_merge(self) -> None:
        self.assertIn("Do not merge anything", parallel_runner.PROMPT_RULES)
        self.assertIn("gh pr merge", parallel_runner.PROMPT_RULES)

    def test_only_merge_base_is_used_and_never_merge_itself(self) -> None:
        source = (RUNNER_DIR / "runner_git.py").read_text(encoding="utf-8")
        for occurrence in re.finditer(r'"merge[^"]*"', source):
            self.assertIn(occurrence.group(0), {'"merge-base"'})

    def test_no_destructive_git_flag_is_used(self) -> None:
        for name in self.SOURCES:
            source = (RUNNER_DIR / name).read_text(encoding="utf-8")
            for banned in ('"-D"', '"--force"', '"--hard"', '"reset"', '"-f"'):
                self.assertNotIn(banned, source, f"{name} uses {banned}")


if __name__ == "__main__":
    unittest.main()
