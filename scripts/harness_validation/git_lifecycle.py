"""Validate the branch, publish, tag, and exact-cleanup lifecycle as one contract."""

from __future__ import annotations

import ast
from pathlib import Path

from .context import (
    AGENT_POLICY,
    CROSS_RELEASE_CONTEXT_HELPER,
    CROSS_RELEASE_CONTEXT_HELPER_TESTS,
    ENGINEERING_RULES,
    GIT_LIFECYCLE_METADATA,
    GIT_LIFECYCLE_SCRIPT,
    GIT_LIFECYCLE_SKILL,
    GIT_LIFECYCLE_SKILL_ROOT,
    GIT_LIFECYCLE_TESTS,
    PREPARE_RELEASE_SKILL,
    PRODUCT_SPEC,
    RELEASE_CONTEXT_HELPER,
    RELEASE_CONTEXT_HELPER_TESTS,
    ROOT,
    SKILLS_ROOT,
    WORKFLOW,
    display_path,
    fail,
    require_fragments,
)


OLD_SKILL_ROOT = SKILLS_ROOT / "desktop-manage-git-branch-chain"


def _function_source(module_text: str, name: str) -> str:
    """Return one top-level function's exact source segment."""

    tree = ast.parse(module_text)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return ast.get_source_segment(module_text, node) or ""
    return ""


def _require_order(
    errors: list[str], path: Path, text: str, fragments: tuple[str, ...], *, label: str
) -> None:
    """Require fragments to appear exactly in the declared operation order."""

    positions = [text.find(fragment) for fragment in fragments]
    if any(position < 0 for position in positions):
        missing = [fragment for fragment, position in zip(fragments, positions) if position < 0]
        fail(errors, f"{label} missing in {display_path(path)}: {', '.join(missing)}")
    elif positions != sorted(positions):
        fail(errors, f"{label} is out of order in {display_path(path)}")


def _active_contract_files() -> tuple[Path, ...]:
    """Return current executable/rule surfaces, excluding historical evidence and tests."""

    primary_docs = (
        ROOT / "AGENTS.md",
        ROOT / "README.md",
        AGENT_POLICY,
        ENGINEERING_RULES,
        ROOT / "docs" / "RELEASE.md",
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md",
        ROOT / "docs" / "VERIFICATION.md",
        PRODUCT_SPEC,
    )
    # Include prose and executable helpers, but exclude tests whose negative fixtures
    # intentionally contain retired tokens.
    skill_contracts = tuple(
        path
        for skill_root in SKILLS_ROOT.iterdir()
        if skill_root.is_dir()
        for path in skill_root.rglob("*")
        if path.is_file()
        and (
            path.name in {"SKILL.md", "openai.yaml"}
            or (path.suffix in {".py", ".sh", ".ps1", ".yml", ".yaml"} and not path.name.startswith("test_"))
        )
    )
    validator_code = tuple(
        path
        for path in (ROOT / "scripts" / "harness_validation").glob("*.py")
        if not path.name.startswith("test_") and path.name != Path(__file__).name
    )
    return (*primary_docs, *skill_contracts, *validator_code)


def _validate_no_retired_runtime(errors: list[str]) -> None:
    """Reject operational remnants while allowing explicit historical evidence."""

    retired_fragments = (
        "desktop-manage-git-branch-chain",
        ".harness/git-branch-chain.json",
        "verify-release-review",
        "verify_release_envelope.py",
        "git push --atomic",
        "git merge --ff-only",
        "--force-with-lease",
        "lastClosedChain",
        "activeChain",
        "closing commit",
        "refs/heads/Release",
        "ref: Release",
        "codex/task-",
        "task-slug",
    )
    seen: set[Path] = set()
    for path in _active_contract_files():
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        for fragment in retired_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"retired Git lifecycle runtime remains in {display_path(path)}: {fragment}",
                )


