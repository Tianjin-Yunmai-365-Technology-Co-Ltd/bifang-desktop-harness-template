import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readJson, readText, relativePath } from "./core.mjs";

const VERSION_SKILL = path.join(SKILLS_ROOT, "desktop-manage-version");
const VERSION_GATE = path.join(VERSION_SKILL, "scripts", "version_gate.mjs");
const RELEASE_NOTES = path.join(SKILLS_ROOT, "desktop-prepare-release", "scripts", "release_notes.mjs");
const BRAND_ROOT = path.join(SKILLS_ROOT, "desktop-prepare-gui-support-surfaces", "assets", "brand-support");
const UPGRADE_OWNERSHIP = path.join(SKILLS_ROOT, "desktop-upgrade-harness", "references", "ownership-manifest.json");
const UPGRADE_POLICY = path.join(SKILLS_ROOT, "desktop-upgrade-harness", "references", "ownership-policy.md");

/** 检查同一规则段落中的关键语义和决策顺序，防止零散关键词掩盖相反规则。 */
function requireOrderedPolicy(errors, label, paragraph, fragments) {
  if (!paragraph) {
    fail(errors, `product versioning contract missing ${label} paragraph`);
    return;
  }
  let previousIndex = -1;
  for (const fragment of fragments) {
    const index = paragraph.indexOf(fragment, previousIndex + 1);
    if (index < 0) {
      fail(errors, `product versioning contract missing or out of order in ${label}: ${fragment}`);
      return;
    }
    previousIndex = index;
  }
}

/** 保证已打 tag 的下游先判新需求，且历史最低所需版本不会误判为记录冲突。 */
export function validateDownstreamVersionClassification(errors, implementationSkill, versionSkill) {
  const implementationStep = implementationSkill.split("\n").find((line) => line.startsWith("2. 对已初始化下游，若上次 Git 发布"));
  requireOrderedPolicy(errors, "desktop-implement-change step 2", implementationStep, [
    "在首个新改动和 `plan` 前",
    "$desktop-manage-version finalize-release",
    "新目标、新能力、新使用场景或扩大既有需求",
    "优先分类为 `feature`/Minor",
    "确认不属于新需求后",
    "分类为 `bug-fix`/Patch",
    "记录互相矛盾时",
    "`record-reconciliation`/Minor",
  ]);

  const versionClassification = versionSkill.split("\n").find((line) => line.startsWith("- 已完成正式发布并确认版本 tag"));
  requireOrderedPolicy(errors, "desktop-manage-version classification", versionClassification, [
    "已完成正式发布并确认版本 tag",
    "先判断它是否提出新目标、新能力、新使用场景或扩大既有需求",
    "优先归类为 `feature`，再考虑 `bug-fix`",
    "确认不属于新需求后",
    "归为 `bug-fix`",
  ]);

  const historicalVersion = versionSkill.split("\n").find((line) => line.startsWith("- Product Spec、ADR、Changelog 或 Work Plan"));
  requireOrderedPolicy(errors, "desktop-manage-version historical required_version", historicalVersion, [
    "`required_version` 是变化完成当时的最低所需版本",
    "最终发布版本高于它是合法历史，不属于记录不一致",
    "不得据此回写旧记录或另行提升 Minor",
    "真实冲突须先调查并修正其事实来源",
    "明确两份针对同一事件的记录及不同观察值",
  ]);
}

