"""Git worktree lifecycle for the parallel agent runner.

Everything here is deliberately conservative:

* no `git worktree remove --force`
* no `git branch -D`
* no `git push --force`
* no `git reset --hard`
* no merge, ever

When the on-disk state does not match what the manifest expects, the task
fails closed with an actionable message instead of being repaired in place.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


class GitError(Exception):
    """A git command failed."""


class WorktreeConflict(Exception):
    """On-disk git state does not match what this batch expects."""


@dataclass(frozen=True)
class CommandResult:
    argv: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


@dataclass(frozen=True)
class WorktreeEntry:
    path: Path
    head: str | None
    branch: str | None
    detached: bool
    prunable: bool
    locked: bool


@dataclass(frozen=True)
class PreparedWorktree:
    path: Path
    branch: str
    base_sha: str
    created: bool
    reused: bool


async def run_command(
    argv: Sequence[str],
    *,
    cwd: Path | str | None = None,
    env: Mapping[str, str] | None = None,
    timeout: float | None = None,
) -> CommandResult:
    """Run a command without a shell and capture its output."""
    proc = await asyncio.create_subprocess_exec(
        *argv,
        cwd=str(cwd) if cwd else None,
        env=dict(env) if env is not None else None,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise GitError(f"command timed out after {timeout}s: {' '.join(argv)}") from None
    return CommandResult(
        argv=tuple(argv),
        returncode=proc.returncode if proc.returncode is not None else -1,
        stdout=(stdout or b"").decode("utf-8", "replace"),
        stderr=(stderr or b"").decode("utf-8", "replace"),
    )


class GitWorktreeManager:
    """Resolves the shared base SHA and prepares one isolated worktree per task."""

    def __init__(self, repo_root: Path, worktree_root: Path) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.worktree_root = Path(worktree_root)
        # `git worktree add` and `git fetch` take repo-wide locks; serialize them
        # so concurrent task preparation cannot race on .git/worktrees.
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------------- basics

    async def git(
        self, *args: str, cwd: Path | None = None, check: bool = True, timeout: float = 300.0
    ) -> CommandResult:
        result = await run_command(
            ["git", *args], cwd=cwd or self.repo_root, timeout=timeout
        )
        if check and not result.ok:
            raise GitError(
                f"git {' '.join(args)} failed (exit {result.returncode}): "
                f"{result.stderr.strip() or result.stdout.strip()}"
            )
        return result

    async def fetch(self, base_ref: str) -> None:
        remote = base_ref.split("/", 1)[0] if "/" in base_ref else "origin"
        async with self._lock:
            await self.git("fetch", remote, timeout=600.0)

    async def resolve_sha(self, ref: str) -> str:
        result = await self.git("rev-parse", "--verify", f"{ref}^{{commit}}")
        sha = result.stdout.strip()
        if len(sha) != 40:
            raise GitError(f"could not resolve {ref!r} to a commit SHA (got {sha!r})")
        return sha

    async def repository_slug(self) -> str | None:
        result = await self.git("remote", "get-url", "origin", check=False)
        if not result.ok:
            return None
        url = result.stdout.strip()
        if not url:
            return None
        if url.endswith(".git"):
            url = url[: -len(".git")]
        if url.startswith("git@") and ":" in url:
            return url.split(":", 1)[1]
        parts = url.rstrip("/").split("/")
        return "/".join(parts[-2:]) if len(parts) >= 2 else url

    async def list_worktrees(self) -> dict[Path, WorktreeEntry]:
        result = await self.git("worktree", "list", "--porcelain")
        entries: dict[Path, WorktreeEntry] = {}
        current: dict[str, object] = {}

        def flush() -> None:
            if not current:
                return
            path = Path(str(current["path"])).resolve()
            branch = current.get("branch")
            entries[path] = WorktreeEntry(
                path=path,
                head=str(current["head"]) if current.get("head") else None,
                branch=str(branch) if branch else None,
                detached=bool(current.get("detached")),
                prunable=bool(current.get("prunable")),
                locked=bool(current.get("locked")),
            )
            current.clear()

        for line in result.stdout.splitlines():
            line = line.rstrip()
            if not line:
                flush()
                continue
            if line.startswith("worktree "):
                flush()
                current["path"] = line[len("worktree ") :]
            elif line.startswith("HEAD "):
                current["head"] = line[len("HEAD ") :]
            elif line.startswith("branch "):
                current["branch"] = line[len("branch ") :].removeprefix("refs/heads/")
            elif line == "detached":
                current["detached"] = True
            elif line.startswith("prunable"):
                current["prunable"] = True
            elif line.startswith("locked"):
                current["locked"] = True
        flush()
        return entries

    async def branch_exists(self, branch: str) -> bool:
        result = await self.git(
            "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", check=False
        )
        return result.ok

    async def is_ancestor(self, ancestor: str, descendant: str, *, cwd: Path) -> bool:
        result = await self.git(
            "merge-base", "--is-ancestor", ancestor, descendant, cwd=cwd, check=False
        )
        return result.ok

    # ------------------------------------------------------------- lifecycle

    async def prepare(
        self, *, branch: str, path: Path, base_sha: str, resume: bool
    ) -> PreparedWorktree:
        """Create or re-attach the task's worktree, or refuse.

        fresh   -> no worktree, no branch: create both at base_sha
        resume  -> expected worktree on expected branch, with --resume: reuse
        refuse  -> anything else
        """
        resolved_path = Path(path)
        async with self._lock:
            entries = await self.list_worktrees()
            existing = entries.get(resolved_path.resolve()) if resolved_path.exists() else None
            if existing is None:
                # A registration can outlive its directory.
                for entry_path, entry in entries.items():
                    if entry_path == resolved_path.resolve():
                        existing = entry
                        break

            if existing is not None:
                if existing.prunable:
                    raise WorktreeConflict(
                        f"worktree registration for {resolved_path} is stale/prunable. "
                        "Inspect it and run `git worktree prune` yourself; the runner will not."
                    )
                if existing.detached or existing.branch != branch:
                    raise WorktreeConflict(
                        f"worktree {resolved_path} is on "
                        f"{'a detached HEAD' if existing.detached else repr(existing.branch)}, "
                        f"expected branch {branch!r}. Refusing to repurpose it."
                    )
                if not resume:
                    raise WorktreeConflict(
                        f"worktree {resolved_path} already exists on {branch!r}. "
                        "Pass --resume to reuse it, or choose a different --worktree-root."
                    )
                if not await self.is_ancestor(base_sha, "HEAD", cwd=resolved_path):
                    raise WorktreeConflict(
                        f"worktree {resolved_path} is on {branch!r} but its HEAD does not descend "
                        f"from this batch's base SHA {base_sha[:12]}. Refusing to resume onto a "
                        "different base."
                    )
                return PreparedWorktree(
                    path=resolved_path,
                    branch=branch,
                    base_sha=base_sha,
                    created=False,
                    reused=True,
                )

            if resolved_path.exists() and any(resolved_path.iterdir()):
                raise WorktreeConflict(
                    f"{resolved_path} exists and is not an empty directory or a registered "
                    "worktree. Refusing to overwrite it."
                )

            resolved_path.parent.mkdir(parents=True, exist_ok=True)

            if await self.branch_exists(branch):
                if not resume:
                    raise WorktreeConflict(
                        f"branch {branch!r} already exists but has no worktree at {resolved_path}. "
                        "Pass --resume to attach a worktree to the existing branch, or delete the "
                        "branch yourself if it is stale."
                    )
                checked_out_elsewhere = [
                    str(entry.path) for entry in entries.values() if entry.branch == branch
                ]
                if checked_out_elsewhere:
                    raise WorktreeConflict(
                        f"branch {branch!r} is already checked out at "
                        f"{', '.join(checked_out_elsewhere)}. Refusing to check it out twice."
                    )
                await self.git("worktree", "add", str(resolved_path), branch)
                if not await self.is_ancestor(base_sha, "HEAD", cwd=resolved_path):
                    raise WorktreeConflict(
                        f"existing branch {branch!r} does not descend from base SHA "
                        f"{base_sha[:12]}. The worktree was attached at {resolved_path} and left "
                        "in place for inspection; the runner will not rebase or reset it."
                    )
                return PreparedWorktree(
                    path=resolved_path,
                    branch=branch,
                    base_sha=base_sha,
                    created=True,
                    reused=True,
                )

            await self.git("worktree", "add", "-b", branch, str(resolved_path), base_sha)
            return PreparedWorktree(
                path=resolved_path, branch=branch, base_sha=base_sha, created=True, reused=False
            )

    # ------------------------------------------------------------- inspection

    async def changed_files(self, worktree: Path, base_sha: str) -> list[str]:
        """Every repo-relative path this branch has touched since base_sha.

        Covers commits, the index, unstaged edits, and untracked files, so an
        agent cannot dodge the scope check by leaving work uncommitted.
        """
        collected: set[str] = set()
        probes = (
            ("diff", "--name-only", f"{base_sha}", "HEAD"),
            ("diff", "--name-only", "--cached"),
            ("diff", "--name-only"),
            ("ls-files", "--others", "--exclude-standard"),
        )
        for probe in probes:
            result = await self.git(*probe, cwd=worktree)
            collected.update(line.strip() for line in result.stdout.splitlines() if line.strip())
        return sorted(collected)

    async def is_dirty(self, worktree: Path) -> bool:
        result = await self.git("status", "--porcelain", cwd=worktree)
        return bool(result.stdout.strip())

    async def head_sha(self, worktree: Path) -> str:
        return (await self.git("rev-parse", "HEAD", cwd=worktree)).stdout.strip()

    # ------------------------------------------------------------- mutations

    async def commit_all(
        self, worktree: Path, message: str, *, no_verify: bool = True
    ) -> str | None:
        """Stage and commit everything in the worktree. Returns the new SHA."""
        await self.git("add", "-A", cwd=worktree)
        staged = await self.git("diff", "--cached", "--name-only", cwd=worktree)
        if not staged.stdout.strip():
            return None
        args = ["commit", "-m", message]
        if no_verify:
            args.append("--no-verify")
        await self.git(*args, cwd=worktree)
        return await self.head_sha(worktree)

    async def push_branch(self, worktree: Path, branch: str, remote: str = "origin") -> str:
        """Push the task branch. Never force, never to another ref."""
        current = (
            await self.git("rev-parse", "--abbrev-ref", "HEAD", cwd=worktree)
        ).stdout.strip()
        if current != branch:
            raise GitError(
                f"refusing to push: worktree {worktree} is on {current!r}, expected {branch!r}"
            )
        result = await self.git(
            "push", "--set-upstream", remote, f"{branch}:{branch}", cwd=worktree, timeout=600.0
        )
        return (result.stderr or result.stdout).strip()
