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
        "预设只是输入捷径，不新增持久字段",
        "Harness 源字段值不是下游确认",
        "不得在用户未确认时静默采用",
        "才一次原子写入本文件",
        "只验证并复用，不重复询问",
        "日常开发直接实施",
        "显式构建必须为当前构建解析一次 E2E 选择",
        "选择只对当前构建有效",
        "持久启用本身不能触发并行步骤",
    )
    for fragment in required_body_fragments:
        if fragment not in text:
            fail(
                errors,
                f"Agent policy persistence rule missing in {display_path(policy_path)}: {fragment}",
            )
