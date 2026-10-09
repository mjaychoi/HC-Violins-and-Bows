#!/usr/bin/env python3
"""Prove the runner's behaviour end to end without a real coding agent.

Builds a throwaway git repo in a temp directory, writes a four-task manifest,
and invokes the real CLI twice: once with --dry-run, once with --run using
`fake_agent.py`. The plan is deliberately mixed so one batch shows success,
agent failure, and a scope violation side by side.

    python3 tools/parallel-agents/tests/demo_fake_batch.py

Nothing here touches the real repository, GitHub, staging, or production.
"""

from __future__ import annotations

import functools

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from helpers import BASIC_MANIFEST, FAKE_AGENT_COMMAND, git, make_repo, write_manifest

RUNNER = Path(__file__).resolve().parent.parent / "parallel_runner.py"

print = functools.partial(print, flush=True)  # noqa: A001 - ordering with child output

# One batch, four different outcomes:
#   B writes a file its manifest entry explicitly freezes -> scope_violation
#   C does its job                                        -> ready_for_pr
#   D exits non-zero                                      -> failed_agent
#   E writes a file nobody declared                        -> scope_violation
PLAN = (
    "B=touch:tests/e2e/critical-path.spec.ts"
    ";D=exit:1"
    ";E=touch:src/app/api/sales/route.ts"
)


def banner(text: str) -> None:
    # Flush: subprocess children write straight to the inherited fd, so our own
    # buffered output would otherwise appear out of order when piped.
    print(f"\n{'=' * 78}\n{text}\n{'=' * 78}", flush=True)


def main() -> int:
    keep = "--keep" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="parallel-agents-demo-"))
    try:
        repo = make_repo(tmp / "repo")
        worktrees = tmp / "worktrees"
        results = tmp / "results"
        manifest = write_manifest(
            repo / "agents",
            BASIC_MANIFEST.format(worktree_root=worktrees),
            prompts=["B.md", "C.md", "D.md", "E.md"],
        )
        base_sha = git("rev-parse", "main", cwd=repo)

        print(f"fixture repo:   {repo}")
        print(f"base sha:       {base_sha}")
        print(f"agent command:  {FAKE_AGENT_COMMAND}")
        print(f"fake agent plan: {PLAN or '(all tasks succeed)'}")

        common = [
            sys.executable, str(RUNNER),
            "--manifest", str(manifest),
            "--tasks", "B,C,D,E",
            "--base-ref", "main",
            "--no-fetch",
            "--worktree-root", str(worktrees),
            "--results-root", str(results),
            "--agent-command", FAKE_AGENT_COMMAND,
        ]
        env = {
            **os.environ,
            "FAKE_AGENT_PLAN": PLAN,
            "FAKE_AGENT_SLEEP_BEFORE": "1.0",
            "FAKE_AGENT_CWD_LOG": str(tmp / "events.log"),
        }

        banner("1. DRY RUN — must create nothing")
        subprocess.run([*common, "--dry-run"], env=env, check=True)

        created = sorted(p.name for p in worktrees.iterdir()) if worktrees.exists() else []
        branches = git("branch", "--format=%(refname:short)", cwd=repo).split()
        print()
        print(f"worktrees after dry run: {created or '(none)'}")
        print(f"branches after dry run:  {[b for b in branches if b != 'main'] or '(none, main only)'}")
        print(f"results dir exists:      {results.exists()}")

        banner("2. REAL RUN with fake agents — four workers, mixed outcomes")
        completed = subprocess.run([*common, "--run"], env=env)
        print(f"\nexit code: {completed.returncode} (non-zero because D and E did not pass)")

        banner("3. Worker isolation evidence (from the fake agents' own logs)")
        events = (tmp / "events.log").read_text(encoding="utf-8")
        print(events.strip())

        spans: dict[str, dict[str, float]] = {}
        for line in events.strip().splitlines():
            event, task_id, *rest = line.split(" ")
            spans.setdefault(task_id, {})[event] = float(rest[-1])
        print()
        for task_id, span in sorted(spans.items()):
            print(f"{task_id}: start={span.get('start', 0):.2f} end={span.get('end', 0):.2f}")
        overlapping = [
            (a, b)
            for a in sorted(spans)
            for b in sorted(spans)
            if a < b
            and spans[a].get("start", 0) < spans[b].get("end", 0)
            and spans[b].get("start", 0) < spans[a].get("end", 0)
        ]
        print(f"\noverlapping (concurrent) task pairs: {overlapping}")

        banner("4. Per-task result JSON")
        batch_dir = sorted(results.iterdir())[-1]
        for task_id in ("B", "C", "D"):
            print(f"\n--- {task_id}/result.json ---")
            print((batch_dir / task_id / "result.json").read_text(encoding="utf-8").strip())

        banner("5. Scope violations were reported, never reverted")
        forbidden = worktrees / "b" / "tests/e2e/critical-path.spec.ts"
        undeclared = worktrees / "e" / "src/app/api/sales/route.ts"
        print(f"B's forbidden edit still present:  {'fake agent output' in forbidden.read_text(encoding='utf-8')}")
        print(f"E's undeclared file still present: {undeclared.exists()}")
        for slug in ("b", "e"):
            at_base = git("rev-parse", "HEAD", cwd=worktrees / slug) == base_sha
            print(f"{slug} worktree uncommitted (HEAD still at base): {at_base}")
        return 0
    finally:
        if keep:
            print(f"\nkeeping fixture at {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
