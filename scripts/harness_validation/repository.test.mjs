import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { ROOT } from "./core.mjs";
import { validateMarkdownLinks, validateSkillsMap, validateWorkPlanContract } from "./repository.mjs";
import { REQUIRED_ROOT_FILES } from "./repository_required_files.mjs";
import { safeRelativePath } from "../../.agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_safety.mjs";
import {
  validateCurrentChangelogContract,
  validateDailyProjectMemory,
  validateSupersededReleaseLifecycleFragments,
} from "./repository_memory.mjs";

/** 源仓库固定清单只在上游校验，避免下游测试导入已裁剪文件。 */
test("required_root_paths_are_unique_and_canonical", () => {
  assert.equal(new Set(REQUIRED_ROOT_FILES).size, REQUIRED_ROOT_FILES.length);
  for (const relative of REQUIRED_ROOT_FILES) assert.equal(safeRelativePath(relative), relative);
});

/** 合法目录可使用带或不带美元符号的精确 Skill 名称，后续章节不进入索引范围。 */
test("skills_map_accepts_exact_complete_inventory", () => {
  const errors = [];
  validateSkillsMap(errors, "# Entry\n## Skills 索引\n`$desktop-first`、`desktop-second`\n## Next\n`$desktop-unrelated`\n", {
    file: "README.md", heading: "## Skills 索引", expected: new Set(["desktop-first", "desktop-second"]),
  });
  assert.deepEqual(errors, []);
});

/** 分类使用三级标题，索引仍须覆盖其下全部 Skill，不能只检查首类。 */
test("skills_map_reads_all_categorized_subsections", () => {
  const errors = [];
  validateSkillsMap(errors, "# Entry\n## Skills 索引\n### 创建\n[`$desktop-first`](first/SKILL.md)\n### 验收\n[`$desktop-second`](second/SKILL.md)\n## Next\n`$desktop-unrelated`\n", {
    file: ".agents/skills/README.md", heading: "## Skills 索引", expected: new Set(["desktop-first", "desktop-second"]),
  });
  assert.deepEqual(errors, []);
});

/** 索引漏项不能由其它段落中的说明补足，防止新增 Skill 后出现不可发现的入口。 */
test("skills_map_rejects_omission_despite_mentions_elsewhere", () => {
  const errors = [];
  validateSkillsMap(errors, "`$desktop-second`\n## Skills 地图\n`$desktop-first`\n## Next\n`$desktop-second`\n", {
    file: "AGENTS.md", heading: "## Skills 地图", expected: new Set(["desktop-first", "desktop-second"]),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /索引遗漏 Skill: desktop-second/u);
});

/** 已删除技能不能继续作为目录入口；缺少索引标题也必须给出明确失败。 */
test("skills_map_rejects_retired_entries_and_missing_section", () => {
  const options = { file: "README.md", heading: "## Skills 索引", expected: new Set(["desktop-first"]) };
  const errors = [];
  validateSkillsMap(errors, "## Skills 索引\n`$desktop-first`、`$desktop-retired`\n", options);
  assert.match(errors[0], /不存在的 Skill: desktop-retired/u);
  const absent = [];
  validateSkillsMap(absent, "# Entry\n`$desktop-first`\n", options);
  assert.match(absent[0], /缺少 Skills 索引章节/u);
});

/** 本地章节链接覆盖同页、跨页、重复标题和显式 HTML id。 */
test("markdown_links_validate_local_fragments", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-markdown-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "README.md"), "# 首页\n[同页](#首页)\n[跨页](guide.md#第一章)\n[编码](guide.md#%E7%AC%AC%E4%B8%80%E7%AB%A0)\n[重复](guide.md#重复-1)\n[显式](guide.md#manual-id)\n[外部](https://example.com/#missing)\n");
  fs.writeFileSync(path.join(root, "guide.md"), "# 第一章\n## 重复\n## 重复\n<a id=\"manual-id\"></a>\n```md\n# 伪标题\n```\n");
  const errors = [];
  validateMarkdownLinks(errors, ["README.md", "guide.md"], root);
  assert.deepEqual(errors, []);

  fs.appendFileSync(path.join(root, "README.md"), "[失效章节](guide.md#不存在)\n[代码伪标题](guide.md#伪标题)\n[失效同页](#不存在)\n");
  const broken = [];
  validateMarkdownLinks(broken, ["README.md", "guide.md"], root);
  assert.equal(broken.filter((error) => error.includes("失效本地 Markdown 锚点")).length, 3, broken.join("\n"));
});

/** 复制保留的脚本与引用到隔离下游，不携带上游专属校验目录。 */
function retainedSkillFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retained-skill-tests-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const skill of ["desktop-upgrade-harness", "desktop-configure-agent-policy", "desktop-switch-post-release-action", "desktop-implement-change"]) {
    for (const directory of ["scripts", "references"]) {
      const relative = path.join(".agents", "skills", skill, directory);
      if (fs.existsSync(path.join(ROOT, relative))) {
        fs.cpSync(path.join(ROOT, relative), path.join(root, relative), { recursive: true });
      }
    }
  }
  return root;
}

/** 子测试启动独立报告器，避免继承父测试 runner 的内部进程协议。 */
function runRetainedTests(args) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...args], { encoding: "utf8", timeout: 30000, env: environment });
}

