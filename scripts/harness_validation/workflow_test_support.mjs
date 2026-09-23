/** 候选 workflow validator 回归的隔离夹具。 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  CANDIDATE_WORKFLOW_HELPER,
  WORKFLOW,
  validateCandidateWorkflowHelper,
  validateReleaseContextHelper,
  validateWorkflow,
} from "./workflow.mjs";

export function temporaryDirectory(prefix = "harness-workflow-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanup(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

export function baseWorkflow() {
  return fs.readFileSync(WORKFLOW, "utf8");
}

export function validateWorkflowText(contents, { crlf = false } = {}) {
  const directory = temporaryDirectory();
  const filePath = path.join(directory, "workflow.yml");
  fs.writeFileSync(filePath, crlf ? contents.replaceAll("\n", "\r\n") : contents, "utf8");
  const errors = [];
  try { validateWorkflow(errors, filePath); } finally { cleanup(directory); }
  return errors;
}

export function validateMutatedHelper(sourcePath, required, replacement, kind = "candidate") {
  const source = fs.readFileSync(sourcePath, "utf8");
  if (!source.includes(required)) throw new Error(`fixture fragment is absent: ${required}`);
  const directory = temporaryDirectory();
  const filePath = path.join(directory, path.basename(sourcePath));
  fs.writeFileSync(filePath, source.replace(required, replacement), "utf8");
  const errors = [];
  try {
    if (kind === "context") validateReleaseContextHelper(errors, filePath);
    else validateCandidateWorkflowHelper(errors, filePath);
  } finally {
    cleanup(directory);
  }
  return errors;
}

export function runCandidateHelper(args, { cwd, env = {}, check = false } = {}) {
  const result = spawnSync(process.execPath, [CANDIDATE_WORKFLOW_HELPER, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (check && result.status !== 0) throw new Error(result.stderr);
  return result;
}
