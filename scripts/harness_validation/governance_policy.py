"""校验四项持久 Agent 策略的 schema、确认元数据与正文语义。"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from .context import AGENT_POLICY, display_path, fail, read_text_cached


def validate_agent_policy(
    errors: list[str],
    policy_path: Path = AGENT_POLICY,
    *,
    allow_pending: bool = True,
    require_source_defaults: bool = False,
) -> None:
    """校验四项项目级偏好的稳定 schema、值域和持久执行语义。"""
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

    if fields.get("schema_version") != "1":
        fail(errors, "Agent policy schema_version must be 1")
    if fields.get("decision_mode") != "reuse_then_infer_then_ask":
        fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask")
    if require_source_defaults and fields.get("superpowers") != "disabled":
        fail(errors, "Harness source Agent policy must default superpowers to disabled")
    for field in (
        "superpowers",
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
        "完成初始化的下游四项选择只能是 `enabled` 或 `disabled`",
        "推荐预设",
        "推荐预设物化为 `superpowers: disabled`",
        "预设只是输入捷径，不新增持久字段",
        "Harness 源字段值不是下游确认",
        "不得在用户未确认时静默采用",
        "才一次原子写入本文件",
        "只验证并复用，不重复询问",
        "日常开发直接实施",
        "显式发布候选构建必须为当前候选解析一次 E2E 选择",
        "E2E 选择只对当前发布候选有效",
        "本地开发试包不消费 E2E/性能选择",
        "持久启用本身不能触发并行步骤",
        "本节只约束用户能从侧栏独立进入的 user-owned Task/thread",
        "不得只因生命周期阶段变化自动拆 Task",
        "按规范化完整路径精确选中保存项目",
        "target.type = project",
        "只返回 `clientThreadId` 表示创建请求已接受但仍为 `SETUP_PENDING`",
        "不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建",
        "用户随后明确要求检查先前 queued Task",
        "git rev-parse --path-format=absolute --git-common-dir",
        "git worktree list --porcelain",
        "不硬编码 `main` 或 `master`",
        "`codex/task-<task-slug>`",
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
