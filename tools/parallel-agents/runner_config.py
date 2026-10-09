"""Task manifest loading, scope rules, and dependency resolution.

Pure configuration logic: no subprocesses, no git, no I/O beyond reading the
manifest and prompt files. Kept separate so it is cheap to unit test.
"""

from __future__ import annotations

import fnmatch
import re
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

SUPPORTED_VERSION = 1

# Validation commands run on a developer machine against a local checkout. They
# must never reach hosted staging, production, a real database, or a code host.
# Hosted E2E stays a CI responsibility (see README "Hosted staging is serial").
DENIED_VALIDATE_SCRIPTS = frozenset(
    {
        "test:e2e",
        "test:e2e:full",
        "test:e2e:all-browsers",
        "test:e2e:critical",
        "test:e2e:critical:dev",
        "test:e2e:ui",
        "test:e2e:invoice-settings",
        "test:e2e:invoice-settings:all-browsers",
        "test:all",
        "reset:db",
        "seed:data",
        "seed:demo",
        "seed:demo:reset",
        "seed:demo:identity",
        "migrate",
        "migrate:postgres",
        "migrate:cli",
        "migrate:sh",
        "migrate:subtype",
        "migrate:maintenance",
        "deploy:build",
        "staging:audits",
        "auth-matrix:hosted",
        "test:synthetic:postdeploy",
        "fix:ownership",
        "populate:numbers",
    }
)

DENIED_VALIDATE_BINARIES = frozenset(
    {"gh", "aws", "supabase", "vercel", "psql", "pg_dump", "docker", "terraform", "ssh"}
)

# `shlex.split` happily accepts these, but we exec without a shell, so a command
# containing them would silently not mean what the author wrote.
_SHELL_METACHAR_RE = re.compile(r"[;&|<>`$\n\r]|\(\)|\{\}")

DEFAULT_STRIP_ENV_PATTERNS: tuple[str, ...] = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "VERCEL_TOKEN",
    "NPM_TOKEN",
    "CODECOV_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "*_SERVICE_ROLE_KEY",
    "*_DB_PASSWORD",
    "PRODUCTION_*",
    "PROD_*",
)

# Placeholders a configured agent command may use. When none is present the
# composed prompt is written to the child's stdin instead.
AGENT_PLACEHOLDERS = ("{prompt_file}", "{worktree}", "{task_id}", "{branch}", "{base_sha}")


class ConfigError(Exception):
    """Raised for any malformed or unsafe manifest."""


@dataclass(frozen=True)
class Defaults:
    base_ref: str = "origin/main"
    worktree_root: str = "/tmp/hc-parallel-agents"
    max_parallel: int = 7
    timeout_minutes: int = 45
    repository: str | None = None
    agent_command: str | None = None
    validate: tuple[str, ...] = ()
    forbidden_files: tuple[str, ...] = ()
    strip_env_patterns: tuple[str, ...] = DEFAULT_STRIP_ENV_PATTERNS
    commit_no_verify: bool = True


@dataclass(frozen=True)
class TaskConfig:
    id: str
    title: str
    branch: str
    prompt_path: Path
    depends_on: tuple[str, ...] = ()
    allowed_files: tuple[str, ...] = ()
    allowed_file_prefixes: tuple[str, ...] = ()
    forbidden_files: tuple[str, ...] = ()
    validate: tuple[str, ...] = ()
    hosted_e2e_required: bool = False
    enabled: bool = True
    timeout_minutes: int = 45
    agent_command: str | None = None
    commit_message: str = ""

    @property
    def slug(self) -> str:
        return self.id.strip().lower()

    def worktree_path(self, worktree_root: Path) -> Path:
        return Path(worktree_root) / self.slug


@dataclass(frozen=True)
class BatchConfig:
    version: int
    defaults: Defaults
    tasks: tuple[TaskConfig, ...]
    manifest_path: Path

    @property
    def by_id(self) -> dict[str, TaskConfig]:
        return {task.id: task for task in self.tasks}


# --------------------------------------------------------------------------- #
# manifest loading
# --------------------------------------------------------------------------- #


def _require_yaml():
    try:
        import yaml  # noqa: PLC0415 - optional dependency, reported clearly below
    except ModuleNotFoundError as exc:  # pragma: no cover - env specific
        raise ConfigError(
            "PyYAML is required to read the task manifest.\n"
            "Install it in an isolated virtualenv:\n"
            "  python3 -m venv .venv-parallel\n"
            "  source .venv-parallel/bin/activate\n"
            "  pip install -r tools/parallel-agents/requirements.txt"
        ) from exc
    return yaml


