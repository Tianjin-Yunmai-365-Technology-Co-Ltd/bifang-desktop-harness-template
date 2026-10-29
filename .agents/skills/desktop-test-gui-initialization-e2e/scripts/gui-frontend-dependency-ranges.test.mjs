import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { isTypeScriptRangeCompatible, validateFrontendTypeScriptRange } from "./gui-frontend-dependency-ranges.mjs";
import { withFixture } from "./verify-gui-lifecycle-contract.fixture.mjs";
import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

/** 当前登记只用于构造独立的语义输入，不读取锁文件或调用包管理器。 */
function catalog() {
  return { npm: {
    typescript: { version: "6.0.3", dependencyRange: ">=6.0.3 <6.1.0" },
    "typescript-eslint": { peerDependencies: { typescript: ">=4.8.4 <6.1.0" } },
  } };
}

/** 完整声明的每个可能解析值都要满足 peer，而非仅下界可安装。 */
test("typescript_range_rejects_unbounded_broad_and_unsupported_syntax", () => {
  for (const range of ["^6.0.3", ">=6.0.3", ">=6.0.3 <7.0.0", ">=6.0.2 <6.1.0", "6.0.3", ">=6.0.3 <=6.1.0", ">=6.0.3 <6.1.0 || >=7.0.0", ">=6.1.0 <6.1.0", ">=6.0.03 <6.1.0", null]) {
    assert.equal(isTypeScriptRangeCompatible(range, "6.0.3", ">=4.8.4 <6.1.0"), false, String(range));
  }
});

/** 同一 peer 内的更窄有界范围仍兼容，不要求固定一个文本拼写。 */
test("typescript_range_accepts_compatible_bounded_subsets", () => {
  for (const range of [">=6.0.3 <6.1.0", " >= 6.0.3  < 6.1.0 ", ">=6.0.4 <6.1.0"]) {
    assert.equal(isTypeScriptRangeCompatible(range, "6.0.3", ">=4.8.4 <6.1.0"), true, range);
  }
});

/** 登记本身漂移或缺少唯一直接声明时失败关闭，避免把锁版本当作范围。 */
test("typescript_package_requires_valid_catalog_and_unique_direct_declaration", () => {
  const valid = { devDependencies: { typescript: ">=6.0.3 <6.1.0" } };
  assert.deepEqual(validateFrontendTypeScriptRange(valid, catalog()), []);
  assert.notDeepEqual(validateFrontendTypeScriptRange({}, catalog()), []);
  assert.notDeepEqual(validateFrontendTypeScriptRange({ ...valid, dependencies: { typescript: ">=6.0.3 <6.1.0" } }, catalog()), []);
  const broken = catalog();
  broken.npm.typescript.dependencyRange = "^6.0.3";
  assert.match(validateFrontendTypeScriptRange(valid, broken).join("\n"), /候选登记/u);
});

/** 初始化直接读取真实 package；宽范围在任何 GUI 编译或宿主动作前被拒绝。 */
test("initialization_rejects_typescript_caret_even_when_the_lower_version_is_compatible", () => {
  withFixture(({ root, guiRoot }) => {
    const file = path.join(guiRoot, "package.json");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.devDependencies.typescript = "^6.0.3";
    fs.writeFileSync(file, JSON.stringify(value));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /TypeScript 直依赖.*兼容上界/u);
    value.devDependencies.typescript = ">=6.0.3 <6.1.0";
    fs.writeFileSync(file, JSON.stringify(value));
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});
