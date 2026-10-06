"""Worktree lifecycle: fresh creation, resume, refusal, and change collection."""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from helpers import git, make_repo  # noqa: F401  (sys.path setup)

from runner_git import GitWorktreeManager, WorktreeConflict


class WorktreeLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.repo = make_repo(self.root / "repo")
        self.worktrees = self.root / "worktrees"
        self.manager = GitWorktreeManager(self.repo, self.worktrees)
        self.base_sha = asyncio.run(self.manager.resolve_sha("main"))

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def prepare(self, *, branch="test/b", name="b", resume=False):
        return asyncio.run(
            self.manager.prepare(
                branch=branch,
                path=self.worktrees / name,
                base_sha=self.base_sha,
                resume=resume,
            )
        )

    # ---------------------------------------------------------------- fresh

    def test_creates_a_fresh_branch_and_worktree_at_the_base_sha(self) -> None:
        prepared = self.prepare()
        self.assertTrue(prepared.created)
        self.assertFalse(prepared.reused)
        self.assertTrue((self.worktrees / "b" / ".git").exists())
        self.assertEqual(git("rev-parse", "HEAD", cwd=prepared.path), self.base_sha)
        self.assertEqual(
            git("rev-parse", "--abbrev-ref", "HEAD", cwd=prepared.path), "test/b"
        )

    def test_resolve_sha_returns_a_full_commit_sha(self) -> None:
        self.assertEqual(len(self.base_sha), 40)

    # --------------------------------------------------------------- refusal

    def test_refuses_an_existing_worktree_without_resume(self) -> None:
        self.prepare()
        with self.assertRaisesRegex(WorktreeConflict, "Pass --resume"):
            self.prepare()

    def test_refuses_a_worktree_on_an_unexpected_branch(self) -> None:
        self.prepare(branch="test/other", name="b")
        with self.assertRaisesRegex(WorktreeConflict, "Refusing to repurpose"):
            self.prepare(branch="test/b", name="b", resume=True)

    def test_refuses_an_existing_branch_with_no_worktree_unless_resuming(self) -> None:
        prepared = self.prepare()
        asyncio.run(self.manager.git("worktree", "remove", str(prepared.path)))
        with self.assertRaisesRegex(WorktreeConflict, "already exists but has no worktree"):
            self.prepare()

    def test_refuses_a_non_empty_unregistered_directory(self) -> None:
        squatter = self.worktrees / "b"
        squatter.mkdir(parents=True)
        (squatter / "stray.txt").write_text("not ours\n", encoding="utf-8")
        with self.assertRaisesRegex(WorktreeConflict, "Refusing to overwrite"):
            self.prepare()

    def test_refuses_to_resume_a_worktree_cut_from_an_older_base(self) -> None:
        """A leftover worktree from a previous batch must not silently join this one."""
        prepared = self.prepare()
        (prepared.path / "tests" / "e2e" / "wip.spec.ts").write_text("// wip\n", encoding="utf-8")

        # A later batch resolves a newer base SHA; the old worktree predates it.
        (self.repo / "moved.txt").write_text("after\n", encoding="utf-8")
        git("add", "-A", cwd=self.repo)
        git("commit", "-m", "main moves on", cwd=self.repo)
        newer_sha = asyncio.run(self.manager.resolve_sha("main"))
        self.assertNotEqual(newer_sha, self.base_sha)

        with self.assertRaisesRegex(WorktreeConflict, "does not descend"):
            asyncio.run(
                self.manager.prepare(
                    branch="test/b",
                    path=self.worktrees / "b",
                    base_sha=newer_sha,
                    resume=True,
                )
            )
        # Refused, not repaired: the agent's work is still there.
        self.assertTrue((prepared.path / "tests" / "e2e" / "wip.spec.ts").exists())

    # ---------------------------------------------------------------- resume

    def test_reuses_an_existing_worktree_on_the_same_branch(self) -> None:
        first = self.prepare()
        (first.path / "tests" / "e2e" / "new.spec.ts").write_text("// wip\n", encoding="utf-8")
        second = self.prepare(resume=True)
        self.assertTrue(second.reused)
        self.assertEqual(second.path, first.path)
        self.assertTrue((second.path / "tests" / "e2e" / "new.spec.ts").exists())

    def test_reattaches_a_worktree_to_an_existing_branch_when_resuming(self) -> None:
        prepared = self.prepare()
        asyncio.run(self.manager.git("worktree", "remove", str(prepared.path)))
        reattached = self.prepare(resume=True)
        self.assertTrue(reattached.reused)
        self.assertEqual(
            git("rev-parse", "--abbrev-ref", "HEAD", cwd=reattached.path), "test/b"
        )

    # --------------------------------------------------------- changed files

    def test_collects_untracked_staged_unstaged_and_committed_changes(self) -> None:
        prepared = self.prepare()
        (prepared.path / "untracked.ts").write_text("// new\n", encoding="utf-8")
        (prepared.path / "staged.ts").write_text("// staged\n", encoding="utf-8")
        git("add", "staged.ts", cwd=prepared.path)
        (prepared.path / "README.md").write_text("# edited\n", encoding="utf-8")
        (prepared.path / "committed.ts").write_text("// committed\n", encoding="utf-8")
        git("add", "committed.ts", cwd=prepared.path)
        git("commit", "-m", "wip", cwd=prepared.path)

        changed = asyncio.run(self.manager.changed_files(prepared.path, self.base_sha))
        self.assertEqual(
            changed, ["README.md", "committed.ts", "staged.ts", "untracked.ts"]
        )

    def test_a_pristine_worktree_reports_no_changes(self) -> None:
        prepared = self.prepare()
        self.assertEqual(asyncio.run(self.manager.changed_files(prepared.path, self.base_sha)), [])

    def test_ignores_gitignored_files(self) -> None:
        prepared = self.prepare()
        (prepared.path / ".gitignore").write_text("secrets.txt\n", encoding="utf-8")
        (prepared.path / "secrets.txt").write_text("token\n", encoding="utf-8")
        changed = asyncio.run(self.manager.changed_files(prepared.path, self.base_sha))
        self.assertIn(".gitignore", changed)
        self.assertNotIn("secrets.txt", changed)

    # -------------------------------------------------------------- commit

    def test_commit_all_creates_one_commit_and_is_a_noop_when_clean(self) -> None:
        prepared = self.prepare()
        (prepared.path / "tests" / "e2e" / "x.spec.ts").write_text("// x\n", encoding="utf-8")
        sha = asyncio.run(self.manager.commit_all(prepared.path, "test(e2e): add x"))
        self.assertIsNotNone(sha)
        self.assertEqual(
            git("log", "-1", "--pretty=%s", cwd=prepared.path), "test(e2e): add x"
        )
        self.assertIsNone(asyncio.run(self.manager.commit_all(prepared.path, "again")))

    def test_push_refuses_when_the_worktree_is_on_another_branch(self) -> None:
        from runner_git import GitError

        prepared = self.prepare()
        git("checkout", "--detach", "HEAD", cwd=prepared.path)
        with self.assertRaisesRegex(GitError, "refusing to push"):
            asyncio.run(self.manager.push_branch(prepared.path, "test/b"))


class SharedBaseShaTests(unittest.TestCase):
    """Every worktree in one batch must be cut from the same resolved SHA."""

    def test_all_worktrees_share_the_resolved_base_even_if_main_moves(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = make_repo(root / "repo")
            manager = GitWorktreeManager(repo, root / "worktrees")
            base_sha = asyncio.run(manager.resolve_sha("main"))

            first = asyncio.run(
                manager.prepare(
                    branch="test/one", path=root / "worktrees" / "one",
                    base_sha=base_sha, resume=False,
                )
            )

            # main advances mid-batch; the batch must not notice.
            (repo / "moved.txt").write_text("after\n", encoding="utf-8")
            git("add", "-A", cwd=repo)
            git("commit", "-m", "main moves on", cwd=repo)
            self.assertNotEqual(asyncio.run(manager.resolve_sha("main")), base_sha)

            second = asyncio.run(
                manager.prepare(
                    branch="test/two", path=root / "worktrees" / "two",
                    base_sha=base_sha, resume=False,
                )
            )

            self.assertEqual(git("rev-parse", "HEAD", cwd=first.path), base_sha)
            self.assertEqual(git("rev-parse", "HEAD", cwd=second.path), base_sha)


if __name__ == "__main__":
    unittest.main()
