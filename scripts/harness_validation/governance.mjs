import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, relativePath } from "./core.mjs";

const AGENTS_MAX_UTF8_BYTES = 20_000;
const AGENTS_MAX_LINES = 120;
const AGENTS_REQUIRED_HEADINGS = [
  "## 项目使命",
  "## 启动门禁",
  "## 按任务渐进读取",
  "## 始终生效的边界",
  "## Skills 地图",
  "## 约束地图",
  "## 每次任务的最小闭环",
];
const AGENTS_REQUIRED_FRAGMENTS = [
  "先判定任务类型",
  "只读取下表命中的事实来源和 Skill",
  "发现冲突或缺失时才扩大读取",
  "不要为了“完整”加载全部项目记忆、设计标准、发布规则或 Skills",
  "不得一次加载全部 GUI Skills",
  "命中后必须完整读取对应 `SKILL.md`",
  "Harness 源范围门禁",
  "只接受 Harness 自身工程维护",
  "产品目的、业务功能、产品专属 UI/文案/数据",
  "一律不得在当前模板源中接收、分析、记录或实施",
  "切换到已存在终端下游的唯一根目录后重新提出",
  "`superpowers: disabled`",
  "`Task {序号} | {当前进度} | {单一结果}`",
  "同一 `hostId` 与精确 `projectId`",
  "`list_threads(limit=50)`",
  "逐页 `list_archived_threads`",
  "最大有效序号继续递增",
  "空历史才用 1、缺号不回填",
  "内部 plan、Subagent、Worktree",
  "`已分配`、`运行中`、`检查中`、`已完成`",
  "不阻断已经完成的任务结果",
  "安全/隐私、数据迁移、破坏性操作",
  "规格不明确且不同答案会改变产品边界时停止并确认",
  "Core-first 是硬规则",
  "对产出物声称“完成”“可用”或“已验证”",
  "不覆盖或撤销用户已有修改",
  "只读取路由命中的最少事实与 Skills",
  "只运行本次变化需要的测试或最小替代检查",
  "只更新被独立事件触发的权威记录",
  "实际验证、未执行项和剩余风险",
  "node scripts/validate_harness.mjs",
  "项目 Skills 位于 `.agents/skills/`",
  "| 约束或事实 | 唯一来源 | 何时读取 |",
  "$desktop-upgrade-harness",
  "$desktop-manage-version",
  "$desktop-manage-git-lifecycle",
  ".harness/version-state.json",
  "Git common-dir 生命周期清单",
  "`v{版本}-{YYYYMMDD}`",
];

/** 校验根 Agent 入口预算、固定章节顺序和渐进披露语义。 */
export function validateAgentsEntrypoint(errors, filePath = path.join(ROOT, "AGENTS.md")) {
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    fail(errors, `cannot read AGENTS entrypoint ${relativePath(filePath)}: ${error.message}`);
    return;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail(errors, `AGENTS entrypoint must be UTF-8: ${relativePath(filePath)}: ${error.message}`);
    return;
  }
  if (bytes.length > AGENTS_MAX_UTF8_BYTES) fail(errors, `AGENTS entrypoint exceeds UTF-8 byte budget: ${relativePath(filePath)} has ${bytes.length} bytes, limit ${AGENTS_MAX_UTF8_BYTES}`);
  const lines = text.length === 0 ? 0 : text.split(/\r\n|[\n\r]/u).length - (/[\n\r]$/u.test(text) ? 1 : 0);
  if (lines > AGENTS_MAX_LINES) fail(errors, `AGENTS entrypoint exceeds line budget: ${relativePath(filePath)} has ${lines} lines, limit ${AGENTS_MAX_LINES}`);
  if (!text.startsWith("# AGENTS.md\n") && !text.startsWith("# AGENTS.md\r\n")) fail(errors, `AGENTS entrypoint must start with '# AGENTS.md': ${relativePath(filePath)}`);
  const positions = [];
  for (const heading of AGENTS_REQUIRED_HEADINGS) {
    const count = text.split(heading).length - 1;
    if (count !== 1) fail(errors, `AGENTS entrypoint heading must appear exactly once in ${relativePath(filePath)}: ${heading} (observed ${count})`);
    else positions.push(text.indexOf(heading));
  }
  if (positions.length === AGENTS_REQUIRED_HEADINGS.length && positions.some((position, index) => index > 0 && position < positions[index - 1])) fail(errors, `AGENTS entrypoint headings are out of order: ${relativePath(filePath)}`);
  for (const fragment of AGENTS_REQUIRED_FRAGMENTS) {
    if (!text.includes(fragment)) fail(errors, `AGENTS progressive-disclosure contract missing in ${relativePath(filePath)}: ${fragment}`);
  }
}
