"""精简开发流程、初始化预设与按需 Work Plan 的回归测试。"""

from __future__ import annotations

import re
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.harness_validation import (
    governance,
    governance_policy,
    initialization,
    repository,
)
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


class AgentPolicyTests(unittest.TestCase):
    """覆盖独立 Task 环境选择、推荐预设与自定义策略的 schema v2 物化。"""

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

    @classmethod
    def _resolved_policy(cls, values: dict[str, str]) -> str:
        """把 Harness 源策略物化为带真实确认元数据的下游策略。"""
        resolved = cls._current_policy()
        merged_fields = {
            "confirmed_by": "project-owner",
            "confirmed_at": "2026-08-03",
            **values,
        }
        for field, value in merged_fields.items():
            resolved, replacements = re.subn(
                rf"(?m)^{re.escape(field)}: (?:pending|enabled|disabled)$",
                f"{field}: {value}",
                resolved,
                count=1,
            )
            if replacements != 1:
                raise AssertionError(f"policy field was not replaced: {field}")
        return resolved

    def test_recommended_values_and_independent_task_environment_are_valid(self) -> None:
        """推荐四项与独立 Task 环境合并后通过下游 fail-closed 校验。"""
        resolved = self._resolved_policy(
            {
                "superpowers": "disabled",
                "left_git_task_worktree": "enabled",
                "parallel_worktree_subagents": "enabled",
                "milestone_smoke": "enabled",
                "milestone_e2e": "disabled",
            }
        )
        self.assertEqual(self._validate(resolved, allow_pending=False), [])

    def test_source_defaults_superpowers_to_disabled(self) -> None:
        """Harness 源策略必须在下游选择前保持 Superpowers 默认关闭。"""
        self.assertRegex(self._current_policy(), r"(?m)^superpowers: disabled$")

    def test_source_leaves_task_worktree_choice_pending(self) -> None:
        """Harness 源不得代替下游用户确认左侧 Git Task 环境。"""
        self.assertRegex(
            self._current_policy(),
            r"(?m)^left_git_task_worktree: pending$",
        )

    def test_source_default_validator_rejects_enabled_superpowers(self) -> None:
        """模板校验不能只依赖正文中的推荐值而忽略源字段漂移。"""
        mutated = self._current_policy().replace(
            "superpowers: disabled",
            "superpowers: enabled",
            1,
        )
        errors = run_validator_on_tempfile(
            governance.validate_agent_policy,
            "AGENT_POLICY.md",
            mutated,
            require_source_defaults=True,
        )
        self.assertTrue(any("default superpowers to disabled" in error for error in errors))

    def test_source_default_validator_rejects_preselected_task_environment(self) -> None:
        """模板源必须保留初始化必问，不能预先替用户开启或关闭 Task Worktree。"""
        mutated = self._current_policy().replace(
            "left_git_task_worktree: pending",
            "left_git_task_worktree: enabled",
            1,
        )
        errors = run_validator_on_tempfile(
            governance.validate_agent_policy,
            "AGENT_POLICY.md",
            mutated,
            require_source_defaults=True,
        )
        self.assertTrue(
            any("leave left_git_task_worktree pending" in error for error in errors),
            errors,
        )

    def test_custom_values_are_not_forced_to_recommended_values(self) -> None:
        """自定义选择可物化不同合法组合，不被推荐配方覆盖。"""
        resolved = self._resolved_policy(
            {
                "superpowers": "enabled",
                "left_git_task_worktree": "disabled",
                "parallel_worktree_subagents": "disabled",
                "milestone_smoke": "disabled",
                "milestone_e2e": "enabled",
            }
        )
        self.assertEqual(self._validate(resolved, allow_pending=False), [])

    def test_rejects_persisted_preset_field(self) -> None:
        """推荐预设只是输入快捷方式，不得扩张稳定 schema。"""
        mutated = self._current_policy().replace(
            "schema_version: 2\n", "schema_version: 2\npreset: agile\n", 1
        )
        errors = self._validate(mutated)
        self.assertTrue(any("fields mismatch" in error for error in errors), errors)

    def test_current_initialization_selection_contract_is_valid(self) -> None:
        """初始化入口必须同时保留推荐和自定义两种选择语义。"""
        errors: list[str] = []
        initialization.validate_initialization_contract(errors)
        self.assertEqual(errors, [])

    def test_environment_upgrade_contract_requires_windows_regressions_and_dotnet_hashing(
        self,
    ) -> None:
        """Windows 独立升级回归与不依赖 cmdlet 的 SHA-256 helper 都是必需门禁。"""
        mutations = (
            (
                "PREREQUISITE_WINDOWS",
                initialization.PREREQUISITE_WINDOWS,
                "[Security.Cryptography.SHA256]::Create()",
            ),
            (
                "PREREQUISITE_WINDOWS_TESTS",
                initialization.PREREQUISITE_WINDOWS_TESTS,
                "test_below_minimum_git_is_upgraded_and_reprobed",
            ),
        )
        for attribute, source_path, anchor in mutations:
            with self.subTest(anchor=anchor), tempfile.TemporaryDirectory() as tmp_dir:
                source = source_path.read_text(encoding="utf-8")
                self.assertIn(anchor, source)
                path = Path(tmp_dir) / source_path.name
                path.write_text(source.replace(anchor, "removed-contract-anchor", 1), encoding="utf-8")
                errors: list[str] = []
                with mock.patch.object(initialization, attribute, path):
                    initialization.validate_initialization_contract(errors)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rust_asset_rejects_non_minimum_compatible_requirements(self) -> None:
        """中性 Rust 资产不能恢复单段版本、精确锁或 Git/tag 依赖。"""
        errors: list[str] = []
        initialization.validate_workspace_dependency_minimums(
            errors,
            {
                "valid": "1.2.3",
                "valid_caret": "^2.3.4",
                "internal": {"path": "internal"},
                "broad": "1",
                "exact": "=1.2.3",
                "tagged": {"git": "https://example.invalid/repo", "tag": "v1.2.3"},
            },
        )
        self.assertEqual(len(errors), 3, errors)
        self.assertTrue(any("broad" in error for error in errors))
        self.assertTrue(any("exact" in error for error in errors))
        self.assertTrue(any("tagged" in error for error in errors))

    def test_macos_dmg_background_asset_is_valid(self) -> None:
        """GUI 初始化携带的真实 PNG 必须通过结构、尺寸和内容门禁。"""
        errors: list[str] = []
        initialization.validate_macos_dmg_background_asset(errors)
        self.assertEqual(errors, [])

    def test_rejects_wrong_macos_dmg_background_dimensions(self) -> None:
        """看似完整但尺寸漂移的 PNG 不能进入所有下游初始化基线。"""

        def png_chunk(chunk_type: bytes, chunk_data: bytes) -> bytes:
            """构造带有效长度与 CRC 的最小 PNG chunk 供负向回归使用。"""
            checksum = zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
            return (
                struct.pack(">I", len(chunk_data))
                + chunk_type
                + chunk_data
                + struct.pack(">I", checksum)
            )

        ihdr = struct.pack(">IIBBBBB", 640, 400, 8, 2, 0, 0, 0)
        payload = (
            initialization.PNG_SIGNATURE
            + png_chunk(b"IHDR", ihdr)
            + png_chunk(b"IDAT", b"x" * 4096)
            + png_chunk(b"IEND", b"")
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "background.png"
            path.write_bytes(payload)
            errors: list[str] = []
            initialization.validate_macos_dmg_background_asset(errors, path)
        self.assertTrue(any("dimensions must be 660x400" in error for error in errors), errors)

    def test_neutral_initialization_does_not_create_verification_memory(self) -> None:
        """中性初始化只能返回环境证据，不能复制或新建验证历史。"""
        instantiate = read_repo_text(".agents/skills/desktop-instantiate-project/SKILL.md")
        initialize = read_repo_text(".agents/skills/desktop-initialize-rust-project/SKILL.md")
        environment = read_repo_text(".agents/skills/desktop-check-development-environment/SKILL.md")
        self.assertIn("历史验证正文", instantiate)
        self.assertIn("docs/verification/", instantiate)
        self.assertIn("不创建或更新 `docs/VERIFICATION.md`", initialize)
        self.assertIn("不得为普通开发预建 Verification", environment)

    def test_public_behavior_and_product_rename_use_direct_development(self) -> None:
        """公开行为和已批准改名都不能自动制造计划、构建或完整验收。"""
        initialize = read_repo_text(".agents/skills/desktop-initialize-rust-project/SKILL.md")
        rename = read_repo_text(".agents/skills/desktop-rename-project-identity/SKILL.md")
        self.assertIn("业务 core 或适配器变化都直接实施", initialize)
        self.assertIn("不自动创建 Work Plan、构建候选或完整验收记录", initialize)
        self.assertIn("现有产品改名", rename)
        self.assertIn("确认后直接实施", rename)
        self.assertIn("不自动创建 Work Plan、候选或完整验收步骤", rename)


class InitializationFormContractTests(unittest.TestCase):
    """覆盖新下游写入前首轮基础表单、条件补全及路径解析契约。"""

    def test_form_batches_base_fields_before_stepwise_conditionals(self) -> None:
        """固定基础字段必须同轮出现，条件字段只能随后按需逐项推进。"""
        form = read_repo_text(
            ".agents/skills/desktop-instantiate-project/references/initialization-form.md"
        )
        self.assertIn("一次列出其中全部尚未解析字段", form)
        self.assertIn("基础字段全部解析前不得进入条件问询", form)
        self.assertIn("每次回复只询问一个当前适用且尚未解析的条件字段", form)
        self.assertIn("用户主动一次提供多个字段时全部解析", form)
        rows = re.findall(
            r"(?m)^\|\s*(\d+)\s*\|\s*(首轮基础|条件补全)\s*\|\s*([^|]+?)\s*\|",
            form,
        )
        self.assertEqual([int(order) for order, _, _ in rows], list(range(1, 23)))
        self.assertEqual(
            [field.strip() for _, stage, field in rows if stage == "首轮基础"],
            [
                "中文项目展示名称",
                "英文项目展示名称",
                "`project_id`",
                "项目路径",
                "负责人",
                "目标平台",
                "接口组合",
                "Agent 策略模式",
                "`left_git_task_worktree`",
            ],
        )
        self.assertEqual(
            [field.strip() for _, stage, field in rows if stage == "条件补全"],
            [
                "`superpowers`",
                "`parallel_worktree_subagents`",
                "`milestone_smoke`",
                "`milestone_e2e`",
                "`system_tray`",
                "`system_notification`",
                "`autostart`",
                "`about_page`",
                "`sponsor_page`",
                "`single_instance`",
                "`deep_link`",
                "`global_shortcut`",
                "`sidebar_mode`",
            ],
        )
        self.assertNotIn("每次回复只询问一个最靠前的", form)

    def test_form_auto_translates_one_missing_display_name_before_confirmation(self) -> None:
        """用户只给一种语言时必须自动补齐另一种，并由最终汇总统一确认。"""

        form = read_repo_text(
            ".agents/skills/desktop-instantiate-project/references/initialization-form.md"
        )
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        self.assertIn("中英文项目展示名称至少由用户直接提供一个", form)
        self.assertIn("只提供中文时", form)
        self.assertIn("只提供英文时", form)
        self.assertIn("自动翻译得到的名称必须标记来源", form)
        self.assertIn("中英文名称、各自来源", instantiate)
        self.assertIn("用户对汇总的确认同时构成对译名的确认", form)

    def test_direct_initialization_batches_interface_and_policy_mode(self) -> None:
        """直接初始化也必须先同轮解析接口与策略模式，再询问条件字段。"""
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        self.assertIn(
            "必须在同一首轮一次列出",
            initialize,
        )
        self.assertIn(
            "基础决定全部解析后，每轮只询问一个尚未解析的 GUI 条件字段",
            initialize,
        )
        self.assertIn(
            "选择自定义后，每轮只询问一个目标用户尚未明确提供的条件字段",
            initialize,
        )

    def test_form_resolves_parent_or_final_path_without_similarity_guessing(self) -> None:
        """末级精确命中才复用输入，否则必须追加标识并只检查最终根。"""
        form = read_repo_text(
            ".agents/skills/desktop-instantiate-project/references/initialization-form.md"
        )
        self.assertIn("区分大小写地精确相等", form)
        self.assertIn("最终项目根目录为 `<项目路径>/<project_id>`", form)
        self.assertIn("相似度把不同名称视为相同", form)
        self.assertIn("作为父目录输入的项目路径可以已经存在", form)
        self.assertIn("“不存在或为空”只约束最终项目根目录", form)

    def test_instantiation_reuses_completed_form_after_first_write(self) -> None:
        """复制后不得重新询问接口、策略或 GUI 条件字段。"""
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        self.assertIn("不得在复制后重新发起一轮问询", instantiate)
        self.assertIn("不得在复制后重新询问接口", initialize)
        self.assertIn("复用表单中已经按需逐项确认的九项值", initialize)

class StreamlinedDevelopmentTests(unittest.TestCase):
    """覆盖直接实施、当前必要测试和显式并行边界。"""

    def test_implementation_only_runs_current_required_tests(self) -> None:
        """日常实现必须只运行当前必要测试，不扩张到全仓门禁。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("只运行第 6 步的测试", skill)
        self.assertIn("不得自动追加格式化、lint、静态、集成/契约、全仓测试、构建", skill)
        self.assertIn("未触发时不写占位", skill)

    def test_multistep_work_does_not_automatically_create_plan_or_subagents(self) -> None:
        """多步骤、多模块或可并行本身不能增加计划和 Subagent。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("不因多步骤、多模块、中等风险、可并行或 Agent 偏好", skill)
        self.assertIn("自动调用 `$desktop-plan-change`、创建 Work Plan、启动 Subagent", skill)

    def test_left_task_contract_requires_isolated_reviewable_delivery(self) -> None:
        """左侧 Task 必须隔离修改、形成可审查提交并干净交付。"""
        policy = read_repo_text("docs/AGENT_POLICY.md")
        implement = read_repo_text(
            ".agents/skills/desktop-implement-change/SKILL.md"
        )
        parallel = read_repo_text(
            ".agents/skills/desktop-run-parallel-worktrees/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        gitignore = read_repo_text(".gitignore")

        for heading in (
            "目标：",
            "Task 绑定：",
            "工作方式：",
            "当前事实：",
            "必须阅读的项目文档：",
            "实施范围：",
            "禁止事项：",
            "验收标准：",
            "交付：",
        ):
            self.assertIn(heading, policy)
        for fragment in (
            "{序号}|{Task简述}|{当前进度} |{功能摘要}",
            'title="{序号}|{Task简述}|已分配 |{功能摘要}"',
            "Task 描述记录不可变的 Task key",
            "稳定序号",
            "显示标题与 Git 摘要是两个事实",
            "user-owned Task/thread",
            "`list_projects`",
            "target.type = project",
            "`SETUP_PENDING`",
            "`list_threads`",
            "git rev-parse --path-format=absolute --git-common-dir",
            "git worktree list --porcelain",
            "不硬编码 `main` 或 `master`",
            "`$desktop-manage-git-lifecycle start --summary <feature-summary>`",
            "`git status --porcelain=v1 --untracked-files=all`",
            "不要自行合并默认/集成分支",
        ):
            self.assertIn(fragment, policy)

        self.assertIn("每完成一个逻辑闭环", implement)
        self.assertIn("保存项目完整路径、`projectId`、repository identity", implement)
        self.assertIn("git rev-parse --path-format=absolute --git-common-dir", implement)
        self.assertIn("从具名分支或 detached HEAD 直接创建并切换到", implement)
        self.assertIn("用户明确说“推送”时才合并到主分支", implement)
        self.assertIn("只管理单个左侧 user-owned Task 内部", parallel)
        self.assertIn("不调用 `create_thread`，不创建新的左侧 Task", parallel)
        self.assertIn("不得把两个左侧 Task 安排进同一 Worktree", parallel)
        self.assertIn("`codex/unit-<task>-<unit>`", parallel)
        self.assertIn("统一描述模板", initialize)
        self.assertIn("左侧 Task 描述模板", instantiate)
        for ignored in (
            "/target/",
            "**/node_modules/",
            "**/dist/",
            "**/__pycache__/",
        ):
            self.assertIn(ignored, gitignore)

    def test_build_is_a_separate_explicit_flow(self) -> None:
        """普通开发只在用户显式要求构建时进入构建 Skill。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("普通构建也只新增全量非空单元测试和实际构建", skill)

    def test_left_task_setup_and_project_binding_are_hard_gates(self) -> None:
        """左侧 Task 一次派发、项目绑定且 setup pending 有界返回。"""
        policy = read_repo_text("docs/AGENT_POLICY.md")
        readme = read_repo_text("README.md")
        product_spec_path = max(
            (ROOT / "docs" / "product_spec").glob("[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_product_spec.md"),
            key=lambda path: path.name,
        )
        product_spec = product_spec_path.read_text(encoding="utf-8")

        for text in (policy, readme, product_spec):
            self.assertIn("`clientThreadId`", text)
            self.assertIn("`threadId`", text)
            self.assertIn("`list_projects`", text)
            self.assertIn("`projectId`", text)
        self.assertIn("对一个结果只调用一次 `create_thread`", policy)
        self.assertIn("立即报告 queued Task", policy)
        self.assertIn("不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建", policy)
        self.assertIn("用户随后明确要求检查先前 queued Task", policy)
        self.assertIn("只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`", policy)
        self.assertIn("不得使用 `projectless`", policy)
        self.assertIn("Git common dir 不同", policy)

    def test_left_task_is_split_by_outcome_not_lifecycle_or_status(self) -> None:
        """标题可反映进度，但诊断、实现和证明仍不得按阶段拆 Task。"""
        policy = read_repo_text("docs/AGENT_POLICY.md")
        readme = read_repo_text("README.md")

        self.assertIn("不得只因生命周期阶段变化自动拆 Task", policy)
        self.assertIn("普通单结果请求不先创建所谓 Task0", policy)
        self.assertIn("`已分配`、`运行中`、`检查中`、`已完成`", policy)
        self.assertIn("Ready/Active/Blocked 等宿主状态不替代这四种标题进度", readme)
        self.assertIn("只有用户明确要求创建新的左侧 Task", policy)
        self.assertIn("生命周期阶段变化就拆 Task", readme)
        self.assertIn("只拿到 `clientThreadId` 时无限等待", readme)
        self.assertIn("Worktree 路径必须位于保存项目目录内", readme)

    def test_worktree_task_title_starts_assigned_and_keeps_feature_summary_separate(self) -> None:
        """Worktree 左侧 Task 以已分配派发，并让序号/标题与 feature 摘要分离。"""
        policy = read_repo_text("docs/AGENT_POLICY.md")
        readme = read_repo_text("README.md")
        implement = read_repo_text(
            ".agents/skills/desktop-implement-change/SKILL.md"
        )
        parallel = read_repo_text(
            ".agents/skills/desktop-run-parallel-worktrees/SKILL.md"
        )
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )

        for text in (policy, readme, instantiate, initialize):
            self.assertIn('title="{序号}|{Task简述}|已分配 |{功能摘要}"', text)
            self.assertIn("Task key", text)
            self.assertIn("feature-summary", text)
        self.assertIn('title="{序号}|{Task简述}|已分配 |{功能摘要}"', implement)
        self.assertIn("Task key", implement)
        self.assertIn("--summary <ascii-kebab>", implement)
        self.assertIn("不得把调用后才返回的 `threadId`/`clientThreadId` 写进序号或标题", policy)
        self.assertIn("显示标题与 Git 摘要是两个事实", policy)
        self.assertIn("不靠标题承担身份判断", policy)
        self.assertIn("不靠标题判断身份", implement)
        self.assertIn("无前导零的正十进制整数", policy)
        self.assertIn(
            "不得把 `{序号}|{Task简述}|{当前进度} |{功能摘要}` 显示标题原样传给",
            parallel,
        )
        self.assertIn("不得把自己称为新的左侧 Task", parallel)
        self.assertIn("在消息中写入完整逻辑初始标题", parallel)

    def test_session_worktree_and_subagent_titles_follow_one_progress_contract(self) -> None:
        """普通 Session、左侧 Task 与 Subagent 共用四字段四态标题。"""

        policy = read_repo_text("docs/AGENT_POLICY.md")
        agents = read_repo_text("AGENTS.md")
        readme = read_repo_text("README.md")
        product_spec = repository.PRODUCT_SPEC.read_text(encoding="utf-8")
        implement = read_repo_text(
            ".agents/skills/desktop-implement-change/SKILL.md"
        )
        parallel = read_repo_text(
            ".agents/skills/desktop-run-parallel-worktrees/SKILL.md"
        )
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )

        for text in (
            policy,
            agents,
            readme,
            product_spec,
            implement,
            parallel,
            instantiate,
            initialize,
        ):
            self.assertIn("{序号}|{Task简述}|{当前进度} |{功能摘要}", text)
            self.assertTrue(
                any(
                    fragment in text
                    for fragment in (
                        "不阻断已完成",
                        "不阻断已经完成",
                        "不会推翻已经完成",
                        "不得推翻已经完成",
                        "不推翻已经完成",
                        "不改变实现和测试的完成结论",
                    )
                ),
                text,
            )
        self.assertIn("每次真实进度转换至多尝试一次标题更新", policy)
        self.assertIn("调用 `set_thread_title` 并省略 `threadId`", policy)
        self.assertIn("按同一真实 id 比较宿主返回的规范化标题原文", policy)
        self.assertIn("保持三个稳定字段并把第三字段更新为 `检查中`", implement)
        self.assertIn("更新为终态 `已完成`", implement)
        self.assertIn('title="{序号}|{Task简述}|已分配 |{功能摘要}"', policy)
        self.assertIn("`Task简述` 是稳定、非空且不含 `|`", policy)
        self.assertIn("`序号`、`Task简述` 和 `功能摘要` 在同一结果内保持不变，只更新第三字段", policy)
        self.assertIn("不得根据返回 id 重新分配序号", policy)
        self.assertIn("检查发现同范围问题并返回修复时重新更新为 `运行中`", policy)
        self.assertIn("请求或流程要求的提交、推送和远端复读都已完成", policy)
        self.assertIn("遇到阻断时保留最后真实阶段", policy)
        self.assertIn("内部 Subagent 取得执行权后的第一项 UI 动作", policy)
        self.assertIn("隐藏 Subagent 不出现在 `list_threads` 时改用", policy)
        self.assertIn("内部单元 Worktree 本身没有独立 Session 标题", policy)
        self.assertIn("不得把该字符串改塞进受限技术 `task_name`", parallel)
        for text in (policy, readme, product_spec, implement, instantiate, initialize):
            for fragment in governance_policy.PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS:
                self.assertIn(fragment, text)
        self.assertIn("隐藏 Subagent 不占用用户可见的项目序列", parallel)
        self.assertIn("追加批次必须避开该父 Task 已经分配的序号", parallel)
        self.assertEqual(
            governance_policy.SESSION_PROGRESS_TITLE_TEMPLATE,
            "{序号}|{Task简述}|{当前进度} |{功能摘要}",
        )
        self.assertEqual(
            governance_policy.SESSION_PROGRESS_TITLE_INITIAL,
            "{序号}|{Task简述}|已分配 |{功能摘要}",
        )

        for progress in governance_policy.SESSION_PROGRESS_STATES:
            self.assertTrue(
                governance_policy.is_valid_session_progress_title(
                    f"23|同步GitHub|{progress} |拉取并推送所有变更"
                ),
                progress,
            )
        for invalid in (
            "0|同步GitHub|已分配 |拉取并推送所有变更",
            "01|同步GitHub|运行中 |拉取并推送所有变更",
            "同步GitHub|23|运行中 |拉取并推送所有变更",
            "23|同步GitHub|检查中|拉取并推送所有变更",
            "23|同步GitHub|检查中  |拉取并推送所有变更",
            "23|同步GitHub|已阻塞 |拉取并推送所有变更",
            "23||已完成 |拉取并推送所有变更",
            "23|同步GitHub|已完成 |",
            "23| 同步GitHub|已完成 |拉取并推送所有变更",
            "23|同步GitHub |已完成 |拉取并推送所有变更",
            "23|同步GitHub|已完成 | 拉取并推送所有变更",
            "23|同步GitHub|已完成 |拉取并推送所有变更 ",
            "23|同步|GitHub|已完成 |拉取并推送所有变更",
            "23|同步\nGitHub|已完成 |拉取并推送所有变更",
            "23|同步\u2028GitHub|已完成 |拉取并推送所有变更",
            "23|同步GitHub|已完成 |拉取\u0085并推送所有变更",
            "23|同步GitHub|已完成 |拉取\u2029并推送所有变更",
            "同步GitHub|23|拉取并推送所有变更已完成",
            "同步任务已完成",
        ):
            self.assertFalse(
                governance_policy.is_valid_session_progress_title(invalid),
                invalid,
            )

    def test_project_task_sequences_increment_from_active_and_archived_history(self) -> None:
        """项目序号取同宿主同项目合法历史最大值，不回填缺号。"""

        def record(title, *, kind="codex", host_id="local", project_id="project-a"):
            return {"kind": kind, "hostId": host_id, "projectId": project_id, "title": title}

        active_records = [
            record("1|首个任务|已完成 |建立标题契约"),
            record("2|第二个任务|运行中 |继续项目工作"),
            record("91|其他宿主|已完成 |不得参与分配", host_id="other-host"),
            record("92|其他项目|已完成 |不得参与分配", project_id="project-b"),
            record("93|其他类型|已完成 |不得参与分配", kind="chatgpt"),
        ]
        archived_records = [
            record("4|归档任务|已完成 |保留项目历史最大值"),
            active_records[1],
            record("03|前导零|已完成 |畸形标题必须忽略"),
            record("100|字段不足|已完成"),
            record(None),
            "not-a-record",
        ]

        records = [*active_records, *archived_records]
        self.assertEqual(
            governance_policy.allocate_project_task_sequences(
                records,
                host_id="local",
                project_id="project-a",
            ),
            (5,),
        )
        self.assertEqual(
            governance_policy.allocate_project_task_sequences(
                records,
                host_id="local",
                project_id="project-a",
                count=3,
            ),
            (5, 6, 7),
        )
        self.assertEqual(
            governance_policy.allocate_project_task_sequences(
                [],
                host_id="local",
                project_id="project-a",
            ),
            (1,),
        )

    def test_project_task_sequence_allocator_rejects_invalid_scope_or_count(self) -> None:
        """宿主、项目和批次数量必须能形成明确的正向分配范围。"""

        invalid_arguments = (
            {"host_id": "", "project_id": "project-a", "count": 1},
            {"host_id": " local", "project_id": "project-a", "count": 1},
            {"host_id": None, "project_id": "project-a", "count": 1},
            {"host_id": "local", "project_id": "", "count": 1},
            {"host_id": "local", "project_id": "project-a ", "count": 1},
            {"host_id": "local", "project_id": 7, "count": 1},
            {"host_id": "local", "project_id": "project-a", "count": 0},
            {"host_id": "local", "project_id": "project-a", "count": -1},
            {"host_id": "local", "project_id": "project-a", "count": True},
            {"host_id": "local", "project_id": "project-a", "count": 1.5},
        )
        for arguments in invalid_arguments:
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                governance_policy.allocate_project_task_sequences([], **arguments)

    def test_build_does_not_create_project_memory(self) -> None:
        """候选事实只进入忽略的原子集合，发布后才写 tracked 记忆。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        rules = read_repo_text("docs/ENGINEERING_RULES.md")
        boundary = "构建请求、执行和结果本身不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        self.assertIn(boundary, skill)
        self.assertIn("候选事实只写入忽略的 `release/` 原子集合", rules)
        self.assertIn("不得复制到 tracked 项目记忆", rules)
        self.assertIn(
            "真实渠道发布成功后，才从已发布且带版本 tag 的默认主分支开始下一次开发生命周期",
            rules,
        )

    def test_environment_gate_only_runs_for_initialization_or_observed_error(self) -> None:
        """环境门禁不得因任务、构建或证据状态预先运行。"""
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        environment = read_repo_text(
            ".agents/skills/desktop-check-development-environment/SKILL.md"
        )
        rust_build = read_repo_text(
            ".agents/skills/desktop-build-rust-release/SKILL.md"
        )
        tauri_build = read_repo_text(
            ".agents/skills/desktop-build-tauri-release/SKILL.md"
        )
        self.assertIn("初始化是允许主动检查环境的唯一常规阶段", initialize)
        self.assertIn("只接受两类触发", environment)
        self.assertIn("不得仅因首次修改代码、新任务、新会话、显式构建", environment)
        self.assertIn("门禁成功后只重试原失败命令一次", environment)
        self.assertIn("不得因显式构建、缺少/过期环境证据", rust_build)
        self.assertIn("初始化后的构建不做例行环境预检", tauri_build)
        self.assertNotIn("显式构建若缺少与当前接口", environment)


class WorkPlanTests(unittest.TestCase):
    """覆盖 Work Plan 的可选准入、精简 Todo 和验收状态隔离。"""

    TODO_TOKEN = SHARED_TODO_TOKEN

    @classmethod
    def _plan(cls, state: str = "pending") -> str:
        """返回不声明流程等级的最小按需计划。"""
        return f"""# 当前工作计划

## Todo 批次 A

### {cls.TODO_TOKEN}（{state}）：更新文档

- 预期行为：当前规则使用直接开发闭环。
- 影响边界：只修改规范文档。
- 验证：运行本次必要的解析检查。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        return run_validator_on_tempfile(
            repository.validate_work_plan_contract,
            "20260824_work_plan.md",
            contents,
        )

    def test_missing_plan_is_valid_by_default(self) -> None:
        """日常开发没有活动 Work Plan 时不应被全局门禁拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(errors, Path(tmp_dir) / "missing.md")
        self.assertEqual(errors, [])

    def test_missing_plan_is_rejected_when_caller_explicitly_requires_one(self) -> None:
        """发布协调等调用方可以显式要求计划真实存在。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(
                errors,
                Path(tmp_dir) / "missing.md",
                required=True,
            )
        self.assertTrue(any("missing active Work Plan" in error for error in errors), errors)

    def test_valid_opt_in_plan_needs_no_path_declaration(self) -> None:
        """用户按需创建的精简计划无需再声明流程等级。"""
        self.assertEqual(self._validate(self._plan()), [])

    def test_plan_does_not_trigger_other_memories(self) -> None:
        """持久计划存在不自动联动其他项目记忆。"""
        skill = read_repo_text(".agents/skills/desktop-plan-change/SKILL.md")
        self.assertIn(
            "计划存在和 Todo 完成都不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog",
            skill,
        )

    def test_rejects_todo_without_explicit_state(self) -> None:
        """Todo 标题缺少可机读状态时必须失败。"""
        mutated = self._plan().replace(f"{self.TODO_TOKEN}（pending）", self.TODO_TOKEN, 1)
        errors = self._validate(mutated)
        self.assertTrue(any("explicit state" in error for error in errors), errors)

    def test_optional_full_acceptance_contract_is_valid(self) -> None:
        """显式完整验收可附加真实候选与失败回流契约。"""
        acceptance = """

## 完整验收

- 进入条件：Todo 全部 `done`。
- 候选必须是完整真实产物，不接受模拟、桩、占位或脚手架。
- 失败时重开 Todo 并返回 `$desktop-implement-change`。
"""
        self.assertEqual(self._validate(self._plan(state="done") + acceptance), [])

    def test_rejects_acceptance_with_unfinished_todo(self) -> None:
        """Work Plan 不得记录候选 accepted 或发布就绪结论。"""
        errors = self._validate(self._plan() + "\n验收状态：accepted\n")
        self.assertTrue(
            any("candidate evidence" in error for error in errors),
            errors,
        )

    def test_rejects_duplicate_todo_id_and_missing_boundary(self) -> None:
        """Todo ID 必须唯一，且每项都拥有预期、边界和验证。"""
        duplicated = self._plan() + f"""

### {self.TODO_TOKEN}（done）：重复

- 预期行为：重复。
- 验证：重复。
"""
        errors = self._validate(duplicated)
        self.assertTrue(any("duplicate Todo IDs" in error for error in errors), errors)
        self.assertTrue(any("ownership/boundary" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
