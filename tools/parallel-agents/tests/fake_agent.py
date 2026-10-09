#!/usr/bin/env python3
"""A deterministic stand-in for a real coding agent.

Used by the runner's tests and by `demo_fake_batch.py` so parallelism, failure
isolation, scope enforcement, and timeouts can be proven without spending money
or network on a real agent.

It reads the composed prompt on stdin (exactly as a real agent would), recovers
its task id and allowed files from that prompt, and then behaves as instructed
by the environment:

    FAKE_AGENT_PLAN      "B=write;D=exit:1;E=sleep:120;F=touch:some/other/file"
    FAKE_AGENT_DEFAULT   action for a task not named in the plan (default: write)
    FAKE_AGENT_CWD_LOG   append "<event> <task> <cwd> <monotonic>" lines here
    FAKE_AGENT_SLEEP_BEFORE  seconds to sleep after "start" and before acting,
                             so concurrent workers are guaranteed to overlap

Actions:
    write            create every allowed file the prompt lists
    touch:<path>     create exactly <path> (used to provoke scope violations)
    exit:<code>      exit with <code> without changing anything
    sleep:<seconds>  sleep, then exit 0 (used to provoke timeouts)
    noop             change nothing, exit 0
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path


def parse_section(prompt: str, header: str) -> list[str]:
    """Collect the bullet list that follows `header` in the composed prompt."""
    lines = prompt.splitlines()
    try:
        start = next(index for index, line in enumerate(lines) if line.strip().startswith(header))
    except StopIteration:
        return []
    items: list[str] = []
    for line in lines[start + 1 :]:
        stripped = line.strip()
        if not stripped:
            break
        if stripped == "(none)":
            break
        if stripped.startswith("- "):
            items.append(stripped[2:].strip())
        else:
            break
    return items


def parse_task_id(prompt: str) -> str:
    lines = prompt.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == "Task:" and index + 1 < len(lines):
            return lines[index + 1].split("—")[0].strip()
    return "UNKNOWN"


def log_event(event: str, task_id: str) -> None:
    path = os.environ.get("FAKE_AGENT_CWD_LOG")
    if not path:
        return
    line = f"{event} {task_id} {Path.cwd()} {time.monotonic():.4f}\n"
    # O_APPEND keeps concurrent single-line writes from interleaving.
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(line)


def resolve_action(task_id: str) -> str:
    plan = os.environ.get("FAKE_AGENT_PLAN", "")
    for entry in plan.split(";"):
        entry = entry.strip()
        if not entry or "=" not in entry:
            continue
        key, _, action = entry.partition("=")
        if key.strip() == task_id:
            return action.strip()
    return os.environ.get("FAKE_AGENT_DEFAULT", "write").strip()


def write_file(relative: str, task_id: str) -> None:
    target = Path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = target.read_text(encoding="utf-8") if target.exists() else ""
    target.write_text(
        existing + f"// fake agent output for task {task_id}\n", encoding="utf-8"
    )
    print(f"wrote {relative}")


def main() -> int:
    prompt = sys.stdin.read()
    task_id = parse_task_id(prompt)
    action = resolve_action(task_id)

    print(f"fake agent task={task_id} cwd={Path.cwd()} action={action}")
    log_event("start", task_id)

    delay = float(os.environ.get("FAKE_AGENT_SLEEP_BEFORE", "0") or 0)
    if delay:
        time.sleep(delay)

    try:
        if action == "write":
            allowed = [
                item for item in parse_section(prompt, "Allowed files:") if "(prefix)" not in item
            ]
            if not allowed:
                print("no concrete allowed files in prompt; nothing to write")
            for relative in allowed:
                write_file(relative, task_id)
            return 0

        if action.startswith("touch:"):
            write_file(action.split(":", 1)[1], task_id)
            return 0

        if action.startswith("exit:"):
            code = int(action.split(":", 1)[1])
            print(f"failing deliberately with exit {code}", file=sys.stderr)
            return code

        if action.startswith("sleep:"):
            time.sleep(float(action.split(":", 1)[1]))
            return 0

        if action == "noop":
            return 0

        print(f"unknown fake agent action: {action!r}", file=sys.stderr)
        return 64
    finally:
        log_event("end", task_id)


if __name__ == "__main__":
    raise SystemExit(main())