/** 确认分类、状态、开发提交、构建只读与发布重置形成自动版本闭环。 */
export function validateProductVersioningContract(errors) {
  const requirements = new Map([
    [path.join(ROOT, "docs", "RELEASE.md"), ["新生成的 Minor 与 Patch 使用 `0..99` 的 base-100 数位", "第一个已完成新功能", "问题修复或用户可感知优化", "不受当前周期的功能提升锁影响", "`check`、`plan` 和 `maintenance` 始终零写入", "不兼容任何历史下位分量 `100`", "`finalize-release`", "`record-reconciliation`"]],
    [path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"), ["$desktop-manage-version", ".harness/version-state.json", "首功能/周期升 Minor", "新生成 Minor/Patch 为 `0..99`", "用户可感知优化"]],
    [path.join(SKILLS_ROOT, "desktop-initialize-rust-project", "SKILL.md"), ["$desktop-manage-version init --project-root .", ".harness/version-state.json", "版本 Skill 及其 Node 标准库 helper/测试必须完整保留"]],
    [path.join(SKILLS_ROOT, "desktop-instantiate-project", "SKILL.md"), ["$desktop-manage-version init --project-root .", ".harness/version-state.json", "完整保留该版本 Skill、标准库 helper 和测试"]],
    [path.join(SKILLS_ROOT, "desktop-implement-change", "SKILL.md"), ["`plan`", "$desktop-manage-version apply", "required_version", "maintenance", "用户可感知优化", "base-100 自动进位", "`record-reconciliation`", "$desktop-manage-version finalize-release"]],
    [path.join(SKILLS_ROOT, "desktop-build-rust-release", "SKILL.md"), ["$desktop-manage-version check --phase build", "不得计算、提升版本或重置正式发布周期"]],
    [path.join(SKILLS_ROOT, "desktop-build-tauri-release", "SKILL.md"), ["$desktop-manage-version check --phase build", "构建不得提升版本"]],
    [path.join(SKILLS_ROOT, "desktop-prepare-release", "SKILL.md"), ["$desktop-manage-version check --phase release", "发布准备不补算 Minor/Patch", "finalize-release"]],
    [path.join(VERSION_SKILL, "SKILL.md"), ["一个正式发布周期内", "问题修复或用户可感知优化", "相同 ID", "不受功能锁影响", "维护不改变版本", "新生成的 Minor/Patch 数位在 `0..99`", "Major 不受 99/100 的业务上限约束", "Cargo `u64` 范围", "不兼容任何历史下位分量 `100`", "历史 `bug-fix` ID 被改作其他提升类别", "`plan` 绝不写入文件", "`init` 是唯一允许在独立 Git 建立前运行的命令"]],
    [VERSION_GATE, [
      'STATE_RELATIVE = path.join(".harness", "version-state.json")',
      'new Set(["feature", "bug-fix", "major", "maintenance", "record-reconciliation"])',
      "CARGO_SEMVER_COMPONENT_MAX = (1n << 64n) - 1n",
      "normalized()",
      "bumpMinor()",
      "bumpPatch()",
      "major component exceeds Cargo u64::MAX",
      "automatic Major carry exceeds Cargo u64::MAX",
      "minor and patch components outside supported range 0..99",
      "feature_bump_applied must match pending feature, major, or record-reconciliation changes",
      "applied_reconciliations",
      "first-record-reconciliation-in-release-cycle",
      "pending bug-fix IDs must exist in applied_bug_ids",
      "historical bug-fix IDs cannot be reused by another kind",
      "function decimalIsAtMost(",
      "function finalizeRelease(",
      "function initializationRoot(",
    ]],
    [RELEASE_NOTES, [
      'MAX_SEMVER_MAJOR = "18446744073709551615"',
      "const SEMVER =",
      "const HARNESS_VERSION = /^[0-9]{12}$/",
      "function decimalAtMost(",
      "semantic version major must be within",
      "semantic version minor and patch components must be within 0..99",
    ]],
    [path.join(BRAND_ROOT, "react", "releaseNotesResource.ts"), ['MAX_CARGO_SEMVER_MAJOR = "18446744073709551615"', "function isCargoSemverMajor(", "semantic.slice(2)"]],
    [path.join(BRAND_ROOT, "rust", "release_notes.rs"), ["components[0].parse::<u64>().is_ok()", "value <= 99"]],
    [UPGRADE_POLICY, [".harness/version-state.json", "$desktop-manage-version"]],
  ]);
  for (const [filePath, fragments] of requirements) {
    if (!fs.existsSync(filePath)) {
      fail(errors, `missing product versioning contract file: ${relativePath(filePath)}`);
      continue;
    }
    const text = readText(filePath);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `product versioning contract missing in ${relativePath(filePath)}: ${fragment}`);
    }
  }
  const implementationSkillPath = path.join(SKILLS_ROOT, "desktop-implement-change", "SKILL.md");
  const versionSkillPath = path.join(VERSION_SKILL, "SKILL.md");
  if (fs.existsSync(implementationSkillPath) && fs.existsSync(versionSkillPath)) {
    validateDownstreamVersionClassification(errors, readText(implementationSkillPath), readText(versionSkillPath));
  }
  let manifest;
  try {
    manifest = readJson(UPGRADE_OWNERSHIP);
  } catch (error) {
    fail(errors, `cannot parse upgrade ownership for version state: ${error.message}`);
    return;
  }
  const matching = Array.isArray(manifest.rules)
    ? manifest.rules.filter((rule) => rule?.pattern === ".harness/version-state.json")
    : [];
  if (JSON.stringify(matching) !== JSON.stringify([{ pattern: ".harness/version-state.json", mode: "protected" }])) {
    fail(errors, "upgrade ownership must explicitly protect .harness/version-state.json");
  }
}
