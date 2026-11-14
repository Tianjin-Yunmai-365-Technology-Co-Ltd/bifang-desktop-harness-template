/** 新项目使用的正式 NSH 运行时。 */
export const NSH_STABLE_VERSION = '0.5.1';
export const NSH_STABLE_REVISION = '224d9a795c7ac9d10d75750de9351adac5549675';
export const NSH_RELEASE_REVISIONS = Object.freeze({
  '0.5.0': 'f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1',
  [NSH_STABLE_VERSION]: NSH_STABLE_REVISION,
});
export const NSH_TARGETS = Object.freeze(['desktop', 'mobile', 'web', 'tui']);
export const NSH_PLATFORMS = Object.freeze(['windows', 'macos', 'linux', 'android', 'ios', 'web']);
const desktopPlatforms = Object.freeze(['windows', 'macos', 'linux']);
export const NSH_TARGET_PLATFORMS = Object.freeze({
  desktop: desktopPlatforms,
  mobile: Object.freeze(['android', 'ios']),
  web: Object.freeze(['web']),
  tui: desktopPlatforms,
});

/** 同一身份限制用于表单和直接生成。展示名也会作为官方包的文件名。 */
export function validNshIdentity(field, value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\x00-\x1f\x7f\u2028\u2029]/u.test(value)) return false;
  if (field === 'projectId') return value.length <= 64 && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(value);
  if (field === 'owner') return value.length <= 200;
  const filename = value.split('.')[0];
  return value.length <= 200 && Buffer.byteLength(value) <= 240 &&
    !/[\\/:*?"<>|]/u.test(value) && !value.endsWith('.') && !value.startsWith('-') &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/iu.test(filename);
}

/** 开发、表单和打包共用目标类别与宿主的映射。 */
export function validateNshPlatforms(targets, platforms) {
  nshRevisionForTargets(targets);
  const supported = new Set(targets.flatMap(target => NSH_TARGET_PLATFORMS[target]));
  if (!Array.isArray(platforms) || !platforms.length ||
      new Set(platforms).size !== platforms.length ||
      platforms.some(platform => !supported.has(platform)) ||
      targets.some(target => !NSH_TARGET_PLATFORMS[target].some(platform => platforms.includes(platform)))) {
    throw new Error('NSH targets and target-platforms mismatch');
  }
}

/** 校验受支持能力集合，并返回唯一正式工具链提交。 */
export function nshRevisionForTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('NSH target selection missing');
  if (new Set(targets).size !== targets.length || targets.some(target => !NSH_TARGETS.includes(target))) throw new Error('invalid NSH targets');
  return NSH_STABLE_REVISION;
}
