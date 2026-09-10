"""校验五项持久 Agent 策略的 schema、确认元数据与正文语义。"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import datetime
from pathlib import Path

from .context import AGENT_POLICY, display_path, fail, read_text_cached


SESSION_PROGRESS_TITLE_TEMPLATE = "Task {序号} | {当前进度} | {单一结果}"
SESSION_PROGRESS_TITLE_INITIAL = "Task {序号} | 已分配 | {单一结果}"
SESSION_PROGRESS_STATES = ("已分配", "运行中", "检查中", "已完成")
SESSION_PROGRESS_TITLE_PATTERN = re.compile(
    r"Task (?P<sequence>[1-9][0-9]*) \| "
    r"(?P<progress>已分配|运行中|检查中|已完成) \| "
    r"(?P<single_result>[^|\r\n]+)"
)
LEGACY_SESSION_PROGRESS_TITLE_PATTERN = re.compile(
    r"(?P<sequence>[1-9][0-9]*)\|(?P<task_summary>[^|\r\n]+)\|"
    r"(?P<progress>已分配|运行中|检查中|已完成) \|"
    r"(?P<feature_summary>[^|\r\n]+)"
)

# 同一份用户可见项目 Task 序号规则，被多处 required-fragment 校验复用；
# 修改措辞只需改这里，不必逐个校验点同步。
PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS = (
    "`hostId`",
    "`projectId`",
    "`list_threads`",
    "归档",
    "最大有效序号",
    "空历史",
    "缺号不回填",
    "内部 Subagent",
)


def _match_session_progress_title(title: str) -> re.Match[str] | None:
    """返回满足 user-owned Task 三字段标题契约的匹配，否则返回 None。"""

    match = SESSION_PROGRESS_TITLE_PATTERN.fullmatch(title)
    if match is None:
        return None
    if all(
        value and value == value.strip() and len(value.splitlines()) == 1
        for value in (match.group("single_result"),)
    ):
        return match
    return None


def is_valid_session_progress_title(title: str) -> bool:
    """判断标题是否满足当前 user-owned Task 三字段契约。"""

    return _match_session_progress_title(title) is not None


def _match_legacy_session_progress_title(title: str) -> re.Match[str] | None:
    """只把曾经满足旧四字段合同的标题作为历史序号证据。"""

    match = LEGACY_SESSION_PROGRESS_TITLE_PATTERN.fullmatch(title)
    if match is None:
        return None
    if all(
        value and value == value.strip() and len(value.splitlines()) == 1
        for value in (match.group("task_summary"), match.group("feature_summary"))
    ):
        return match
    return None


def allocate_project_task_sequences(
    records: Iterable[object],
    *,
    host_id: str,
    project_id: str,
    count: int = 1,
) -> tuple[int, ...]:
    """按同一宿主和项目的合法 Codex 标题分配连续递增序号。"""

    for field_name, value in (("host_id", host_id), ("project_id", project_id)):
        if not isinstance(value, str) or not value or value != value.strip():
            raise ValueError(f"{field_name} must be a non-empty trimmed string")
    if isinstance(count, bool) or not isinstance(count, int) or count <= 0:
        raise ValueError("count must be a positive integer")

    highest_sequence = 0
    for record in records:
        if not isinstance(record, Mapping):
            continue
        if (
            record.get("kind") != "codex"
            or record.get("hostId") != host_id
            or record.get("projectId") != project_id
        ):
            continue
        title = record.get("title")
        if not isinstance(title, str):
            continue
        match = _match_session_progress_title(title)
        if match is None:
            match = _match_legacy_session_progress_title(title)
        if match is not None:
            highest_sequence = max(highest_sequence, int(match.group("sequence")))

    first_sequence = highest_sequence + 1
    return tuple(range(first_sequence, first_sequence + count))


def validate_agent_policy(
    errors: list[str],
    policy_path: Path = AGENT_POLICY,
    *,
    allow_pending: bool = True,
    require_source_defaults: bool = False,
) -> None:
    """校验五项项目级偏好的稳定 schema、值域和持久执行语义。"""
    if not policy_path.is_file():
        fail(errors, f"missing Agent policy: {display_path(policy_path)}")
        return

    text = read_text_cached(policy_path)
    match = re.match(r"\A---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        fail(errors, f"missing Agent policy YAML frontmatter: {display_path(policy_path)}")
        return

    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        key = key.strip()
        if not separator or not key:
            fail(errors, f"invalid Agent policy frontmatter line: {line}")
            continue
        if key in fields:
            fail(errors, f"duplicate Agent policy field: {key}")
            continue
        fields[key] = value.strip()

    expected_fields = {
        "schema_version",
        "confirmed_by",
        "confirmed_at",
        "decision_mode",
        "superpowers",
        "user_owned_tasks",
        "parallel_worktree_subagents",
        "milestone_smoke",
        "milestone_e2e",
    }
    if set(fields) != expected_fields:
        fail(
            errors,
            "Agent policy fields mismatch: "
            f"missing={sorted(expected_fields - set(fields))}, "
            f"extra={sorted(set(fields) - expected_fields)}",
        )

    if fields.get("schema_version") != "2":
        fail(errors, "Agent policy schema_version must be 2")
    if fields.get("decision_mode") != "reuse_then_infer_then_ask":
        fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask")
    if require_source_defaults and fields.get("superpowers") != "disabled":
        fail(errors, "Harness source Agent policy must default superpowers to disabled")
    if require_source_defaults and fields.get("user_owned_tasks") != "disabled":
        fail(
            errors,
            "Harness source Agent policy must default user_owned_tasks to disabled",
        )
    for field in (
        "superpowers",
        "user_owned_tasks",
        "parallel_worktree_subagents",
        "milestone_smoke",
        "milestone_e2e",
    ):
        if fields.get(field) not in {"enabled", "disabled", "pending"}:
            fail(errors, f"Agent policy {field} must be enabled, disabled, or pending")
        elif not allow_pending and fields.get(field) == "pending":
            fail(errors, f"initialized downstream Agent policy must resolve {field}")
    for field in ("confirmed_by", "confirmed_at"):
        if not fields.get(field):
            fail(errors, f"Agent policy {field} must not be empty")
    if not allow_pending:
        confirmed_by = fields.get("confirmed_by", "").strip()
        if confirmed_by.lower() in {"pending", "unknown", "unset", "n/a"}:
            fail(
                errors,
                "initialized downstream Agent policy confirmed_by must identify "
                "a real confirmation source",
            )
        confirmed_at = fields.get("confirmed_at", "").strip()
        if confirmed_at.lower() in {"pending", "unknown", "unset", "n/a"}:
            fail(
                errors,
                "initialized downstream Agent policy confirmed_at must be resolved",
            )
        else:
            try:
                datetime.fromisoformat(confirmed_at.replace("Z", "+00:00"))
            except ValueError:
                fail(
                    errors,
                    "initialized downstream Agent policy confirmed_at must be "
                    "a calendar-valid ISO date or RFC3339 timestamp",
                )

    required_body_fragments = (
        "完成初始化的下游五项选择只能是 `enabled` 或 `disabled`",
        "`user_owned_tasks`：控制是否由 Agent 自动把新结果拆到 Codex 左侧菜单",
        "`user_owned_tasks: disabled` 是默认状态",
        "用户仍可明确要求创建左侧 Task",
        "`enabled` 是长期授权",
        "一个用户可见 Task 只对应一个明确、可验收的结果",
        "交付物类型变化、生命周期阶段变化",
        "每个项目同一时间只允许一个写入型 active 用户可见 Task",
        "Task0 可以协调和派发，但不得代替实施 Task 写入",
        "Git 项目固定选择",
        "environment.type = worktree",
        "非 Git 项目固定使用同一 project target 与 `environment.type = local`",
        "只返回 `clientThreadId` 表示仍在 setup",
        "保持零实现",
        "取得真实 `threadId`",
        "核对该 id 的标题、`projectId`、cwd 和状态",
        "核对工作区干净及起始提交正确",
        f'`{SESSION_PROGRESS_TITLE_TEMPLATE}`',
        f'title="{SESSION_PROGRESS_TITLE_INITIAL}"',
        "旧标题只用于保留序号连续性",
        *PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS,
        "内部 Subagent 不使用本标题合同、不占用 Task 序号",
        "推荐预设确定性物化五项",
        "`user_owned_tasks: disabled`",
        "开启左侧 Task",
        "关闭左侧 Task",
        "旧 `schema_version: 1` 下游缺少本字段时视为 `disabled`",
        "`parallel_worktree_subagents` 只控制当前 Task 内部",
        "日常开发直接实施",
        "显式发布候选构建必须为当前候选解析一次 E2E 选择",
        "GUI 发布性能选择刻意不进入本文件，每次发布重新解析",
        "每次 GUI 发布开始前解析当次 `performanceSelection: enabled | disabled`",
        "选择 `disabled` 且没有硬要求时跳过探针",
        "产品/渠道要求时执行完整门禁",
    )
    for fragment in required_body_fragments:
        if fragment not in text:
            fail(
                errors,
                f"Agent policy persistence rule missing in {display_path(policy_path)}: {fragment}",
            )

    example = "Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关"
    if example not in text or not is_valid_session_progress_title(example):
        fail(
            errors,
            f"Agent policy must contain a valid progress title example: {example}",
        )
