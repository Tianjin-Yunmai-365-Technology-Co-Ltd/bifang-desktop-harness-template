"""校验 Harness 仓库结构、日期记忆、Skills 元数据与本地链接。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import NamedTuple
from urllib.parse import unquote

from .context import *  # noqa: F403
from .repository_memory import validate_daily_project_memory


class _WorkPlanPathRules(NamedTuple):
    """给定任务路径下，Work Plan 允许出现的验收章节与结论声明。"""

    milestone_section_allowed: bool
    verdict_allowed: bool


_WORK_PLAN_PATH_RULES: dict[str | None, _WorkPlanPathRules] = {
    "标准": _WorkPlanPathRules(milestone_section_allowed=False, verdict_allowed=False),
    "里程碑": _WorkPlanPathRules(milestone_section_allowed=True, verdict_allowed=True),
}
_DEFAULT_WORK_PLAN_PATH_RULES = _WorkPlanPathRules(
    milestone_section_allowed=False, verdict_allowed=False
)

def validate_required_files(errors: list[str]) -> None:
    """确认所有规范文档、脚本和门禁入口真实存在。"""
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            fail(errors, f"missing required file: {relative}")



def validate_work_plan_contract(
    errors: list[str],
    plan_path: Path = WORK_PLAN,
    *,
    required: bool = False,
) -> None:
    """按标准/里程碑路径校验可选 Work Plan，并保留严格验收门禁。"""
    if not plan_path.is_file():
        if required:
            fail(errors, f"missing active Work Plan: {display_path(plan_path)}")
        return

    text = read_text_cached(plan_path)
    path_match = re.search(
        r"当前任务路径\s*[：:]\s*`?(快速|标准|里程碑)`?",
        text,
    )
    path_kind = path_match.group(1) if path_match else None
    if path_kind is None:
        fail(errors, "active Work Plan must declare 标准 or 里程碑 task path")
    if path_kind == "快速":
        fail(errors, "quick path must not persist an active Work Plan")
        return
    if "## Todo" not in text:
        fail(errors, f"active Work Plan has no Todo section: {display_path(plan_path)}")

    heading_pattern = re.compile(
        r"^###\s+(TODO-[A-Z0-9-]+)(.*?)$",
        flags=re.MULTILINE,
    )
    heading_matches = list(heading_pattern.finditer(text))
    todo_ids = [match.group(1) for match in heading_matches]
    if not todo_ids:
        fail(errors, f"active Work Plan has no stable Todo IDs: {display_path(plan_path)}")
    duplicates = sorted(
        todo_id for todo_id in set(todo_ids) if todo_ids.count(todo_id) > 1
    )
    if duplicates:
        fail(
            errors,
            "active Work Plan contains duplicate Todo IDs: " + ", ".join(duplicates),
        )

    todo_states: list[tuple[int, str, str | None]] = []
    for index, match in enumerate(heading_matches):
        todo_id = match.group(1)
        heading_suffix = match.group(2)
        states = re.findall(
            r"[（(](pending|in_progress|blocked|done)[）)]",
            heading_suffix,
        )
        if len(states) != 1:
            fail(
                errors,
                f"Todo {todo_id} heading must carry exactly one explicit state",
            )
            state = None
        else:
            state = states[0]
        todo_states.append((match.start(), todo_id, state))
        block_end = (
            heading_matches[index + 1].start()
            if index + 1 < len(heading_matches)
            else len(text)
        )
        block = text[match.end() : block_end]
        field_patterns = {
            "expected behavior": r"(?:预期行为|Expected behavior)\s*[：:]",
            "ownership/boundary": r"(?:影响边界|Ownership/Boundary)\s*[：:]",
            "verification": r"(?:完成验证|验证|Verification)\s*[：:]",
        }
        for label, pattern in field_patterns.items():
            if not re.search(pattern, block, flags=re.IGNORECASE):
                fail(errors, f"Todo {todo_id} is missing per-item {label}")

    milestone_matches = list(
        re.finditer(r"^##\s+验证里程碑\b.*$", text, flags=re.MULTILINE)
    )
    path_rules = _WORK_PLAN_PATH_RULES.get(path_kind, _DEFAULT_WORK_PLAN_PATH_RULES)
    if path_rules.milestone_section_allowed and not milestone_matches:
        fail(
            errors,
            f"milestone path is missing ## 验证里程碑 in {display_path(plan_path)}",
        )
    if milestone_matches and not path_rules.milestone_section_allowed:
        fail(errors, "only a milestone path may contain a 验证里程碑 section")
    if milestone_matches:
        milestone_fragments = ("候选", "`done`", "$desktop-implement-change")
        for fragment in milestone_fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"Work Plan milestone contract missing in {display_path(plan_path)}: {fragment}",
                )
        if not re.search(r"完整(?:真实| Harness|源树|产物)", text):
            fail(
                errors,
                f"Work Plan milestone lacks a complete real candidate: {display_path(plan_path)}",
            )
        if not re.search(r"模拟|桩|占位|脚手架|开发预览|单段文案", text):
            fail(
                errors,
                f"Work Plan milestone lacks substitute rejection: {display_path(plan_path)}",
            )

    verdict_patterns = (
        re.compile(
            r"^\s*(?:[-*]\s*)?"
            r"(?:(?:当前)?(?:里程碑|验收|技术验收)?(?:状态|结论)"
            r"|(?:Milestone|Acceptance)\s+(?:status|verdict))"
            r"\s*[：:]\s*`?"
            r"(?:Technically\s+accepted|Milestone\s+accepted|accepted|passed|已验收|通过)\b",
            flags=re.IGNORECASE | re.MULTILINE,
        ),
        re.compile(
            r"^\s*(?:[-*]\s*)?"
            r"(?:(?:发布|候选)(?:状态|结论)|发布就绪|Release\s+readiness)"
            r"\s*[：:]\s*`?(?:ready|已就绪|可发布)\b",
            flags=re.IGNORECASE | re.MULTILINE,
        ),
    )
    if not path_rules.verdict_allowed and any(pattern.search(text) for pattern in verdict_patterns):
        fail(
            errors,
            "only a milestone path may record an accepted milestone or release-ready verdict",
        )
    previous_milestone_end = 0
    for index, milestone in enumerate(milestone_matches):
        milestone_end = (
            milestone_matches[index + 1].start()
            if index + 1 < len(milestone_matches)
            else len(text)
        )
        milestone_block = text[milestone.end() : milestone_end]
        batch_unfinished = sorted(
            todo_id
            for position, todo_id, state in todo_states
            if previous_milestone_end <= position < milestone.start()
            and state != "done"
        )
        if batch_unfinished and any(
            pattern.search(milestone_block) for pattern in verdict_patterns
        ):
            fail(
                errors,
                "active Work Plan marks a milestone accepted while Todo remains non-done: "
                + ", ".join(batch_unfinished),
            )
        previous_milestone_end = milestone.end()


def parse_frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    """解析 Skill 的最小 YAML frontmatter，并拒绝缺失或额外字段。"""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        fail(errors, f"missing YAML frontmatter: {path.relative_to(ROOT)}")
        return {}

    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            fail(errors, f"invalid frontmatter line in {path.relative_to(ROOT)}: {line}")
            continue
        fields[key.strip()] = value.strip()
    if set(fields) != {"name", "description"}:
        fail(
            errors,
            f"frontmatter must contain only name/description: {path.relative_to(ROOT)}",
        )
    return fields

def yaml_string(text: str, key: str) -> str | None:
    """从受控 UI 元数据中提取一个双引号字符串字段。"""
    match = re.search(rf'^\s*{re.escape(key)}:\s*"([^"]*)"\s*$', text, re.MULTILINE)
    return match.group(1) if match else None

def validate_skills(errors: list[str]) -> None:
    """校验 Skill 集合、frontmatter、UI 元数据和入口声明保持一致。"""
    actual = {path.name for path in SKILLS_ROOT.iterdir() if path.is_dir()}
    if actual != EXPECTED_SKILLS:
        fail(
            errors,
            f"skill set mismatch: missing={sorted(EXPECTED_SKILLS - actual)}, "
            f"extra={sorted(actual - EXPECTED_SKILLS)}",
        )

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    for skill in sorted(actual):
        skill_dir = SKILLS_ROOT / skill
        skill_file = skill_dir / "SKILL.md"
        metadata_file = skill_dir / "agents" / "openai.yaml"
        if not skill_file.is_file():
            fail(errors, f"missing SKILL.md: {skill}")
            continue
        if not metadata_file.is_file():
            fail(errors, f"missing agents/openai.yaml: {skill}")
            continue

        fields = parse_frontmatter(skill_file, errors)
        if fields.get("name") != skill:
            fail(errors, f"skill name does not match directory: {skill}")
        if not fields.get("description"):
            fail(errors, f"empty skill description: {skill}")
        if "TODO" in skill_file.read_text(encoding="utf-8"):
            fail(errors, f"unresolved TODO in skill: {skill}")

        metadata = metadata_file.read_text(encoding="utf-8")
        display_name = yaml_string(metadata, "display_name")
        short_description = yaml_string(metadata, "short_description")
        default_prompt = yaml_string(metadata, "default_prompt")
        if not display_name:
            fail(errors, f"missing display_name: {skill}")
        if not short_description or not 25 <= len(short_description) <= 64:
            fail(errors, f"short_description length must be 25-64: {skill}")
        if not default_prompt or f"${skill}" not in default_prompt:
            fail(errors, f"default_prompt must mention ${skill}: {skill}")

        if f"`${skill}`" not in readme and f"`${'$'}{skill}`" not in readme:
            fail(errors, f"README does not declare skill: {skill}")
        if f"${skill}" not in agents:
            fail(errors, f"AGENTS routing does not mention skill: {skill}")

def validate_markdown_links(errors: list[str]) -> None:
    """解析仓库内 Markdown 链接，并拒绝指向不存在本地目标的引用。"""
    link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    markdown_files = sorted(ROOT.rglob("*.md"))
    for path in markdown_files:
        text = path.read_text(encoding="utf-8")
        for raw_target in link_pattern.findall(text):
            target = raw_target.strip().strip("<>")
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = unquote(target.split("#", 1)[0])
            if not target:
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                fail(
                    errors,
                    f"broken local link in {path.relative_to(ROOT)}: {raw_target}",
                )
