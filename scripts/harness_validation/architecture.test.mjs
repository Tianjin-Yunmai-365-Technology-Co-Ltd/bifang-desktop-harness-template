import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateCoreFirstContract } from "./architecture.mjs";

test("current core-first contract and neutral workspace pass", () => {
  const errors = [];
  validateCoreFirstContract(errors);
  assert.deepEqual(errors, []);
});

test("required fragment validation fails closed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-architecture-"));
  const filePath = path.join(directory, "contract.md");
  fs.writeFileSync(filePath, "present\n");
  try {
    const errors = [];
    validateCoreFirstContract(errors, new Map([[filePath, ["present", "missing"]]]));
    assert.ok(errors.some((error) => error.includes("missing")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("missing required core-first file fails closed", () => {
  const errors = [];
  validateCoreFirstContract(errors, new Map([[path.join(os.tmpdir(), "definitely-missing-core-contract"), ["x"]]]));
  assert.ok(errors.some((error) => error.includes("missing core-first contract file")));
});