def validate_git_lifecycle_contract(errors: list[str]) -> None:
    """Validate local start, main publish, tag-first release, and exact cleanup."""

    if OLD_SKILL_ROOT.exists() or OLD_SKILL_ROOT.is_symlink():
        fail(errors, f"retired Git lifecycle skill still exists: {display_path(OLD_SKILL_ROOT)}")

    required = {
        GIT_LIFECYCLE_SKILL: (
            "name: desktop-manage-git-lifecycle",
            "start --project-root",
            "track-worktree --project-root",
            "publish --project-root",
            "release --project-root",
            "feature-<summary>-<Asia/Shanghai YYYYMMDD>",
            "创建本地分支不要求配置远端",
            "即使命令从关联 Task Worktree 发起",
            "无论从主 Worktree 还是关联 Task Worktree 发起",
            "普通 `git merge --no-edit`",
            "不创建标签，也不清理任何资源",
            "`v{version}-{YYYYMMDD}`",
            "远端标签成功确认之前不会开始清理",
            "Worktree、精确登记的远端分支、精确登记的本地分支",
            "不扫描名称前缀",
            "Git common-dir",
            "不会写入项目受跟踪目录",
            "多个 Task 同时开始也不会相互覆盖登记",
        ),
        GIT_LIFECYCLE_METADATA: (
            'display_name: "管理 Git 生命周期"',
            "$desktop-manage-git-lifecycle",
        ),
        GIT_LIFECYCLE_SCRIPT: (
            'STATE_DIRECTORY = "agent-first-harness"',
            'STATE_FILENAME = "git-lifecycle.json"',
            'LOCK_DIRECTORY = ".git-lifecycle.lock"',
            "def lifecycle_state_lock",
            "def primary_repository",
            '["switch", "-c", candidate]',
            'select_remote(repository, state, arguments.remote, required=False)',
            '["merge", "--no-edit", f"refs/heads/{branch}"]',
            '"tagged": False',
            '"cleaned": False',
            'tag = f"v{version}-{release_date}"',
            'raise LifecycleError("tag-conflict"',
            'raise LifecycleError("tag-push-failed"',
            'raise LifecycleError("tag-verification-failed"',
            'remove_arguments = ["worktree", "remove", "--", registered]',
            '["push", remote, f":refs/heads/{branch}"]',
            '["branch", "-D", "--", branch]',
            'commands.add_parser("track-worktree"',
            "return publish(primary_repository(repository), arguments.remote)",
            "repository = primary_repository(repository)",
        ),
        GIT_LIFECYCLE_TESTS: (
            "test_start_without_remote_is_idempotent_and_uses_common_dir_state",
            "test_start_adds_numeric_suffix_for_local_name_collisions",
            "test_concurrent_task_starts_preserve_both_branches_and_worktrees",
            "test_detached_task_worktree_start_is_registered_and_release_removes_it",
            "test_publish_merges_switches_and_pushes_without_tag_or_cleanup",
            "test_publish_merges_current_remote_default_before_development_branches",
            "test_publish_refuses_to_omit_a_missing_registered_branch",
            "test_release_tag_rejection_leaves_resources_and_remote_drift_blocks_cleanup",
            "test_release_tag_conflict_leaves_cycle_resources",
            "test_release_preserves_dirty_worktree_and_resumes_after_it_is_clean",
            "test_release_persists_each_cleanup_item_and_resumes_after_remote_rejection",
            "test_release_tags_before_exact_cleanup_and_retry_is_idempotent",
        ),
        RELEASE_CONTEXT_HELPER: (
            'CONTEXT_RELATIVE_PATH = ".harness/release-context.json"',
            '"expectedTag"',
            'expected_tag = f"v{version}-{release_date}"',
        ),
        CROSS_RELEASE_CONTEXT_HELPER: (
            'CONTEXT_PATH = Path(".harness/release-context.json")',
            '"releaseContextSha256"',
            "f\"refs/tags/{normalized['expectedTag']}\"",
        ),
        WORKFLOW: (
            "release_context_sha256:",
            "verify_release_context.py capture",
            "verify_release_context.py verify",
            '"releaseContextSha256": snapshot["releaseContextSha256"]',
        ),
    }
    for path, fragments in required.items():
        require_fragments(errors, path, fragments, label="Git lifecycle contract")

    for path in (
        GIT_LIFECYCLE_SCRIPT,
        GIT_LIFECYCLE_TESTS,
        RELEASE_CONTEXT_HELPER,
        RELEASE_CONTEXT_HELPER_TESTS,
        CROSS_RELEASE_CONTEXT_HELPER,
        CROSS_RELEASE_CONTEXT_HELPER_TESTS,
    ):
        if not path.is_file():
            continue
        try:
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        except (OSError, SyntaxError, UnicodeError) as error:
            fail(errors, f"invalid Git lifecycle Python module {display_path(path)}: {error}")

    if GIT_LIFECYCLE_SCRIPT.is_file():
        source = GIT_LIFECYCLE_SCRIPT.read_text(encoding="utf-8")
        publish_source = _function_source(source, "publish")
        release_source = _function_source(source, "command_release")
        new_release_source = release_source[release_source.find("published = publish(repository, arguments.remote)") :]
        completion_source = _function_source(source, "complete_pending_release")
        tag_source = _function_source(source, "ensure_release_tag")
        _require_order(
            errors,
            GIT_LIFECYCLE_SCRIPT,
            publish_source,
            (
                '["fetch", remote, f"refs/heads/{default_branch}:refs/remotes/{remote}/{default_branch}"]',
                "switch_to_default(repository, remote, default_branch)",
                '["merge", "--no-edit", remote_tracking]',
                '["merge", "--no-edit", f"refs/heads/{branch}"]',
                '["push", remote, f"refs/heads/{default_branch}:refs/heads/{default_branch}"]',
                "remote_branch_oid(repository, remote, default_branch)",
            ),
            label="main publish sequence",
        )
        if any(token in publish_source for token in ("ensure_release_tag", "cleanup_worktrees", "cleanup_remote_branches", "cleanup_local_branches")):
            fail(errors, "publish must not tag or clean release-cycle resources")
        _require_order(
            errors,
            GIT_LIFECYCLE_SCRIPT,
            new_release_source,
            (
                "published = publish(repository, arguments.remote)",
                "verify_release_tag_compatibility(repository, remote, tag, head)",
                'cycle["pendingRelease"] = release_record',
                "save_state(repository, state)",
                "return complete_pending_release(repository, state, arguments.remote)",
            ),
            label="published-head persistence sequence",
        )
        _require_order(
            errors,
            GIT_LIFECYCLE_SCRIPT,
            completion_source,
            (
                'ensure_release_tag(repository, remote, pending["tag"], pending["head"])',
                "cleanup_worktrees(repository, state)",
                "cleanup_remote_branches(repository, state, remote)",
                "cleanup_local_branches(repository, state)",
            ),
            label="tag-before-cleanup release sequence",
        )
        _require_order(
            errors,
            GIT_LIFECYCLE_SCRIPT,
            tag_source,
            (
                '["push", remote, f"refs/tags/{tag}:refs/tags/{tag}"]',
                "if remote_tag_target(repository, remote, tag) != head:",
            ),
            label="remote tag verification sequence",
        )
        for forbidden in ('"--ff-only"', '"--force-with-lease', '"--atomic"', '"merge-base"'):
            if forbidden in source:
                fail(errors, f"branch gate remains in {display_path(GIT_LIFECYCLE_SCRIPT)}: {forbidden}")

    tracked_state = ROOT / ".harness" / "git-lifecycle.json"
    if tracked_state.exists() or tracked_state.is_symlink():
        fail(errors, "Git lifecycle state must live under git-common-dir, not tracked .harness")

    _validate_no_retired_runtime(errors)
