"""校验 core-first 规则文本、中性资产和确定性 Cargo 依赖边界。"""

from __future__ import annotations

import tomllib
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .context import *  # noqa: F403
from .architecture_requirements import core_first_requirements

ADAPTER_SUFFIXES = ("_cli", "_tui", "_mcp", "_gui")
INTERFACE_CRATE_NAMES = frozenset(
    {
        "clap",
        "crossterm",
        "dialoguer",
        "muda",
        "ratatui",
        "rmcp",
        "tauri",
        "tauri-build",
        "termion",
        "tray-icon",
        "tui-realm",
        "tui-realm-stdlib",
        "tuirealm",
        "winit",
    }
)
INTERFACE_CRATE_PREFIXES = ("tauri-plugin-",)


def _interface_crate(package_name: str) -> bool:
    """判断解析后的依赖名是否属于接口框架。"""

    return package_name in INTERFACE_CRATE_NAMES or package_name.startswith(INTERFACE_CRATE_PREFIXES)


def _resolved_dependency(
    dependency_name: str,
    declaration: object,
    workspace_dependencies: Mapping[str, object],
) -> tuple[str, bool, bool]:
    """解析 package 重命名、optional 标记和本地 path 来源。"""

    optional = False
    package_name = dependency_name
    effective = declaration
    if isinstance(declaration, dict) and declaration.get("workspace") is True:
        effective = workspace_dependencies.get(dependency_name)
        optional = bool(declaration.get("optional", False))
    if isinstance(effective, dict):
        package_name = str(effective.get("package", dependency_name))
        optional = optional or bool(effective.get("optional", False))
    local_path = (
        isinstance(effective, dict)
        and isinstance(effective.get("path"), str)
        and bool(effective["path"])
    )
    return package_name, optional, local_path


def _dependency_entries(
    manifest: Mapping[str, Any],
    workspace_dependencies: Mapping[str, object],
) -> list[tuple[str, str, str | None, bool, bool]]:
    """提取 normal/dev/build 与 target-specific 依赖的稳定事实。"""

    entries: list[tuple[str, str, str | None, bool, bool]] = []

    def append_table(
        table: object,
        *,
        kind: str,
        target: str | None,
    ) -> None:
        """把一个 TOML 依赖表解析为统一元组。"""

        if not isinstance(table, dict):
            return
        for dependency_name, declaration in table.items():
            package_name, optional, local_path = _resolved_dependency(
                str(dependency_name),
                declaration,
                workspace_dependencies,
            )
            entries.append((package_name, kind, target, optional, local_path))

    append_table(manifest.get("dependencies"), kind="normal", target=None)
    append_table(manifest.get("dev-dependencies"), kind="dev", target=None)
    append_table(manifest.get("build-dependencies"), kind="build", target=None)
    targets = manifest.get("target")
    if isinstance(targets, dict):
        for target_name, target_table in targets.items():
            if not isinstance(target_table, dict):
                continue
            append_table(
                target_table.get("dependencies"),
                kind="normal",
                target=str(target_name),
            )
            append_table(
                target_table.get("dev-dependencies"),
                kind="dev",
                target=str(target_name),
            )
            append_table(
                target_table.get("build-dependencies"),
                kind="build",
                target=str(target_name),
            )
    return sorted(entries)


def _local_manifest_graph(
    manifests: Mapping[str, Mapping[str, Any]],
    workspace_dependencies: Mapping[str, object],
) -> dict[str, tuple[str, ...]]:
    """建立只包含本地 path 声明的 workspace manifest 依赖图。"""

    names = set(manifests)
    return {
        package_name: tuple(
            sorted(
                {
                    dependency_name
                    for dependency_name, _kind, _target, _optional, local_path in _dependency_entries(
                        manifest,
                        workspace_dependencies,
                    )
                    if local_path and dependency_name in names
                }
            )
        )
        for package_name, manifest in manifests.items()
    }


def _reachable_manifest_paths(
    start: str,
    graph: Mapping[str, tuple[str, ...]],
) -> dict[str, tuple[str, ...]]:
    """以稳定最短路径枚举一个 manifest 可达的本地 package。"""

    paths = {start: (start,)}
    pending = [start]
    for package_name in pending:
        for target in graph.get(package_name, ()):
            if target not in paths:
                paths[target] = (*paths[package_name], target)
                pending.append(target)
    return paths


