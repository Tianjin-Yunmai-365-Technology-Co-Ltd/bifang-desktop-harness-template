"""校验五项持久 Agent 策略的 schema、确认元数据与正文语义。"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import datetime
from pathlib import Path

from .context import AGENT_POLICY, display_path, fail, read_text_cached


SESSION_PROGRESS_TITLE_TEMPLATE = "{序号}|{Task简述}|{当前进度} |{功能摘要}"
SESSION_PROGRESS_TITLE_INITIAL = "{序号}|{Task简述}|已分配 |{功能摘要}"
SESSION_PROGRESS_STATES = ("已分配", "运行中", "检查中", "已完成")
SESSION_PROGRESS_TITLE_PATTERN = re.compile(
    r"(?P<sequence>[1-9][0-9]*)\|(?P<task_summary>[^|\r\n]+)\|"
    r"(?P<progress>已分配|运行中|检查中|已完成) \|"
    r"(?P<feature_summary>[^|\r\n]+)"
)

# 同一份用户可见项目 Task 序号规则，被多处 required-fragment 校验复用；
# 修改措辞只需改这里，不必逐个校验点同步。
PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS = (
    "同一 `hostId` 与精确 `projectId`",
    "`list_threads(limit=50)`",
    "`list_archived_threads`",
    "最大有效序号加 1",
    "空历史才从 1 开始",
    "缺号不回填",
    "隐藏 Subagent 不占用项目序列",
)


def _match_session_progress_title(title: str) -> re.Match[str] | None:
    """返回满足四字段顺序、四态和精确空格契约的正则匹配，否则返回 None。"""

    match = SESSION_PROGRESS_TITLE_PATTERN.fullmatch(title)
    if match is None:
        return None
    if all(
        value and value == value.strip() and len(value.splitlines()) == 1
        for value in (match.group("task_summary"), match.group("feature_summary"))
    ):
        return match
    return None


def is_valid_session_progress_title(title: str) -> bool:
    """判断 Session 标题是否满足四字段顺序、四态和精确空格契约。"""

    return _match_session_progress_title(title) is not None


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
        "left_git_task_worktree",
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
    if require_source_defaults and fields.get("left_git_task_worktree") != "pending":
        fail(
            errors,
            "Harness source Agent policy must leave left_git_task_worktree pending",
        )
    for field in (
        "superpowers",
        "left_git_task_worktree",
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
        "构建 E2E 建议默认值的唯一持久事实来源",
        "完成初始化的下游五项选择只能是 `enabled` 或 `disabled`",
        "`left_git_task_worktree`：控制用户明确要求创建的左侧 Git Task",
        "初始化必须单独询问并记录本项",
        "推荐预设",
        "推荐预设只物化另外四项",
        "并与用户单独确认的 `left_git_task_worktree` 合并成最终五项策略",
        "预设只是输入捷径，不新增持久字段",
        "Harness 源字段值不是下游确认",
        "不得在用户未确认时静默采用",
        "才以 `schema_version: 2` 一次原子写入本文件",
        "只验证并复用，不重复询问",
        "日常开发直接实施",
        "显式发布候选构建必须为当前候选解析一次 E2E 选择",
        "E2E 选择只对当前发布候选有效",
        "本地开发试包不消费 E2E/性能选择",
        "持久启用本身不能触发并行步骤",
        "本节只约束用户能从侧栏独立进入的 user-owned Task/thread",
        "`left_git_task_worktree` 只控制左侧 Git Task 自身使用 Worktree 还是 Local",
        "Git 项目读取 `left_git_task_worktree`",
        "Git Local 模式派发写入型 Task 前必须确认保存 checkout 干净",
        "开启左侧 Git Task Worktree",
        "关闭左侧 Git Task Worktree",
        "只影响切换成功后新创建的左侧 Git Task",
        "旧 `schema_version: 1` 下游缺少本字段时继续按历史规则视为 `enabled`",
        "不得只因生命周期阶段变化自动拆 Task",
        "按规范化完整路径精确选中保存项目",
        "target.type = project",
        "只返回 `clientThreadId` 表示创建请求已接受但仍为 `SETUP_PENDING`",
        "不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建",
        "用户随后明确要求检查先前 queued Task",
        "只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`",
        "git rev-parse --path-format=absolute --git-common-dir",
        "git worktree list --porcelain",
        "不硬编码 `main` 或 `master`",
        "`$desktop-manage-git-lifecycle start --summary <feature-summary>`",
        f'`{SESSION_PROGRESS_TITLE_TEMPLATE}`',
        f'title="{SESSION_PROGRESS_TITLE_INITIAL}"',
        "无前导零的正十进制整数",
        "`Task简述` 与 `功能摘要` 都必须单行、首尾无空白",
        "`已分配`、`运行中`、`检查中`、`已完成`",
        "`序号`、`Task简述` 和 `功能摘要` 在同一结果内保持不变，只更新第三字段",
        "Task 描述记录不可变的 Task key",
        "稳定序号",
        "显示标题与 Git 摘要是两个事实",
        "不得根据返回 id 重新分配序号",
        *PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS,
        "普通当前 Session 在首次形成三个稳定字段并开始处理时直接更新为 `运行中`",
        "每次真实进度转换至多尝试一次标题更新",
        "调用 `set_thread_title` 并省略 `threadId`",
        "检查发现同范围问题并返回修复时重新更新为 `运行中`",
        "只有授权结果、全部必需检查，以及请求或流程要求的提交、推送和远端复读都已完成，才在最终回复前更新为 `已完成`",
        "`已完成` 是终态",
        "遇到阻断时保留最后真实阶段并在正文报告，不得虚写 `已完成` 或创造第五种状态",
        "按同一真实 id 比较宿主返回的规范化标题原文",
        "内部 Subagent 取得执行权后的第一项 UI 动作",
        "`spawn_agent` 不提供显示标题参数",
        "内部单元 Worktree 本身没有独立 Session 标题",
        "隐藏 Subagent 不出现在 `list_threads` 时改用 `read_thread`",
        "不得推翻已经完成的任务结果",
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

    example = "4|统一Session标题格式|运行中 |统一普通会话、Worktree与Subagent命名"
    if example not in text or not is_valid_session_progress_title(example):
        fail(
            errors,
            f"Agent policy must contain a valid progress title example: {example}",
        )
