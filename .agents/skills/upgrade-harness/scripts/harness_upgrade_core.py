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
        raise UpgradeError(f"{label}不得是符号链接：{path}")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise UpgradeError(f"无法解析{label} {path}：{exc}") from exc
    if not resolved.is_dir():
        raise UpgradeError(f"{label}不是目录：{resolved}")
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
        raise UpgradeError(f"相对路径不安全：{raw!r}")
    normalized = candidate.as_posix()
    if normalized in {".", ""} or normalized != raw.replace("\\", "/"):
        raise UpgradeError(f"相对路径不是规范形式：{raw!r}")
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
        raise UpgradeError(f"{label}越出声明根目录：{absolute}")
    relative = absolute.relative_to(root)
    cursor = root
    parts = relative.parts
    for index, part in enumerate(parts):
        cursor /= part
        exists = os.path.lexists(cursor)
        if not exists:
            if index != len(parts) - 1 and not final_may_be_missing:
                raise UpgradeError(f"{label}的父路径缺失：{cursor}")
            break
        observed = os.lstat(cursor)
        is_junction = bool(
            hasattr(os.path, "isjunction") and os.path.isjunction(cursor)
        )
        if stat.S_ISLNK(observed.st_mode) or is_junction:
            raise UpgradeError(f"{label}包含符号链接或目录联接：{cursor}")
        if index != len(parts) - 1 and not stat.S_ISDIR(observed.st_mode):
            raise UpgradeError(f"{label}的父路径不是目录：{cursor}")
    return absolute


