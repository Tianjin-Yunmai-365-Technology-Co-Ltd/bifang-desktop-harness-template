"""Harness 入口、策略和 Work Plan 治理回归。"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from collections.abc import Iterator
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import scripts.validate_harness as validate_harness
from scripts.harness_validation import governance, initialization, repository, upgrade
from scripts.harness_validation.gui_support import validate_gui_support_contract
from scripts.harness_validation.initialization_primary_contract import (
    primary_required_fragments,
)
from scripts.harness_validation.initialization_repository_contract import (
    repository_required_fragments,
)
from scripts.harness_validation.context import (
    BRANCH_CHAIN_EMPTY_STATE,
    BRANCH_CHAIN_CHECKS,
    BRANCH_CHAIN_COMMIT,
    BRANCH_CHAIN_CONTRACT_TESTS,
    BRANCH_CHAIN_GIT,
    BRANCH_CHAIN_METADATA,
    BRANCH_CHAIN_OPERATIONS,
    BRANCH_CHAIN_RACE_TESTS,
    BRANCH_CHAIN_REMOTE,
    BRANCH_CHAIN_SCRIPT,
    BRANCH_CHAIN_SKILL,
    BRANCH_CHAIN_STATE,
    BRANCH_CHAIN_TESTS,
    BRANCH_CHAIN_VERSION_TESTS,
    EXPECTED_SKILLS,
    GUI_DIALOG_SKILL,
    GUI_GLOBAL_SHORTCUT_BINDING_CONTRACT,
    GUI_GLOBAL_SHORTCUT_CONTRACT_FIXTURE,
    GUI_GLOBAL_SHORTCUT_CONTRACT_TEST_CASES,
    GUI_GLOBAL_SHORTCUT_RUNTIME_CONTRACT_CHECKER,
    GUI_GLOBAL_SHORTCUT_SKILL,
    GUI_INITIALIZATION_E2E_SKILL,
    GUI_LIFECYCLE_CONTRACT_TESTS,
    GUI_LIFECYCLE_PLUGIN_CONTRACT_CHECKER,
    GUI_LIFECYCLE_PLUGIN_CONTRACT_TESTS,
    GUI_SKILL,
    GUI_SUPPORT_SKILL,
    PRODUCT_SPEC,
    REQUIRED_FILES,
)
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


class ValidateHarnessEntrypointTests(unittest.TestCase):
    """覆盖单一命令入口、当前接口集合与已淘汰治理语义。"""

    @staticmethod
    def _validate_agents_entrypoint(contents: str) -> list[str]:
        """在临时根入口上运行轻量路由门禁。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "AGENTS.md"
            path.write_text(contents, encoding="utf-8")
            errors: list[str] = []
            governance.validate_agents_entrypoint(errors, path)
        return errors

    def test_agents_entrypoint_is_progressive_and_within_budget(self) -> None:
        """仓库根入口必须同时满足预算、永久章节和渐进读取语义。"""

        errors: list[str] = []
        governance.validate_agents_entrypoint(errors)
        self.assertEqual(errors, [])

    def test_agents_entrypoint_rejects_utf8_byte_budget_regression(self) -> None:
        """即使行数不增长，UTF-8 内容超预算也必须阻断。"""

        source = read_repo_text("AGENTS.md")
        padding_bytes = governance.AGENTS_MAX_UTF8_BYTES - len(source.encode("utf-8")) + 1
        errors = self._validate_agents_entrypoint(source + ("x" * padding_bytes))
        self.assertTrue(any("UTF-8 byte budget" in error for error in errors), errors)

    def test_agents_entrypoint_rejects_line_budget_regression(self) -> None:
        """通过堆叠短行规避字节预算时仍必须阻断。"""

        source = read_repo_text("AGENTS.md").rstrip("\n")
        extra_count = governance.AGENTS_MAX_LINES + 1 - len(source.splitlines())
        extra_lines = "\n".join(f"extra-{index}" for index in range(extra_count))
        errors = self._validate_agents_entrypoint(f"{source}\n{extra_lines}\n")
        self.assertTrue(any("line budget" in error for error in errors), errors)

    def test_agents_entrypoint_rejects_missing_progressive_semantics(self) -> None:
        """根入口不能只保留章节标题而丢失按需扩读语义。"""

        source = read_repo_text("AGENTS.md")
        required = governance.AGENTS_PROGRESSIVE_DISCLOSURE_FRAGMENTS[2]
        self.assertIn(required, source)
        errors = self._validate_agents_entrypoint(source.replace(required, "", 1))
        self.assertTrue(any(required in error for error in errors), errors)

    def test_agents_entrypoint_rejects_missing_always_on_boundary(self) -> None:
        """渐进加载不能裁掉分类前必须生效的跨任务安全摘要。"""

        source = read_repo_text("AGENTS.md")
        required = governance.AGENTS_ALWAYS_ON_BOUNDARY_FRAGMENTS[3]
        self.assertIn(required, source)
        errors = self._validate_agents_entrypoint(source.replace(required, "", 1))
        self.assertTrue(any(required in error for error in errors), errors)

    def test_agents_entrypoint_rejects_missing_permanent_section(self) -> None:
        """Skills、约束与最小闭环等永久路由章节不得被裁掉。"""

        source = read_repo_text("AGENTS.md")
        heading = "## Skills 地图"
        self.assertIn(heading, source)
        errors = self._validate_agents_entrypoint(source.replace(heading, "## Skills", 1))
        self.assertTrue(any(heading in error for error in errors), errors)

    def test_scoped_initialization_entrypoints_succeed(self) -> None:
        """初始化与 GUI 支持范围内的校验器应在当前仓库上通过。"""

        errors: list[str] = []
        initialization.validate_initialization_contract(errors)
        validate_gui_support_contract(errors)
        self.assertEqual(errors, [])

    def test_branch_chain_skill_is_a_complete_required_harness_capability(self) -> None:
        """入口、初始化契约和必需文件清单必须同步纳入完整 Skill。"""

        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        required = primary_required_fragments(initialize_skill)
        expected_paths = (
            BRANCH_CHAIN_SKILL,
            BRANCH_CHAIN_METADATA,
            BRANCH_CHAIN_EMPTY_STATE,
            BRANCH_CHAIN_SCRIPT,
            BRANCH_CHAIN_OPERATIONS,
            BRANCH_CHAIN_COMMIT,
            BRANCH_CHAIN_CHECKS,
            BRANCH_CHAIN_GIT,
            BRANCH_CHAIN_REMOTE,
            BRANCH_CHAIN_STATE,
            BRANCH_CHAIN_TESTS,
            BRANCH_CHAIN_CONTRACT_TESTS,
            BRANCH_CHAIN_RACE_TESTS,
            BRANCH_CHAIN_VERSION_TESTS,
        )

        self.assertIn("desktop-manage-git-branch-chain", EXPECTED_SKILLS)
        for path in expected_paths:
            relative = path.relative_to(ROOT).as_posix()
            self.assertIn(relative, REQUIRED_FILES)
            self.assertIn(path, required)
        self.assertIn("不创建 Codex 左侧 Task", required[BRANCH_CHAIN_SKILL])
        self.assertIn("git push --atomic", required[BRANCH_CHAIN_SKILL])
        self.assertIn("--force-with-lease", required[BRANCH_CHAIN_SKILL])

    def test_governance_rejects_branch_chain_default_branch_write_regression(self) -> None:
        """Skill 不能移除发布事务直达默认分支的唯一受限写入边界。"""

        source = BRANCH_CHAIN_SKILL.read_text(encoding="utf-8")
        anchor = "默认分支更新只能是发布事务内基于冻结旧 OID 的严格 fast-forward"
        mutated = source.replace(anchor, "普通命令也可以更新默认分支", 1)
        self.assertNotEqual(mutated, source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(mutated, encoding="utf-8")
            errors: list[str] = []
            with mock.patch.object(governance, "BRANCH_CHAIN_SKILL", path):
                governance.validate_streamlined_development_and_build(errors)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_direct_script_entrypoint_succeeds(self) -> None:
        """从仓库根直接执行历史命令时应完成全部领域校验并返回成功。"""

        result = subprocess.run(
            [sys.executable, "scripts/validate_harness.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Harness validation passed:", result.stdout)

    def test_product_spec_uses_current_nine_field_gui_contract(self) -> None:
        """当前 Product Spec 不得恢复已被九字段方案取代的七字段描述。"""

        text = PRODUCT_SPEC.read_text(encoding="utf-8")
        for fragment in (
            "HARNESS-FEAT-GUI-PLUGIN-CAPABILITY-MODULES",
            "八项条件能力的启用/禁用",
            "包含九项最终配置、三项 Rust-only 固定基线、dialog 固定 WebView 基线",
            "`os`（system-locale）、updater、window-state 是不询问的三项 Rust-only 固定基线，dialog 是不询问的固定 WebView 基线",
        ):
            self.assertIn(fragment, text)
        for stale in (
            "选择 GUI 时还包括六项能力",
            "GUI 下游另输出包含七项最终配置",
            "结构检查解析七项 profile",
            "GUI 选择后必须完成七项专门问询",
            "固定通过七项 profile-aware",
        ):
            self.assertNotIn(stale, text)

    def test_gui_settings_version_fragment_matches_skill(self) -> None:
        """GUI 设置页的单个小写 v 版本契约必须与验证器要求一致。"""

        expected = "设置页固定区始终只渲染当前应用名/带一个小写 `v` 的版本"
        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        required = primary_required_fragments(initialize_skill)
        self.assertIn(expected, required[GUI_SKILL])
        self.assertIn(expected, GUI_SKILL.read_text(encoding="utf-8"))

    def test_gui_sidebar_omission_defaults_to_detailed(self) -> None:
        """侧栏未选择时只能由初始化器归一化为详细模式。"""

        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        required = primary_required_fragments(initialize_skill)
        default_fragment = "未选择侧栏模式必须写入 `sidebar_mode = detailed`"
        invalid_fragment = "显式非法值不得按未选择处理"
        self.assertIn(default_fragment, required[initialize_skill])
        self.assertIn(invalid_fragment, required[initialize_skill])
        initialize_text = initialize_skill.read_text(encoding="utf-8")
        self.assertIn(default_fragment, initialize_text)
        self.assertIn(invalid_fragment, initialize_text)
        product_text = PRODUCT_SPEC.read_text(encoding="utf-8")
        self.assertIn(
            "用户未选择侧栏模式时必须写入 `sidebar_mode = detailed`",
            product_text,
        )
        self.assertIn(invalid_fragment, product_text)

    def test_standalone_web_is_removed_while_tauri_stack_remains(self) -> None:
        """独立 WEB Skill 必须消失，GUI 自有基线仍须声明固定前端技术栈。"""
        self.assertFalse((ROOT / ".agents/skills/add-web-adapter").exists())
        baseline = (
            ROOT / ".agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md"
        ).read_text(encoding="utf-8")
        for fragment in (
            "React 和 TypeScript",
            "Mantine UI",
            "@tabler/icons-react",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "pnpm-lock.yaml",
            "WebView",
        ):
            self.assertIn(fragment, baseline)

    def test_gui_initialization_e2e_is_a_required_one_time_contract(self) -> None:
        """GUI 初始化必须按九项配置锁定适用生命周期与界面。"""

        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        required = primary_required_fragments(initialize_skill)
        initialization_fragments = required[initialize_skill]
        e2e_skill = (
            ROOT
            / ".agents/skills/desktop-test-gui-initialization-e2e/SKILL.md"
        )
        lifecycle_checker = (
            ROOT
            / ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.mjs"
        )
        lifecycle_tests = (
            ROOT
            / ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.test.mjs"
        )
        lifecycle_plugin_tests = GUI_LIFECYCLE_PLUGIN_CONTRACT_TESTS
        self.assertIn("$desktop-test-gui-initialization-e2e", initialization_fragments)
        self.assertIn("`gui-initialization-config`", initialization_fragments)
        self.assertIn("$desktop-add-gui-system-locale", initialization_fragments)
        self.assertIn("$desktop-add-gui-updater", initialization_fragments)
        self.assertIn("$desktop-add-gui-window-state", initialization_fragments)
        self.assertIn("$desktop-add-gui-dialog", initialization_fragments)
        self.assertIn("最终九项不得缺失或残留 `pending`", initialization_fragments)
        self.assertIn(
            "`deep_link = enabled` 且 `single_instance != enabled` 是非法组合",
            initialization_fragments,
        )
        self.assertIn(
            "结构检查器先验证唯一九字段、组合约束、四项固定基线和每个独立能力的启用完整/禁用无残留",
            initialization_fragments,
        )
        self.assertIn(e2e_skill, required)
        e2e_text = e2e_skill.read_text(encoding="utf-8")
        self.assertIn(
            "新实例化目标在本 E2E 阶段不得提前 `git init`",
            e2e_text,
        )
        self.assertIn(
            "本 E2E 与裁剪成功后、紧邻唯一基线提交时建立",
            e2e_text,
        )
        self.assertNotIn(
            "当前目录同时是下游项目根和独立 Git 顶层目录",
            e2e_text,
        )
        self.assertIn("未选能力不是缺失证据", required[e2e_skill])
        self.assertIn(
            "固定基线：所有 GUI 都验证 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state` 三项 Rust-only 基线",
            required[e2e_skill],
        )
        self.assertIn("同时验证 `$desktop-add-gui-dialog` 固定 WebView 基线", required[e2e_skill])
        self.assertEqual(
            GUI_DIALOG_SKILL,
            ROOT / ".agents/skills/desktop-add-gui-dialog/SKILL.md",
        )
        self.assertIn("`single_instance: enabled`", required[e2e_skill])
        self.assertIn("`deep_link: enabled`", required[e2e_skill])
        self.assertIn("`global_shortcut: enabled`", required[e2e_skill])
        self.assertIn("`system_tray: enabled`", required[e2e_skill])
        self.assertIn("close_last_window_exits_application", required[e2e_skill])
        self.assertIn("icons/32x32.png", required[e2e_skill])
        self.assertIn("真实非空图形", required[e2e_skill])
        self.assertIn("空白点击区域", required[e2e_skill])
        self.assertIn(
            "有且只有一个 `gui-initialization-config` 围栏代码块",
            required[e2e_skill],
        )
        self.assertIn(lifecycle_checker, required)
        self.assertIn("gui-initialization-config", required[lifecycle_checker])
        self.assertIn('"deep_link"', required[lifecycle_checker])
        self.assertIn('"global_shortcut"', required[lifecycle_checker])
        self.assertIn('"sidebar_mode"', required[lifecycle_checker])
        self.assertIn(
            "初始化器应在用户未选择时写入 detailed",
            required[lifecycle_checker],
        )
        self.assertIn("close_last_window_exits_application", required[lifecycle_checker])
        self.assertIn(
            "GUI 初始化配置 deep_link = enabled 必须同时满足 single_instance = enabled",
            required[lifecycle_checker],
        )
        self.assertIn("validatePluginDependencyContract", required[lifecycle_checker])
        self.assertIn("validatePluginRuntimeContract", required[lifecycle_checker])
        self.assertIn("validateRequiredPluginTests", required[lifecycle_checker])
        self.assertIn("TrayIconBuilder", required[lifecycle_checker])
        self.assertIn("icons/32x32.png", required[lifecycle_checker])
        self.assertIn("inflateSync", required[lifecycle_checker])
        self.assertIn("全部像素透明，无法形成可见托盘图标", required[lifecycle_checker])
        self.assertIn(
            "托盘安装函数必须在同一实现中创建 Menu、绑定 .menu(...)、强制取得 default_window_icon、绑定 .icon(...) 并成功 .build(app)",
            required[lifecycle_checker],
        )
        self.assertIn(
            "未选择系统托盘时必须在 CloseRequested 中显式调用 AppHandle::exit(0)",
            required[lifecycle_checker],
        )
        self.assertIn("process.exitCode = main()", required[lifecycle_checker])
        self.assertIn(lifecycle_tests, required)
        for fragment in (
            "dialog_default_permission_covers_all_dialog_types",
            "dialog_baseline_does_not_grant_filesystem_access",
            "rejects a main capability that appends extra dialog permissions",
            "rejects dialog permissions granted outside the main window",
        ):
            self.assertIn(fragment, required[lifecycle_tests])
        self.assertIn(
            "accepts an explicit no-tray no-single-instance close-on-last-window contract",
            required[lifecycle_tests],
        )
        self.assertIn(
            "rejects a final profile that omits the materialized detailed sidebar default",
            required[lifecycle_tests],
        )
        self.assertIn(
            "rejects close-hide lifecycle code when system tray was not selected",
            required[lifecycle_tests],
        )
        self.assertIn(
            "rejects a GUI that does not register the single-instance plugin first",
            required[lifecycle_tests],
        )
        self.assertIn(
            "rejects a GUI whose runtime no longer creates a tray",
            required[lifecycle_tests],
        )
        for fragment in (
            "rejects a tray implementation that is not wired into Tauri setup",
            "rejects a tray builder that does not attach its menu",
            "rejects optional default icon fallback that can create an iconless tray",
            "rejects a bundle config that omits the 32px tray icon source",
            "rejects an all-transparent 32px tray icon source",
        ):
            self.assertIn(fragment, required[lifecycle_tests])
        self.assertIn(lifecycle_plugin_tests, required)
        for fragment in (
            "dialog_dependencies_are_fixed",
            "dialog_plugin_is_registered_once_in_fixed_order",
            "rejects treating tauri_plugin_os locale as a Result",
            "rejects updater code that can check before the NotConfigured gate",
            "rejects window-state setup that is not wired through the recoverable helper",
            "rejects opening deep-link runtime registration APIs on the neutral restore path",
            "rejects a global shortcut handler that fires on press and release",
            "rejects duplicate notification and autostart plugin registrations",
            "rejects enabled commands omitted from the merged invoke handler",
            "rejects constant-true assertions in fixed plugin tests",
        ):
            self.assertIn(fragment, required[lifecycle_plugin_tests])

    def test_global_shortcut_contract_has_no_harness_default_and_is_requirement_driven(self) -> None:
        """能力启用不得注入 Harness 默认，并按 fixed/可编辑策略验证完整事务。"""

        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        required = primary_required_fragments(initialize_skill)
        common_regressions = (
            "global_shortcut_initial_bindings_match_contract",
            "global_shortcut_registers_only_configured_bindings",
            "global_shortcut_dispatches_pressed_events_to_declared_actions",
            "global_shortcut_reports_real_registration_state",
            "global_shortcut_unregisters_owned_bindings_on_shutdown",
            "global_shortcut_setup_failure_unregisters_owned_bindings",
        )
        configurable_regressions = (
            "shortcut_bindings_require_modifier_and_reject_equivalent_duplicates",
            "global_shortcut_replace_rolls_back_on_registration_failure",
            "global_shortcut_persistence_failure_restores_previous_bindings",
            "global_shortcut_recording_suppresses_dispatch_until_released",
        )

        for path in (
            GUI_GLOBAL_SHORTCUT_SKILL,
            GUI_GLOBAL_SHORTCUT_BINDING_CONTRACT,
            GUI_GLOBAL_SHORTCUT_RUNTIME_CONTRACT_CHECKER,
            GUI_GLOBAL_SHORTCUT_CONTRACT_FIXTURE,
            GUI_GLOBAL_SHORTCUT_CONTRACT_TEST_CASES,
            GUI_LIFECYCLE_CONTRACT_TESTS,
            GUI_LIFECYCLE_PLUGIN_CONTRACT_CHECKER,
        ):
            self.assertIn(path, required)

        for fragment in (
            "中性初始化只建立 Rust-only 宿主能力",
            "`schemaVersion = 1`、`actions = []`",
            "没有产品动作、默认 chord、OS 注册或快捷键界面",
            "`disabled` 时该块、依赖、插件、注册器、命令、配置文件、UI/i18n 与专属测试全部缺席",
            "产品动作使用稳定 ID 映射到编译期登记的宿主动作或单个 core 用例",
            "回调只在 `ShortcutState::Pressed` 分派",
            "配置文本、期望绑定与 OS 实际注册状态分开建模",
            "未绑定使用 `null`/`Option::None`",
            "原子替换/回滚",
            "只注销本模块实际拥有的 chord",
            "空动作 contract 不生成占位界面",
        ):
            self.assertIn(fragment, required[GUI_GLOBAL_SHORTCUT_SKILL])

        for fragment in (
            "全局快捷键启用时还必须有唯一 `gui-global-shortcut-contract`",
            "中性初始化的 `actions` 必须为空；禁用时该块缺席",
            "global-shortcut 只按唯一 contract 注册非空 binding",
            "空 contract 零注册",
            "`user-configurable` 才增加录制、取消和清空",
        ):
            self.assertIn(fragment, required[GUI_SKILL])

        for fragment in (
            "全局快捷键界面只按 contract 的非空固定/可编辑动作生成，空 contract 无占位",
            "全局快捷键只对 contract 非空动作接入逐项真实状态",
            "固定策略只读，可编辑策略使用 Rust 权威 load/save/capture 命令",
            "空 contract 不传 prop 或复制翻译键",
        ):
            self.assertIn(fragment, required[GUI_SUPPORT_SKILL])

        for name in (*common_regressions, *configurable_regressions):
            self.assertIn(name, required[GUI_GLOBAL_SHORTCUT_BINDING_CONTRACT])
            self.assertIn(name, required[GUI_GLOBAL_SHORTCUT_RUNTIME_CONTRACT_CHECKER])

        for fragment in (
            'from "./gui-global-shortcut-runtime-contract.mjs"',
            "GLOBAL_SHORTCUT_TEST_NAMES",
            "USER_CONFIGURABLE_GLOBAL_SHORTCUT_TEST_NAMES",
            "validateGlobalShortcutRuntimeContract(sourceText, profile, errors)",
            "validateGlobalShortcutTestCoverage(testFunctions, profile, errors)",
        ):
            self.assertIn(fragment, required[GUI_LIFECYCLE_PLUGIN_CONTRACT_CHECKER])

        for fragment in (
            "dispatchHelperName",
            "GlobalShortcutAction {",
            "id:",
            "binding_policy:",
            "default_chord:",
            "dispatch_kind:",
            "dispatch_target:",
            "e2e_safe:",
            "renderEmptyRuntime",
            "renderConfiguredRuntime",
            "renderDispatcher",
            "renderDispatchHelpers",
            "app.emit(",
            'map_err(|_| "shortcut-dispatch-failed")',
            '_ => Err("undeclared-shortcut-action")',
        ):
            self.assertIn(fragment, required[GUI_GLOBAL_SHORTCUT_CONTRACT_FIXTURE])
        for obsolete_fragment in ("dispatch_host_action", "dispatch_core_use_case"):
            self.assertNotIn(
                obsolete_fragment,
                required[GUI_GLOBAL_SHORTCUT_CONTRACT_FIXTURE],
            )

        for fragment in (
            "sanitizeRustCode",
            "rustExecutableCode",
            "isShortcutRuntimeIdentifier",
            "invokeHandlerCommands",
            "allowedInitializationCommands",
            "dispatchHelperName",
            "hasDispatchEffect",
            "visited.has(candidate.name)",
            "全局快捷键不得通过通用 target helper 分派",
            "全局快捷键 kind/target 专用 helper 不得是通用 target 非空判断或 Ok/no-op",
            "混合快捷键保存必须逐 ID 校验策略，并在 fixed chord 变化时立即 return Err",
            "混合快捷键保存必须在顶层先取得 fixed-safe validated updates，不得把校验放入死分支",
            "混合快捷键保存只能在 fixed 校验后用 validated updates 替换 owned bindings，不得随后全量 mutate 原请求",
            "空 gui-global-shortcut-contract 不得由任何非测试函数取得 OS shortcut API",
            "空 gui-global-shortcut-contract 只能保留初始化所需的唯一 invoke_handler",
            "空 gui-global-shortcut-contract 的 invoke_handler 不得接入额外命令",
        ):
            self.assertIn(fragment, required[GUI_GLOBAL_SHORTCUT_RUNTIME_CONTRACT_CHECKER])
        for obsolete_fragment in (
            "混合快捷键保存命令必须按 binding_policy 拒绝修改 fixed 动作",
            "空 gui-global-shortcut-contract 不得保留任何 OS register/status/cleanup 路径，即使 chord 来自变量",
        ):
            self.assertNotIn(
                obsolete_fragment,
                required[GUI_GLOBAL_SHORTCUT_RUNTIME_CONTRACT_CHECKER],
            )

        for fragment in (
            "唯一合法 `gui-global-shortcut-contract` JSON 块",
            "可空绑定/逐项真实状态",
            "Pressed-only typed dispatch",
            "注册与持久化原子回滚",
            "录制 token 及 owned 清理",
            "零默认 chord、零 OS 注册、零占位 UI",
        ):
            self.assertIn(fragment, required[GUI_INITIALIZATION_E2E_SKILL])

        main_test_fragments = (
            'from "./gui-global-shortcut-contract.test-cases.mjs"',
            "registerGlobalShortcutContractTests();",
        )
        for fragment in main_test_fragments:
            self.assertIn(fragment, required[GUI_LIFECYCLE_CONTRACT_TESTS])

        moved_test_titles = (
            "accepts an empty global shortcut action contract without a default binding or UI",
            "parses fixed nullable and dotted-target global shortcut actions",
            "rejects an implicit legacy global shortcut default outside the action contract",
            "rejects cross-function shortcut API access for an empty action contract",
            "rejects aliased shortcut commands added to the empty-contract invoke handler",
            "rejects a target-specific dispatcher whose helper chain is a no-op",
            "rejects a dead fixed-action guard in mixed shortcut persistence",
            "rejects raw mixed shortcut updates mutated after fixed validation",
            "rejects WebView storage Jotai and Query as the global shortcut binding authority",
        )
        for fragment in moved_test_titles:
            self.assertIn(fragment, required[GUI_GLOBAL_SHORTCUT_CONTRACT_TEST_CASES])
            self.assertNotIn(fragment, required[GUI_LIFECYCLE_CONTRACT_TESTS])

    def test_rust_technology_standard_is_a_required_contract(self) -> None:
        """Rust 固定与条件技术族必须进入事实源、传播入口与机械门禁。"""

        technology_names = {
            "Tokio",
            "Axum",
            "Tower/Tower HTTP",
            "Clap",
            "SeaORM",
            "config-rs",
            "tracing",
            "tracing-subscriber",
            "tracing-appender",
            "OpenTelemetry",
            "anyhow",
            "thiserror",
            "serde",
            "jiff",
        }
        initialize_skill = ROOT / ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        primary = primary_required_fragments(initialize_skill)
        primary_text = " ".join(primary[initialize_skill])
        self.assertTrue(all(name in primary_text for name in technology_names))

        rust_baseline = ROOT / "docs/RUST_CLI_TEMPLATE.md"
        gate_file = (
            ROOT
            / ".agents/skills/desktop-check-development-environment/references/development-environment-gates.md"
        )
        repository_contract = repository_required_fragments(gate_file, rust_baseline)
        for path in (rust_baseline, PRODUCT_SPEC):
            self.assertTrue(technology_names.issubset(set(repository_contract[path])))

    def test_rejects_obsolete_per_task_preference_prompt(self) -> None:
        """持久项目偏好不得退回每任务重新授权语义。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text("Worktree 授权只对当前任务有效。", encoding="utf-8")
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_obsolete_all_task_parallel_prompt(self) -> None:
        """旧的全修改/交付任务询问规则重新出现时应被拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text(
                "每个会修改仓库或执行交付工作的任务都必须询问并行模式。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_obsolete_environment_preflight_prompt(self) -> None:
        """显式构建缺少环境证据不能重新成为预检触发器。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "environment.md"
            path.write_text(
                "显式构建需要不可复用的工具链证据时先运行环境门禁。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_obsolete_stepwise_base_initialization_prompt(self) -> None:
        """固定基础字段不得退回每轮只问一个的旧初始化交互。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "initialization-form.md"
            path.write_text(
                "每次回复只询问一个最靠前的 `待询问` 字段。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_invalid_harness_datetime_version(self) -> None:
        """12 位但不是有效年月日时分的 Harness 版本必须被拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "Version.md"
            path.write_text("# 版本\n\n- 当前版本：`202613401299`\n", encoding="utf-8")
            original = governance.VERSION_FILE
            governance.VERSION_FILE = path
            try:
                errors: list[str] = []
                governance.validate_version_contract(errors)
            finally:
                governance.VERSION_FILE = original
        self.assertTrue(any("not a valid Shanghai datetime" in error for error in errors), errors)

    def test_harness_datetime_validation_does_not_require_iana_tzdata(self) -> None:
        """Windows 式无系统 tzdata 环境仍应只用标准库完成时间版本校验。"""

        command = (
            "from pathlib import Path; "
            "from scripts.harness_validation.governance_version import validate_version_contract; "
            "errors = []; "
            "validate_version_contract(errors, Path('Version.md')); "
            "raise SystemExit(1 if errors else 0)"
        )
        env = os.environ.copy()
        env["PYTHONTZPATH"] = ""
        result = subprocess.run(
            [sys.executable, "-S", "-B", "-c", command],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_live_readme_identity_matches_version_source(self) -> None:
        """已发货版本契约检查器必须锁定活 README 名称、与 Version.md 相同的 v 展示版本，以及 Released。"""

        errors: list[str] = []
        governance.validate_version_contract(errors)
        self.assertEqual(errors, [])

        version_text = read_repo_text("Version.md")
        current_version = None
        version_prefix = "- 当前版本：`"
        for line in version_text.splitlines():
            if line.startswith(version_prefix) and line.endswith("`"):
                current_version = line[len(version_prefix) : -1]
                break
        self.assertIsNotNone(current_version)
        self.assertEqual(len(current_version), 12)
        self.assertTrue(current_version.isdigit(), current_version)
        self.assertIn("- 发布状态：Released", version_text)

        readme = read_repo_text("README.md")
        self.assertTrue(readme.startswith("# 毕方桌面应用Harness模版\n"))
        self.assertIn("\nBifang Desktop Harness Template\n", readme)
        self.assertIn("- 中文名称：毕方桌面应用Harness模版\n", readme)
        self.assertIn("- English name: Bifang Desktop Harness Template\n", readme)
        self.assertIn(f"- 当前版本：v{current_version}\n", readme)
        self.assertIn("- 发布状态：Released\n", readme)
        self.assertNotIn("- 中文名称：Agent-first Harness 项目模板", readme)
        self.assertNotIn("- English name: Agent-first Harness Template", readme)
        self.assertNotIn("- 发布状态：Unreleased", readme)

    def test_rejects_unreleased_status_in_version_source(self) -> None:
        """活契约要求 Released 时，Version.md 再写 Unreleased 必须被已发货检查器拒绝。"""

        mutated = read_repo_text("Version.md").replace(
            "发布状态：Released",
            "发布状态：Unreleased",
            1,
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "Version.md"
            path.write_text(mutated, encoding="utf-8")
            original = governance.VERSION_FILE
            governance.VERSION_FILE = path
            try:
                errors: list[str] = []
                governance.validate_version_contract(errors)
            finally:
                governance.VERSION_FILE = original
        self.assertTrue(
            any("发布状态：Released" in error for error in errors),
            errors,
        )


class ValidateAgentPolicyTests(unittest.TestCase):
    """覆盖四项持久偏好的合法 schema 与初始化 fail-closed 语义。"""

    @staticmethod
    def _current_policy() -> str:
        return read_repo_text("docs/AGENT_POLICY.md")

    @staticmethod
    def _validate(contents: str, *, allow_pending: bool = True) -> list[str]:
        return run_validator_on_tempfile(
            governance.validate_agent_policy,
            "AGENT_POLICY.md",
            contents,
            allow_pending=allow_pending,
        )

    def test_source_policy_is_valid(self) -> None:
        """Harness 源可以保留尚待下游首次确认的 pending。"""
        self.assertEqual(self._validate(self._current_policy()), [])

    def test_rejects_incomplete_session_progress_title_contract(self) -> None:
        """策略必须保留统一格式、四态、阶段更新与真实身份复读。"""

        policy = self._current_policy()
        required = (
            "`{序号}|{Task简述}|{当前进度} |{功能摘要}`",
            "`已分配`、`运行中`、`检查中`、`已完成`",
            'title="{序号}|{Task简述}|已分配 |{功能摘要}"',
            "无前导零的正十进制整数",
            "`Task简述` 与 `功能摘要` 都必须单行、首尾无空白",
            "`序号`、`Task简述` 和 `功能摘要` 在同一结果内保持不变，只更新第三字段",
            "每次真实进度转换至多尝试一次标题更新",
            "调用 `set_thread_title` 并省略 `threadId`",
            "按同一真实 id 比较宿主返回的规范化标题原文",
            "只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`",
            "内部 Subagent 取得执行权后的第一项 UI 动作",
            "`spawn_agent` 不提供显示标题参数",
            "内部单元 Worktree 本身没有独立 Session 标题",
            "隐藏 Subagent 不出现在 `list_threads` 时改用 `read_thread`",
            "只有授权结果、全部必需检查，以及请求或流程要求的提交、推送和远端复读都已完成，才在最终回复前更新为 `已完成`",
            "遇到阻断时保留最后真实阶段并在正文报告，不得虚写 `已完成` 或创造第五种状态",
            "`已完成` 是终态",
        )
        for fragment in required:
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, policy)
                errors = self._validate(policy.replace(fragment, "已删除标题契约"))
                self.assertTrue(
                    any("Agent policy persistence rule missing" in error for error in errors),
                    errors,
                )

    def test_rejects_missing_preference_field(self) -> None:
        """四项选择缺失任一字段都必须失败。"""
        mutated = self._current_policy().replace("milestone_e2e: pending\n", "", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("fields mismatch" in error for error in errors), errors)

    def test_rejects_invalid_preference_value(self) -> None:
        """偏好值不得扩展为模糊的 ask 或 auto。"""
        mutated = self._current_policy().replace(
            "milestone_smoke: pending",
            "milestone_smoke: auto",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(any("milestone_smoke must be" in error for error in errors), errors)

    def test_initialized_downstream_rejects_pending(self) -> None:
        """下游基线前必须解析所有 pending，而不是把选择留给后续任务。"""
        errors = self._validate(self._current_policy(), allow_pending=False)
        self.assertTrue(
            any("initialized downstream Agent policy must resolve" in error for error in errors),
            errors,
        )

    def test_resolved_downstream_rejects_pending_confirmation_metadata(self) -> None:
        """四项选择虽已解析，确认来源和日期仍不得保留占位值。"""

        resolved = self._current_policy()
        for field in (
            "superpowers",
            "parallel_worktree_subagents",
            "milestone_smoke",
            "milestone_e2e",
        ):
            resolved = resolved.replace(f"{field}: pending", f"{field}: disabled", 1)
        errors = self._validate(resolved, allow_pending=False)
        self.assertTrue(any("confirmed_by" in error for error in errors), errors)
        self.assertTrue(any("confirmed_at" in error for error in errors), errors)

    def test_resolved_downstream_rejects_invalid_confirmation_date(self) -> None:
        """确认日期必须是实际存在的 ISO 日期或 RFC3339 时间。"""

        resolved = self._current_policy().replace("confirmed_by: pending", "confirmed_by: owner", 1)
        resolved = resolved.replace("confirmed_at: pending", "confirmed_at: 2026-02-30", 1)
        for field in (
            "superpowers",
            "parallel_worktree_subagents",
            "milestone_smoke",
            "milestone_e2e",
        ):
            resolved = resolved.replace(f"{field}: pending", f"{field}: enabled", 1)
        errors = self._validate(resolved, allow_pending=False)
        self.assertTrue(any("calendar-valid" in error for error in errors), errors)


class ValidateWorkPlanTests(unittest.TestCase):
    """覆盖按需 Todo、可选完整验收和候选事实禁止回写。"""

    TODO_TOKEN = SHARED_TODO_TOKEN

    @staticmethod
    def _valid_plan() -> str:
        todo_token = ValidateWorkPlanTests.TODO_TOKEN
        return f"""# 当前工作计划

## Todo 批次 A

### {todo_token}（pending）：实现行为

- 预期行为：实现批准行为。
- 影响边界：只修改受控范围。
- 完成验证：运行非空单元测试。
- 状态值包括 `pending`、`in_progress`、`blocked`、`done`。

## 完整验收

- 进入条件：Todo 全部 `done`。
- 候选必须是完整真实产物，模拟实现与脚手架不可验收。
- 失败时重开 Todo 并返回 `$desktop-implement-change`。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        return run_validator_on_tempfile(
            repository.validate_work_plan_contract,
            "20260731_work_plan.md",
            contents,
        )

    def test_valid_todo_and_optional_acceptance_plan(self) -> None:
        """带稳定状态和回流语义的活动计划应通过。"""
        self.assertEqual(self._validate(self._valid_plan()), [])

    def test_acceptance_section_is_optional(self) -> None:
        """普通按需计划不应被迫增加完整验收章节。"""
        plan = self._valid_plan().split("## 完整验收", 1)[0]
        self.assertEqual(self._validate(plan), [])

    def test_rejects_todo_without_explicit_state(self) -> None:
        """Todo 标题缺少可机读状态时必须失败。"""
        mutated = self._valid_plan().replace(
            f"{self.TODO_TOKEN}（pending）",
            self.TODO_TOKEN,
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(any("explicit state" in error for error in errors), errors)

    def test_rejects_accepted_verdict_with_pending_todo(self) -> None:
        """Work Plan 不得把候选完整验收记为 accepted。"""
        mutated = self._valid_plan() + "\n验收状态：accepted\n"
        errors = self._validate(mutated)
        self.assertTrue(
            any("candidate evidence" in error for error in errors),
            errors,
        )

    def test_rejects_accepted_verdict_after_all_todos_done(self) -> None:
        """Todo 全部完成也不能把候选验收结论写入 tracked Work Plan。"""

        plan = self._valid_plan().replace("（pending）", "（done）", 1)
        errors = self._validate(plan + "\n验收状态：accepted\n")
        self.assertTrue(any("candidate evidence" in error for error in errors), errors)

    def test_rejects_candidate_manifest_facts(self) -> None:
        """候选 manifest 状态只能存在于忽略的 release 集合。"""

        errors = self._validate(self._valid_plan() + "\nmilestoneAcceptance: pending\n")
        self.assertTrue(any("candidate evidence" in error for error in errors), errors)

    def test_rejects_duplicate_todo_id_and_missing_per_item_field(self) -> None:
        """Todo ID 必须唯一，且每项都拥有预期、边界和验证。"""

        duplicated = self._valid_plan().replace(
            "## 完整验收",
            f"### {self.TODO_TOKEN}（done）：重复\n\n- 预期行为：重复。\n"
            "- 完成验证：重复。\n\n## 完整验收",
            1,
        )
        errors = self._validate(duplicated)
        self.assertTrue(any("duplicate Todo IDs" in error for error in errors), errors)
        self.assertTrue(any("ownership/boundary" in error for error in errors), errors)

    def test_rejects_chinese_pass_verdict_with_unfinished_todo(self) -> None:
        """常见中文“验收结论：通过”不能绕过未完成 Todo 门禁。"""

        errors = self._validate(self._valid_plan() + "\n验收结论：通过\n")
        self.assertTrue(
            any("candidate evidence" in error for error in errors),
            errors,
        )

    def test_allows_explicit_not_run_with_negative_acceptance_sentence(self) -> None:
        """否定句提到验收结论时，不得把未运行状态误判为已验收。"""

        plan = self._valid_plan() + (
            "\n- 当前状态：`Not run`；因此不产生 `Milestone accepted` 结论。\n"
        )
        self.assertEqual(self._validate(plan), [])

    def test_rejects_accepted_plan_when_a_later_todo_is_unfinished(self) -> None:
        """同一活动计划新增未完成 Todo 后必须撤销整体 accepted 结论。"""

        first_batch = self._valid_plan().replace("（pending）", "（done）", 1)
        first_batch += "\n- 里程碑状态：accepted\n\n"
        second_batch = f"""## Todo 批次 B

### TO{''}DO-B01（pending）：后续行为

- 预期行为：实现后续行为。
- 影响边界：只修改后续范围。
- 完成验证：运行非空单元测试。

## 完整验收 M2

- 当前状态：`Not run`。
- 候选必须是完整真实产物，模拟实现与脚手架不可验收。
- 失败时重开 Todo 并返回 `$desktop-implement-change`。
"""
        errors = self._validate(first_batch + second_batch)
        self.assertTrue(any("candidate evidence" in error for error in errors), errors)


class ProjectMemoryTriggerTests(unittest.TestCase):
    """保护日常维护排除与独立发布证据边界。"""

    def test_current_project_memory_exclusions_are_valid(self) -> None:
        """当前索引和执行 Skills 应使用一致的事件触发规则。"""

        errors: list[str] = []
        repository.validate_daily_project_memory(errors)
        self.assertEqual(errors, [], "\n".join(errors))

    def test_rejects_obsolete_changelog_fix_category(self) -> None:
        """旧的通用修复分类不能回流当前事实源。"""

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "current.md"
            path.write_text(
                "只记录已经发生的新增、变化、修复、移除、安全事项。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in item for item in errors))

    def test_rejects_superseded_session_title_rules_in_current_sources(self) -> None:
        """旧标题格式、后缀语义与 Subagent 排除不得回流当前事实源。"""

        stale_fragments = (
            "{Task}|{序号}|{功能摘要}{当前进度}",
            "内部 agent 不套用",
            "内部 Subagent、agent thread 和内部单元 Worktree 不执行该操作",
            "只更新进度后缀",
            "稳定三部分与合法四态后缀",
        )
        for fragment in stale_fragments:
            with self.subTest(fragment=fragment), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "current.md"
                path.write_text(fragment, encoding="utf-8")
                errors: list[str] = []
                governance.validate_stale_fragments(errors, (path,))
                self.assertTrue(
                    any("stale current description" in item for item in errors),
                    errors,
                )

    def test_rejects_superseded_task_title_in_current_changelog(self) -> None:
        """同日 Changelog 不得把被取代标题格式继续陈述为当前合同。"""

        deprecated_claims = (
            "标题固定使用“动作 + 结果”。",
            "当前显示标题固定使用 `{任务}-{ID}-{摘要}`。",
            "普通单结果请求在当前调用 Session 完成授权结果和本次必需检查后、最终回复前，至多一次尝试使用旧格式。",
            "调用后返回的 `threadId`/`clientThreadId` 和可变状态不再反填标题。",
            "标题不再携带可变状态。",
            "当前调用 Session 与用户可见的 Worktree/Local 左侧 Task 统一使用 `{Task}|{序号}|{功能摘要}{当前进度}`。",
            "内部 agent 不套用。",
        )
        for claim in deprecated_claims:
            with self.subTest(claim=claim), tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "current.md"
                path.write_text(claim, encoding="utf-8")
                errors: list[str] = []
                repository.validate_current_changelog_contract(errors, path)
                self.assertTrue(
                    any("superseded Task title contract" in item for item in errors),
                    errors,
                )

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "current.md"
            path.write_text(
                "历史 `{Task}|{序号}|{功能摘要}{当前进度}` 已被 "
                "`{序号}|{Task简述}|{当前进度} |{功能摘要}` 取代。",
                encoding="utf-8",
            )
            errors = []
            repository.validate_current_changelog_contract(errors, path)
            self.assertEqual(errors, [])

    def test_rejects_superseded_release_lifecycle_wording(self) -> None:
        """反向旧措辞不能与新候选生命周期并存。"""

        fragment = "`pending`/`ready` 状态转换"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "current.md"
            path.write_text(fragment, encoding="utf-8")
            errors: list[str] = []
            repository.validate_superseded_release_lifecycle_fragments(
                errors,
                ((path, (fragment,)),),
            )
        self.assertTrue(any("superseded release lifecycle" in item for item in errors))

    def test_release_contract_allows_fix_only_without_changelog(self) -> None:
        """仅含 bug-fix 的 PATCH 仍有发布证据，但不得制造 Changelog。"""

        release = read_repo_text("docs/RELEASE.md")
        prepare = read_repo_text(".agents/skills/desktop-prepare-release/SKILL.md")
        self.assertIn("版本变化与 Changelog 写入是独立门禁", release)
        self.assertIn("缺少 Changelog 不削弱候选证据", release)
        self.assertIn("0.0.99 -> 0.1.0", release)
        self.assertIn("问题修复或用户可感知优化", release)
        self.assertIn("不受当前周期的功能提升锁影响", release)
        self.assertIn("仅含普通缺陷修复或纯重构", prepare)
        self.assertIn("不创建、不补写也不汇总 Changelog", prepare)
