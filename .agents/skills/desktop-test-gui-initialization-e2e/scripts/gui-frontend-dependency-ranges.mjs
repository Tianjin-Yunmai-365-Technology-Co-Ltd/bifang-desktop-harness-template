/** 为初始化和候选登记共享 TypeScript 与 ESLint peer 的有界兼容检查。 */

/** 只解析完整三段稳定版本，拒绝预发布、隐式下界和不安全数字。 */
function parseVersion(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** 比较已经校验的三段版本，不依赖包管理器或第三方 SemVer 实现。 */
function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** 只接受本次登记使用的闭下界、开上界语法；未知范围失败关闭。 */
export function parseBoundedVersionRange(value) {
  if (typeof value !== "string") return null;
  const match = /^\s*>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)\s*$/u.exec(value);
  if (!match) return null;
  const minimum = parseVersion(match[1]);
  const maximum = parseVersion(match[2]);
  if (!minimum || !maximum || compareVersion(minimum, maximum) >= 0) return null;
  return { minimum, maximum };
}

/** 声明的整个区间必须位于已登记 peer 内，且不能退回旧候选下界。 */
export function isTypeScriptRangeCompatible(range, minimumVersion, peerRange) {
  const requested = parseBoundedVersionRange(range);
  const peer = parseBoundedVersionRange(peerRange);
  const minimum = parseVersion(minimumVersion);
  return Boolean(requested && peer && minimum
    && compareVersion(requested.minimum, minimum) >= 0
    && compareVersion(requested.minimum, peer.minimum) >= 0
    && compareVersion(requested.maximum, peer.maximum) <= 0);
}

/** 验证真实 package 的 TypeScript 直依赖，而非仅证明当前锁定版本可安装。 */
export function validateFrontendTypeScriptRange(packageJson, catalog) {
  const compiler = catalog?.npm?.typescript;
  const peerRange = catalog?.npm?.["typescript-eslint"]?.peerDependencies?.typescript;
  if (!compiler || !isTypeScriptRangeCompatible(compiler.dependencyRange, compiler.version, peerRange)) {
    return ["GUI TypeScript 候选登记必须提供完整下界且处于 typescript-eslint peer 内的有界范围"];
  }
  const declarations = [packageJson?.dependencies, packageJson?.devDependencies]
    .filter(section => section && Object.hasOwn(section, "typescript"))
    .map(section => section.typescript);
  if (declarations.length !== 1 || !isTypeScriptRangeCompatible(declarations[0], compiler.version, peerRange)) {
    return [`GUI TypeScript 直依赖必须使用完整下界与兼容上界，最低 ${compiler.version}，typescript-eslint peer ${peerRange}`];
  }
  return [];
}
