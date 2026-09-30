import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ensureDesignSkill, loadDesignSkillSnapshot, SNAPSHOT_ROOT } from "./ensure_design_skill.mjs";

/** 每个场景使用独立 pre-Git 下游根，结束后只清理自己的临时目录。 */
function withProject(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "harness-local-design-skill-"));
  const root = path.join(temporary, "downstream");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "Cargo.toml"), '[workspace.metadata.agent-first-harness]\ninterfaces = ["cli"]\n');
  try { callback(root, temporary); } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

/** 证明安装只写项目本地目录，复制真实上游字节、许可和来源，且无需 Git 或网络。 */
test("missing_project_skill_installs_original_snapshot_with_license_and_provenance", () => {
  withProject((root) => {
    const result = ensureDesignSkill(root);
    assert.equal(result.status, "installed");
    assert.equal(result.path, path.join(fs.realpathSync(root), ".agents/skills/design-taste-frontend"));
    for (const file of ["SKILL.md", "LICENSE", "source.json"]) {
      assert.deepEqual(fs.readFileSync(path.join(result.path, file)), fs.readFileSync(path.join(SNAPSHOT_ROOT, file)));
    }
    assert.equal(fs.existsSync(path.join(root, ".git")), false);
    assert.equal(fs.existsSync(path.join(root, ".codex")), false);
    assert.deepEqual(fs.readdirSync(path.dirname(result.path)), ["design-taste-frontend"]);
  });
});

/** 已有有效的本地版本即使经过项目定制也复用；不要求安装源仍存在。 */
test("existing_valid_project_skill_is_reused_without_overwriting_local_changes", () => {
  withProject((root) => {
    const installed = ensureDesignSkill(root);
    const skill = path.join(installed.path, "SKILL.md");
    const custom = fs.readFileSync(skill, "utf8") + "\nProject-specific design notes.\n";
    fs.writeFileSync(skill, custom);
    const reused = ensureDesignSkill(root, { snapshotRoot: path.join(root, "missing-snapshot") });
    assert.equal(reused.status, "reused");
    assert.equal(fs.readFileSync(skill, "utf8"), custom);
  });
});

/** 其他位置存在同名 Skill 不算目标项目已有安装，且这些文件不得被修改。 */
test("skill_outside_project_does_not_replace_project_local_installation", () => {
  withProject((root, temporary) => {
    const external = path.join(temporary, "global-skills/design-taste-frontend");
    fs.mkdirSync(external, { recursive: true });
    fs.writeFileSync(path.join(external, "SKILL.md"), "existing external skill");
    assert.equal(ensureDesignSkill(root).status, "installed");
    assert.equal(fs.readFileSync(path.join(external, "SKILL.md"), "utf8"), "existing external skill");
  });
});

/** 空目录可补装；含用户文件却缺少入口时失败且保留原目录。 */
test("empty_skill_directory_installs_but_partial_user_content_is_preserved", () => {
  withProject((root) => {
    const local = path.join(root, ".agents/skills/design-taste-frontend");
    fs.mkdirSync(local, { recursive: true });
    assert.equal(ensureDesignSkill(root).status, "installed");
    fs.unlinkSync(path.join(local, "SKILL.md"));
    assert.throws(() => ensureDesignSkill(root), /已有其他内容/u);
    assert.equal(fs.existsSync(path.join(local, "LICENSE")), true);
  });
});

/** 不以覆盖来修复已有无效入口，保留其精确字节。 */
test("invalid_existing_skill_fails_without_overwriting", () => {
  withProject((root) => {
    const local = path.join(root, ".agents/skills/design-taste-frontend");
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, "SKILL.md"), "invalid local content");
    assert.throws(() => ensureDesignSkill(root), /Skill 无效/u);
    assert.equal(fs.readFileSync(path.join(local, "SKILL.md"), "utf8"), "invalid local content");
  });
});