def _as_str_tuple(value: Any, *, field_name: str, task_id: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str) or not isinstance(value, Sequence):
        raise ConfigError(f"task {task_id}: {field_name} must be a list of strings")
    out: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ConfigError(f"task {task_id}: {field_name} entries must be non-empty strings")
        out.append(item.strip())
    return tuple(out)


def _check_relative_path(pattern: str, *, field_name: str, task_id: str) -> None:
    if pattern.startswith("/") or pattern.startswith("~"):
        raise ConfigError(
            f"task {task_id}: {field_name} entry {pattern!r} must be repo-relative, not absolute"
        )
    if ".." in Path(pattern).parts:
        raise ConfigError(
            f"task {task_id}: {field_name} entry {pattern!r} must not escape the repo with '..'"
        )


def _check_validate_command(command: str, *, task_id: str) -> None:
    if _SHELL_METACHAR_RE.search(command):
        raise ConfigError(
            f"task {task_id}: validate command {command!r} contains shell metacharacters. "
            "Commands are executed without a shell; use one argv command per list entry."
        )
    try:
        argv = shlex.split(command)
    except ValueError as exc:
        raise ConfigError(f"task {task_id}: validate command {command!r} is unparsable: {exc}") from exc
    if not argv:
        raise ConfigError(f"task {task_id}: validate command {command!r} is empty")

    binary = Path(argv[0]).name
    if binary in DENIED_VALIDATE_BINARIES:
        raise ConfigError(
            f"task {task_id}: validate command {command!r} invokes {binary!r}, which can mutate "
            "external state. Local validation must stay offline and read-only."
        )
    for token in argv[1:]:
        if token in DENIED_VALIDATE_SCRIPTS:
            raise ConfigError(
                f"task {task_id}: validate command {command!r} runs the {token!r} script, which "
                "needs hosted staging credentials or mutates data. Set hosted_e2e_required: true "
                "and leave it to CI."
            )


def _default_commit_message(task: Mapping[str, Any]) -> str:
    title = str(task.get("title") or task.get("id") or "parallel agent task").strip()
    branch = str(task.get("branch") or "")
    scope = "ops" if branch.startswith("ops/") else "test(e2e)"
    return f"{scope}: {title[0].lower() + title[1:] if title else 'parallel agent task'}"


def _parse_defaults(raw: Mapping[str, Any] | None) -> Defaults:
    raw = raw or {}
    if not isinstance(raw, Mapping):
        raise ConfigError("defaults must be a mapping")
    base = Defaults()
    unknown = set(raw) - {f for f in Defaults.__dataclass_fields__}
    if unknown:
        raise ConfigError(f"defaults: unknown key(s) {sorted(unknown)}")

    def _int(key: str, fallback: int) -> int:
        value = raw.get(key, fallback)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ConfigError(f"defaults.{key} must be a positive integer")
        return value

    validate = _as_str_tuple(raw.get("validate"), field_name="defaults.validate", task_id="<defaults>")
    for command in validate:
        _check_validate_command(command, task_id="<defaults>")

    forbidden = _as_str_tuple(
        raw.get("forbidden_files"), field_name="defaults.forbidden_files", task_id="<defaults>"
    )
    for pattern in forbidden:
        _check_relative_path(pattern, field_name="defaults.forbidden_files", task_id="<defaults>")

    strip_patterns = raw.get("strip_env_patterns")
    strip = (
        base.strip_env_patterns
        if strip_patterns is None
        else _as_str_tuple(strip_patterns, field_name="defaults.strip_env_patterns", task_id="<defaults>")
    )

    return Defaults(
        base_ref=str(raw.get("base_ref", base.base_ref)).strip() or base.base_ref,
        worktree_root=str(raw.get("worktree_root", base.worktree_root)).strip() or base.worktree_root,
        max_parallel=_int("max_parallel", base.max_parallel),
        timeout_minutes=_int("timeout_minutes", base.timeout_minutes),
        repository=(str(raw["repository"]).strip() if raw.get("repository") else None),
        agent_command=(str(raw["agent_command"]).strip() if raw.get("agent_command") else None),
        validate=validate,
        forbidden_files=forbidden,
        strip_env_patterns=strip,
        commit_no_verify=bool(raw.get("commit_no_verify", base.commit_no_verify)),
    )


