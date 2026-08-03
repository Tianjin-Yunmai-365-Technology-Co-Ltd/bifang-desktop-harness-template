"""校验 Harness 仓库结构、日期记忆、Skills 元数据与本地链接。"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote

from .context import *  # noqa: F403

def validate_required_files(errors: list[str]) -> None:
    """确认所有规范文档、脚本和门禁入口真实存在。"""
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            fail(errors, f"missing required file: {relative}")

def validate_daily_project_memory(errors: list[str]) -> None:
    """校验五类按日项目记忆的唯一事实来源、命名、索引和工作流入口。"""
    forbidden_legacy_files = (
        ROOT / "CHANGELOG.md",
        ROOT / "docs" / "DECISIONS.md",
        ROOT / "docs" / "PRODUCT_SPEC.md",
        ROOT / "docs" / "PROJECT_STATUS.md",
        ROOT / "docs" / "WORK_PLAN.md",
    )
    for path in forbidden_legacy_files:
        if path.exists():
            fail(errors, f"legacy growing log must be removed: {display_path(path)}")

    product_is_approved = PRODUCT_SPEC.is_file() and bool(
        re.search(r"状态[：:]\s*Approved", PRODUCT_SPEC.read_text(encoding="utf-8"))
    )
    daily_contracts = (
        (PRODUCT_SPEC_DIR, PRODUCT_SPEC_PATTERN, "Product Spec", True),
        (PRODUCT_STATUS_DIR, PRODUCT_STATUS_PATTERN, "Product Status", True),
        (WORK_PLAN_DIR, WORK_PLAN_PATTERN, "Work Plan", True),
        (ADR_DIR, re.compile(r"^\d{8}_ADR\.md$"), "ADR", product_is_approved),
        (
            CHANGELOG_DIR,
            re.compile(r"^\d{8}_CHANGELOG\.md$"),
            "Changelog",
            product_is_approved,
        ),
    )
    for directory, filename_pattern, label, dated_file_required in daily_contracts:
        if not directory.is_dir():
            fail(errors, f"missing daily {label} directory: {display_path(directory)}")
            continue
        index = directory / "README.md"
        if not index.is_file():
            fail(errors, f"missing daily {label} index: {display_path(index)}")
            index_text = ""
        else:
            index_text = index.read_text(encoding="utf-8")
        daily_files: list[Path] = []
        for path in sorted(directory.glob("*.md")):
            if path.name == "README.md":
                continue
            if not filename_pattern.fullmatch(path.name):
                fail(errors, f"invalid daily {label} filename: {display_path(path)}")
                continue
            daily_files.append(path)
            if path.name not in index_text:
                fail(errors, f"daily {label} file missing from index: {display_path(path)}")
        if dated_file_required and not daily_files:
            fail(errors, f"no dated {label} file found in {display_path(directory)}")

    required_fragments = {
        PRODUCT_SPEC_DIR / "README.md": (
            "YYYYMMDD_product_spec.md",
            "同一天只维护一份产品规格",
            "读取前一份产品规格",
            "完整的当前规格",
        ),
        PRODUCT_STATUS_DIR / "README.md": (
            "YYYYMMDD_product_status.md",
            "同一天只维护一份产品状态",
            "读取前一份产品状态",
            "完整的当前状态",
        ),
        WORK_PLAN_DIR / "README.md": (
            "YYYYMMDD_work_plan.md",
            "同一天只维护一份工作计划",
            "读取前一份工作计划",
            "完整的当前计划",
            "Todo` 批次和对应验证里程碑",
            "当前批次任一 Todo 非 `done` 时",
            "模拟实现、桩实现、占位、中性脚手架",
            "重开或新增 Todo 并返回编码",
        ),
        ADR_DIR / "README.md": (
            "YYYYMMDD_ADR.md",
            "同一天不得新建第二个 ADR 文件",
            "独立 `ADR-YYYYMMDD-NNN` 条目",
        ),
        CHANGELOG_DIR / "README.md": (
            "YYYYMMDD_CHANGELOG.md",
            "同一天的实际变化持续更新同一文件",
            "尚未实施的需求只进入 ADR 和计划",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "日期最新的产品规格",
            "综合重写完整的当前快照",
            "日期最新的 ADR",
        ),
        SKILLS_ROOT / "plan-change" / "SKILL.md": (
            "日期最新的产品状态",
            "从前一份快照综合重写其中仍有效的内容",
            "日期最新的 ADR",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "日期最新的工作计划",
            "从前一份日期文件综合重写每份当前快照",
            "日期最新的 ADR",
            "docs/changelog/YYYYMMDD_CHANGELOG.md",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "日期最新的产品规格",
            "日期最新的工作计划",
            "日期最新的 ADR",
            "docs/changelog/YYYYMMDD_CHANGELOG.md",
        ),
        SKILLS_ROOT / "prepare-release" / "SKILL.md": ("docs/changelog/README.md",),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing daily project-memory contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"daily project-memory rule missing in {display_path(path)}: {fragment}",
                )


def validate_work_plan_contract(
    errors: list[str],
    plan_path: Path = WORK_PLAN,
) -> None:
    """确认活动计划具有可机读 Todo 状态、里程碑准入和失败回流。"""
    if not plan_path.is_file():
        fail(errors, f"missing active Work Plan: {display_path(plan_path)}")
        return

    text = plan_path.read_text(encoding="utf-8")
    required_fragments = (
        "## Todo",
        "## 验证里程碑",
        "pending",
        "in_progress",
        "blocked",
        "`done`",
        "完整真实",
        "模拟实现",
        "脚手架",
        "重开",
        "返回 `$implement-change`",
    )
    for fragment in required_fragments:
        if fragment not in text:
            fail(
                errors,
                f"Work Plan Todo/milestone contract missing in {display_path(plan_path)}: {fragment}",
            )

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
            "verification": r"(?:完成验证|Verification)\s*[：:]",
        }
        for label, pattern in field_patterns.items():
            if not re.search(pattern, block, flags=re.IGNORECASE):
                fail(errors, f"Todo {todo_id} is missing per-item {label}")

    milestone_matches = list(
        re.finditer(r"^##\s+验证里程碑\b.*$", text, flags=re.MULTILINE)
    )
    accepted_status_pattern = re.compile(
        r"^\s*(?:[-*]\s*)?"
        r"(?:(?:当前)?(?:里程碑|验收|技术验收)?(?:状态|结论)"
        r"|(?:Milestone|Acceptance)\s+(?:status|verdict))"
        r"\s*[：:]\s*`?"
        r"(?:Technically\s+accepted|Milestone\s+accepted|accepted|passed|已验收|通过)\b",
        flags=re.IGNORECASE | re.MULTILINE,
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
        if batch_unfinished and accepted_status_pattern.search(milestone_block):
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
