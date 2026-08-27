#!/usr/bin/env python3
"""维护可打包并供已选关于页展示的近五次发布更新日志。"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path
from typing import Any, Sequence


SCHEMA_VERSION = 1
MAX_RELEASES = 5
MAX_ITEMS_PER_SECTION = 10
ROOT_KEYS = {"schemaVersion", "releases"}
ENTRY_KEYS = {
    "releaseDate",
    "version",
    "featureOptimizations",
    "bugFixes",
}
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
HARNESS_VERSION = re.compile(r"^\d{12}$")


class ReleaseNotesError(ValueError):
    """表示更新日志文件或命令输入违反稳定契约。"""


def normalize_display_version(value: str) -> str:
    """把机器版本规范化为仅带一个小写 `v` 的用户可见版本。"""

    normalized = value.strip()
    while normalized[:1].lower() == "v":
        normalized = normalized[1:]
    semantic = SEMVER.fullmatch(normalized)
    if semantic is not None:
        if any(int(part) > 100 for part in semantic.groups()):
            raise ReleaseNotesError("semantic version components must be within 0..100")
    elif HARNESS_VERSION.fullmatch(normalized) is None:
        raise ReleaseNotesError(
            "version must be x.y.z or a 12-digit Harness time version"
        )
    return f"v{normalized}"


def _validate_release_date(value: Any) -> str:
    """要求发布日期为规范 ISO 日历日期。"""

    if not isinstance(value, str):
        raise ReleaseNotesError("releaseDate must be a string")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ReleaseNotesError("releaseDate must be YYYY-MM-DD") from error
    if parsed.isoformat() != value:
        raise ReleaseNotesError("releaseDate must be canonical YYYY-MM-DD")
    return value


def _validate_items(value: Any, field: str) -> list[str]:
    """校验单个更新日志分类的非空、去重和十条上限。"""

    if not isinstance(value, list):
        raise ReleaseNotesError(f"{field} must be an array")
    if len(value) > MAX_ITEMS_PER_SECTION:
        raise ReleaseNotesError(
            f"{field} must contain at most {MAX_ITEMS_PER_SECTION} items"
        )
    normalized: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ReleaseNotesError(f"{field} items must be non-empty strings")
        text = item.strip()
        if text in normalized:
            raise ReleaseNotesError(f"{field} must not contain duplicate items")
        normalized.append(text)
    return normalized


def validate_release_entry(value: Any) -> dict[str, Any]:
    """校验并规范化一个版本的发布日期、展示版本与两类条目。"""

    if not isinstance(value, dict) or set(value) != ENTRY_KEYS:
        raise ReleaseNotesError("release entry keys do not match the schema")
    feature_optimizations = _validate_items(
        value["featureOptimizations"], "featureOptimizations"
    )
    bug_fixes = _validate_items(value["bugFixes"], "bugFixes")
    if not feature_optimizations and not bug_fixes:
        raise ReleaseNotesError("each release must contain at least one actual change")
    return {
        "releaseDate": _validate_release_date(value["releaseDate"]),
        "version": normalize_display_version(value["version"]),
        "featureOptimizations": feature_optimizations,
        "bugFixes": bug_fixes,
    }


def validate_document(value: Any) -> dict[str, Any]:
    """校验整个更新日志，锁定 schema、顺序、唯一版本和五版上限。"""

    if not isinstance(value, dict) or set(value) != ROOT_KEYS:
        raise ReleaseNotesError("release notes root keys do not match the schema")
    if value["schemaVersion"] != SCHEMA_VERSION:
        raise ReleaseNotesError(f"schemaVersion must be {SCHEMA_VERSION}")
    releases = value["releases"]
    if not isinstance(releases, list):
        raise ReleaseNotesError("releases must be an array")
    if len(releases) > MAX_RELEASES:
        raise ReleaseNotesError(f"releases must contain at most {MAX_RELEASES} entries")
    normalized = [validate_release_entry(entry) for entry in releases]
    versions = [entry["version"] for entry in normalized]
    if len(versions) != len(set(versions)):
        raise ReleaseNotesError("release versions must be unique")
    dates = [entry["releaseDate"] for entry in normalized]
    if dates != sorted(dates, reverse=True):
        raise ReleaseNotesError("releases must be ordered newest first")
    return {"schemaVersion": SCHEMA_VERSION, "releases": normalized}


def _require_regular_file(path: Path) -> None:
    """拒绝缺失、符号链接或非普通更新日志文件。"""

    if path.is_symlink() or not path.is_file():
        raise ReleaseNotesError(f"release notes must be a regular file: {path}")


def load_document(path: Path) -> dict[str, Any]:
    """从普通 UTF-8 JSON 文件读取并校验更新日志。"""

    _require_regular_file(path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleaseNotesError(f"cannot read valid release notes: {error}") from error
    return validate_document(value)


def _write_document(path: Path, document: dict[str, Any]) -> None:
    """在同目录暂存完整 JSON 后原子替换目标文件。"""

    parent = path.parent
    if parent.is_symlink() or not parent.is_dir():
        raise ReleaseNotesError(f"release notes parent must be a regular directory: {parent}")
    if path.exists() and (path.is_symlink() or not path.is_file()):
        raise ReleaseNotesError(f"release notes target must be a regular file: {path}")
    serialized = json.dumps(
        validate_document(document), ensure_ascii=False, indent=2
    ) + "\n"
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=parent, delete=False
        ) as temporary:
            temporary.write(serialized)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        os.replace(temporary_name, path)
    finally:
        if temporary_name is not None:
            temporary_path = Path(temporary_name)
            if temporary_path.exists():
                temporary_path.unlink()


def upsert_release(
    path: Path,
    *,
    release_date: str,
    version: str,
    feature_optimizations: Sequence[str],
    bug_fixes: Sequence[str],
) -> dict[str, Any]:
    """新增或替换当前版本，置顶后只保留最近五个版本。"""

    existing = (
        load_document(path)
        if path.exists() or path.is_symlink()
        else {"schemaVersion": SCHEMA_VERSION, "releases": []}
    )
    entry = validate_release_entry(
        {
            "releaseDate": release_date,
            "version": version,
            "featureOptimizations": list(feature_optimizations),
            "bugFixes": list(bug_fixes),
        }
    )
    releases = [
        item for item in existing["releases"] if item["version"] != entry["version"]
    ]
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "releases": [entry, *releases][:MAX_RELEASES],
    }
    _write_document(path, document)
    return validate_document(document)


def render_document(document: dict[str, Any]) -> str:
    """按固定中文结构渲染已选关于页可展示的近五次更新日志。"""

    normalized = validate_document(document)
    blocks: list[str] = []
    for entry in normalized["releases"]:
        features = entry["featureOptimizations"] or ["无"]
        fixes = entry["bugFixes"] or ["无"]
        lines = [
            f"-----------更新日志 {entry['releaseDate']} {entry['version']}----------",
            "",
            "###功能优化",
            "",
            *(f"- {item}" for item in features),
            "",
            "###问题修复",
            "",
            *(f"- {item}" for item in fixes),
        ]
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _build_parser() -> argparse.ArgumentParser:
    """建立 check、render 与 upsert 三个非交互命令。"""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="validate release-notes.json")
    check.add_argument("--file", required=True, type=Path)
    check.add_argument("--expected-version")

    render = subparsers.add_parser("render", help="render the visible release notes")
    render.add_argument("--file", required=True, type=Path)

    upsert = subparsers.add_parser("upsert", help="prepend or replace one release")
    upsert.add_argument("--file", required=True, type=Path)
    upsert.add_argument("--release-date", required=True)
    upsert.add_argument("--version", required=True)
    upsert.add_argument("--feature-optimization", action="append", default=[])
    upsert.add_argument("--bug-fix", action="append", default=[])
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """执行非交互维护命令，并用稳定错误输出阻断无效发布日志。"""

    args = _build_parser().parse_args(argv)
    try:
        if args.command == "upsert":
            document = upsert_release(
                args.file,
                release_date=args.release_date,
                version=args.version,
                feature_optimizations=args.feature_optimization,
                bug_fixes=args.bug_fix,
            )
            print(
                f"release-notes.updated={document['releases'][0]['version']} "
                f"retained={len(document['releases'])}"
            )
            return 0

        document = load_document(args.file)
        if args.command == "render":
            print(render_document(document))
            return 0
        if args.expected_version is not None:
            expected = normalize_display_version(args.expected_version)
            actual = document["releases"][0]["version"] if document["releases"] else None
            if actual != expected:
                raise ReleaseNotesError(
                    f"latest release notes version is {actual!r}, expected {expected!r}"
                )
        print(f"release-notes.valid=true retained={len(document['releases'])}")
        return 0
    except ReleaseNotesError as error:
        print(f"release-notes.error={error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
