#!/usr/bin/env python3
"""为一个独立 Git 仓库安装并检查受管提交消息模板。"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Sequence


SKILL_ROOT = Path(__file__).resolve().parent.parent
SOURCE_TEMPLATE = SKILL_ROOT / "assets" / "commit-template.txt"
MANAGED_DIRECTORY = "harness"
MANAGED_TEMPLATE = "meaningful-commit-template.txt"


class ConfigurationError(RuntimeError):
    """表示仓库边界、受管文件或本地 Git 配置不满足安全条件。"""


def run_git(
    root: Path,
    arguments: Sequence[str],
    *,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    """在精确项目根运行 Git，并把失败转换为可读且不含 shell 展开的错误。"""

    try:
        result = subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError as exc:
        raise ConfigurationError("git executable is unavailable") from exc
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git failure"
        raise ConfigurationError(f"git {' '.join(arguments)} failed: {detail}")
    return result


def resolve_repository(project_root: str) -> tuple[Path, Path]:
    """解析独立工作树与 Git common dir，拒绝父仓库、裸仓库和符号链接目录。"""

    supplied = Path(project_root).expanduser()
    if supplied.is_symlink():
        raise ConfigurationError("project root must not be a symbolic link")
    try:
        root = supplied.resolve(strict=True)
    except FileNotFoundError as exc:
        raise ConfigurationError("project root does not exist") from exc
    if not root.is_dir():
        raise ConfigurationError("project root is not a directory")

    query = run_git(
        root,
        ["rev-parse", "--is-inside-work-tree", "--show-toplevel", "--git-common-dir"],
    ).stdout.splitlines()
    if len(query) != 3:
        raise ConfigurationError("unexpected output from git rev-parse")
    inside, top_level_raw, common_raw = query
    if inside != "true":
        raise ConfigurationError("project root is not a Git work tree")
    top_level = Path(top_level_raw).resolve(strict=True)
    if top_level != root:
        raise ConfigurationError("project root must equal the independent Git top level")

    common_candidate = Path(common_raw)
    common_dir = (
        common_candidate.resolve(strict=True)
        if common_candidate.is_absolute()
        else (root / common_candidate).resolve(strict=True)
    )
    if common_dir.is_symlink() or not common_dir.is_dir():
        raise ConfigurationError("Git common dir must be a real directory")
    return root, common_dir


def read_source_template() -> bytes:
    """读取受跟踪模板，并确保未编辑模板不会留下可提交的正文。"""

    if SOURCE_TEMPLATE.is_symlink() or not SOURCE_TEMPLATE.is_file():
        raise ConfigurationError("source commit template must be a regular file")
    data = SOURCE_TEMPLATE.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ConfigurationError("source commit template must be valid UTF-8") from exc
    if not text.endswith("\n"):
        raise ConfigurationError("source commit template must end with a newline")
    if any(line.strip() and not line.startswith("#") for line in text.splitlines()):
        raise ConfigurationError("source commit template must contain comments only")
    return data


def managed_path(common_dir: Path) -> Path:
    """返回 Git common dir 内不会进入工作树提交的受管模板路径。"""

    return common_dir / MANAGED_DIRECTORY / MANAGED_TEMPLATE


def read_local_settings(root: Path, keys: Sequence[str]) -> dict[str, list[str]]:
    """一次性列出仓库本地配置并按键分组，避免逐键各起一个 Git 进程。"""

    result = run_git(root, ["config", "--local", "--list", "--null"], check=False)
    if result.returncode == 1:
        return {key: [] for key in keys}
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git failure"
        raise ConfigurationError(f"cannot read local Git settings: {detail}")
    wanted = {key.lower(): key for key in keys}
    values: dict[str, list[str]] = {key: [] for key in keys}
    for entry in result.stdout.split("\0"):
        if not entry:
            continue
        name, _, value = entry.partition("\n")
        original = wanted.get(name)
        if original is not None:
            values[original].append(value)
    return values


def desired_settings(template_path: Path) -> dict[str, str]:
    """生成模板正确显示且注释不会进入提交正文的四项本地设置。"""

    return {
        "commit.template": str(template_path),
        "commit.cleanup": "strip",
        "commit.verbose": "true",
        "core.commentChar": "#",
    }


def replace_config_values(root: Path, key: str, values: Sequence[str]) -> None:
    """以确定性顺序替换一个本地配置键，用于应用或失败回滚。"""

    unset = run_git(root, ["config", "--local", "--unset-all", key], check=False)
    if unset.returncode not in (0, 5):
        detail = unset.stderr.strip() or unset.stdout.strip() or "unknown git failure"
        raise ConfigurationError(f"cannot clear local Git setting {key}: {detail}")
    for value in values:
        run_git(root, ["config", "--local", "--add", key, value])


def write_atomic(path: Path, data: bytes) -> None:
    """在 Git common dir 内原子写入模板，并拒绝已有符号链接或非普通文件。"""

    directory = path.parent
    if directory.is_symlink():
        raise ConfigurationError("managed Git metadata path is not a real directory")
    if directory.exists():
        if not directory.is_dir():
            raise ConfigurationError("managed Git metadata path is not a real directory")
    else:
        directory.mkdir(mode=0o700)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ConfigurationError("managed commit template is not a regular file")

    descriptor, temporary_name = tempfile.mkstemp(prefix=".commit-template-", dir=directory)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def restore_template(path: Path, previous: bytes | None) -> None:
    """在配置应用失败时恢复原模板字节或移除本次新建文件。"""

    if previous is None:
        if path.exists() and path.is_file() and not path.is_symlink():
            path.unlink()
        return
    write_atomic(path, previous)


def load_context(project_root: str) -> tuple[Path, Path, bytes, dict[str, str]]:
    """解析仓库、加载受信模板并生成期望配置，供安装与检查共用。"""

    root, common_dir = resolve_repository(project_root)
    source = read_source_template()
    target = managed_path(common_dir)
    desired = desired_settings(target)
    return root, target, source, desired


def install(project_root: str, *, replace: bool) -> dict[str, object]:
    """安装模板并事务式设置仓库本地配置；冲突默认失败关闭。"""

    root, target, source, desired = load_context(project_root)
    previous_settings = read_local_settings(root, tuple(desired))
    conflicts: dict[str, list[str]] = {}
    settings_changed = False
    for key, value in desired.items():
        values = previous_settings[key]
        if values != [value]:
            settings_changed = True
            if values:
                conflicts[key] = values
    if conflicts and not replace:
        names = ", ".join(sorted(conflicts))
        raise ConfigurationError(
            f"conflicting local Git settings: {names}; rerun with --replace only after approval"
        )

    previous_template: bytes | None = None
    if target.is_symlink() or target.exists():
        if target.is_symlink() or not target.is_file():
            raise ConfigurationError("managed commit template is not a regular file")
        previous_template = target.read_bytes()
    changed = previous_template != source or settings_changed

    write_atomic(target, source)
    try:
        for key, value in desired.items():
            replace_config_values(root, key, [value])
    except ConfigurationError as exc:
        rollback_errors: list[str] = []
        for key in reversed(tuple(desired)):
            try:
                replace_config_values(root, key, previous_settings[key])
            except ConfigurationError as rollback_exc:
                rollback_errors.append(str(rollback_exc))
        try:
            restore_template(target, previous_template)
        except ConfigurationError as rollback_exc:
            rollback_errors.append(str(rollback_exc))
        suffix = f"; rollback errors: {'; '.join(rollback_errors)}" if rollback_errors else ""
        raise ConfigurationError(f"installation failed: {exc}{suffix}") from exc

    return {
        "status": "installed",
        "projectRoot": str(root),
        "templatePath": str(target),
        "settings": desired,
        "changed": changed,
        "replacedConflicts": bool(conflicts),
    }


def check_installation(project_root: str) -> dict[str, object]:
    """检查模板字节与四项仓库本地设置，任何漂移都返回失败。"""

    root, target, source, desired = load_context(project_root)
    problems: list[str] = []
    if target.is_symlink() or not target.is_file():
        problems.append("managed commit template is missing or not a regular file")
    elif target.read_bytes() != source:
        problems.append("managed commit template differs from the tracked source")

    observed = read_local_settings(root, tuple(desired))
    for key, value in desired.items():
        if observed[key] != [value]:
            problems.append(f"local Git setting {key} does not equal {value!r}")
    if problems:
        raise ConfigurationError("; ".join(problems))
    return {
        "status": "ok",
        "projectRoot": str(root),
        "templatePath": str(target),
        "settings": desired,
    }


def build_parser() -> argparse.ArgumentParser:
    """构造只有 install/check 两种确定模式的命令行接口。"""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    install_parser = subparsers.add_parser("install", help="install local template settings")
    install_parser.add_argument("--project-root", required=True)
    install_parser.add_argument("--replace", action="store_true")
    check_parser = subparsers.add_parser("check", help="check local template settings")
    check_parser.add_argument("--project-root", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """执行配置命令并输出稳定 JSON，失败时返回非零状态。"""

    arguments = build_parser().parse_args(argv)
    try:
        if arguments.command == "install":
            result = install(arguments.project_root, replace=arguments.replace)
        else:
            result = check_installation(arguments.project_root)
    except (ConfigurationError, OSError) as exc:
        print(
            json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
