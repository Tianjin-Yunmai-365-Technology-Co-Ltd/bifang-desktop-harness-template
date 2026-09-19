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
            "未命中 `$mantine-list-view` 的普通 GUI 页面",
            "业务行和总数只由 TanStack Query",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (  # noqa: F405
            "Core-first 是四类接口共同的硬规则",
            "当前只有一个适配器",
            "违反宿主能力约束",
            "workspace 依赖路径",
            "scripts/check_core_first.py",
            "cargo metadata --no-deps --locked --format-version 1",
            "命中 `$mantine-list-view` 的列表页是封闭例外",
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
            "对业务行为保持 core-first",
            "接口/宿主专属改动须记录其专属性理由",
        ),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (  # noqa: F405
            "Core-first 是硬规则",
            "适配器操作 → core API → core 测试",
            "违反宿主能力约束",
            "不得自动追加格式化、lint、静态",
        ),
        INITIALIZE_SKILL / "SKILL.md": (  # noqa: F405
            "Core-first 是永久硬规则",
            "adapter-only",
            "值域、跨字段关系",
            "必须保留 `$desktop-implement-change` 及其",
            "不得在日常开发中自动运行这些全仓门禁",
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
            "列表页及已有列表审查必须调用 `$mantine-list-view`",
        ),
        GUI_SUPPORT_SKILL: (  # noqa: F405
            "领域校验、跨接口可复用的资格判断",
            "进入 shared core",
            "属于 GUI adapter",
            "列表页改由 `$mantine-list-view` 约束",
        ),
        TUI_BASELINE: ("纯界面应用状态", "当前只有 TUI"),  # noqa: F405
        SKILLS_ROOT / "desktop-add-mcp-adapter" / "references" / "mcp-baseline.md": (  # noqa: F405
            "格式正确但值域",
            "MCP 工具 → core API → core 测试",
        ),
        GUI_BASELINE: ("系统托盘", "GUI 事件/命令 → core API → core 测试"),  # noqa: F405
        REACT_BASELINE: ("不得编排多个命令来决定业务结果",),  # noqa: F405
        MANTINE_LIST_VIEW_SKILL: (  # noqa: F405
            "即使用户未写“表格”",
            "stickyHeaderOffset={GLOBAL_OFFSET}",
            "asc → desc → none",
            "[10, 20, 50, 100]",
            "用户明确指定白名单值时作为该列表初始值",
            "业务行数据只由 TanStack Query 缓存",
            "@dnd-kit/core",
            "checklist.md",
        ),
        ROOT / "docs" / "design_standards" / "mantine_list_view.md": (  # noqa: F405
            "standard_id = mantine-list-view-v1",
            "URL 完全没有本列表拥有的参数时才读取会话快照",
            "业务行数据、总数和请求结果只由 TanStack Query 缓存",
            "成功响应后，若 page 大于非零 totalPages",
            "@dnd-kit/sortable",
        ),
        MANTINE_LIST_VIEW_PATTERN: (  # noqa: F405
            "previousQuery.queryKey.slice(0, -1)",
            'refetchOnMount: "always"',
            "显式 URL 模式",
            "totalPages === 0",
            "ColumnPreferences",
        ),
        MANTINE_LIST_VIEW_API: (  # noqa: F405
            "Mantine `9.6.1`",
            "Table.ScrollContainer",
            "Pagination",
            "total` 是总页数",
        ),
        MANTINE_LIST_VIEW_CHECKLIST: (  # noqa: F405
            "首次加载恰好渲染 pageSize 行 Skeleton",
            "只有当前排序列有准确 `aria-sort`",
            "业务行、总数和请求结果只在 TanStack Query",
            "required: true",
        ),
        MANTINE_LIST_VIEW_TEMPLATE: (  # noqa: F405
            "stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}",
            "PAGE_SIZES = [10, 20, 50, 100] as const",
            'from "@tabler/icons-react"',
            "placeholderData:",
            "!query.isFetching",
            "getCorrectedPage",
            "window.sessionStorage",
            "window.localStorage",
            "columnSchemaVersion: number",
            "hideBelow?:",
            "requires a required column that remains visible on narrow screens",
            "KeyboardSensor",
            "onDragStart:",
            "onDragCancel:",
            "moveColumnLeft(props.label)",
            "moveColumnRight(props.label)",
            "resetFilters",
            "selectionSummary",
            "requires each sort field to belong to exactly one column",
            "key={rowId}",
        ),
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
