"""Manifest parsing, dependency ordering, scope rules, agent command, env."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from helpers import RUNNER_DIR, write_manifest  # noqa: F401  (sys.path setup)

from runner_config import (
    ConfigError,
    DEFAULT_STRIP_ENV_PATTERNS,
    ScopeChecker,
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

SHIPPED_MANIFEST = RUNNER_DIR / "tasks.yaml"


def task(**overrides) -> TaskConfig:
    base = {
        "id": "B",
        "title": "t",
        "branch": "test/b",
        "prompt_path": Path("/dev/null"),
    }
    base.update(overrides)
    return TaskConfig(**base)


class ShippedManifestTests(unittest.TestCase):
    """The manifest that ships with the runner must stay loadable and in scope."""

    def setUp(self) -> None:
        self.config = load_manifest(SHIPPED_MANIFEST)

    def test_defines_the_seven_batch_tasks(self) -> None:
        self.assertEqual(
            [t.id for t in self.config.tasks], ["B", "C", "D", "E", "F", "G1", "H1"]
        )

    def test_branches_match_the_batch_contract(self) -> None:
        self.assertEqual(
            {t.id: t.branch for t in self.config.tasks},
            {
                "B": "test/e2e-connections-critical",
                "C": "test/e2e-member-authz-critical",
                "D": "test/e2e-sale-lifecycle-critical",
                "E": "test/e2e-maintenance-critical",
                "F": "test/e2e-cross-tenant-foundation",
                "G1": "ops/e2e-staging-storage",
                "H1": "test/e2e-notes-ownership-critical",
            },
        )

    def test_every_prompt_file_exists(self) -> None:
        for item in self.config.tasks:
            self.assertTrue(item.prompt_path.is_file(), item.prompt_path)

    def test_all_seven_are_independent_in_this_batch(self) -> None:
        for item in self.config.tasks:
            self.assertEqual(item.depends_on, (), item.id)
        self.assertEqual(len(topological_waves(self.config.tasks)), 1)

    def test_critical_path_spec_is_frozen_for_the_spec_tasks(self) -> None:
        for task_id in ("B", "C", "D", "E", "F", "H1"):
            found = self.config.by_id[task_id]
            self.assertIn("tests/e2e/critical-path.spec.ts", found.forbidden_files, task_id)

    def test_ci_yml_is_frozen_for_every_task_including_g1(self) -> None:
        for item in self.config.tasks:
            self.assertIn(".github/workflows/ci.yml", item.forbidden_files, item.id)

    def test_g1_owns_the_hosted_staging_workflow(self) -> None:
        g1 = self.config.by_id["G1"]
        self.assertIn(".github/workflows/hosted-staging-integration.yml", g1.allowed_files)

    def test_h1_excludes_invoice_settings(self) -> None:
        self.assertIn(
            "tests/e2e/invoice-settings.spec.ts", self.config.by_id["H1"].forbidden_files
        )

    def test_f_owns_the_shared_identity_surface_alone(self) -> None:
        shared = {"tests/e2e/global-setup.ts", "tests/e2e/e2e-identities.ts"}
        self.assertTrue(shared.issubset(set(self.config.by_id["F"].allowed_files)))
        for task_id in ("B", "C", "D", "E", "H1"):
            self.assertTrue(
                shared.issubset(set(self.config.by_id[task_id].forbidden_files)), task_id
            )

    def test_hosted_e2e_is_required_for_spec_tasks_and_not_for_g1(self) -> None:
        for task_id in ("B", "C", "D", "E", "F", "H1"):
            self.assertTrue(self.config.by_id[task_id].hosted_e2e_required, task_id)
        self.assertFalse(self.config.by_id["G1"].hosted_e2e_required)

    def test_no_task_validates_with_hosted_e2e(self) -> None:
        for item in self.config.tasks:
            for command in item.validate:
                self.assertNotIn("test:e2e", command, item.id)


class ManifestRejectionTests(unittest.TestCase):
    """Every malformed or unsafe manifest must fail closed at load time."""

    def _load(self, body: str, prompts=("B.md",)) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = write_manifest(Path(tmp), body, prompts=list(prompts))
            load_manifest(path)

    def test_rejects_unsupported_version(self) -> None:
        with self.assertRaisesRegex(ConfigError, "unsupported manifest version"):
            self._load("version: 2\ntasks: []\n")

    def test_rejects_empty_task_list(self) -> None:
        with self.assertRaisesRegex(ConfigError, "non-empty list"):
            self._load("version: 1\ntasks: []\n")

    def test_rejects_missing_prompt_file(self) -> None:
        with self.assertRaisesRegex(ConfigError, "prompt file not found"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/missing.md
                """
            )

    def test_rejects_duplicate_task_id(self) -> None:
        with self.assertRaisesRegex(ConfigError, "duplicate task id"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: one
                    branch: test/b1
                    prompt: prompts/B.md
                  - id: B
                    title: two
                    branch: test/b2
                    prompt: prompts/B.md
                """
            )

    def test_rejects_duplicate_branch(self) -> None:
        with self.assertRaisesRegex(ConfigError, "already used by task"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: one
                    branch: test/same
                    prompt: prompts/B.md
                  - id: C
                    title: two
                    branch: test/same
                    prompt: prompts/B.md
                """
            )

    def test_rejects_branch_main(self) -> None:
        with self.assertRaisesRegex(ConfigError, "not allowed"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: main
                    prompt: prompts/B.md
                """
            )

    def test_rejects_unknown_dependency(self) -> None:
        with self.assertRaisesRegex(ConfigError, "unknown task"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    depends_on: [ZZ]
                """
            )

    def test_rejects_dependency_cycle(self) -> None:
        with self.assertRaisesRegex(ConfigError, "cycle"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    depends_on: [C]
                  - id: C
                    title: t
                    branch: test/c
                    prompt: prompts/B.md
                    depends_on: [B]
                """
            )

    def test_rejects_shell_metacharacters_in_validate(self) -> None:
        with self.assertRaisesRegex(ConfigError, "shell metacharacters"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    validate:
                      - npm run lint && npm run type-check
                """
            )

    def test_rejects_hosted_e2e_in_validate(self) -> None:
        with self.assertRaisesRegex(ConfigError, "hosted staging credentials"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    validate:
                      - npm run test:e2e:critical
                """
            )

    def test_rejects_external_mutating_binary_in_validate(self) -> None:
        with self.assertRaisesRegex(ConfigError, "mutate external state"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    validate:
                      - aws s3 ls
                """
            )

    def test_rejects_absolute_allowed_file(self) -> None:
        with self.assertRaisesRegex(ConfigError, "repo-relative"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    allowed_files:
                      - /etc/passwd
                """
            )

    def test_rejects_parent_escape_in_allowed_file(self) -> None:
        with self.assertRaisesRegex(ConfigError, r"escape the repo"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    allowed_files:
                      - ../outside.ts
                """
            )

    def test_rejects_file_that_is_both_allowed_and_forbidden(self) -> None:
        with self.assertRaisesRegex(ConfigError, "both allowed_files and forbidden_files"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    allowed_files:
                      - tests/e2e/a.spec.ts
                    forbidden_files:
                      - tests/e2e/a.spec.ts
                """
            )

    def test_rejects_unknown_task_key(self) -> None:
        with self.assertRaisesRegex(ConfigError, "unknown key"):
            self._load(
                """
                version: 1
                tasks:
                  - id: B
                    title: t
                    branch: test/b
                    prompt: prompts/B.md
                    auto_merge: true
                """
            )


class SelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_manifest(SHIPPED_MANIFEST)

    def test_defaults_to_every_enabled_task(self) -> None:
        self.assertEqual(len(select_tasks(self.config, None)), 7)

    def test_selects_a_subset_in_manifest_order(self) -> None:
        selected = select_tasks(self.config, ["H1", "B", "D"])
        self.assertEqual([t.id for t in selected], ["B", "D", "H1"])

    def test_is_case_insensitive_and_deduplicates(self) -> None:
        selected = select_tasks(self.config, ["g1", "G1", "b"])
        self.assertEqual([t.id for t in selected], ["B", "G1"])

    def test_rejects_unknown_task_id(self) -> None:
        with self.assertRaisesRegex(ConfigError, "unknown task id"):
            select_tasks(self.config, ["ZZ"])


class DependencyOrderingTests(unittest.TestCase):
    def test_orders_dependencies_into_waves(self) -> None:
        tasks = [
            task(id="G2", branch="test/g2", depends_on=("G1",)),
            task(id="G1", branch="test/g1"),
            task(id="B", branch="test/b"),
        ]
        self.assertEqual(topological_waves(tasks), [["G1", "B"], ["G2"]])

    def test_handles_a_three_level_chain(self) -> None:
        tasks = [
            task(id="F", branch="test/f"),
            task(id="F2", branch="test/f2", depends_on=("F",)),
            task(id="F3", branch="test/f3", depends_on=("F2",)),
        ]
        self.assertEqual(topological_waves(tasks), [["F"], ["F2"], ["F3"]])

    def test_detects_a_cycle(self) -> None:
        tasks = [
            task(id="A", branch="test/a", depends_on=("B",)),
            task(id="B", branch="test/b", depends_on=("A",)),
        ]
        with self.assertRaisesRegex(ConfigError, "cycle"):
            topological_waves(tasks)

    def test_reports_a_dependency_left_out_of_the_selection(self) -> None:
        g2 = task(id="G2", branch="test/g2", depends_on=("G1",))
        self.assertEqual(unsatisfied_dependencies(g2, ["G2"]), ["G1"])
        self.assertEqual(unsatisfied_dependencies(g2, ["G1", "G2"]), [])


class ScopeCheckerTests(unittest.TestCase):
    def test_accepts_an_exactly_allowed_file(self) -> None:
        report = ScopeChecker(
            task(allowed_files=("tests/e2e/connections.critical.spec.ts",))
        ).check(["tests/e2e/connections.critical.spec.ts"])
        self.assertTrue(report.scope_ok)
        self.assertEqual(report.unexpected_files, ())

    def test_accepts_a_file_under_an_allowed_prefix(self) -> None:
        report = ScopeChecker(task(allowed_file_prefixes=("tests/e2e/cross-tenant/",))).check(
            ["tests/e2e/cross-tenant/org-b.ts", "tests/e2e/cross-tenant/nested/x.ts"]
        )
        self.assertTrue(report.scope_ok)

    def test_accepts_a_glob_in_allowed_files(self) -> None:
        report = ScopeChecker(task(allowed_files=("docs/e2e-*.md",))).check(
            ["docs/e2e-staging-storage.md"]
        )
        self.assertTrue(report.scope_ok)

    def test_flags_an_unexpected_file(self) -> None:
        report = ScopeChecker(task(allowed_files=("tests/e2e/a.spec.ts",))).check(
            ["tests/e2e/a.spec.ts", "src/app/api/connections/route.ts"]
        )
        self.assertFalse(report.scope_ok)
        self.assertEqual(report.unexpected_files, ("src/app/api/connections/route.ts",))
        self.assertEqual(report.forbidden_files_touched, ())

    def test_flags_a_forbidden_file(self) -> None:
        report = ScopeChecker(
            task(
                allowed_files=("tests/e2e/connections.critical.spec.ts",),
                forbidden_files=("tests/e2e/critical-path.spec.ts",),
            )
        ).check(
            ["tests/e2e/connections.critical.spec.ts", "tests/e2e/critical-path.spec.ts"]
        )
        self.assertFalse(report.scope_ok)
        self.assertEqual(report.forbidden_files_touched, ("tests/e2e/critical-path.spec.ts",))
        self.assertEqual(report.unexpected_files, ())

    def test_forbidden_wins_over_an_allowing_prefix(self) -> None:
        """A broad allow prefix must never re-open a frozen file."""
        report = ScopeChecker(
            task(
                allowed_file_prefixes=(".github/workflows/",),
                forbidden_files=(".github/workflows/ci.yml",),
            )
        ).check([".github/workflows/ci.yml"])
        self.assertFalse(report.scope_ok)
        self.assertEqual(report.forbidden_files_touched, (".github/workflows/ci.yml",))

    def test_forbidden_glob_matches_a_directory_tree(self) -> None:
        report = ScopeChecker(task(forbidden_files=("supabase/migrations/*",))).check(
            ["supabase/migrations/20260101_x.sql"]
        )
        self.assertFalse(report.scope_ok)

    def test_a_clean_worktree_is_in_scope(self) -> None:
        report = ScopeChecker(task(allowed_files=("a.ts",))).check([])
        self.assertTrue(report.scope_ok)
        self.assertEqual(report.changed_files, ())


class AgentCommandTests(unittest.TestCase):
    def test_splits_a_command_without_a_shell(self) -> None:
        self.assertEqual(parse_agent_command("claude -p"), ["claude", "-p"])

    def test_preserves_quoted_arguments(self) -> None:
        self.assertEqual(
            parse_agent_command('codex exec --model "gpt test" --yolo'),
            ["codex", "exec", "--model", "gpt test", "--yolo"],
        )

    def test_rejects_an_empty_command(self) -> None:
        for raw in (None, "", "   "):
            with self.assertRaisesRegex(ConfigError, "No agent command configured"):
                parse_agent_command(raw)

    def test_rejects_an_unbalanced_quote(self) -> None:
        with self.assertRaisesRegex(ConfigError, "unparsable"):
            parse_agent_command('claude -p "oops')

    def test_detects_placeholder_usage(self) -> None:
        self.assertFalse(agent_command_uses_placeholder(["claude", "-p"]))
        self.assertTrue(
            agent_command_uses_placeholder(["myagent", "--prompt-file", "{prompt_file}"])
        )

    def test_expands_placeholders(self) -> None:
        expanded = expand_agent_command(
            ["myagent", "--prompt", "{prompt_file}", "--cwd", "{worktree}", "--id", "{task_id}"],
            {"prompt_file": "/tmp/p.md", "worktree": "/tmp/wt/b", "task_id": "B"},
        )
        self.assertEqual(
            expanded, ["myagent", "--prompt", "/tmp/p.md", "--cwd", "/tmp/wt/b", "--id", "B"]
        )


class EnvFilterTests(unittest.TestCase):
    def test_strips_known_secret_variables(self) -> None:
        env = {
            "PATH": "/usr/bin",
            "GITHUB_TOKEN": "ghp_example",
            "AWS_SECRET_ACCESS_KEY": "aws-example",
            "SUPABASE_SERVICE_ROLE_KEY": "sb-example",
            "PRODUCTION_DB_URL": "postgres://x",
            "ANTHROPIC_API_KEY": "sk-ant-keep-me",
        }
        filtered = filter_env(env, DEFAULT_STRIP_ENV_PATTERNS)
        self.assertEqual(
            sorted(filtered), ["ANTHROPIC_API_KEY", "PATH"]
        )
        self.assertEqual(
            stripped_env_keys(env, DEFAULT_STRIP_ENV_PATTERNS),
            ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "PRODUCTION_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"],
        )

    def test_keeps_the_agents_own_credential_so_it_can_run(self) -> None:
        env = {"ANTHROPIC_API_KEY": "sk-ant-x", "CLAUDE_CODE_OAUTH_TOKEN": "tok"}
        self.assertIn("ANTHROPIC_API_KEY", filter_env(env, DEFAULT_STRIP_ENV_PATTERNS))

    def test_no_stripping_when_patterns_are_empty(self) -> None:
        env = {"GITHUB_TOKEN": "x"}
        self.assertEqual(filter_env(env, ()), env)


if __name__ == "__main__":
    unittest.main()