_TASK_KEYS = {
    "id",
    "title",
    "branch",
    "prompt",
    "depends_on",
    "allowed_files",
    "allowed_file_prefixes",
    "forbidden_files",
    "validate",
    "hosted_e2e_required",
    "enabled",
    "timeout_minutes",
    "agent",
    "commit_message",
}


def _parse_task(raw: Mapping[str, Any], defaults: Defaults, manifest_dir: Path) -> TaskConfig:
    if not isinstance(raw, Mapping):
        raise ConfigError("each task must be a mapping")
    task_id = str(raw.get("id", "")).strip()
    if not task_id:
        raise ConfigError("task is missing required field: id")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", task_id):
        raise ConfigError(f"task {task_id!r}: id must be alphanumeric with . _ - only")

    unknown = set(raw) - _TASK_KEYS
    if unknown:
        raise ConfigError(f"task {task_id}: unknown key(s) {sorted(unknown)}")

    for required in ("title", "branch", "prompt"):
        if not str(raw.get(required, "")).strip():
            raise ConfigError(f"task {task_id}: missing required field: {required}")

    branch = str(raw["branch"]).strip()
    if branch in {"main", "master"} or branch.startswith("origin/"):
        raise ConfigError(
            f"task {task_id}: branch {branch!r} is not allowed; use a dedicated topic branch"
        )

    prompt_path = (manifest_dir / str(raw["prompt"]).strip()).resolve()
    if not prompt_path.is_file():
        raise ConfigError(f"task {task_id}: prompt file not found: {prompt_path}")

    allowed_files = _as_str_tuple(raw.get("allowed_files"), field_name="allowed_files", task_id=task_id)
    allowed_prefixes = _as_str_tuple(
        raw.get("allowed_file_prefixes"), field_name="allowed_file_prefixes", task_id=task_id
    )
    forbidden_files = _as_str_tuple(
        raw.get("forbidden_files"), field_name="forbidden_files", task_id=task_id
    )
    for name, patterns in (
        ("allowed_files", allowed_files),
        ("allowed_file_prefixes", allowed_prefixes),
        ("forbidden_files", forbidden_files),
    ):
        for pattern in patterns:
            _check_relative_path(pattern, field_name=name, task_id=task_id)

    merged_forbidden = tuple(dict.fromkeys(forbidden_files + defaults.forbidden_files))

    if "validate" in raw:
        validate = _as_str_tuple(raw.get("validate"), field_name="validate", task_id=task_id)
    else:
        validate = defaults.validate
    for command in validate:
        _check_validate_command(command, task_id=task_id)

    timeout_minutes = raw.get("timeout_minutes", defaults.timeout_minutes)
    if not isinstance(timeout_minutes, int) or isinstance(timeout_minutes, bool) or timeout_minutes < 1:
        raise ConfigError(f"task {task_id}: timeout_minutes must be a positive integer")

    agent = raw.get("agent")
    if agent is not None and (not isinstance(agent, str) or not agent.strip()):
        raise ConfigError(f"task {task_id}: agent must be a non-empty string when present")

    return TaskConfig(
        id=task_id,
        title=str(raw["title"]).strip(),
        branch=branch,
        prompt_path=prompt_path,
        depends_on=_as_str_tuple(raw.get("depends_on"), field_name="depends_on", task_id=task_id),
        allowed_files=allowed_files,
        allowed_file_prefixes=allowed_prefixes,
        forbidden_files=merged_forbidden,
        validate=validate,
        hosted_e2e_required=bool(raw.get("hosted_e2e_required", False)),
        enabled=bool(raw.get("enabled", True)),
        timeout_minutes=timeout_minutes,
        agent_command=(agent.strip() if isinstance(agent, str) else None),
        commit_message=str(raw.get("commit_message") or _default_commit_message(raw)).strip(),
    )