def load_json(path: Path, label: str) -> dict[str, Any]:
    """读取非符号链接 JSON 对象并稳定报告语法或顶层类型错误。"""

    if path.is_symlink() or not path.is_file():
        raise UpgradeError(f"{label}必须是非符号链接的普通文件：{path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpgradeError(f"无法读取{label} {path}：{exc}") from exc
    if not isinstance(value, dict):
        raise UpgradeError(f"{label}必须包含 JSON 对象：{path}")
    return value


def snapshot_fd(file_descriptor: int) -> Snapshot:
    """从已打开的普通文件描述符读取内容摘要与权限位。"""

    observed = os.fstat(file_descriptor)
    if not stat.S_ISREG(observed.st_mode):
        raise UpgradeError("快照来源不是普通文件")
    permission_mode = stat.S_IMODE(observed.st_mode)
    if permission_mode & ~0o777:
        raise UpgradeError(
            f"快照来源使用了不受支持的特殊权限位：{oct(permission_mode)}"
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
        raise UpgradeError(f"无法打开普通文件 {path}：{exc}") from exc
    try:
        return snapshot_fd(file_descriptor)
    finally:
        os.close(file_descriptor)


def validate_snapshot(value: Any, label: str) -> Snapshot | None:
    """严格校验 plan/lock 中的可选文件快照。"""

    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"sha256", "mode"}:
        raise UpgradeError(f"{label}的快照非法")
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
        raise UpgradeError(f"{label}的快照非法")
    return {"sha256": digest, "mode": mode}


def require_git_root(root: Path, label: str = "目标") -> dict[str, str | int | bool]:
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
                f"{label} Git 命令失败（{' '.join(arguments)}）："
                f"{result.stderr.strip()}"
            )
        return result.stdout.strip() if result.returncode == 0 else "unborn"

    observed_root = Path(git_output("rev-parse", "--show-toplevel")).resolve(strict=True)
    if observed_root != root:
        raise UpgradeError(
            f"{label} Git 顶层目录不匹配：预期 {root}，实际 {observed_root}"
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
        raise UpgradeError(f"{label} Git 仓库必须已有 HEAD 提交")
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
            f"{label} Git 状态检查失败："
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

    source = canonical_directory(source_root, "源 Harness 根目录")
    identity = require_git_root(source, "源 Harness")
    if identity["dirty"]:
        raise UpgradeError("源 Harness Git 工作树必须保持干净")
    if expected_commit != identity["head"]:
        raise UpgradeError(
            "源 commit 与源 Harness HEAD 不匹配："
            f"预期 {expected_commit}，实际 {identity['head']}"
        )
    version_file = source / "Version.md"
    assert_safe_path(
        source,
        version_file,
        "源 Harness Version.md",
        final_may_be_missing=False,
    )
    if version_file.is_symlink() or not version_file.is_file():
        raise UpgradeError("源 Harness Version.md 必须是普通文件")
    match = VERSION_PATTERN.search(version_file.read_text(encoding="utf-8"))
    if not match:
        raise UpgradeError("源 Harness Version.md 没有当前版本")
    observed_version = match.group(1)
    if expected_version != observed_version:
        raise UpgradeError(
            "源版本与源 Harness Version.md 不匹配："
            f"预期 {expected_version}，实际 {observed_version}"
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
            f"无法解析所有权 manifest {ownership_path}：{exc}"
        ) from exc
    if observed_ownership != expected_ownership:
        raise UpgradeError(
            f"所有权 manifest 必须精确位于 {expected_ownership}"
        )
    assert_safe_path(
        target,
        observed_ownership,
        "所有权 manifest",
        final_may_be_missing=False,
    )
    if not observed_ownership.is_file():
        raise UpgradeError(f"缺少所有权 manifest：{observed_ownership}")

    expected_lock = target / LOCK_RELATIVE
    try:
        observed_lock = lock_path.resolve(strict=False)
    except OSError as exc:
        raise UpgradeError(f"无法解析上游 lock {lock_path}：{exc}") from exc
    if observed_lock != expected_lock:
        raise UpgradeError(f"lock 必须精确位于 {expected_lock}")
    assert_safe_path(
        target,
        observed_lock,
        "上游 lock",
        final_may_be_missing=True,
    )
    return observed_ownership, observed_lock


def load_ownership(path: Path) -> tuple[str, list[tuple[str, str]]]:
    """加载有序所有权规则；具体规则必须位于兜底规则之前。"""

    data = load_json(path, "所有权 manifest")
    if data.get("schema_version") != 1:
        raise UpgradeError("所有权 manifest 的 schema_version 必须为 1")
    default_mode = data.get("default_mode")
    if default_mode != "protected":
        raise UpgradeError("所有权 manifest 的 default_mode 必须为 protected")
    raw_rules = data.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise UpgradeError("所有权 manifest 的 rules 必须是非空列表")
    rules: list[tuple[str, str]] = []
    seen_patterns: set[str] = set()
    for index, item in enumerate(raw_rules):
        if not isinstance(item, dict) or set(item) != {"pattern", "mode"}:
            raise UpgradeError(f"所有权规则 {index} 必须包含 pattern/mode")
        pattern = item.get("pattern")
        mode = item.get("mode")
        if not isinstance(pattern, str) or not pattern:
            raise UpgradeError(f"所有权规则 {index} 的 pattern 非法")
        if pattern in seen_patterns:
            raise UpgradeError(f"所有权规则的 pattern 重复：{pattern}")
        if mode not in VALID_MODES:
            raise UpgradeError(f"所有权规则 {index} 的 mode 非法：{mode!r}")
        seen_patterns.add(pattern)
        rules.append((pattern, mode))
    observed_rules = dict(rules)
    for pattern, expected_mode in MINIMUM_OWNERSHIP_RULES.items():
        if observed_rules.get(pattern) != expected_mode:
            raise UpgradeError(
                "所有权 manifest 削弱了必需保护："
                f"{pattern} 必须为 {expected_mode}"
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
            "managed-self 所有权规则必须位于通用 managed 规则之前"
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
                raise UpgradeError(f"无法检查 {child}：{exc}") from exc
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
    data = load_json(path, "上游 lock")
    if data.get("schema_version") != SCHEMA_VERSION:
        raise UpgradeError(
            f"上游 lock 的 schema_version 必须为 {SCHEMA_VERSION}"
        )
    entries = data.get("entries")
    if not isinstance(entries, dict):
        raise UpgradeError("上游 lock 的 entries 必须是 object")
    for raw_path, entry in entries.items():
        path_key = safe_relative_path(raw_path)
        if path_key != raw_path or not isinstance(entry, dict):
            raise UpgradeError(f"上游 lock entry 非法：{raw_path!r}")
        if set(entry) != {"mode", "candidate", "target"}:
            raise UpgradeError(f"{raw_path} 的上游 lock 字段非法")
        if entry.get("mode") not in VALID_MODES:
            raise UpgradeError(f"{raw_path} 的上游 lock mode 非法")
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
    candidate = canonical_directory(candidate_root, "候选根目录")
    target = canonical_directory(target_root, "目标根目录")
    roots = (source, candidate, target)
    for index, left in enumerate(roots):
        for right in roots[index + 1 :]:
            if left == right or left in right.parents or right in left.parents:
                raise UpgradeError(
                    "源、候选和目标根目录必须彼此独立且不能嵌套"
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
        f"候选包含符号链接、特殊文件或 Git 元数据：{path}"
        for path in candidate_unsafe
    ]
    for path, is_directory in candidate_nodes.items():
        mode = explicit_ownership_mode_for_node(
            path,
            is_directory=is_directory,
            rules=rules,
        )
        if mode in {"protected", "tombstone"}:
            problems.append(f"候选包含禁止的 {mode} 路径：{path}")
    for path, is_directory in target_nodes.items():
        mode = explicit_ownership_mode_for_node(
            path,
            is_directory=is_directory,
            rules=rules,
        )
        if mode == "tombstone":
            problems.append(f"目标包含 tombstone 路径：{path}")

    relevant = set(candidate_files) | set(entries)
    for path in target_files:
        if ownership_mode(path, default_mode, rules) == "tombstone" or path in entries:
            relevant.add(path)

    for unsafe in target_unsafe:
        if any(path == unsafe or path.startswith(f"{unsafe}/") for path in relevant):
            problems.append(f"目标相关路径是符号链接或特殊文件：{unsafe}")

    actions: list[dict[str, Any]] = []
    for raw_path in sorted(relevant):
        path = safe_relative_path(raw_path)
        mode = ownership_mode(path, default_mode, rules)
        candidate_snapshot = candidate_files.get(path)
        target_snapshot = target_files.get(path)
        baseline = entries.get(path)
        if baseline is not None and baseline.get("mode") != mode:
            problems.append(
                f"{path} 的所有权 mode 已变化："
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

    parent = canonical_directory(path.parent, "plan 输出父目录")
    output = parent / path.name
    for root in forbidden_roots:
        if is_within(output, root):
            raise UpgradeError(f"plan 输出必须位于 {root} 之外：{output}")
    if os.path.lexists(output):
        raise UpgradeError(f"plan 输出已存在，拒绝覆盖：{output}")
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
        raise UpgradeError(f"无法创建 plan 输出 {output}：{exc}") from exc


def load_reviewed_plan(plan_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """重算计划并要求与受审 JSON 完全一致，拒绝篡改与状态漂移。"""

    reviewed = load_json(plan_path, "升级 plan")
    if reviewed.get("schema_version") != SCHEMA_VERSION:
        raise UpgradeError(f"升级 plan 的 schema_version 必须为 {SCHEMA_VERSION}")
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
        raise UpgradeError("升级 plan 缺少 provenance 字段")
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
            "已复核 plan 不再匹配源、所有权、lock、Git 身份、候选或目标；"
            "请生成并复核新 plan"
        )
    return reviewed, recomputed
