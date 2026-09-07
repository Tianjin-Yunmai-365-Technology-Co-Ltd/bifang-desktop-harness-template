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


AGENTS_ENTRYPOINT = ROOT / "AGENTS.md"
AGENTS_MAX_UTF8_BYTES = 20_000
AGENTS_MAX_LINES = 120
AGENTS_REQUIRED_HEADINGS = (
    "## 项目使命",
    "## 启动门禁",
    "## 按任务渐进读取",
    "## 始终生效的边界",
    "## Skills 地图",
    "## 约束地图",
    "## 每次任务的最小闭环",
)
AGENTS_PROGRESSIVE_DISCLOSURE_FRAGMENTS = (
    "先判定任务类型",
    "只读取下表命中的事实来源和 Skill",
    "发现冲突或缺失时才扩大读取",
    "不要为了“完整”加载全部项目记忆、设计标准、发布规则或 Skills",
    "不得一次加载全部 GUI Skills",
    "命中后必须完整读取对应 `SKILL.md`",
)
AGENTS_SOURCE_GATE_FRAGMENTS = (
    "Harness 源范围门禁",
    "只接受 Harness 自身工程维护",
    "产品目的、业务功能、产品专属 UI/文案/数据",
    "一律不得在当前模板源中接收、分析、记录或实施",
    "切换到已存在终端下游的唯一根目录后重新提出",
)
AGENTS_ALWAYS_ON_BOUNDARY_FRAGMENTS = (
    "`superpowers: disabled`",
    "安全/隐私、数据迁移、破坏性操作",
    "规格不明确且不同答案会改变产品边界时停止并确认",
    "Core-first 是硬规则",
    "对产出物声称“完成”“可用”或“已验证”",
    "不覆盖或撤销用户已有修改",
)
AGENTS_MINIMUM_CLOSURE_FRAGMENTS = (
    "只读取路由命中的最少事实与 Skills",
    "只运行本次变化需要的测试或最小替代检查",
    "只更新被独立事件触发的权威记录",
    "实际验证、未执行项和剩余风险",
    "python3 -B scripts/validate_harness.py",
)


def validate_agents_entrypoint(
    errors: list[str],
    path: Path = AGENTS_ENTRYPOINT,
) -> None:
    """校验根 Agent 入口保持轻量，并以渐进披露路由到详细事实源。"""

    try:
        payload = path.read_bytes()
    except OSError as exc:
        fail(errors, f"cannot read AGENTS entrypoint {display_path(path)}: {exc}")
        return
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        fail(errors, f"AGENTS entrypoint must be UTF-8: {display_path(path)}: {exc}")
        return

    if len(payload) > AGENTS_MAX_UTF8_BYTES:
        fail(
            errors,
            "AGENTS entrypoint exceeds UTF-8 byte budget: "
            f"{display_path(path)} has {len(payload)} bytes, limit {AGENTS_MAX_UTF8_BYTES}",
        )
    line_count = len(text.splitlines())
    if line_count > AGENTS_MAX_LINES:
        fail(
            errors,
            "AGENTS entrypoint exceeds line budget: "
            f"{display_path(path)} has {line_count} lines, limit {AGENTS_MAX_LINES}",
        )
    if not text.startswith(("# AGENTS.md\n", "# AGENTS.md\r\n")):
        fail(errors, f"AGENTS entrypoint must start with '# AGENTS.md': {display_path(path)}")

    heading_positions: list[int] = []
    for heading in AGENTS_REQUIRED_HEADINGS:
        occurrences = text.count(heading)
        if occurrences != 1:
            fail(
                errors,
                f"AGENTS entrypoint heading must appear exactly once in {display_path(path)}: "
                f"{heading} (observed {occurrences})",
            )
            continue
        heading_positions.append(text.index(heading))
    if len(heading_positions) == len(AGENTS_REQUIRED_HEADINGS) and heading_positions != sorted(
        heading_positions
    ):
        fail(errors, f"AGENTS entrypoint headings are out of order: {display_path(path)}")

    required_fragments = (
        *AGENTS_PROGRESSIVE_DISCLOSURE_FRAGMENTS,
        *AGENTS_SOURCE_GATE_FRAGMENTS,
        *AGENTS_ALWAYS_ON_BOUNDARY_FRAGMENTS,
        *AGENTS_MINIMUM_CLOSURE_FRAGMENTS,
        "项目 Skills 位于 `.agents/skills/`",
        "| 约束或事实 | 唯一来源 | 何时读取 |",
        "$desktop-upgrade-harness",
        "$desktop-manage-version",
        ".harness/version-state.json",
    )
    for fragment in required_fragments:
        if fragment not in text:
            fail(
                errors,
                f"AGENTS progressive-disclosure contract missing in {display_path(path)}: {fragment}",
            )


