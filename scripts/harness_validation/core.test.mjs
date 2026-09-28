import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkNodeSyntax } from "./core.mjs";

test("syntax cache rechecks changed bytes with unchanged size and mtime", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-syntax-cache-"));
  const first = path.join(directory, "first.mjs");
  const second = path.join(directory, "second.mjs");
  const timestamp = new Date("2020-01-01T00:00:00.000Z");
  const writeAtFixedTime = (filePath, source) => {
    fs.writeFileSync(filePath, source);
    fs.utimesSync(filePath, timestamp, timestamp);
  };
  try {
    writeAtFixedTime(first, "export const x = 1;\n");
    writeAtFixedTime(second, "export const y = 2;\n");
    const original = fs.statSync(first);
    const initial = checkNodeSyntax([first, second]);
    assert.equal(initial.get(first), null);
    assert.equal(initial.get(second), null);

    writeAtFixedTime(first, "export const x = ; \n");
    const changed = fs.statSync(first);
    assert.equal(changed.size, original.size);
    assert.equal(changed.mtimeMs, original.mtimeMs);
    const invalid = checkNodeSyntax([first, second]);
    assert.match(invalid.get(first), /SyntaxError/u);
    assert.equal(invalid.get(second), null);

    writeAtFixedTime(first, "export const x = 1;\n");
    const restored = checkNodeSyntax([first, second]);
    assert.equal(restored.get(first), null);
    assert.equal(restored.get(second), null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