def parse_manifest(text: str, manifest_path: Path) -> BatchConfig:
    """Parse manifest YAML text. Raises ConfigError on anything malformed."""
    yaml = _require_yaml()
    try:
        raw = yaml.safe_load(text)
    except Exception as exc:  # yaml.YAMLError and friends
        raise ConfigError(f"{manifest_path}: invalid YAML: {exc}") from exc

    if not isinstance(raw, Mapping):
        raise ConfigError(f"{manifest_path}: top level must be a mapping")

    unknown = set(raw) - {"version", "defaults", "tasks"}
    if unknown:
        raise ConfigError(f"{manifest_path}: unknown top-level key(s) {sorted(unknown)}")

    version = raw.get("version")
    if version != SUPPORTED_VERSION:
        raise ConfigError(f"{manifest_path}: unsupported manifest version {version!r} (expected 1)")

    defaults = _parse_defaults(raw.get("defaults"))

    raw_tasks = raw.get("tasks")
    if not isinstance(raw_tasks, Sequence) or isinstance(raw_tasks, str) or not raw_tasks:
        raise ConfigError(f"{manifest_path}: tasks must be a non-empty list")

    manifest_dir = manifest_path.parent
    tasks = tuple(_parse_task(item, defaults, manifest_dir) for item in raw_tasks)

    seen_ids: set[str] = set()
    seen_branches: dict[str, str] = {}
    for task in tasks:
        if task.id in seen_ids:
            raise ConfigError(f"duplicate task id: {task.id}")
        seen_ids.add(task.id)
        if task.branch in seen_branches:
            raise ConfigError(
                f"task {task.id}: branch {task.branch!r} is already used by task {seen_branches[task.branch]}"
            )
        seen_branches[task.branch] = task.id

    for task in tasks:
        for dep in task.depends_on:
            if dep not in seen_ids:
                raise ConfigError(f"task {task.id}: depends_on references unknown task {dep!r}")
            if dep == task.id:
                raise ConfigError(f"task {task.id}: depends_on must not include itself")
        overlap = set(task.allowed_files) & set(task.forbidden_files)
        if overlap:
            raise ConfigError(
                f"task {task.id}: {sorted(overlap)} appear in both allowed_files and forbidden_files"
            )

    config = BatchConfig(
        version=version, defaults=defaults, tasks=tasks, manifest_path=manifest_path
    )
    # Surface cycles at load time rather than at execution time.
    topological_waves(tasks)
    return config


def load_manifest(manifest_path: Path) -> BatchConfig:
    path = Path(manifest_path).resolve()
    if not path.is_file():
        raise ConfigError(f"task manifest not found: {path}")
    return parse_manifest(path.read_text(encoding="utf-8"), path)


# --------------------------------------------------------------------------- #
# selection and dependency resolution
# --------------------------------------------------------------------------- #


def select_tasks(config: BatchConfig, requested: Sequence[str] | None) -> tuple[TaskConfig, ...]:
    """Resolve --tasks into TaskConfigs, preserving manifest order."""
    if not requested:
        selected = tuple(task for task in config.tasks if task.enabled)
        if not selected:
            raise ConfigError("no enabled tasks in manifest")
        return selected

    by_id = config.by_id
    lowered = {task_id.lower(): task_id for task_id in by_id}
    resolved: list[str] = []
    for raw_id in requested:
        key = raw_id.strip()
        if not key:
            continue
        actual = key if key in by_id else lowered.get(key.lower())
        if actual is None:
            raise ConfigError(f"unknown task id {raw_id!r}; manifest defines {sorted(by_id)}")
        if actual not in resolved:
            resolved.append(actual)
    if not resolved:
        raise ConfigError("--tasks resolved to an empty selection")

    disabled = [task_id for task_id in resolved if not by_id[task_id].enabled]
    if disabled:
        raise ConfigError(
            f"task(s) {disabled} are disabled in the manifest; set enabled: true to run them"
        )
    order = {task.id: index for index, task in enumerate(config.tasks)}
    return tuple(sorted((by_id[task_id] for task_id in resolved), key=lambda t: order[t.id]))


def topological_waves(tasks: Iterable[TaskConfig]) -> list[list[str]]:
    """Group tasks into dependency waves. Raises ConfigError on a cycle.

    Dependencies outside the given set are ignored here; `unsatisfied_dependencies`
    reports those instead, so an unselected dependency blocks rather than reorders.
    """
    task_list = list(tasks)
    ids = [task.id for task in task_list]
    pending = {task.id: {dep for dep in task.depends_on if dep in set(ids)} for task in task_list}
    waves: list[list[str]] = []
    done: set[str] = set()

    while pending:
        wave = [task_id for task_id in ids if task_id in pending and not (pending[task_id] - done)]
        if not wave:
            raise ConfigError(
                f"dependency cycle detected among task(s): {sorted(pending)}"
            )
        waves.append(wave)
        done.update(wave)
        for task_id in wave:
            pending.pop(task_id)
    return waves


