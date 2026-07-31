#!/usr/bin/env python3
"""为下游 Harness 工程升级生成三方计划并安全更新既有受管文件。"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from typing import Any

from harness_upgrade_policy import (
    AUTO_MODES,
    BLOCKING_CLASSES,
    LOCK_RELATIVE,
    MANUAL_CLASSES,
    MINIMUM_OWNERSHIP_RULES,
    OWNERSHIP_RELATIVE,
    SCHEMA_VERSION,
    VALID_MODES,
    VERSION_PATTERN,
)


class UpgradeError(RuntimeError):
    """表示路径、来源、基线或应用条件不满足，调用方必须停止升级。"""


Snapshot = dict[str, str | int]


def lexical_absolute(path: Path) -> Path:
    """生成不追随最终符号链接的绝对规范化路径。"""

    return Path(os.path.abspath(os.fspath(path)))


def is_within(path: Path, root: Path) -> bool:
    """判断一个绝对路径是否等于或位于给定根目录内。"""

    return path == root or root in path.parents


def canonical_directory(path: Path, label: str) -> Path:
    """解析并校验一个非符号链接目录。"""

    if path.is_symlink():
        raise UpgradeError(f"{label} must not be a symlink: {path}")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise UpgradeError(f"cannot resolve {label} {path}: {exc}") from exc
    if not resolved.is_dir():
        raise UpgradeError(f"{label} is not a directory: {resolved}")
    return resolved


def safe_relative_path(raw: str) -> str:
    """规范化清单、lock 与 plan 中的相对路径并拒绝逃逸。"""

    candidate = Path(raw)
    if (
        not raw
        or candidate.is_absolute()
        or ".." in candidate.parts
        or "\x00" in raw
    ):
        raise UpgradeError(f"unsafe relative path: {raw!r}")
    normalized = candidate.as_posix()
    if normalized in {".", ""} or normalized != raw.replace("\\", "/"):
        raise UpgradeError(f"non-canonical relative path: {raw!r}")
    return normalized


def assert_safe_path(
    root: Path,
    path: Path,
    label: str,
    *,
    final_may_be_missing: bool,
) -> Path:
    """拒绝根外路径、任一祖先符号链接及中间非目录。"""

    absolute = lexical_absolute(path)
    if not is_within(absolute, root):
        raise UpgradeError(f"{label} escapes declared root: {absolute}")
    relative = absolute.relative_to(root)
    cursor = root
    parts = relative.parts
    for index, part in enumerate(parts):
        cursor /= part
        exists = os.path.lexists(cursor)
        if not exists:
            if index != len(parts) - 1 and not final_may_be_missing:
                raise UpgradeError(f"{label} parent is missing: {cursor}")
            break
        observed = os.lstat(cursor)
        is_junction = bool(
            hasattr(os.path, "isjunction") and os.path.isjunction(cursor)
        )
        if stat.S_ISLNK(observed.st_mode) or is_junction:
            raise UpgradeError(f"{label} contains a symlink or junction: {cursor}")
        if index != len(parts) - 1 and not stat.S_ISDIR(observed.st_mode):
            raise UpgradeError(f"{label} parent is not a directory: {cursor}")
    return absolute


def load_json(path: Path, label: str) -> dict[str, Any]:
    """读取非符号链接 JSON 对象并稳定报告语法或顶层类型错误。"""

    if path.is_symlink() or not path.is_file():
        raise UpgradeError(f"{label} must be a regular non-symlink file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpgradeError(f"cannot read {label} {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise UpgradeError(f"{label} must contain a JSON object: {path}")
    return value


def snapshot_fd(file_descriptor: int) -> Snapshot:
    """从已打开的普通文件描述符读取内容摘要与权限位。"""

    observed = os.fstat(file_descriptor)
    if not stat.S_ISREG(observed.st_mode):
        raise UpgradeError("snapshot source is not a regular file")
    permission_mode = stat.S_IMODE(observed.st_mode)
    if permission_mode & ~0o777:
        raise UpgradeError(
            f"snapshot source uses unsupported special permission bits: {oct(permission_mode)}"
        )
    digest = hashlib.sha256()
    os.lseek(file_descriptor, 0, os.SEEK_SET)
    while chunk := os.read(file_descriptor, 1024 * 1024):
        digest.update(chunk)
    os.lseek(file_descriptor, 0, os.SEEK_SET)
    return {
        "sha256": digest.hexdigest(),
        "mode": permission_mode,
    }


def snapshot_file(path: Path) -> Snapshot:
    """在不追随最终符号链接的前提下读取普通文件快照。"""

    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        file_descriptor = os.open(path, flags)
    except OSError as exc:
        raise UpgradeError(f"cannot open regular file {path}: {exc}") from exc
    try:
        return snapshot_fd(file_descriptor)
    finally:
        os.close(file_descriptor)


def validate_snapshot(value: Any, label: str) -> Snapshot | None:
    """严格校验 plan/lock 中的可选文件快照。"""

    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"sha256", "mode"}:
        raise UpgradeError(f"invalid snapshot for {label}")
    digest = value.get("sha256")
    mode = value.get("mode")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
        or not isinstance(mode, int)
        or mode < 0
        or mode > 0o777
    ):
        raise UpgradeError(f"invalid snapshot for {label}")
    return {"sha256": digest, "mode": mode}


def require_git_root(root: Path, label: str = "target") -> dict[str, str | int | bool]:
    """确认独立且已有提交的 Git 根，并绑定分支、HEAD 与工作区状态。"""

    def git_output(*arguments: str, allow_failure: bool = False) -> str:
        result = subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 and not allow_failure:
            raise UpgradeError(
                f"{label} Git command failed ({' '.join(arguments)}): "
                f"{result.stderr.strip()}"
            )
        return result.stdout.strip() if result.returncode == 0 else "unborn"

    observed_root = Path(git_output("rev-parse", "--show-toplevel")).resolve(strict=True)
    if observed_root != root:
        raise UpgradeError(
            f"{label} Git top-level mismatch: expected {root}, got {observed_root}"
        )
    common_raw = Path(git_output("rev-parse", "--git-common-dir"))
    common = (
        common_raw
        if common_raw.is_absolute()
        else lexical_absolute(root / common_raw)
    ).resolve(strict=True)
    common_stat = common.stat()
    head = git_output("rev-parse", "--verify", "HEAD", allow_failure=True)
    if head == "unborn":
        raise UpgradeError(f"{label} Git repository must have an existing HEAD commit")
    status_result = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "-z",
        ],
        check=False,
        capture_output=True,
    )
    if status_result.returncode != 0:
        raise UpgradeError(
            f"{label} Git status failed: "
            f"{status_result.stderr.decode('utf-8', errors='replace').strip()}"
        )
    status_digest = hashlib.sha256(status_result.stdout).hexdigest()
    return {
        "top_level": str(root),
        "common_dir": str(common),
        "common_device": common_stat.st_dev,
        "common_inode": common_stat.st_ino,
        "head": head,
        "branch": git_output("branch", "--show-current"),
        "dirty": bool(status_result.stdout),
        "status_sha256": status_digest,
    }


def require_source_identity(
    source_root: Path,
    expected_version: str,
    expected_commit: str,
) -> tuple[Path, dict[str, str | int | bool]]:
    """验证来源 Harness 根、已提交版本和干净工作区，并返回可审计身份。"""

    source = canonical_directory(source_root, "source Harness root")
    identity = require_git_root(source, "source Harness")
    if identity["dirty"]:
        raise UpgradeError("source Harness Git worktree must be clean")
    if expected_commit != identity["head"]:
        raise UpgradeError(
            "source commit does not match source Harness HEAD: "
            f"expected {expected_commit}, got {identity['head']}"
        )
    version_file = source / "Version.md"
    assert_safe_path(
        source,
        version_file,
        "source Harness Version.md",
        final_may_be_missing=False,
    )
    if version_file.is_symlink() or not version_file.is_file():
        raise UpgradeError("source Harness Version.md must be a regular file")
    match = VERSION_PATTERN.search(version_file.read_text(encoding="utf-8"))
    if not match:
        raise UpgradeError("source Harness Version.md has no current version")
    observed_version = match.group(1)
    if expected_version != observed_version:
        raise UpgradeError(
            "source version does not match source Harness Version.md: "
            f"expected {expected_version}, got {observed_version}"
        )
    return source, identity


def require_control_paths(
    target: Path,
    ownership_path: Path,
    lock_path: Path,
) -> tuple[Path, Path]:
    """把所有权清单和来源锁固定到下游内的唯一维护位置。"""

    expected_ownership = target / OWNERSHIP_RELATIVE
    try:
        observed_ownership = ownership_path.resolve(strict=True)
    except OSError as exc:
        raise UpgradeError(
            f"cannot resolve ownership manifest {ownership_path}: {exc}"
        ) from exc
    if observed_ownership != expected_ownership:
        raise UpgradeError(
            f"ownership manifest must be exactly {expected_ownership}"
        )
    assert_safe_path(
        target,
        observed_ownership,
        "ownership manifest",
        final_may_be_missing=False,
    )
    if not observed_ownership.is_file():
        raise UpgradeError(f"ownership manifest is missing: {observed_ownership}")

    expected_lock = target / LOCK_RELATIVE
    try:
        observed_lock = lock_path.resolve(strict=False)
    except OSError as exc:
        raise UpgradeError(f"cannot resolve upstream lock {lock_path}: {exc}") from exc
    if observed_lock != expected_lock:
        raise UpgradeError(f"lock must be exactly {expected_lock}")
    assert_safe_path(
        target,
        observed_lock,
        "upstream lock",
        final_may_be_missing=True,
    )
    return observed_ownership, observed_lock


def load_ownership(path: Path) -> tuple[str, list[tuple[str, str]]]:
    """加载有序所有权规则；具体规则必须位于兜底规则之前。"""

    data = load_json(path, "ownership manifest")
    if data.get("schema_version") != 1:
        raise UpgradeError("ownership manifest schema_version must be 1")
    default_mode = data.get("default_mode")
    if default_mode != "protected":
        raise UpgradeError("ownership manifest default_mode must be protected")
    raw_rules = data.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise UpgradeError("ownership manifest rules must be a non-empty list")
    rules: list[tuple[str, str]] = []
    seen_patterns: set[str] = set()
    for index, item in enumerate(raw_rules):
        if not isinstance(item, dict) or set(item) != {"pattern", "mode"}:
            raise UpgradeError(f"ownership rule {index} must contain pattern/mode")
        pattern = item.get("pattern")
        mode = item.get("mode")
        if not isinstance(pattern, str) or not pattern:
            raise UpgradeError(f"ownership rule {index} has invalid pattern")
        if pattern in seen_patterns:
            raise UpgradeError(f"duplicate ownership rule pattern: {pattern}")
        if mode not in VALID_MODES:
            raise UpgradeError(f"ownership rule {index} has invalid mode: {mode!r}")
        seen_patterns.add(pattern)
        rules.append((pattern, mode))
    observed_rules = dict(rules)
    for pattern, expected_mode in MINIMUM_OWNERSHIP_RULES.items():
        if observed_rules.get(pattern) != expected_mode:
            raise UpgradeError(
                "ownership manifest weakens required protection: "
                f"{pattern} must be {expected_mode}"
            )
    self_index = next(
        index
        for index, item in enumerate(rules)
        if item == (".agents/skills/upgrade-harness/**", "managed-self")
    )
    generic_index = next(
        index
        for index, item in enumerate(rules)
        if item == (".agents/skills/**", "managed")
    )
    if self_index >= generic_index:
        raise UpgradeError(
            "managed-self ownership rule must precede the generic managed rule"
        )
    return default_mode, rules


def ownership_mode(path: str, default_mode: str, rules: list[tuple[str, str]]) -> str:
    """按清单顺序返回路径所有权。"""

    for pattern, mode in rules:
        if fnmatch.fnmatchcase(path, pattern):
            return mode
    return default_mode


def explicit_ownership_mode_for_node(
    path: str,
    *,
    is_directory: bool,
    rules: list[tuple[str, str]],
) -> str | None:
    """返回节点命中的显式规则；目录额外用后代探针匹配 `/**` 规则。"""

    if is_directory:
        probe = f"{path}/__harness_node_probe__"
        for pattern, mode in rules:
            if fnmatch.fnmatchcase(probe, pattern):
                return mode
    for pattern, mode in rules:
        if fnmatch.fnmatchcase(path, pattern):
            return mode
    return None


def scan_tree(
    root: Path,
    *,
    target_tree: bool,
) -> tuple[dict[str, Snapshot], list[str], dict[str, bool]]:
    """枚举所有节点及普通文件快照，并报告链接、特殊文件和候选 Git 元数据。"""

    files: dict[str, Snapshot] = {}
    unsafe: list[str] = []
    nodes: dict[str, bool] = {}
    for current, directories, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        kept_directories: list[str] = []
        for name in directories:
            child = current_path / name
            relative = child.relative_to(root).as_posix()
            if target_tree and relative == ".git":
                continue
            nodes[relative] = True
            is_junction = bool(
                hasattr(os.path, "isjunction") and os.path.isjunction(child)
            )
            if child.is_symlink() or is_junction:
                unsafe.append(relative)
            elif not child.is_dir():
                unsafe.append(relative)
            elif not target_tree and relative == ".git":
                unsafe.append(relative)
            else:
                kept_directories.append(name)
        directories[:] = kept_directories
        for name in filenames:
            child = current_path / name
            relative = child.relative_to(root).as_posix()
            nodes[relative] = False
            try:
                observed = child.lstat()
            except OSError as exc:
                raise UpgradeError(f"cannot inspect {child}: {exc}") from exc
            is_junction = bool(
                hasattr(os.path, "isjunction") and os.path.isjunction(child)
            )
            if (
                stat.S_ISLNK(observed.st_mode)
                or is_junction
                or not stat.S_ISREG(observed.st_mode)
            ):
                unsafe.append(relative)
                continue
            files[relative] = snapshot_file(child)
    return files, sorted(unsafe), nodes


def load_lock(path: Path) -> dict[str, Any] | None:
    """读取并严格校验上一版来源锁；缺失表示必须走 bootstrap audit。"""

    if not os.path.lexists(path):
        return None
    data = load_json(path, "upstream lock")
    if data.get("schema_version") != SCHEMA_VERSION:
        raise UpgradeError(
            f"upstream lock schema_version must be {SCHEMA_VERSION}"
        )
    entries = data.get("entries")
    if not isinstance(entries, dict):
        raise UpgradeError("upstream lock entries must be an object")
    for raw_path, entry in entries.items():
        path_key = safe_relative_path(raw_path)
        if path_key != raw_path or not isinstance(entry, dict):
            raise UpgradeError(f"invalid upstream lock entry: {raw_path!r}")
        if set(entry) != {"mode", "candidate", "target"}:
            raise UpgradeError(f"invalid upstream lock fields for {raw_path}")
        if entry.get("mode") not in VALID_MODES:
            raise UpgradeError(f"invalid upstream lock mode for {raw_path}")
        validate_snapshot(entry.get("candidate"), f"{raw_path}.candidate")
        validate_snapshot(entry.get("target"), f"{raw_path}.target")
    return data


def classify_managed(
    candidate: Snapshot | None,
    target: Snapshot | None,
    baseline: dict[str, Any] | None,
    *,
    lock_loaded: bool,
) -> str:
    """按三方快照为纯受管路径生成确定性分类。"""

    if baseline is None:
        if candidate is not None and target is None:
            return "add"
        if candidate is not None and target is not None:
            if lock_loaded:
                return "converged" if candidate == target else "collision"
            return "bootstrap_conflict"
        return "preserve_local"
    old_candidate = baseline.get("candidate")
    old_target = baseline.get("target")
    candidate_changed = candidate != old_candidate
    target_changed = target != old_target
    if candidate_changed and target_changed:
        return "converged" if candidate == target else "conflict"
    if target_changed:
        return "preserve_local"
    if not candidate_changed:
        return "unchanged"
    if candidate is None:
        return "delete"
    if target is None and old_target is not None:
        return "conflict"
    return "update"


def classify_mixed(
    candidate: Snapshot | None,
    target: Snapshot | None,
    baseline: dict[str, Any] | None,
) -> str:
    """为共享或条件所有权路径标记人工合并需求。"""

    if baseline is None:
        if candidate is None:
            return "preserve_local"
        if candidate == target:
            return "converged"
        return "manual_merge" if target is not None else "manual_add"
    if candidate == baseline.get("candidate"):
        return (
            "preserve_local"
            if target != baseline.get("target")
            else "unchanged"
        )
    if candidate == target:
        return "converged"
    return "manual_merge"


def build_plan(
    source_root: Path,
    source_version: str,
    source_commit: str,
    candidate_root: Path,
    target_root: Path,
    ownership_path: Path,
    lock_path: Path,
) -> dict[str, Any]:
    """生成完整只读升级计划，不更改候选、目标或来源锁。"""

    source, source_identity = require_source_identity(
        source_root,
        source_version,
        source_commit,
    )
    candidate = canonical_directory(candidate_root, "candidate root")
    target = canonical_directory(target_root, "target root")
    roots = (source, candidate, target)
    for index, left in enumerate(roots):
        for right in roots[index + 1 :]:
            if left == right or left in right.parents or right in left.parents:
                raise UpgradeError(
                    "source, candidate, and target roots must be separate and non-nested"
                )
    git_identity = require_git_root(target)
    ownership, lock_file = require_control_paths(target, ownership_path, lock_path)
    default_mode, rules = load_ownership(ownership)
    candidate_files, candidate_unsafe, candidate_nodes = scan_tree(
        candidate,
        target_tree=False,
    )
    target_files, target_unsafe, target_nodes = scan_tree(
        target,
        target_tree=True,
    )
    lock = load_lock(lock_file)
    entries = {} if lock is None else lock["entries"]

    problems = [
        f"candidate contains symlink, special file, or Git metadata: {path}"
        for path in candidate_unsafe
    ]
    for path, is_directory in candidate_nodes.items():
        mode = explicit_ownership_mode_for_node(
            path,
            is_directory=is_directory,
            rules=rules,
        )
        if mode in {"protected", "tombstone"}:
            problems.append(f"candidate contains forbidden {mode} path: {path}")
    for path, is_directory in target_nodes.items():
        mode = explicit_ownership_mode_for_node(
            path,
            is_directory=is_directory,
            rules=rules,
        )
        if mode == "tombstone":
            problems.append(f"target contains tombstone path: {path}")

    relevant = set(candidate_files) | set(entries)
    for path in target_files:
        if ownership_mode(path, default_mode, rules) == "tombstone" or path in entries:
            relevant.add(path)

    for unsafe in target_unsafe:
        if any(path == unsafe or path.startswith(f"{unsafe}/") for path in relevant):
            problems.append(f"target relevant path is symlink or special file: {unsafe}")

    actions: list[dict[str, Any]] = []
    for raw_path in sorted(relevant):
        path = safe_relative_path(raw_path)
        mode = ownership_mode(path, default_mode, rules)
        candidate_snapshot = candidate_files.get(path)
        target_snapshot = target_files.get(path)
        baseline = entries.get(path)
        if baseline is not None and baseline.get("mode") != mode:
            problems.append(
                f"ownership mode changed for {path}: "
                f"{baseline.get('mode')} -> {mode}"
            )
        if mode == "tombstone":
            if candidate_snapshot is not None:
                classification = "tombstone_candidate"
            elif target_snapshot is not None:
                classification = "tombstone_present"
            else:
                classification = "tombstone_absent"
        elif mode == "protected":
            classification = (
                "protected_candidate"
                if candidate_snapshot is not None
                else "protected"
            )
        elif mode in AUTO_MODES:
            classification = classify_managed(
                candidate_snapshot,
                target_snapshot,
                baseline,
                lock_loaded=lock is not None,
            )
        else:
            classification = classify_mixed(
                candidate_snapshot,
                target_snapshot,
                baseline,
            )
        blocked = classification in BLOCKING_CLASSES
        auto_apply = mode in AUTO_MODES and classification == "update"
        actions.append(
            {
                "path": path,
                "mode": mode,
                "classification": classification,
                "candidate": candidate_snapshot,
                "target": target_snapshot,
                "baseline_candidate": (
                    None if baseline is None else baseline.get("candidate")
                ),
                "baseline_target": (
                    None if baseline is None else baseline.get("target")
                ),
                "auto_apply": auto_apply,
                "blocked": blocked,
            }
        )

    ownership_snapshot = snapshot_file(ownership)
    lock_snapshot = snapshot_file(lock_file) if lock is not None else None
    return {
        "schema_version": SCHEMA_VERSION,
        "source_root": str(source),
        "source_version": source_version,
        "source_commit": source_commit,
        "source_git": source_identity,
        "candidate_root": str(candidate),
        "target_root": str(target),
        "ownership_path": str(ownership),
        "ownership_snapshot": ownership_snapshot,
        "lock_path": str(lock_file),
        "lock_snapshot": lock_snapshot,
        "target_git": git_identity,
        "baseline": "missing" if lock is None else "loaded",
        "blocked": bool(problems) or any(item["blocked"] for item in actions),
        "manual_required": any(
            item["classification"] in MANUAL_CLASSES for item in actions
        ),
        "problems": sorted(problems),
        "actions": actions,
    }


def write_new_plan(path: Path, value: dict[str, Any], forbidden_roots: tuple[Path, ...]) -> None:
    """只在候选/目标之外独占创建新计划，禁止覆盖任何现有文件。"""

    parent = canonical_directory(path.parent, "plan output parent")
    output = parent / path.name
    for root in forbidden_roots:
        if is_within(output, root):
            raise UpgradeError(f"plan output must remain outside {root}: {output}")
    if os.path.lexists(output):
        raise UpgradeError(f"plan output already exists; refusing overwrite: {output}")
    payload = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(output, flags, 0o600)
        try:
            remaining = memoryview(payload.encode("utf-8"))
            while remaining:
                written = os.write(descriptor, remaining)
                remaining = remaining[written:]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        if hasattr(os, "O_DIRECTORY"):
            parent_descriptor = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(parent_descriptor)
            finally:
                os.close(parent_descriptor)
    except OSError as exc:
        raise UpgradeError(f"cannot create plan output {output}: {exc}") from exc


def load_reviewed_plan(plan_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """重算计划并要求与受审 JSON 完全一致，拒绝篡改与状态漂移。"""

    reviewed = load_json(plan_path, "upgrade plan")
    if reviewed.get("schema_version") != SCHEMA_VERSION:
        raise UpgradeError(f"upgrade plan schema_version must be {SCHEMA_VERSION}")
    required = {
        "source_root",
        "source_version",
        "source_commit",
        "candidate_root",
        "target_root",
        "ownership_path",
        "lock_path",
    }
    if not required.issubset(reviewed):
        raise UpgradeError("upgrade plan is missing provenance fields")
    recomputed = build_plan(
        Path(reviewed["source_root"]),
        reviewed["source_version"],
        reviewed["source_commit"],
        Path(reviewed["candidate_root"]),
        Path(reviewed["target_root"]),
        Path(reviewed["ownership_path"]),
        Path(reviewed["lock_path"]),
    )
    if reviewed != recomputed:
        raise UpgradeError(
            "reviewed plan no longer matches source, ownership, lock, Git identity, "
            "candidate, or target; generate and review a new plan"
        )
    return reviewed, recomputed
