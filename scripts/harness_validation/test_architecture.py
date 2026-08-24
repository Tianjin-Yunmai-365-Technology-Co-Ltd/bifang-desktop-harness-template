"""覆盖 Harness core-first 规则存在性和 TOML 依赖图门禁。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
CHECKER_TEST_ROOT = ROOT / ".agents" / "skills" / "desktop-implement-change" / "scripts"
if str(CHECKER_TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(CHECKER_TEST_ROOT))

import check_core_first as checker
import test_check_core_first as checker_tests
from scripts.harness_validation import architecture


def load_tests(
    loader: unittest.TestLoader,
    tests: unittest.TestSuite,
    pattern: str | None,
) -> unittest.TestSuite:
    """把下游 checker 专属回归并入 Harness 默认 Python 测试发现入口。"""

    del pattern
    tests.addTests(loader.loadTestsFromModule(checker_tests))
    return tests


class ValidateCoreFirstContractTests(unittest.TestCase):
    """覆盖 core-first 规则存在性和 TOML 依赖图门禁。"""

    def test_current_core_first_contract_is_valid(self) -> None:
        """当前规则、Skills、提示和中性资产必须形成完整门禁。"""

        errors: list[str] = []
        architecture.validate_core_first_contract(errors)
        self.assertEqual(errors, [])

    def test_harness_and_downstream_checker_share_interface_crate_catalog(self) -> None:
        """模板门禁和下游 checker 的接口框架目录不得静默分叉。"""

        self.assertEqual(architecture.INTERFACE_CRATE_NAMES, checker.INTERFACE_CRATE_NAMES)
        self.assertEqual(
            architecture.INTERFACE_CRATE_PREFIXES,
            checker.INTERFACE_CRATE_PREFIXES,
        )

    def test_rejects_removed_required_core_first_fragment(self) -> None:
        """删除 core-first 或平台机制边界时必须产生确定性失败。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "rule.md"
            path.write_text("Core-first 是硬规则。", encoding="utf-8")
            errors: list[str] = []
            architecture.validate_required_fragments(
                errors,
                {path: ("Core-first 是硬规则", "系统托盘留在 adapter")},
            )
        self.assertTrue(any("core-first contract missing" in error for error in errors), errors)

    def test_initialization_retains_governance_scripts_without_auto_running_them(self) -> None:
        """初始化保留治理脚本，但必须明确日常开发不会自动运行。"""

        source = (architecture.INITIALIZE_SKILL / "SKILL.md").read_text(encoding="utf-8")
        retained = "必须保留 `$desktop-implement-change` 及其维护脚本和对应测试"
        no_auto_run = "不得在日常开发中自动运行这些全仓门禁"
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source.replace(no_auto_run, "日常开发自动运行全部门禁", 1), encoding="utf-8")
            errors: list[str] = []
            architecture.validate_required_fragments(
                errors,
                {path: (retained, no_auto_run)},
            )
        self.assertTrue(any("core-first contract missing" in error for error in errors), errors)

    def test_manifest_graph_accepts_renamed_direct_core_dependency(self) -> None:
        """workspace package 重命名后仍应识别普通直接 core 依赖。"""

        errors: list[str] = []
        architecture.validate_manifest_graph(
            errors,
            core_name="sample_core",
            core_manifest={"package": {"name": "sample_core"}},
            adapter_manifests={
                "sample_cli": {
                    "package": {"name": "sample_cli"},
                    "dependencies": {"business": {"workspace": True}},
                }
            },
            workspace_dependencies={
                "business": {"package": "sample_core", "path": "sample_core"}
            },
        )
        self.assertEqual(errors, [])

    def test_manifest_graph_rejects_reverse_cross_and_interface_dependencies(self) -> None:
        """core 反向、adapter 横向和 core 接口框架依赖必须同时失败。"""

        errors: list[str] = []
        architecture.validate_manifest_graph(
            errors,
            core_name="sample_core",
            core_manifest={
                "package": {"name": "sample_core"},
                "dependencies": {
                    "sample_cli": {"workspace": True},
                    "tauri": {"workspace": True},
                },
            },
            adapter_manifests={
                "sample_cli": {
                    "dependencies": {
                        "sample_core": {"workspace": True},
                        "sample_mcp": {"workspace": True},
                    }
                },
                "sample_mcp": {
                    "dependencies": {"sample_core": {"workspace": True}}
                },
            },
            workspace_dependencies={
                "sample_core": {"path": "sample_core"},
                "sample_cli": {"path": "sample_cli"},
                "sample_mcp": {"path": "sample_mcp"},
                "tauri": "2",
            },
        )
        self.assertTrue(any("reverse dependency" in error for error in errors), errors)
        self.assertTrue(any("adapter dependency" in error for error in errors), errors)
        self.assertTrue(any("interface dependency" in error for error in errors), errors)

    def test_manifest_graph_rejects_target_specific_core_only(self) -> None:
        """target-specific core 依赖不能替代 adapter 的普通直接依赖。"""

        errors: list[str] = []
        architecture.validate_manifest_graph(
            errors,
            core_name="sample_core",
            core_manifest={},
            adapter_manifests={
                "sample_gui": {
                    "target": {
                        "cfg(target_os = \"windows\")": {
                            "dependencies": {"sample_core": {"workspace": True}}
                        }
                    }
                }
            },
            workspace_dependencies={"sample_core": {"path": "sample_core"}},
        )
        self.assertTrue(any("direct dependency missing" in error for error in errors), errors)

    def test_manifest_graph_rejects_registry_crate_named_like_core(self) -> None:
        """裸版本同名 crate 不能冒充 adapter 对 workspace core 的直接依赖。"""

        errors: list[str] = []
        architecture.validate_manifest_graph(
            errors,
            core_name="sample_core",
            core_manifest={},
            adapter_manifests={
                "sample_cli": {"dependencies": {"sample_core": "1.0"}}
            },
            workspace_dependencies={},
        )
        self.assertTrue(any("direct dependency missing" in error for error in errors), errors)

    def test_manifest_graph_rejects_transitive_interface_and_adapter_paths(self) -> None:
        """普通 workspace crate 不能隐藏 core 接口依赖或 adapter 横向依赖。"""

        errors: list[str] = []
        architecture.validate_manifest_graph(
            errors,
            core_name="sample_core",
            core_manifest={"dependencies": {"sample_infra": {"workspace": True}}},
            adapter_manifests={
                "sample_cli": {
                    "dependencies": {
                        "sample_core": {"workspace": True},
                        "sample_bridge": {"workspace": True},
                    }
                },
                "sample_mcp": {
                    "dependencies": {"sample_core": {"workspace": True}}
                },
            },
            workspace_dependencies={
                name: {"path": name}
                for name in (
                    "sample_core",
                    "sample_cli",
                    "sample_mcp",
                    "sample_infra",
                    "sample_bridge",
                )
            },
            workspace_manifests={
                "sample_infra": {"dependencies": {"tauri": "2"}},
                "sample_bridge": {
                    "dependencies": {"sample_mcp": {"workspace": True}}
                },
            },
        )
        self.assertTrue(
            any("sample_core -> sample_infra -> tauri" in error for error in errors),
            errors,
        )
        self.assertTrue(
            any(
                "sample_cli -> sample_bridge -> sample_mcp" in error
                for error in errors
            ),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
