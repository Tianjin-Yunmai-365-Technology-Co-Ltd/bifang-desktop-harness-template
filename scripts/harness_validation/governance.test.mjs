import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT, readText } from "./core.mjs";
import { validateAgentsEntrypoint } from "./governance.mjs";

function withAgents(text, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-agents-"));
  const filePath = path.join(directory, "AGENTS.md");
  fs.writeFileSync(filePath, text);
  try {
    callback(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("current AGENTS entrypoint is progressive and budgeted", () => {
  const errors = [];
  validateAgentsEntrypoint(errors);
  assert.deepEqual(errors, []);
});

test("AGENTS rejects removed progressive semantics", () => {
  const source = readText(path.join(ROOT, "AGENTS.md"));
  withAgents(source.replace("只读取下表命中的事实来源和 Skill", "读取事实源"), (filePath) => {
    const errors = [];
    validateAgentsEntrypoint(errors, filePath);
    assert.ok(errors.some((error) => error.includes("只读取下表命中的事实来源和 Skill")));
  });
});

test("AGENTS rejects duplicate or reordered required headings", () => {
  const source = readText(path.join(ROOT, "AGENTS.md"));
  withAgents(`${source}\n## 项目使命\n`, (filePath) => {
    const errors = [];
    validateAgentsEntrypoint(errors, filePath);
    assert.ok(errors.some((error) => error.includes("exactly once")));
  });
  const first = "## 项目使命";
  const second = "## 启动门禁";
  const reordered = source.replace(first, "__FIRST__").replace(second, first).replace("__FIRST__", second);
  withAgents(reordered, (filePath) => {
    const errors = [];
    validateAgentsEntrypoint(errors, filePath);
    assert.ok(errors.some((error) => error.includes("out of order")));
  });
});

test("AGENTS rejects UTF-8 byte and line budget regressions", () => {
  const source = readText(path.join(ROOT, "AGENTS.md"));
  withAgents(`${source}${"甲".repeat(20_000)}`, (filePath) => {
    const errors = [];
    validateAgentsEntrypoint(errors, filePath);
    assert.ok(errors.some((error) => error.includes("byte budget")));
  });
  withAgents(`${source}${"\nextra".repeat(121)}`, (filePath) => {
    const errors = [];
    validateAgentsEntrypoint(errors, filePath);
    assert.ok(errors.some((error) => error.includes("line budget")));
  });
});