/** 下游升级测试在上游专属清单已裁剪后仍能加载并验证保留路径。 */
test("retained_upgrade_tests_run_without_source_only_validation_files", (t) => {
  const root = retainedSkillFixture(t);
  assert.equal(fs.existsSync(path.join(root, "scripts/harness_validation")), false);
  const result = runRetainedTests(["--test-name-pattern", "required_managed_paths_are_unique_and_canonical", path.join(root, ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_plan.test.mjs")]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /required_managed_paths_are_unique_and_canonical/u);
});

/** 已确认的下游策略不能改变保留测试自己的能力与确认夹具。 */
test("retained_policy_tests_run_with_initialized_project_preferences", (t) => {
  const root = retainedSkillFixture(t);
  const policy = fs.readFileSync(path.join(ROOT, "docs/AGENT_POLICY.md"), "utf8")
    .replace(/^confirmed_by: .*$/mu, "confirmed_by: downstream-user")
    .replace(/^confirmed_at: .*$/mu, "confirmed_at: 2026-10-01")
    .replace(/^(superpowers|user_owned_tasks|parallel_worktree_subagents|acceptance_smoke|e2e_hint): .*$/gmu, "$1: enabled")
    .replace(/^post_release_action: .*$/mu, "post_release_action: local_package");
  fs.mkdirSync(path.join(root, "docs"));
  for (const newline of ["\n", "\r\n"]) {
    const bytes = policy.replaceAll("\r\n", "\n").replaceAll("\n", newline);
    fs.writeFileSync(path.join(root, "docs/AGENT_POLICY.md"), bytes);
    const result = runRetainedTests([path.join(root, ".agents/skills/desktop-configure-agent-policy/scripts/agent_policy.test.mjs")]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /# pass [1-9]\d*\b/u);
    assert.equal(fs.readFileSync(path.join(root, "docs/AGENT_POLICY.md"), "utf8"), bytes);
  }
});

function withTextFile(text, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-repository-"));
  const filePath = path.join(directory, "fixture.md");
  fs.writeFileSync(filePath, text);
  try {
    callback(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const VALID_PLAN = `# Plan

## Todo

### TODO-A（pending）

- 预期行为：完成 A。
- 影响边界：只改 A。
- 验证：运行 A 测试。
`;

test("current project memory and optional plan are valid", () => {
  const errors = [];
  validateDailyProjectMemory(errors);
  validateWorkPlanContract(errors);
  assert.deepEqual(errors, []);
});

test("valid minimal work plan is accepted", () => withTextFile(VALID_PLAN, (filePath) => {
  const errors = [];
  validateWorkPlanContract(errors, filePath, { required: true });
  assert.deepEqual(errors, []);
}));

test("work plan requires stable unique IDs, state, and per-item fields", () => {
  const mutations = [
    VALID_PLAN.replace("TODO-A（pending）", "item A"),
    `${VALID_PLAN}\n### TODO-A（done）\n\n- 预期行为：B\n- 影响边界：B\n- 验证：B\n`,
    VALID_PLAN.replace("（pending）", ""),
    VALID_PLAN.replace("- 验证：运行 A 测试。\n", ""),
  ];
  for (const mutation of mutations) {
    withTextFile(mutation, (filePath) => {
      const errors = [];
      validateWorkPlanContract(errors, filePath, { required: true });
      assert.ok(errors.length > 0);
    });
  }
});

test("work plan rejects candidate evidence and readiness verdicts", () => {
  for (const evidence of ["- sourceCommit: deadbeef", "- 候选状态：accepted", "- 发布就绪：ready"]) {
    withTextFile(`${VALID_PLAN}\n${evidence}\n`, (filePath) => {
      const errors = [];
      validateWorkPlanContract(errors, filePath);
      assert.ok(errors.some((error) => error.includes("candidate evidence")));
    });
  }
});

test("missing required work plan fails while optional absence passes", () => {
  const missing = path.join(os.tmpdir(), `missing-work-plan-${process.pid}.md`);
  let errors = [];
  validateWorkPlanContract(errors, missing);
  assert.deepEqual(errors, []);
  errors = [];
  validateWorkPlanContract(errors, missing, { required: true });
  assert.ok(errors.some((error) => error.includes("missing active Work Plan")));
});

test("current changelog rejects superseded Task title claims", () => {
  withTextFile("当前显示标题固定使用 `{任务}-{ID}-{摘要}`\n", (filePath) => {
    const errors = [];
    validateCurrentChangelogContract(errors, filePath);
    assert.equal(errors.length, 1);
  });
});

test("superseded lifecycle checker uses injected contracts", () => {
  withTextFile("发布准备仍要求匹配的\n", (filePath) => {
    const errors = [];
    validateSupersededReleaseLifecycleFragments(errors, [[filePath, ["发布准备仍要求匹配的"]]]);
    assert.equal(errors.length, 1);
  });
});

test("daily memory validator does not mutate repository", () => {
  const before = fs.statSync(path.join(ROOT, "docs", "product_spec", "README.md")).mtimeMs;
  const errors = [];
  validateDailyProjectMemory(errors);
  const after = fs.statSync(path.join(ROOT, "docs", "product_spec", "README.md")).mtimeMs;
  assert.deepEqual(errors, []);
  assert.equal(after, before);
});
