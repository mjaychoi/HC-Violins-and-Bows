"""Shared helpers for the runner's tests: a throwaway git repo and manifests."""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

RUNNER_DIR = Path(__file__).resolve().parent.parent
if str(RUNNER_DIR) not in sys.path:
    sys.path.insert(0, str(RUNNER_DIR))

FAKE_AGENT = Path(__file__).resolve().parent / "fake_agent.py"
FAKE_AGENT_COMMAND = f"{sys.executable} {FAKE_AGENT}"


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def make_repo(root: Path) -> Path:
    """A tiny git repo with a `main` branch and one commit.

    No remote: tests always pass --base-ref main --no-fetch so nothing reaches
    the network or the real HC repository.
    """
    root.mkdir(parents=True, exist_ok=True)
    git("init", "-b", "main", cwd=root)
    git("config", "user.email", "runner-tests@example.invalid", cwd=root)
    git("config", "user.name", "Runner Tests", cwd=root)
    git("config", "commit.gpgsign", "false", cwd=root)

    (root / "tests" / "e2e").mkdir(parents=True, exist_ok=True)
    (root / "tests" / "e2e" / "critical-path.spec.ts").write_text(
        "// shared critical spec\n", encoding="utf-8"
    )
    (root / "README.md").write_text("# fixture repo\n", encoding="utf-8")
    git("add", "-A", cwd=root)
    git("commit", "-m", "initial", cwd=root)
    return root


def write_prompt(manifest_dir: Path, name: str, body: str = "Do the thing.") -> None:
    prompts = manifest_dir / "prompts"
    prompts.mkdir(parents=True, exist_ok=True)
    (prompts / name).write_text(body + "\n", encoding="utf-8")


def write_manifest(manifest_dir: Path, body: str, *, prompts: list[str]) -> Path:
    manifest_dir.mkdir(parents=True, exist_ok=True)
    for name in prompts:
        write_prompt(manifest_dir, name)
    path = manifest_dir / "tasks.yaml"
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    return path


BASIC_MANIFEST = """
version: 1

defaults:
  base_ref: main
  worktree_root: {worktree_root}
  max_parallel: 4
  timeout_minutes: 5
  validate:
    - /bin/echo baseline-ok

tasks:
  - id: B
    title: Connections CRUD critical
    branch: test/e2e-connections-critical
    prompt: prompts/B.md
    depends_on: []
    allowed_files:
      - tests/e2e/connections.critical.spec.ts
    forbidden_files:
      - tests/e2e/critical-path.spec.ts
    validate:
      - /bin/echo type-check-ok
      - /bin/echo lint-ok
    hosted_e2e_required: true

  - id: C
    title: Member denial matrix
    branch: test/e2e-member-authz-critical
    prompt: prompts/C.md
    allowed_files:
      - tests/e2e/member-authz.critical.spec.ts
    forbidden_files:
      - tests/e2e/critical-path.spec.ts
    validate:
      - /bin/echo type-check-ok
    hosted_e2e_required: true

  - id: D
    title: Sale lifecycle
    branch: test/e2e-sale-lifecycle-critical
    prompt: prompts/D.md
    allowed_files:
      - tests/e2e/sale-lifecycle.critical.spec.ts
    validate:
      - /bin/echo type-check-ok
    hosted_e2e_required: true

  - id: E
    title: Maintenance CRUD
    branch: test/e2e-maintenance-critical
    prompt: prompts/E.md
    allowed_files:
      - tests/e2e/maintenance.critical.spec.ts
    validate:
      - /bin/echo type-check-ok
    hosted_e2e_required: true
"""

DEPENDENCY_MANIFEST = """
version: 1

defaults:
  base_ref: main
  worktree_root: {worktree_root}
  max_parallel: 4
  timeout_minutes: 5

tasks:
  - id: G1
    title: Staging storage infra
    branch: ops/e2e-staging-storage
    prompt: prompts/G1.md
    depends_on: []
    allowed_files:
      - docs/staging-storage.md
    validate:
      - /bin/echo ok

  - id: G2
    title: Staging storage consumer
    branch: ops/e2e-staging-storage-consumer
    prompt: prompts/G2.md
    depends_on: [G1]
    allowed_files:
      - docs/staging-storage-consumer.md
    validate:
      - /bin/echo ok
"""
