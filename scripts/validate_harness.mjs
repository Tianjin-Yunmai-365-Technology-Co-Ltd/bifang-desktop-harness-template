#!/usr/bin/env node

import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateAssets } from "./harness_validation/assets.mjs";
import { validateContracts } from "./harness_validation/contracts.mjs";
import { validateLineLimits, validateReviewMarkers } from "./harness_validation/line_limits.mjs";
import { EXPECTED_SKILLS, validateRepository } from "./harness_validation/repository.mjs";

/** 解析单一发布审查开关；未知参数直接失败。 */
function parseArguments() {
  return parseArgs({
    options: {
      "release-review": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
}

/** 运行 Harness 的确定性硬门禁，并按需追加非阻断发布审查提示。 */
export function validateHarness({ releaseReview = false } = {}) {
  const errors = [];
  const warnings = [];
  validateRepository(errors);
  const nodeInventory = validateContracts(errors);
  const lineInventory = validateLineLimits(errors, warnings, { releaseReview });
  const assetInventory = validateAssets(errors);
  if (releaseReview) validateReviewMarkers(warnings);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    inventory: {
      skills: EXPECTED_SKILLS.size,
      nodeScripts: nodeInventory.scripts,
      nodeTests: nodeInventory.tests,
      maintainedFiles: lineInventory.checked,
      brandAssets: assetInventory.assets,
    },
  };
}

/** 命令行入口：错误与审查提示走 stderr，成功摘要走 stdout。 */
export function main() {
  let options;
  try {
    options = parseArguments();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  let report;
  try {
    report = validateHarness({ releaseReview: options["release-review"] });
  } catch (error) {
    console.error(`ERROR: Harness validator 运行失败: ${error.stack ?? error.message}`);
    return 2;
  }
  for (const warning of report.warnings) console.error(`WARNING: ${warning}`);
  if (!report.ok) {
    for (const error of report.errors) console.error(`ERROR: ${error}`);
    console.error(`Harness validation failed with ${report.errors.length} error(s).`);
    return 1;
  }
  const inventory = report.inventory;
  console.log(
    `Harness validation passed: ${inventory.skills} skills, ${inventory.nodeScripts} Node script(s), `
    + `${inventory.nodeTests} Node test file(s), ${inventory.maintainedFiles} maintained file(s), `
    + `${inventory.brandAssets} audited brand asset(s), local Markdown links, tiered line limits, `
    + "Node-only automation, project-memory indexes, Agent policy, release workflow, core-first fixture, and binary asset gates"
    + (options["release-review"]
      ? `; release review included ${report.warnings.length} non-blocking warning(s).`
      : "; non-essential review prompts deferred to the release selection."),
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
