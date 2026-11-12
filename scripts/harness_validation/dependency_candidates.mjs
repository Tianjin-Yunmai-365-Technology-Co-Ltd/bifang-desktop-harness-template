import path from "node:path";
import { isTypeScriptRangeCompatible, parseBoundedVersionRange } from "../../.agents/skills/desktop-test-gui-initialization-e2e/scripts/gui-frontend-dependency-ranges.mjs";
import { ROOT, fail, readJson, readText } from "./core.mjs";
import { parseCargoToml } from "./initialization_toml.mjs";

export const DEPENDENCY_CANDIDATES = path.join(ROOT, ".agents/skills/desktop-manage-dependencies/references/registry-candidates.json");
const RUST_MANIFEST = path.join(ROOT, ".agents/skills/desktop-initialize-rust-project/assets/rust-lib-cli/Cargo.toml");
const FRONTEND_BASELINE = path.join(ROOT, ".agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md");
const STABLE_VERSION = /^\d+\.\d+\.\d+$/u;

/** 比较已由调用方校验的完整或二段稳定版本；缺失 patch 视为零。 */
function compareVersion(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** 选中包必须有一条覆盖最低 Node 及全部更高正式版本的无上界 engine 分支。 */
export function coversContinuousNodeRange(engine, minimum = "24.0.0") {
  if (engine === null) return true;
  if (typeof engine !== "string") return false;
  return engine.split("||").some(branch => {
    const match = /^\s*>=\s*(\d+(?:\.\d+){0,2})\s*$/u.exec(branch);
    return match && compareVersion(match[1], minimum) <= 0;
  });
}

/** 清单实际下界必须与当次登记一致，内部 path member 不参与 registry 版本核对。 */
function compareWorkspaceDependencies(errors, dependencies, catalog, label) {
  for (const [name, declaration] of Object.entries(dependencies ?? {})) {
    if (typeof declaration === "object" && declaration.path) continue;
    const version = typeof declaration === "string" ? declaration : declaration.version;
    if (catalog.crates[name]?.version !== version?.replace(/^\^/u, "")) {
      fail(errors, `${label} dependency candidate drift: ${name}=${version}`);
    }
  }
}

/** 检查 registry 快照与真实 CLI 生成器、前端登记的一致性；离线门禁不声称实时最新。 */
export function validateDependencyCandidates(errors, options = {}) {
  let catalog;
  try { catalog = readJson(options.catalogPath ?? DEPENDENCY_CANDIDATES); }
  catch (error) { fail(errors, `dependency candidates: ${error.message}`); return; }
  if (catalog.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/u.test(catalog.checkedOn ?? "") || !catalog.crates || !catalog.npm) {
    fail(errors, "dependency candidates require a dated schema v1 registry snapshot");
    return;
  }
  if (catalog.constraints?.rustMsrv !== "1.98.1" || catalog.constraints?.node !== ">=24.0.0" || catalog.constraints?.pnpm !== ">=12.4.1") {
    fail(errors, "dependency candidate constraints must preserve project MSRV and continuous Node range");
  }
  for (const [name, item] of Object.entries(catalog.crates)) {
    if (!STABLE_VERSION.test(item.version ?? "") || !STABLE_VERSION.test(item.latestStable ?? "") || item.source !== `https://crates.io/api/v1/crates/${name}/${item.version}`) {
      fail(errors, `invalid stable Rust candidate or official source: ${name}`);
    }
    if (item.declaredRustVersion !== null && (!/^\d+\.\d+(?:\.\d+)?$/u.test(item.declaredRustVersion) || compareVersion(item.declaredRustVersion, "1.98.1") > 0)) {
      fail(errors, `Rust candidate exceeds project MSRV: ${name}`);
    }
  }
  for (const [name, item] of Object.entries(catalog.npm)) {
    if (!STABLE_VERSION.test(item.version ?? "") || !item.source?.startsWith("https://registry.npmjs.org/") || !item.source.endsWith(`/${item.version}`)) {
      fail(errors, `invalid stable npm candidate or official source: ${name}`);
    }
    if (!coversContinuousNodeRange(item.nodeEngine)) fail(errors, `npm candidate excludes a supported Node release: ${name}`);
  }
  const typescript = catalog.npm.typescript;
  const peerRange = catalog.npm["typescript-eslint"]?.peerDependencies?.typescript;
  const registeredRange = parseBoundedVersionRange(typescript?.dependencyRange);
  if (!isTypeScriptRangeCompatible(typescript?.dependencyRange, typescript?.version, peerRange)
      || registeredRange?.minimum.join(".") !== typescript?.version) {
    fail(errors, "TypeScript dependency range must preserve its registered lower bound and typescript-eslint peer upper bound");
  }
  try {
    const rust = parseCargoToml(readText(options.rustManifestPath ?? RUST_MANIFEST));
    compareWorkspaceDependencies(errors, rust.workspace?.dependencies, catalog, "CLI template");
    const baseline = readText(options.frontendBaselinePath ?? FRONTEND_BASELINE);
    for (const [name, item] of Object.entries(catalog.npm)) {
      const rangeToken = item.dependencyRange ? `\`${item.dependencyRange}\`` : `^${item.version}`;
      const found = baseline.split("\n").some(line => (line.includes(`\`${name}\``) || line.includes(`\`${name}:`)) && line.includes(rangeToken));
      if (!found) fail(errors, `frontend dependency candidate drift: ${name}@${item.version}`);
    }
  } catch (error) { fail(errors, `dependency candidate source check failed: ${error.message}`); }
}
