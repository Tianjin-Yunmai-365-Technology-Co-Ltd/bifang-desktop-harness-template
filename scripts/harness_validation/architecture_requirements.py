"""集中维护 core-first 当前事实源的必需片段。"""

from __future__ import annotations

from pathlib import Path

from .context import *  # noqa: F403


def core_first_requirements() -> dict[Path, tuple[str, ...]]:
    """返回规则、Skills、提示与检查器的稳定片段矩阵。"""

    return {
        ENGINEERING_RULES: (  # noqa: F405
            "Core-first 是硬规则",
            "薄层按职责判断",
            "系统托盘",
            "适配器操作 → core 用例 API → core 测试",
            "workspace 可达闭包",
            "业务逻辑是否真正位于 core",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (  # noqa: F405
            "Core-first 是四类接口共同的硬规则",
            "当前只有一个适配器",
            "违反宿主能力约束",
            "workspace 依赖路径",
            "scripts/check_core_first.py",
            "cargo metadata --no-deps --locked --format-version 1",
        ),
        ROOT / "AGENTS.md": (  # noqa: F405
            "Core-first 是硬规则",
            "薄层按职责",
            "值域、跨字段关系",
            "unittest discover -s scripts",
        ),
        ROOT / "README.md": (  # noqa: F405
            "Core-first 是强制规则",
            "系统托盘",
            "值域、跨字段关系",
            "unittest discover -s scripts",
        ),
        PRODUCT_SPEC: (  # noqa: F405
            "Core-first 是强制架构约束",
            "当前只有一个接口",
            "系统托盘",
            "宿主能力约束",
        ),
        SKILLS_ROOT / "desktop-define-product" / "SKILL.md": (  # noqa: F405
            "接口/宿主无关的业务结果",
            "业务效果仍委托 core",
        ),
        SKILLS_ROOT / "desktop-plan-change" / "SKILL.md": (  # noqa: F405
            "适配器操作 → core API → core 测试",
            "当前只有一个适配器",
        ),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (  # noqa: F405
            "Core-first 是硬规则",
            "适配器操作 → core API → core 测试",
            "违反宿主能力约束",
            "scripts/check_core_first.py",
        ),
        SKILLS_ROOT / "desktop-verify-delivery" / "SKILL.md": (  # noqa: F405
            "适配器操作 → core API → core 测试",
            "系统托盘",
        ),
        INITIALIZE_SKILL / "SKILL.md": (  # noqa: F405
            "Core-first 是永久硬规则",
            "adapter-only",
            "值域、跨字段关系",
            "不得依赖 POSIX 可执行位",
            "Python 3 不可用时",
            "必须保留 `$desktop-implement-change` 及其",
            "scripts/check_file_line_limits.py",
            "scripts/check_rust_chinese_comments.py",
            "scripts/check_core_first.py",
            "裁剪后再次按第 10 步",
        ),
        CLI_SKILL: ("CLI 命令 → core API → core 测试", "当前只有 CLI"),  # noqa: F405
        TUI_SKILL: ("TUI 消息 → core API → core 测试", "纯交互状态"),  # noqa: F405
        MCP_SKILL: (  # noqa: F405
            "MCP 工具 → core API → core 测试",
            "格式正确但业务无效",
        ),
        GUI_SKILL: (  # noqa: F405
            "GUI 事件/命令 → core API → core 测试",
            "平台机制本身无需 core-first 例外 ADR",
        ),
        GUI_SUPPORT_SKILL: (  # noqa: F405
            "领域校验、跨接口可复用的资格判断",
            "进入 shared core",
            "属于 GUI adapter",
        ),
        TUI_BASELINE: ("纯界面应用状态", "当前只有 TUI"),  # noqa: F405
        SKILLS_ROOT / "desktop-add-mcp-adapter" / "references" / "mcp-baseline.md": (  # noqa: F405
            "格式正确但值域",
            "MCP 工具 → core API → core 测试",
        ),
        GUI_BASELINE: ("系统托盘", "GUI 事件/命令 → core API → core 测试"),  # noqa: F405
        REACT_BASELINE: ("不得编排多个命令来决定业务结果",),  # noqa: F405
        CORE_FIRST_CHECKER: (  # noqa: F405
            "cargo metadata",
            "ADAPTER_SUFFIXES",
            "INTERFACE_CRATE_NAMES",
            "_reachable_paths",
        ),
        CORE_FIRST_CHECKER_TESTS: (  # noqa: F405
            "test_rejects_core_reverse_dependency_in_any_scope", "test_rejects_adapter_to_adapter_dependency",
            "test_rejects_registry_crate_with_same_name_as_workspace_core",
            "test_rejects_transitive_interface_framework_from_core", "test_rejects_transitive_adapter_to_adapter_dependency", "class CoreFirstCliTests", "test_cli_returns_two_for_json_and_cargo_tool_failures",
        ),
        ROOT / "scripts" / "harness_validation" / "test_architecture.py": ("def load_tests(", "checker_tests"),  # noqa: F405
        SKILLS_ROOT / "desktop-initialize-rust-project" / "agents" / "openai.yaml": (  # noqa: F405
            "core-first",
            "薄 adapter",
        ),
        SKILLS_ROOT / "desktop-add-cli-adapter" / "agents" / "openai.yaml": ("薄适配器",),  # noqa: F405
        SKILLS_ROOT / "desktop-add-tui-adapter" / "agents" / "openai.yaml": ("薄适配器",),  # noqa: F405
        SKILLS_ROOT / "desktop-add-mcp-adapter" / "agents" / "openai.yaml": ("薄适配器",),  # noqa: F405
        SKILLS_ROOT / "desktop-add-gui-adapter" / "agents" / "openai.yaml": (  # noqa: F405
            "薄适配器",
            "业务效果回到 core",
        ),
    }
