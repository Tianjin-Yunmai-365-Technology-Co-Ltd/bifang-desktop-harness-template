"""执行受审 Harness 升级计划并原子记录共同基线。"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
from typing import Any
import uuid

from harness_upgrade_core import (
    AUTO_MODES,
    SCHEMA_VERSION,
    Snapshot,
    UpgradeError,
    assert_safe_path,
    canonical_directory,
    load_lock,
    load_reviewed_plan,
    require_git_root,
    safe_relative_path,
    snapshot_fd,
    snapshot_file,
    validate_snapshot,
)

def assert_current_snapshot(
    root: Path,
    relative: str,
    expected: Snapshot | None,
    label: str,
) -> Path:
    """重验普通文件快照和祖先边界，阻止计划后的静默变化。"""

    path = assert_safe_path(
        root,
        root / relative,
        label,
        final_may_be_missing=expected is None,
    )
    if expected is None:
        if os.path.lexists(path):
            raise UpgradeError(f"{label}意外存在：{relative}")
        return path
    if not path.is_file() or path.is_symlink():
        raise UpgradeError(f"{label}不是普通文件：{relative}")
    observed = snapshot_file(path)
    if observed != expected:
        raise UpgradeError(
            f"{label}在 plan 后发生变化：{relative}；"
            f"预期 {expected}，实际 {observed}"
        )
    return path


def assert_plan_still_current(plan: dict[str, Any]) -> None:
    """在写入前重验控制文件、Git 身份以及计划覆盖的两棵文件树。"""

    candidate = canonical_directory(Path(plan["candidate_root"]), "候选根目录")
    target = canonical_directory(Path(plan["target_root"]), "目标根目录")
    ownership = Path(plan["ownership_path"])
    if snapshot_file(ownership) != validate_snapshot(
        plan["ownership_snapshot"],
        "ownership_snapshot",
    ):
        raise UpgradeError("所有权 manifest 在 plan 后发生变化")
    lock_path = Path(plan["lock_path"])
    expected_lock = validate_snapshot(plan["lock_snapshot"], "lock_snapshot")
    if expected_lock is None:
        if os.path.lexists(lock_path):
            raise UpgradeError("上游 lock 在 plan 后出现")
    elif snapshot_file(lock_path) != expected_lock:
        raise UpgradeError("上游 lock 在 plan 后发生变化")
    if require_git_root(target) != plan["target_git"]:
        raise UpgradeError("目标 Git 身份或工作树状态在 plan 后发生变化")
    for item in plan["actions"]:
        relative = safe_relative_path(item["path"])
        assert_current_snapshot(
            candidate,
            relative,
            validate_snapshot(item.get("candidate"), f"{relative}.candidate"),
            "候选",
        )
        assert_current_snapshot(
            target,
            relative,
            validate_snapshot(item.get("target"), f"{relative}.target"),
            "目标",
        )


def open_parent_descriptor(root: Path, relative: str) -> tuple[int, str]:
    """通过 O_NOFOLLOW 逐级打开既有父目录，返回稳定目录描述符。"""

    parts = Path(relative).parts
    if not parts:
        raise UpgradeError(f"文件路径非法：{relative}")
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(root, flags)
    try:
        for part in parts[:-1]:
            next_descriptor = os.open(part, flags, dir_fd=descriptor)
            observed = os.fstat(next_descriptor)
            if not stat.S_ISDIR(observed.st_mode):
                os.close(next_descriptor)
                raise UpgradeError(f"父路径不是目录：{relative}")
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor, parts[-1]
    except Exception:
        os.close(descriptor)
        raise


def replace_existing_posix(
    candidate_root: Path,
    target_root: Path,
    relative: str,
    candidate_snapshot: Snapshot,
    target_snapshot: Snapshot,
) -> None:
    """使用稳定父目录描述符原子替换一个既有受管文件。"""

    source_parent, source_name = open_parent_descriptor(candidate_root, relative)
    target_parent, target_name = open_parent_descriptor(target_root, relative)
    source_descriptor = -1
    temporary_name = f".harness-upgrade-{uuid.uuid4().hex}.tmp"
    temporary_created = False
    try:
        read_flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            read_flags |= os.O_NOFOLLOW
        source_descriptor = os.open(source_name, read_flags, dir_fd=source_parent)
        if snapshot_fd(source_descriptor) != candidate_snapshot:
            raise UpgradeError(f"候选在 apply 期间发生变化：{relative}")

        target_descriptor = os.open(target_name, read_flags, dir_fd=target_parent)
        try:
            if snapshot_fd(target_descriptor) != target_snapshot:
                raise UpgradeError(f"目标在 apply 期间发生变化：{relative}")
        finally:
            os.close(target_descriptor)

        write_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            write_flags |= os.O_NOFOLLOW
        temporary_descriptor = os.open(
            temporary_name,
            write_flags,
            int(candidate_snapshot["mode"]),
            dir_fd=target_parent,
        )
        temporary_created = True
        copied_digest = hashlib.sha256()
        try:
            while chunk := os.read(source_descriptor, 1024 * 1024):
                copied_digest.update(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(temporary_descriptor, view)
                    view = view[written:]
            if hasattr(os, "fchmod"):
                os.fchmod(temporary_descriptor, int(candidate_snapshot["mode"]))
            os.fsync(temporary_descriptor)
        finally:
            os.close(temporary_descriptor)
        if copied_digest.hexdigest() != candidate_snapshot["sha256"]:
            raise UpgradeError(f"候选在复制期间发生变化：{relative}")
        if stat.S_IMODE(os.fstat(source_descriptor).st_mode) != candidate_snapshot["mode"]:
            raise UpgradeError(f"候选 mode 在复制期间发生变化：{relative}")

        target_descriptor = os.open(target_name, read_flags, dir_fd=target_parent)
        try:
            if snapshot_fd(target_descriptor) != target_snapshot:
                raise UpgradeError(f"目标在 replace 前发生变化：{relative}")
        finally:
            os.close(target_descriptor)
        os.replace(
            temporary_name,
            target_name,
            src_dir_fd=target_parent,
            dst_dir_fd=target_parent,
        )
        temporary_created = False
        os.fsync(target_parent)
    finally:
        if source_descriptor != -1:
            os.close(source_descriptor)
        if temporary_created:
            try:
                os.unlink(temporary_name, dir_fd=target_parent)
            except OSError:
                pass
        os.close(source_parent)
        os.close(target_parent)


def replace_existing_portable(
    source: Path,
    destination: Path,
    candidate_snapshot: Snapshot,
    target_snapshot: Snapshot,
) -> None:
    """在无 dir_fd 平台以双重边界复验和同目录原子替换更新文件。"""

    if snapshot_file(source) != candidate_snapshot:
        raise UpgradeError(f"候选在 apply 期间发生变化：{source}")
    if snapshot_file(destination) != target_snapshot:
        raise UpgradeError(f"目标在 apply 期间发生变化：{destination}")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as stream:
            temporary = Path(stream.name)
            with source.open("rb") as source_stream:
                shutil.copyfileobj(source_stream, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, int(candidate_snapshot["mode"]))
        if snapshot_file(temporary) != candidate_snapshot:
            raise UpgradeError(f"候选在复制期间发生变化：{source}")
        if snapshot_file(destination) != target_snapshot:
            raise UpgradeError(f"目标在 replace 前发生变化：{destination}")
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def apply_plan(plan_path: Path, approval: str, selected_path: str) -> dict[str, Any]:
    """重算计划后一次只替换一个既有受管文件，避免批量部分应用。"""

    if approval != "apply-managed-changes":
        raise UpgradeError("apply 要求传入 --approval apply-managed-changes")
    plan, _ = load_reviewed_plan(plan_path)
    if plan["blocked"]:
        raise UpgradeError("升级 plan 已被阻断；请在 apply 前解决 conflict")
    pending = [
        item
        for item in plan["actions"]
        if isinstance(item, dict) and item.get("auto_apply") is True
    ]
    for item in pending:
        relative = safe_relative_path(item["path"])
        if (
            item.get("mode") not in AUTO_MODES
            or item.get("classification") != "update"
        ):
            raise UpgradeError(f"plan 包含不安全的自动操作：{relative}")
    selected = safe_relative_path(selected_path)
    matches = [item for item in pending if item["path"] == selected]
    if len(matches) != 1:
        raise UpgradeError(
            f"--path 必须精确指定一个已复核且可自动应用的 update：{selected}"
        )
    item = matches[0]
    if item["mode"] == "managed-self":
        normal_pending = [
            action["path"] for action in pending if action["mode"] != "managed-self"
        ]
        if normal_pending:
            raise UpgradeError(
                "managed-self 更新必须等待全部普通 managed 更新解决后再执行："
                + ", ".join(sorted(normal_pending))
            )
        self_pending = sorted(
            action["path"]
            for action in pending
            if action["mode"] == "managed-self"
        )
        self_pending.sort(
            key=lambda path: (Path(path).name == "harness_upgrade.py", path)
        )
        if selected != self_pending[0]:
            raise UpgradeError(
                f"managed-self 更新顺序要求先处理 {self_pending[0]}，再处理 {selected}"
            )

    assert_plan_still_current(plan)
    candidate = canonical_directory(Path(plan["candidate_root"]), "候选根目录")
    target = canonical_directory(Path(plan["target_root"]), "目标根目录")
    candidate_snapshot = validate_snapshot(
        item.get("candidate"), f"{selected}.candidate"
    )
    target_snapshot = validate_snapshot(item.get("target"), f"{selected}.target")
    if candidate_snapshot is None or target_snapshot is None:
        raise UpgradeError(f"update 要求两个文件都已存在：{selected}")
    source = assert_current_snapshot(
        candidate,
        selected,
        candidate_snapshot,
        "候选",
    )
    destination = assert_current_snapshot(
        target,
        selected,
        target_snapshot,
        "目标",
    )
    if os.name == "posix":
        replace_existing_posix(
            candidate,
            target,
            selected,
            candidate_snapshot,
            target_snapshot,
        )
    else:
        replace_existing_portable(
            source,
            destination,
            candidate_snapshot,
            target_snapshot,
        )
    return {"applied": [selected], "count": 1}


def write_all(file_descriptor: int, payload: bytes) -> None:
    """把完整载荷写入描述符，避免短写造成锁文件截断。"""

    remaining = memoryview(payload)
    while remaining:
        written = os.write(file_descriptor, remaining)
        remaining = remaining[written:]


def write_lock_posix(target: Path, payload: bytes) -> None:
    """以稳定目录描述符创建 `.harness` 并原子替换来源锁。"""

    directory_flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        directory_flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    root_descriptor = os.open(target, directory_flags)
    harness_descriptor = -1
    temporary_name = f".upstream-lock-{uuid.uuid4().hex}.tmp"
    temporary_created = False
    try:
        try:
            os.mkdir(".harness", mode=0o755, dir_fd=root_descriptor)
        except FileExistsError:
            pass
        harness_descriptor = os.open(
            ".harness",
            directory_flags,
            dir_fd=root_descriptor,
        )
        if not stat.S_ISDIR(os.fstat(harness_descriptor).st_mode):
            raise UpgradeError(".harness 不是稳定目录")
        write_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            write_flags |= os.O_NOFOLLOW
        descriptor = os.open(
            temporary_name,
            write_flags,
            0o600,
            dir_fd=harness_descriptor,
        )
        temporary_created = True
        try:
            write_all(descriptor, payload)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        try:
            observed = os.stat(
                "upstream-lock.json",
                dir_fd=harness_descriptor,
                follow_symlinks=False,
            )
        except FileNotFoundError:
            observed = None
        if observed is not None and not stat.S_ISREG(observed.st_mode):
            raise UpgradeError("上游 lock 不是普通文件")
        os.replace(
            temporary_name,
            "upstream-lock.json",
            src_dir_fd=harness_descriptor,
            dst_dir_fd=harness_descriptor,
        )
        temporary_created = False
        os.fsync(harness_descriptor)
    finally:
        if temporary_created and harness_descriptor != -1:
            try:
                os.unlink(temporary_name, dir_fd=harness_descriptor)
            except OSError:
                pass
        if harness_descriptor != -1:
            os.close(harness_descriptor)
        os.close(root_descriptor)


def write_lock_atomic(target: Path, lock_path: Path, value: dict[str, Any]) -> None:
    """只在精确 `.harness` 目录内原子替换来源锁。"""

    assert_safe_path(
        target,
        lock_path,
        "上游 lock",
        final_may_be_missing=True,
    )
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    if os.name == "posix":
        write_lock_posix(target, payload)
        return

    harness_directory = target / ".harness"
    if not os.path.lexists(harness_directory):
        harness_directory.mkdir(mode=0o755)
    assert_safe_path(
        target,
        harness_directory,
        "上游 lock 目录",
        final_may_be_missing=False,
    )
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=harness_directory, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        assert_safe_path(
            target,
            lock_path,
            "上游 lock",
            final_may_be_missing=True,
        )
        if lock_path.is_symlink():
            raise UpgradeError(f"拒绝替换符号链接 lock：{lock_path}")
        os.replace(temporary, lock_path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def record_lock(args: argparse.Namespace) -> dict[str, Any]:
    """把已复核且已完成应用/人工合并的计划记录为新共同基线。"""

    expected = "bootstrap-verified-baseline" if args.bootstrap else "record-verified-baseline"
    if args.approval != expected:
        raise UpgradeError(f"record 要求传入 --approval {expected}")
    plan, _ = load_reviewed_plan(args.plan)
    target = canonical_directory(Path(plan["target_root"]), "目标根目录")
    if (
        args.source_version != plan["source_version"]
        or args.source_commit != plan["source_commit"]
    ):
        raise UpgradeError(
            "record 的源版本/commit 必须与已复核 plan 精确匹配"
        )
    assert_plan_still_current(plan)
    lock_path = Path(plan["lock_path"])
    existing_lock = load_lock(lock_path)

    manual_paths = {
        item["path"]
        for item in plan["actions"]
        if item["classification"] == "manual_merge"
    }
    resolved_manual = {safe_relative_path(path) for path in args.resolved_manual}
    if resolved_manual != manual_paths:
        raise UpgradeError(
            "record 要求 --resolved-manual 精确列出已复核混合所有权操作的路径："
            f"预期={sorted(manual_paths)}，实际={sorted(resolved_manual)}"
        )
    if plan["problems"]:
        raise UpgradeError("存在路径或所有权问题的 plan 不能 record")

    if args.bootstrap:
        if plan["baseline"] != "missing" or existing_lock is not None:
            raise UpgradeError("bootstrap record 要求 lock 不存在")
        for item in plan["actions"]:
            classification = item["classification"]
            if classification in {"protected_candidate", "tombstone_candidate", "tombstone_present"}:
                raise UpgradeError(f"bootstrap 包含禁止路径：{item['path']}")
            if item["mode"] in AUTO_MODES:
                if classification in {"add", "delete", "update", "conflict", "collision"}:
                    raise UpgradeError(
                        f"bootstrap 的 managed 路径尚未解决：{item['path']}"
                    )
                if (
                    classification == "bootstrap_conflict"
                    and item["candidate"] != item["target"]
                ):
                    raise UpgradeError(
                        f"bootstrap 的 managed 重叠项必须先收敛：{item['path']}"
                    )
                if item["blocked"] and classification != "bootstrap_conflict":
                    raise UpgradeError(
                        f"bootstrap 包含不可复核的 blocker：{item['path']}"
                    )
            elif classification == "manual_add":
                raise UpgradeError(
                    f"bootstrap 的 mixed 路径必须先创建并重新生成 plan：{item['path']}"
                )
    else:
        if plan["baseline"] != "loaded" or existing_lock is None:
            raise UpgradeError("非 bootstrap record 要求已有 lock")
        if plan["blocked"]:
            raise UpgradeError("不能 record 已阻断的升级 plan")
        unresolved = [
            item["path"]
            for item in plan["actions"]
            if item["classification"] in {"add", "delete", "update", "manual_add"}
        ]
        if unresolved:
            raise UpgradeError(
                "仍有 managed 操作未解决：" + ", ".join(unresolved)
            )

    previous_entries = {} if existing_lock is None else existing_lock["entries"]
    entries: dict[str, Any] = {}
    for item in plan["actions"]:
        if item["mode"] in {"protected", "tombstone"}:
            continue
        if item["candidate"] is None and item["target"] is None:
            continue
        if (
            item["mode"] in AUTO_MODES
            and item["classification"] == "preserve_local"
            and item["path"] in previous_entries
        ):
            entries[item["path"]] = previous_entries[item["path"]]
            continue
        entries[item["path"]] = {
            "mode": item["mode"],
            "candidate": item["candidate"],
            "target": item["target"],
        }
    lock = {
        "schema_version": SCHEMA_VERSION,
        "recorded_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "harness_source": {
            "version": plan["source_version"],
            "commit": plan["source_commit"],
        },
        "entries": entries,
    }
    assert_plan_still_current(plan)
    write_lock_atomic(target, lock_path, lock)
    return {"recorded": str(lock_path), "entries": len(entries)}