/** 三种项目内部目录链接均在写入前阻断，不能经链接安装到项目之外。 */
test("symlinked_skill_ancestors_are_rejected_before_external_writes", () => {
  for (const segment of [".agents", ".agents/skills", ".agents/skills/design-taste-frontend"]) {
    withProject((root, temporary) => {
      const outside = path.join(temporary, "outside");
      fs.mkdirSync(outside);
      const link = path.join(root, segment);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
      assert.throws(() => ensureDesignSkill(root), /非符号链接/u);
      assert.deepEqual(fs.readdirSync(outside), []);
    });
  }
});

/** 来源任一文件摘要变化都失败；目标 Skill 目录不被提前创建。 */
test("corrupt_snapshot_is_rejected_before_project_mutation", () => {
  for (const file of ["SKILL.md", "LICENSE"]) {
    withProject((root, temporary) => {
      const snapshot = path.join(temporary, "snapshot");
      fs.cpSync(SNAPSHOT_ROOT, snapshot, { recursive: true });
      fs.appendFileSync(path.join(snapshot, file), "tampered");
      assert.throws(() => ensureDesignSkill(root, { snapshotRoot: snapshot }), /摘要不一致/u);
      assert.equal(fs.existsSync(path.join(root, ".agents")), false);
    });
  }
});

/** 来源不合法、许可链接或缺文件不能形成可用安装包。 */
test("snapshot_provenance_and_regular_file_requirements_fail_closed", (t) => {
  withProject((root, temporary) => {
    const snapshot = path.join(temporary, "snapshot");
    fs.cpSync(SNAPSHOT_ROOT, snapshot, { recursive: true });
    const source = path.join(snapshot, "source.json");
    const metadata = JSON.parse(fs.readFileSync(source, "utf8"));
    metadata.repository = "https://example.invalid/other-skill";
    fs.writeFileSync(source, JSON.stringify(metadata));
    assert.throws(() => loadDesignSkillSnapshot(snapshot), /来源记录无效/u);
    fs.copyFileSync(path.join(SNAPSHOT_ROOT, "source.json"), source);
    fs.unlinkSync(path.join(snapshot, "LICENSE"));
    try {
      fs.symlinkSync(path.join(SNAPSHOT_ROOT, "LICENSE"), path.join(snapshot, "LICENSE"));
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        t.skip("当前 Windows 主机未授予文件符号链接权限");
        return;
      }
      throw error;
    }
    assert.throws(() => loadDesignSkillSnapshot(snapshot), /非符号链接/u);
  });
});

/** 有效的带引号 YAML 名称也视为现有本地 Skill，不强制用户改写元数据。 */
test("quoted_skill_name_is_reused_and_empty_description_is_rejected", () => {
  withProject((root) => {
    const local = path.join(root, ".agents/skills/design-taste-frontend");
    fs.mkdirSync(local, { recursive: true });
    const file = path.join(local, "SKILL.md");
    fs.writeFileSync(file, '---\nname: "design-taste-frontend"\ndescription: x\n---\nLocal design guidance.\n');
    assert.equal(ensureDesignSkill(root).status, "reused");
    fs.writeFileSync(file, '---\nname: design-taste-frontend\ndescription:\nextra: value\n---\nLocal design guidance.\n');
    assert.throws(() => ensureDesignSkill(root), /Skill 无效/u);
  });
});

/** 引号空串、注释、非字符串值或重复关键字段都失败，既有字节不被覆盖。 */
test("invalid_scalar_values_and_duplicate_skill_fields_preserve_local_content", () => {
  const fields = [
    ...['""', "''", "# missing", "null", "true", "42", "[]", "{}"].map((value) => `name: design-taste-frontend\ndescription: ${value}`),
    "name: design-taste-frontend\nname: other-skill\ndescription: valid",
    'name: design-taste-frontend\n"name" : other-skill\ndescription: valid',
    "name: design-taste-frontend\ndescription: valid\ndescription: other",
    "name: design-taste-frontend\ndescription: >-\n  ",
  ];
  for (const header of fields) withProject((root) => {
    const local = path.join(root, ".agents/skills/design-taste-frontend");
    fs.mkdirSync(local, { recursive: true });
    const file = path.join(local, "SKILL.md");
    const original = `---\n${header}\n---\nLocal design guidance.\n`;
    fs.writeFileSync(file, original);
    assert.throws(() => ensureDesignSkill(root), /Skill 无效/u, header);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });
});

