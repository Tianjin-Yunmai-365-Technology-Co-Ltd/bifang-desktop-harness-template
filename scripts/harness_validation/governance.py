"""校验工程治理、并行协作、当前描述与版本事实契约。"""

from __future__ import annotations

import re
from pathlib import Path

from .context import *  # noqa: F403
from .governance_descriptions import (
    validate_current_descriptions,
    validate_stale_fragments,
)
from .governance_policy import validate_agent_policy
from .governance_version import validate_version_contract as _validate_version_contract


def validate_engineering_contract(errors: list[str]) -> None:
    """确认工程规则唯一来源、关键入口和执行型 Skills 已建立确定性引用。"""
    required_fragments = {
        ENGINEERING_RULES: (
            "## 2. 文件、模块与依赖边界",
            "Rust 代码：400 行及以内",
            "800 行通过，801 行失败",
            "前端代码：500 行及以内",
            "1000 行通过，1001 行失败",
            "其他人工维护文本",
            "2000 行通过，2001 行失败",
            "<module>/mod.rs",
            "不强制 `index.ts` 桶文件",
            "高内聚、职责单一和职责相近性复核",
            "## 3. 中文代码注释",
            "### 3.4 机械存在性门禁",
            "check_rust_chinese_comments.py",
            "TypeScript Compiler AST",
            "不得自动生成或批量补入",
            "## 4. 文档规则",
            "## 5. 测试组织",
            "## 6. 规则例外",
            "## 7. 机械检查边界",
            "src-tauri/icons/32x32.png",
            "Tauri Builder `.setup(...)` 可达",
            "`.on_window_event(...)` 注册",
            "透明点击区域",
            "本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification",
            "任务被称为“修复”或“重构”不能绕过门禁",
        ),
        ROOT / "AGENTS.md": (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "普通缺陷修复、不改变可观察行为的纯重构",
            "Rust 代码超过 400 行建议重构、超过 800 行强制拆分",
            "前端代码超过 500 行建议重构、超过 1000 行强制拆分",
            "<module>/mod.rs",
        ),
        ROOT / "README.md": (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "普通缺陷修复、不改变可观察行为的纯重构",
            "Rust 代码超过 400 行建议重构、超过 800 行强制拆分",
            "前端代码超过 500 行建议重构、超过 1000 行强制拆分",
            "<module>/mod.rs",
        ),
        AGENT_POLICY: (
            "superpowers:",
            "推荐预设物化为 `superpowers: disabled`",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
            "日常开发直接实施",
            "显式构建必须为当前构建解析一次 E2E 选择",
        ),
        PRODUCT_SPEC: (
            "docs/ENGINEERING_RULES.md",
            "不把普通缺陷修复、纯重构、格式整理、测试补强或内部清理写成项目记忆流水账",
            "HARNESS-FEAT-TIERED-CODE-LINE-LIMITS",
            "Rust 代码 400 行及以内",
            "前端代码 500 行及以内",
            "<module>/mod.rs",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "docs/ENGINEERING_RULES.md",
            "design_standards/README.md",
        ),
        ROOT / "docs" / "design_standards" / "README.md": (
            "当前请求或产品 profile 中已批准的产品专属标准优先于 Harness 通用缺省",
            "不得自行发明数值",
            "tauri-gui-sidebar-compact-80-v1",
            "tauri-gui-sidebar-detailed-v1",
        ),
        ROOT / "docs" / "design_standards" / "tauri_gui.md": (
            "adapter 的展示和纯交互层",
            "localStorageColorSchemeManager",
            "page → surface → section → field → action",
            "320 CSS px",
            "@tabler/icons-react",
            "i18next",
            "父容器不得代理子控件动作",
            'role="alertdialog"',
            "WCAG 2.2 AA",
            "Testing Library",
        ),
        ROOT / "docs" / "design_standards" / "tauri_sidebar.md": (
            "80px",
            "6px",
            "36px",
            "22px",
            "line-height: 1.25",
            "56px",
            "禁止 `em`/`ch` 固定占位盒",
            "navbar.width",
            "AppShell.Navbar",
            "248px",
            "76px",
            "APP_SIDEBAR_NAV_ICON_SIZE_PX = 22",
            "readDetailedSidebarCollapsed()",
            "detailedSidebarNavbarWidth(collapsed)",
            'data-navbar-width',
            'data-testid="app-sidebar-collapse-toggle"',
            'position="right"',
            "身份区父级点击不得切换状态",
        ),
        SKILLS_ROOT / "desktop-plan-change" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (
            "docs/ENGINEERING_RULES.md",
            "本次开发需要的相关非空单元/回归测试",
            "不得自动追加格式化、lint、静态",
        ),
        INITIALIZE_SKILL / "SKILL.md": (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "只运行初始化本身必需的非空测试",
            "不得在日常开发中自动运行这些全仓门禁",
            "Rust 代码超过 400 行建议重构",
            "前端代码超过 500 行建议重构",
            "<module>/mod.rs",
        ),
        SKILLS_ROOT / "desktop-refactor-code" / "SKILL.md": (
            "Rust 401 至 800 行",
            "前端 501 至 1000 行",
            "<module>/mod.rs",
            "不强制创建 `index.ts` 桶文件",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": ("docs/RUST_CLI_TEMPLATE.md",),
        GUI_IDENTITY_SKILL: (
            "docs/ENGINEERING_RULES.md",
            "$desktop-add-gui-adapter",
            "tauri-gui-common-v1",
            "tauri-gui-sidebar-compact-80-v1",
        ),
        GUI_SUPPORT_SKILL: (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "$desktop-implement-change",
            "秘密只能由已批准的安全运行时来源提供",
        ),
        GUI_INITIALIZATION_E2E_SKILL: (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "真实本机调试二进制",
            "verify-gui-lifecycle-contract.mjs",
            "src-tauri/tauri.release.conf.json",
            "异步 `load_release_notes`",
            "loading/error/retry",
            "未选能力不是缺失证据",
            "`single_instance: enabled`",
            "第二进程 15 秒内退出",
            "`system_tray: enabled`",
            "icons/32x32.png",
            "非透明 `icons/32x32.png`/配置引用",
            "从 `.setup(...)` 可达",
            "真实非空图形",
            "空白点击区域",
            "退出项结束进程并移除图标",
            "关闭最后一个窗口",
        ),
        SKILLS_ROOT / "desktop-verify-delivery" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "desktop-instantiate-project" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "desktop-add-mcp-adapter" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "desktop-add-gui-adapter" / "SKILL.md": (
            "docs/ENGINEERING_RULES.md",
            "docs/design_standards/README.md",
            "check-typescript-chinese-comments.cjs",
            "mantine-ui-guidelines.md",
        ),
        CLI_SKILL: ("docs/ENGINEERING_RULES.md",),
        TUI_SKILL: ("工程规则",),
        E2E_SKILL: ("docs/VERIFICATION.md",),
        RUST_ASSET / "example_tool_core" / "src" / "lib.rs": (
            "#![deny(missing_docs)]",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing engineering contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"engineering rule reference missing in {display_path(path)}: {fragment}",
                )

def validate_streamlined_development_and_build(errors: list[str]) -> None:
    """校验最小开发闭环、构建记录边界、全量构建单测和显式并行。"""
    required_fragments = {
        ROOT / "AGENTS.md": (
            "日常开发统一从用户请求直接进入 `$desktop-implement-change`",
            "除必要 ADR、Changelog 等事件触发记录和本次开发所需单元/回归测试外",
            "不因多步骤、多模块、中等风险、可并行或 Agent 偏好自动增加",
            "每次显式构建在任何测试或编译前解析一次本次 E2E 选择",
            "cargo test --workspace --all-targets --all-features --locked",
            "GUI 构建还必须运行前端完整单元测试套件",
            "构建事实只写入当前 `release/` manifest、其声明的相邻制品证据和最终回复",
            "不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "只有用户在当前请求中明确要求并行 Subagent/Worktree",
            "E2E 只在最终真实候选形成后",
            "格式、lint、静态、集成/契约、全仓测试和构建不自动追加",
            "用户要求新建左侧 Task 处理仓库变更时",
            "标题使用“动作 + 结果”",
            "最新干净 `main` 基线",
            "完成时提交全部改动并保持状态干净",
        ),
        ROOT / "README.md": (
            "日常开发直接使用 `$desktop-implement-change`",
            "只增加并运行本次变更需要的单元/回归测试",
            "不自动增加计划、全仓检查、构建、冒烟、发布候选 E2E 或验收步骤",
            "构建 Skill 只读校验并把同一日志打入候选，再解析本次是否启用 E2E",
            "运行项目全部非空单元测试并构建",
            "构建事实只写入 `release/` manifest 和最终回复",
            "不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆",
            "只有用户明确要求并行",
            "## 开始一个左侧 Task",
            "选择项目 Worktree",
            "主任务复核提交、测试证据和风险后负责整合",
        ),
        AGENT_POLICY: (
            "decision_mode: reuse_then_infer_then_ask",
            "推荐预设",
            "持久启用本身不能触发并行步骤",
            "日常开发直接实施",
            "显式构建必须为当前构建解析一次 E2E 选择",
            "选择只对当前构建有效",
            "构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "milestone_e2e` 只提供建议默认值",
            "## 左侧 Task 与独立 Worktree",
            "一个左侧 Task = 一个明确且可独立验收的目标",
            "最新本地 `main` HEAD",
            "Codex 管理 Worktree 默认可能处于 detached HEAD",
            "`codex/<task-slug>`",
            "必须阅读的项目文档：",
            "`git status --porcelain=v1 --untracked-files=all`",
            "不要自行合并 `main`",
            "主任务才移除对应 Worktree",
        ),
        SKILLS_ROOT / "desktop-plan-change" / "SKILL.md": (
            "只在持久计划能解决真实协调问题时建立 Todo",
            "多步骤、多模块、中等风险、可并行或 Agent 偏好本身不构成准入",
            "日常开发直接交给 `$desktop-implement-change`",
            "日常计划不得自行增加这些步骤",
            "不得在执行时静默追加全仓检查、构建或验收",
        ),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (
            "直接实现用户请求",
            "只运行第 6 步的测试",
            "日常开发不得自动追加格式化、lint、静态",
            "普通构建也只新增全量非空单元测试和实际构建",
            "构建请求、执行和结果本身不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "只更新被独立事件触发的记忆",
            "当前说明是左侧 Task 模板",
            "每完成一个逻辑闭环",
            "`git status --porcelain=v1 --untracked-files=all`",
            "不自行合并 `main`",
        ),
        PARALLEL_SKILL / "SKILL.md": (
            "只有用户在当前请求中明确要求并行 Subagent/Worktree",
            "日常开发不得仅因持久策略启用而自动增加并行步骤",
            "不重叠所有权",
            "同步等待每个必需结果",
            "绝不得自动暂存或自动提交用户修改",
            "不得因并行本身追加格式、lint、静态、构建、冒烟、E2E 或完整验收",
            "辅助脚本会保留分支",
            "只管理单个左侧 Task 内部",
            "不得把两个左侧 Task 安排进同一 Worktree",
            "`codex/<task>/<unit>`",
        ),
        SKILLS_ROOT / "desktop-initialize-rust-project" / "SKILL.md": (
            "还必须保留 `docs/AGENT_POLICY.md` 中左侧 Task",
            "统一描述模板",
        ),
        INSTANTIATE_SKILL: (
            "必须完整保留 `docs/AGENT_POLICY.md` 的左侧 Task 描述模板",
            "一项目标 + 独立 Worktree",
        ),
        SKILLS_ROOT / "desktop-configure-git-commits" / "SKILL.md": (
            "references/commit-convention.md", "commit.template", "commit.cleanup=strip", "commit.verbose=true",
            "core.commentChar=#", "git config --local", "install --replace", "用户没有要求创建提交时",
        ),
        PRODUCT_SPEC: (
            "HARNESS-FEAT-INDEPENDENT-TASK-WORKTREE-DELIVERY",
            "一个左侧 Task 固定对应一个明确且可独立验收的目标",
            "主任务复核提交、测试证据、文档和风险后整合到 `main`",
        ),
        PARALLEL_WORKTREE_SCRIPT: (
            '"rev-parse", "--show-toplevel"',
            'f"codex/{safe_task}/{safe_unit}"',
            "base_worktree_dirty",
            "worktree_path_exists",
            "worktree_branch_mismatch",
            "worktree_dirty",
            "branch_not_integrated",
            '"worktree", "remove"',
        ),
        PARALLEL_WORKTREE_TESTS: (
            "test_create_and_remove_integrated_clean_worktree",
            "test_create_rejects_dirty_base_including_untracked_files",
            "test_create_rejects_unsafe_identifier_and_existing_path",
            "test_remove_rejects_dirty_or_unintegrated_worktree",
        ),
        SKILLS_ROOT / "desktop-rename-project-identity" / "SKILL.md": (
            "实例化身份重置",
            "现有产品改名",
            "必须先通过 `$desktop-define-product` 确认范围",
            "不自动创建 Work Plan、候选或完整验收步骤",
            "只有用户显式请求构建时才进入对应构建 Skill",
        ),
        VERIFY_DELIVERY_SKILL: (
            "当前构建已明确选择 E2E `enabled`",
            "没有 Work Plan 不阻断验收",
            "当前构建已经运行项目全部非空单元测试",
            "milestone_e2e` 仅用于当时询问的建议默认值",
            "立即返回 `$desktop-implement-change`",
        ),
        E2E_SKILL: (
            "当前构建选择为 `enabled`",
            "milestone_e2e` 不能替代当前构建选择",
            "完整真实最终产物",
            "没有 Work Plan 不阻断 E2E",
            "返回 `$desktop-implement-change` 增加回归测试",
        ),
        BUILD_RELEASE_SKILL: (
            "本次请求已明确 `enabled`/`disabled` 时直接复用",
            "否则在任何测试或编译前询问用户一次",
            "只强制运行项目全部非空单元测试",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁",
            "不得因显式构建、缺少/过期环境证据",
            "并重试原失败命令一次",
            "e2eSelection",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "最终字节和清单形成后立即交给 `$desktop-verify-delivery`",
        ),
        TAURI_RELEASE_SKILL: (
            "本次请求已明确 `enabled`/`disabled` 时直接复用",
            "否则在任何测试或编译前询问用户一次",
            "打包前只先运行项目全部非空单元测试",
            "cargo test --workspace --all-targets --all-features --locked",
            "前端必须运行 `package.json` 与锁文件实际声明的完整单元测试套件",
            "不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁",
            "初始化后的构建不做例行环境预检",
            "只有某条命令已经失败",
            "并重试原命令一次",
            "e2eSelection",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "最终字节形成后立即交给 `$desktop-verify-delivery`",
        ),
        CROSS_PLATFORM_RELEASE_SKILL: (
            "e2e_selection",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得自动追加格式、lint 或其他开发门禁",
            "e2eSelection",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "矩阵本身不得运行 E2E",
        ),
        COLLECT_RELEASE_SKILL: (
            "e2eSelection",
            "不重新构建、签名、执行或发布候选",
            "收集过程绝不得自行启动冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        PREPARE_RELEASE_SKILL: (
            "候选清单中的 `e2eSelection`",
            "不得在此运行任一测试",
            "绝不得在发布准备中运行冒烟/E2E",
        ),
        ENGINEERING_RULES: (
            "### 5.3 开发、构建与完整验收",
            "日常开发统一直接实施，只运行本次变更需要的相关非空单元/回归测试",
            "显式构建在任何测试或编译前解析当前构建的 E2E 选择",
            "构建必须运行项目全部非空单元测试",
            "manifest 和最终回复是普通构建的记录出口",
            "不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "自动增加 Work Plan、全仓测试、格式化、代码规范、静态、集成/契约、构建、冒烟、E2E、Verification 或人工复核",
            "普通构建不为它增加独立步骤",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "## 构建、完整验收与发布顺序",
            "当前请求未明确时询问一次",
            "必须运行项目全部非空单元测试",
            "当前 `e2eSelection`",
            "E2E 选择只对当前构建有效",
            "普通构建只把这些事实写入当前 `release/` manifest、其声明的相邻制品证据和最终回复",
            "不得把构建日志复制到项目记忆",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "用户显式请求构建时逐次解析 E2E 选择",
            "只追加全量非空单元测试和实际构建",
            "不自动追加格式、lint、静态或其他开发门禁",
            "构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        ROOT / "docs" / "VERIFICATION.md": (
            "构建请求、执行和结果本身不创建或更新本索引及 `docs/verification/` 证据分卷",
            "只有独立触发的 E2E、完整验收、发布、人工复核或长期审计才按本文件留证",
        ),
        UPGRADE_SKILL / "SKILL.md": (
            "不自动创建 Work Plan、Todo、并行 Worktree/Subagent 或完整验收步骤",
            "只有用户明确要求并行",
            "只运行本次升级实际影响的非空单元/回归测试",
            "不得因 Harness 升级自动追加全仓格式、lint、静态",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": (
            "只接受两类触发",
            "不得仅因首次修改代码、新任务、新会话、显式构建",
            "门禁成功后只重试原失败命令一次",
            "缺少环境证据或工具链版本可能变化而增加探测",
        ),
        UPGRADE_POLICY: (
            "managed",
            "managed-self",
            "merge-sections",
            "conditional",
            "protected",
            "tombstone",
        ),
    }
    helper_text = ""
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing streamlined workflow contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        if path == PARALLEL_WORKTREE_SCRIPT:
            helper_text = text
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"streamlined workflow rule missing in {display_path(path)}: {fragment}",
                )

    current_rule_files = (
        ROOT / "README.md",
        ROOT / "AGENTS.md",
        AGENT_POLICY,
        ENGINEERING_RULES,
        PRODUCT_SPEC,
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md",
        ROOT / "docs" / "RELEASE.md",
        ROOT / "docs" / "VERIFICATION.md",
        ROOT / "docs" / "work_plan" / "README.md",
        *(ROOT / "docs" / "harness_engineering" / name for name in (
            "foundations.md",
            "agent_first_design.md",
            "project_lifecycle.md",
        )),
        *(path / "SKILL.md" for path in sorted(SKILLS_ROOT.iterdir()) if path.is_dir()),
    )
    forbidden_tier_fragments = (
        "每项任务使用一种路径",
        "快速路径",
        "标准路径",
        "里程碑路径",
        "当前任务路径",
        "推荐敏捷预设",
    )
    for path in current_rule_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in forbidden_tier_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"obsolete tiered workflow remains in {display_path(path)}: {fragment}",
                )

    forbidden_helper_fragments = (
        "git stash",
        "git commit",
        "--force",
        '"branch", "-D"',
    )
    for fragment in forbidden_helper_fragments:
        if fragment in helper_text:
            fail(errors, f"unsafe parallel helper behavior present: {fragment}")

def validate_version_contract(errors: list[str]) -> None:
    """使用 facade 当前 VERSION_FILE，保留测试和调用方的注入边界。"""

    _validate_version_contract(errors, VERSION_FILE)  # noqa: F405