def unsatisfied_dependencies(
    task: TaskConfig, selected_ids: Iterable[str]
) -> list[str]:
    """Dependencies of `task` that are not part of this batch's selection."""
    selected = set(selected_ids)
    return [dep for dep in task.depends_on if dep not in selected]


# --------------------------------------------------------------------------- #
# scope enforcement
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class ScopeReport:
    scope_ok: bool
    changed_files: tuple[str, ...]
    in_scope_files: tuple[str, ...]
    unexpected_files: tuple[str, ...]
    forbidden_files_touched: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "scope_ok": self.scope_ok,
            "changed_files": list(self.changed_files),
            "unexpected_files": list(self.unexpected_files),
            "forbidden_files_touched": list(self.forbidden_files_touched),
        }


def _matches_any(path: str, patterns: Sequence[str]) -> bool:
    for pattern in patterns:
        if path == pattern or fnmatch.fnmatchcase(path, pattern):
            return True
    return False


class ScopeChecker:
    """Classifies changed files against a task's declared ownership.

    `forbidden_files` wins over `allowed_*` so a broad prefix can never
    re-open a file the manifest froze.
    """

    def __init__(self, task: TaskConfig) -> None:
        self._task = task

    def check(self, changed_files: Iterable[str]) -> ScopeReport:
        changed = tuple(dict.fromkeys(sorted(path for path in changed_files if path)))
        forbidden: list[str] = []
        unexpected: list[str] = []
        in_scope: list[str] = []

        for path in changed:
            if _matches_any(path, self._task.forbidden_files):
                forbidden.append(path)
                continue
            allowed = _matches_any(path, self._task.allowed_files) or any(
                path.startswith(prefix) for prefix in self._task.allowed_file_prefixes
            )
            (in_scope if allowed else unexpected).append(path)

        return ScopeReport(
            scope_ok=not forbidden and not unexpected,
            changed_files=changed,
            in_scope_files=tuple(in_scope),
            unexpected_files=tuple(unexpected),
            forbidden_files_touched=tuple(forbidden),
        )


# --------------------------------------------------------------------------- #
# agent command / environment
# --------------------------------------------------------------------------- #


def parse_agent_command(raw: str | None) -> list[str]:
    """Split a configured agent command into argv. Never uses a shell."""
    if raw is None or not raw.strip():
        raise ConfigError(
            "No agent command configured. Set PARALLEL_AGENT_COMMAND, pass "
            "--agent-command, or add defaults.agent_command to the manifest.\n"
            "Example: export PARALLEL_AGENT_COMMAND='claude -p'"
        )
    try:
        argv = shlex.split(raw)
    except ValueError as exc:
        raise ConfigError(f"agent command {raw!r} is unparsable: {exc}") from exc
    if not argv:
        raise ConfigError(f"agent command {raw!r} is empty")
    return argv


def agent_command_uses_placeholder(argv: Sequence[str]) -> bool:
    return any(placeholder in token for token in argv for placeholder in AGENT_PLACEHOLDERS)


def expand_agent_command(argv: Sequence[str], substitutions: Mapping[str, str]) -> list[str]:
    expanded: list[str] = []
    for token in argv:
        for key, value in substitutions.items():
            token = token.replace("{" + key + "}", value)
        expanded.append(token)
    return expanded


def filter_env(
    env: Mapping[str, str], strip_patterns: Sequence[str] = DEFAULT_STRIP_ENV_PATTERNS
) -> dict[str, str]:
    """Drop obviously-unnecessary secrets before handing the env to a child.

    This is a reduction, not a sandbox: see the README security section.
    """
    out: dict[str, str] = {}
    for key, value in env.items():
        if any(fnmatch.fnmatchcase(key, pattern) for pattern in strip_patterns):
            continue
        out[key] = value
    return out


def stripped_env_keys(
    env: Mapping[str, str], strip_patterns: Sequence[str] = DEFAULT_STRIP_ENV_PATTERNS
) -> list[str]:
    return sorted(
        key
        for key in env
        if any(fnmatch.fnmatchcase(key, pattern) for pattern in strip_patterns)
    )