/** 带注释的普通或引号标量、空白分隔与非空块描述仍可复用。 */
test("valid_local_scalar_and_block_descriptions_are_reused", () => {
  for (const description of ['"Local: guidance # literal" # comment', "'Local designer''s guidance'", "Local guidance # comment", ">-\n  Local guidance.\n  More details.", "|\n  Local guidance."]) {
    withProject((root) => {
      const local = path.join(root, ".agents/skills/design-taste-frontend");
      fs.mkdirSync(local, { recursive: true });
      fs.writeFileSync(path.join(local, "SKILL.md"), `---\nname: design-taste-frontend # comment\n\ndescription: ${description}\n---\nBody.\n`);
      assert.equal(ensureDesignSkill(root).status, "reused");
    });
  }
});

/** CLI 必須显式指定下游根且拒绝全局选项；真实两次调用返回 installed/reused。 */
test("cli_requires_downstream_root_and_is_idempotent", () => {
  withProject((root) => {
    const script = fileURLToPath(new URL("./ensure_design_skill.mjs", import.meta.url));
    for (const status of ["installed", "reused"]) {
      const result = spawnSync(process.execPath, [script, "--project-root", root], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }
    for (const args of [[], ["--global"], ["--project-root", root, "--global"]]) {
      const rejected = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
      assert.equal(rejected.status, 1);
      assert.equal(JSON.parse(rejected.stdout).status, "error");
    }
  });
});

/** 复制到下游的初始化器从自身快照完成真实安装；裁剪初始化目录后实际 Skill 独立保留。 */
test("copied_initializer_installs_locally_and_pruning_keeps_the_installed_skill", () => {
  withProject((root) => {
    const initializer = path.join(root, ".agents/skills/desktop-initialize-rust-project");
    fs.cpSync(fileURLToPath(new URL("../", import.meta.url)), initializer, { recursive: true });
    const script = path.join(initializer, "scripts/ensure_design_skill.mjs");
    const result = spawnSync(process.execPath, [script, "--project-root", root], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const installed = JSON.parse(result.stdout);
    assert.equal(installed.status, "installed");
    fs.rmSync(initializer, { recursive: true });
    for (const file of ["SKILL.md", "LICENSE", "source.json"]) {
      assert.deepEqual(fs.readFileSync(path.join(installed.path, file)), fs.readFileSync(path.join(SNAPSHOT_ROOT, file)));
    }
    assert.equal(fs.existsSync(initializer), false);
    const guidance = fs.readFileSync(new URL("../../../../docs/design_standards/taste_skill.md", import.meta.url), "utf8");
    assert.match(guidance, /\.agents\/skills\/design-taste-frontend/u);
    assert.doesNotMatch(guidance, /desktop-initialize-rust-project|ensure_design_skill\.mjs|assets\/vendor\//u);
  });
});

/** 非下游根与 Harness 源根都不能被当作安装目标。 */
test("non_downstream_and_harness_source_roots_are_rejected", () => {
  withProject((root) => {
    fs.writeFileSync(path.join(root, "Cargo.toml"), "[workspace]\n");
    assert.throws(() => ensureDesignSkill(root), /下游 Harness Cargo/u);
    fs.writeFileSync(path.join(root, "Version.md"), "Harness version");
    const instantiate = path.join(root, ".agents/skills/desktop-instantiate-project");
    fs.mkdirSync(instantiate, { recursive: true });
    fs.writeFileSync(path.join(instantiate, "SKILL.md"), "Harness source marker");
    assert.throws(() => ensureDesignSkill(root), /Harness 源根/u);
    assert.equal(fs.existsSync(path.join(root, ".agents/skills/design-taste-frontend")), false);
  });
});