def validate_engineering_contract(errors: list[str]) -> None:
    """确认工程规则唯一来源、关键入口和执行型 Skills 已建立确定性引用。"""
    validate_agents_entrypoint(errors)
    required_fragments = {
        ENGINEERING_RULES: (
            "当前规范根同时包含 Harness 专用 `Version.md`",
            "只接受 Harness 自身工程维护",
            "只能拒绝并要求用户在初始化完成、切换到唯一终端下游根目录后重新提出",
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
            "`candidate-1`、`candidate-2`、`candidate-3`",
            "用户选择前不得验证格式、尺寸、色彩、像素、摘要或质量",
            "用户明确选择后只验证和按需标准化所选项",
            "完整表单确认后、首次写入前检查，缺失时受管安装、可证明低于最低下界时受管升级",
            "已有有效身份保持，缺失字段只在独立目标仓库 local 作用域补齐",
            "明确发布请求授权复核并本地提交",
        ),
        ROOT / "README.md": (
            "docs/ENGINEERING_RULES.md",
            "## AI Agent 快速入口",
            ".agents/skills/desktop-instantiate-project/SKILL.md",
            ".agents/skills/desktop-instantiate-project/references/initialization-form.md",
            "用户确认完整汇总前保持零写入",
            "不要复制源 `.git`",
            "切换到该目录，再用 `$desktop-define-product`",
            "## 当前模板仓库的请求边界",
            "只接受两类信息",
            "必须在完成实例化并切换到唯一终端下游根目录后重新提出",
            "缺失时按当前平台的受管方式安装",
            "不修改全局 Git 设置",
            "`candidate-1` → `candidate-2` → `candidate-3`",
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
            "显式发布候选构建必须为当前候选解析一次 E2E 选择",
            "GUI 发布性能选择刻意不进入本文件，每次发布重新解析",
            "每次 GUI 发布开始前解析当次 `performanceSelection: enabled | disabled`",
            "产品/渠道要求时执行完整门禁",
        ),
        PRODUCT_SPEC: (
            "docs/ENGINEERING_RULES.md",
            "HARNESS-FEAT-HARNESS-SOURCE-SCOPE-GATE",
            "HARNESS-FEAT-INITIALIZATION-GIT-BOOTSTRAP-RELEASE-AUTOCOMMIT",
            "HARNESS-FEAT-GUI-NOTIFICATION-AUTOSTART-CAPABILITIES",
            "HARNESS-FEAT-GUI-RELEASE-PERFORMANCE-GATE",
            "HARNESS-CHANGE-GUI-RELEASE-PERFORMANCE-BUDGET-V2",
            "`gui-release-v2` 预算",
            "HARNESS-FEAT-RUST-1-95-LATEST-STABLE-SELECTION",
            "HARNESS-FEAT-DEFERRED-LOGO-VALIDATION-STABLE-PREVIEW",
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
            "close_last_window_exits_application",
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
        ROOT / "README.md": (
            "日常开发直接使用 `$desktop-implement-change`",
            "只增加并运行本次变更需要的单元/回归测试",
            "不自动增加计划、全仓检查、构建、冒烟、发布候选 E2E 或验收步骤",
            "显式“发布候选”构建时，构建 Skill 只读校验并把同一日志打入候选，再解析本次是否启用 E2E",
            "运行项目全部非空单元测试并构建",
            "普通 Windows 本地安装试包是开发制品",
            "不要求发布日志或 clean HEAD",
            "构建事实只写入适用的产物位置和最终回复",
            "不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆",
            "只有在用户明确要求并行",
            "## 开始一个左侧 Task",
            "用 `list_projects` 按完整路径锁定保存项目",
            "精确 `projectId`",
            "只返回 `clientThreadId` 时表示请求已接受但仍在 setup",
            "不假设存在转换接口、不无限等待，也不重复创建",
            "相同 Git common dir",
            "`codex/task-*`",
            "`codex/unit-*`",
            "生命周期阶段变化就拆 Task",
            "只拿到 `clientThreadId` 时无限等待",
            "把实时状态写进固定标题",
        ),
        AGENT_POLICY: (
            "decision_mode: reuse_then_infer_then_ask",
            "推荐预设",
            "持久启用本身不能触发并行步骤",
            "日常开发直接实施",
            "显式发布候选构建必须为当前候选解析一次 E2E 选择",
            "E2E 选择只对当前发布候选有效",
            "本地开发试包不消费 E2E/性能选择",
            "构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "milestone_e2e` 只提供建议默认值",
            "GUI 发布性能选择刻意不进入本文件，每次发布重新解析",
            "每次 GUI 发布开始前解析当次 `performanceSelection: enabled | disabled`",
            "选择 `disabled` 且没有硬要求时跳过探针",
            "## 左侧 Task、项目绑定与独立 Worktree",
            "user-owned Task/thread",
            "不得只因生命周期阶段变化自动拆 Task",
            "普通单结果请求不先创建所谓 Task0",
            "按规范化完整路径精确选中保存项目",
            "target.type = project",
            "SETUP_PENDING",
            "不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建",
            "用户随后明确要求检查先前 queued Task",
            "git rev-parse --path-format=absolute --git-common-dir",
            "git worktree list --porcelain",
            "不硬编码 `main` 或 `master`",
            "Codex 管理 Worktree 默认可能处于 detached HEAD",
            "`codex/task-<task-slug>`",
            "Task 绑定：",
            "必须阅读的项目文档：",
            "`git status --porcelain=v1 --untracked-files=all`",
            "不要自行合并默认/集成分支",
            "协调方才移除对应 Worktree",
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
            "当前说明来自左侧 Task 模板",
            "保存项目完整路径、`projectId`、repository identity、起始分支和起始提交",
            "git rev-parse --path-format=absolute --git-common-dir",
            "git worktree list --porcelain",
            "`codex/task-*`",
            "不退化到 Local 主目录、其他 Task 或内部 Subagent 继续实施",
            "每完成一个逻辑闭环",
            "`git status --porcelain=v1 --untracked-files=all`",
            "不自行合并默认/集成分支",
        ),
        PARALLEL_SKILL / "SKILL.md": (
            "只有用户在当前请求中明确要求并行 Subagent/Worktree",
            "日常开发不得仅因持久策略启用而自动增加并行步骤",
            "它不调用 `create_thread`，不创建新的左侧 Task",
            "保存项目根和当前 Task source Worktree",
            "相同规范化 Git common-dir",
            "`codex/task-<task>`",
            "`codex/unit-<task>-<unit>`",
            "非空 repo-relative 写入所有权",
            "--source-worktree",
            "--write-target",
            "postflight",
            "committed 路径",
            "staged、unstaged、untracked 和 rename",
            "让每个单元分支成为 source 分支的祖先",
            "squash/cherry-pick 不满足 helper 的可证明清理条件",
            "同步等待每个必需结果",
            "绝不得自动暂存、贮藏或提交用户修改",
            "不得因并行本身追加格式、lint、静态、构建、冒烟、E2E 或完整验收",
            "helper 删除状态登记但保留单元分支",
            "只管理单个左侧 user-owned Task 内部",
            "不得把两个左侧 Task 安排进同一 Worktree",
        ),
        SKILLS_ROOT / "desktop-initialize-rust-project" / "SKILL.md": (
            "还必须保留 `docs/AGENT_POLICY.md` 中左侧 Task",
            "统一描述模板",
        ),
        INSTANTIATE_SKILL: (
            "必须完整保留 `docs/AGENT_POLICY.md` 的左侧 Task 描述模板",
            "精确保存项目/`projectId`",
            "`SETUP_PENDING` 有界返回",
            "`codex/task-*`",
            "`codex/unit-*`",
        ),
        SKILLS_ROOT / "desktop-configure-git-commits" / "SKILL.md": (
            "references/commit-convention.md", "commit.template", "commit.cleanup=strip", "commit.verbose=true",
            "core.commentChar=#", "git config --local", "install --replace", "用户没有要求创建提交时",
            "下一步将实际运行 `git commit`",
            "不得运行本 Skill 的脚本或改写任何 Git 配置",
            "不得在初始化表单、复制、身份改写、环境门禁、脚手架编写或测试阶段提前运行",
        ),
        PRODUCT_SPEC: (
            "HARNESS-FEAT-INDEPENDENT-TASK-WORKTREE-DELIVERY",
            "HARNESS-FIX-PROJECT-BOUND-TASK-AND-SUBAGENT-WORKTREE",
            "HARNESS-FEAT-HARNESS-SOURCE-SCOPE-GATE",
            "HARNESS-FEAT-INITIALIZATION-GIT-BOOTSTRAP-RELEASE-AUTOCOMMIT",
            "HARNESS-FEAT-DEFERRED-LOGO-VALIDATION-STABLE-PREVIEW",
            "一个左侧 Task 固定对应一个明确且可独立验收的结果",
            "`clientThreadId` 表示请求已接受但仍 `SETUP_PENDING`",
            "相同规范化 Git common dir",
            "`codex/task-<task-slug>`",
            "`codex/unit-<task>-<unit>`",
            "postflight",
        ),
        PARALLEL_WORKTREE_SCRIPT: (
            '"rev-parse", "--show-toplevel"',
            "project_root_not_primary_worktree",
            "source_worktree_not_independent",
            "source_repository_mismatch",
            'f"codex/task-{task}"',
            'f"codex/unit-{safe_task}-{safe_unit}"',
            "source_worktree_dirty",
            "ownership_overlap_across_units",
            "actual_change_outside_ownership",
            "integration_ref_mismatch",
            "worktree_path_exists",
            "worktree_branch_mismatch",
            "worktree_dirty",
            "branch_not_integrated",
            'command.add_argument("--source-worktree", required=True)',
            'commands.add_parser(name)',
            'for name in ("inspect", "create", "guard", "verify", "remove")',
            "def remove_unit",
        ),
        PARALLEL_WORKTREE_TESTS: (
            "test_create_from_task_branch_avoids_parent_child_ref_collision_and_removes",
            "test_create_rejects_dirty_source_including_untracked_files",
            "test_create_requires_primary_project_and_exact_source_cwd",
            "test_create_rejects_source_from_another_repository",
            "test_create_rejects_symlinked_external_worktree_container",
            "test_create_requires_safe_non_root_ownership",
            "test_create_rejects_overlapping_ownership_within_and_across_units",
            "test_guard_accepts_registered_subpath_and_rejects_unregistered_target",
            "test_verify_rejects_committed_untracked_and_renamed_escape",
            "test_remove_rejects_self_reference_dirty_and_unintegrated_unit",
            "test_remove_runs_postflight_before_clean_integrated_cleanup",
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
            "按每个 GUI manifest 的 `performanceSelection` 条件复核性能",
            "`disabled`：只有不存在产品/渠道性能硬要求时才接受 `performanceStatus: Not run`",
            "performanceReason",
            "performanceRemainingRisk",
            "立即返回 `$desktop-implement-change`",
        ),
        E2E_SKILL: (
            "当前构建选择为 `enabled`",
            "milestone_e2e` 不能替代当前构建选择",
            "完整真实最终产物",
            "没有 Work Plan 不阻断 E2E",
            "GUI 性能按 manifest 的当次 `performanceSelection` 独立处理",
            "选择 `disabled` 且无硬要求时",
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
            "当次 `performanceSelection: enabled | disabled`",
            "产品/渠道硬要求强制为 `enabled` 并记录来源",
            "否则在任何测试或编译前询问用户一次，可与尚未解析的 E2E 选择同轮询问",
            "打包前只先运行项目全部非空单元测试",
            "cargo test --workspace --all-targets --all-features --locked",
            "前端必须运行 `package.json` 与锁文件实际声明的完整单元测试套件",
            "不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁",
            "初始化后的构建不做例行环境预检",
            "只有某条命令已经失败",
            "并重试原命令一次",
            "e2eSelection",
            "选择 `performanceSelection: disabled` 且无产品/渠道硬要求时",
            "performanceStatus: Not run",
            "performanceReason",
            "performanceRemainingRisk",
            "性能选择为 `enabled` 时 `performanceStatus` 为 `Unverified`",
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
            "GUI manifest 中的当次 `performanceSelection`",
            "选择为 `disabled` 且无产品/渠道硬要求时允许 `performanceStatus: Not run`",
            "performanceReason",
            "performanceRemainingRisk",
            "不重新构建、签名、执行或发布候选",
            "收集过程绝不得自行启动冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        PREPARE_RELEASE_SKILL: (
            "候选清单中的 `e2eSelection`",
            "在任何本地提交或发布元数据写入前解析当次 `performanceSelection: enabled | disabled`",
            "产品/渠道硬要求强制启用并记录来源",
            "新发布重新询问",
            "不得在此运行任一测试",
            "绝不得在发布准备中运行冒烟/E2E",
        ),
        ENGINEERING_RULES: (
            "### 5.3 开发、构建与完整验收",
            "日常开发统一直接实施，只运行本次变更需要的相关非空单元/回归测试",
            "显式发布候选构建在任何测试或编译前解析当前候选的 E2E 选择",
            "GUI 正式发布在任何测试或编译前解析当次 `performanceSelection: enabled | disabled`",
            "选择 `disabled` 且无硬要求时跳过探针",
            "构建必须运行项目全部非空单元测试",
            "manifest 和最终回复是发布候选构建的记录出口",
            "本地开发试包只报告实际产物路径和风险",
            "不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "自动增加 Work Plan、全仓测试、格式化、代码规范、静态、集成/契约、构建、冒烟、E2E、Verification 或人工复核",
            "普通构建不为它增加独立步骤",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "## 构建、完整验收与发布顺序",
            "当前请求未明确时询问一次",
            "必须运行项目全部非空单元测试",
            "当前 `e2eSelection`",
            "E2E 选择只对当前发布候选有效",
            "GUI 性能选择也只对当前发布有效且没有持久默认值",
            "产品/渠道硬要求优先并强制启用",
            "选择 `disabled` 且无硬要求时不生成探针",
            "发布候选构建只把这些事实写入当前 `release/` manifest、其声明的相邻制品证据和最终回复",
            "本地开发试包只写最终回复，不创建 manifest",
            "不得把构建日志复制到项目记忆",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "用户显式请求发布候选构建时逐次解析 E2E 选择",
            "Windows 本地开发试包不解析 E2E/性能选择",
            "只追加全量非空单元测试和实际构建",
            "不自动追加格式、lint、静态或其他开发门禁",
            "构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        ROOT / "docs" / "VERIFICATION.md": (
            "构建请求、执行和结果本身不创建或更新本索引及 `docs/verification/` 证据分卷",
            "只有独立触发的 E2E、完整验收、发布、人工复核或长期审计才按本文件留证",
            "GUI 发布性能是逐次选择",
            "选择 `disabled` 且无硬要求时允许 `performanceStatus: Not run`",
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