def validate_manifest_graph(
    errors: list[str],
    *,
    core_name: str,
    core_manifest: Mapping[str, Any],
    adapter_manifests: Mapping[str, Mapping[str, Any]],
    workspace_dependencies: Mapping[str, object],
    workspace_manifests: Mapping[str, Mapping[str, Any]] | None = None,
) -> None:
    """验证 TOML 层面的 core/adapter 直连、反向和横向依赖。"""

    adapter_names = set(adapter_manifests)
    manifests = dict(workspace_manifests or {})
    manifests[core_name] = core_manifest
    manifests.update(adapter_manifests)
    dependency_graph = _local_manifest_graph(manifests, workspace_dependencies)
    core_paths = _reachable_manifest_paths(core_name, dependency_graph)
    for package_name, path in sorted(core_paths.items()):
        path_text = " -> ".join(path)
        if package_name != core_name and package_name in adapter_names:
            fail(  # noqa: F405
                errors,
                f"core-first reverse dependency: {path_text}",
            )
            continue
        for dependency_name, kind, target, _optional, _local in _dependency_entries(
            manifests[package_name],
            workspace_dependencies,
        ):
            if _interface_crate(dependency_name):
                fail(  # noqa: F405
                    errors,
                    f"core-first interface dependency: {path_text} -> "
                    f"{dependency_name} (kind={kind}, target={target or 'all-targets'})",
                )

    for adapter_name, adapter_manifest in sorted(adapter_manifests.items()):
        dependencies = _dependency_entries(adapter_manifest, workspace_dependencies)
        if not any(
            dependency_name == core_name
            and kind == "normal"
            and target is None
            and not optional
            and local_path
            for dependency_name, kind, target, optional, local_path in dependencies
        ):
            fail(  # noqa: F405
                errors,
                f"core-first direct dependency missing: {adapter_name} -> {core_name}",
            )
        for package_name, path in sorted(
            _reachable_manifest_paths(adapter_name, dependency_graph).items()
        ):
            if package_name in adapter_names and package_name != adapter_name:
                fail(  # noqa: F405
                    errors,
                    f"core-first adapter dependency: {' -> '.join(path)}",
                )


def validate_required_fragments(
    errors: list[str],
    requirements: Mapping[Path, tuple[str, ...]],
) -> None:
    """验证 core-first 事实来源和执行入口没有丢失必需语义。"""

    for path, fragments in requirements.items():
        if not path.is_file():
            fail(errors, f"missing core-first contract file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"core-first contract missing in {display_path(path)}: {fragment}",
                )


def validate_core_first_contract(errors: list[str]) -> None:
    """运行 Harness 规则、Skill、提示和中性 Rust 资产的 core-first 门禁。"""

    requirements = core_first_requirements()
    validate_required_fragments(errors, requirements)

    root_manifest = RUST_ASSET / "Cargo.toml"  # noqa: F405
    try:
        root_data = tomllib.loads(root_manifest.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        fail(errors, f"cannot parse core-first Rust asset root manifest: {error}")  # noqa: F405
        return

    workspace = root_data.get("workspace", {})
    if not isinstance(workspace, dict) or not isinstance(workspace.get("members"), list):
        fail(errors, "Rust asset workspace members must be an array")  # noqa: F405
        return
    workspace_dependencies = workspace.get("dependencies", {})
    if not isinstance(workspace_dependencies, dict):
        fail(errors, "Rust asset workspace dependencies must be a table")  # noqa: F405
        return

    workspace_manifests: dict[str, Mapping[str, Any]] = {}
    asset_root = RUST_ASSET.resolve()  # noqa: F405
    for member in workspace["members"]:
        if not isinstance(member, str) or not member:
            fail(errors, f"invalid Rust asset workspace member: {member!r}")  # noqa: F405
            continue
        member_root = (RUST_ASSET / member).resolve()  # noqa: F405
        if member_root != asset_root and asset_root not in member_root.parents:
            fail(errors, f"Rust asset workspace member escapes root: {member}")  # noqa: F405
            continue
        try:
            manifest = tomllib.loads(
                (member_root / "Cargo.toml").read_text(encoding="utf-8")
            )
        except (OSError, tomllib.TOMLDecodeError) as error:
            fail(errors, f"cannot parse Rust asset member {member}: {error}")  # noqa: F405
            continue
        package = manifest.get("package")
        package_name = package.get("name") if isinstance(package, dict) else None
        if not isinstance(package_name, str) or not package_name:
            fail(errors, f"Rust asset member lacks package name: {member}")  # noqa: F405
        elif package_name in workspace_manifests:
            fail(errors, f"duplicate Rust asset package name: {package_name}")  # noqa: F405
        else:
            workspace_manifests[package_name] = manifest

    core_data = workspace_manifests.get("example_tool_core")
    adapter_manifests = {
        name: manifest
        for name, manifest in workspace_manifests.items()
        if any(name.endswith(suffix) for suffix in ADAPTER_SUFFIXES)
    }
    if core_data is None or not adapter_manifests:
        fail(errors, "Rust asset must include example_tool_core and an adapter")  # noqa: F405
        return
    validate_manifest_graph(
        errors,
        core_name="example_tool_core",
        core_manifest=core_data,
        adapter_manifests=adapter_manifests,
        workspace_dependencies=workspace_dependencies,
        workspace_manifests=workspace_manifests,
    )
