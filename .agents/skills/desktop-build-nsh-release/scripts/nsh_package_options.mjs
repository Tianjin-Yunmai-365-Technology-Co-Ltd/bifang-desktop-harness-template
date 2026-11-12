/** 解析受管打包器允许的官方参数，凭据仅由明确选中的本次签名读取。 */
import fs from 'node:fs';
import path from 'node:path';

const androidAbis = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
const iosSdks = { ios: ['iphoneos', 'aarch64-apple-ios'], 'ios-simulator': ['iphonesimulator', 'aarch64-apple-ios-sim'] };

/** 混合应用的 QuickJS bindgen 需要从对应 Xcode SDK 读取 iOS 系统头文件。 */
export function addNshIosBindgenSdk(target, env, resolveSdk) {
  const settings = iosSdks[target];
  if (!settings) return;
  const [sdk, triple] = settings;
  const baseKey = 'BINDGEN_EXTRA_CLANG_ARGS';
  const dashedKey = `${baseKey}_${triple}`;
  const key = dashedKey.replaceAll('-', '_');
  const existingKey = Object.hasOwn(env, dashedKey) ? dashedKey : key;
  const flags = env[existingKey] ?? env[baseKey] ?? '';
  if (/(?:^|\s)(?:-isysroot|--sysroot)(?:[=\s]|$)/u.test(flags)) return;
  const sdkPath = resolveSdk(sdk);
  if (!path.isAbsolute(sdkPath) || !fs.statSync(sdkPath).isDirectory()) throw new Error('xcrun did not resolve an iOS SDK directory');
  const quotedPath = "'" + sdkPath.replaceAll("'", "'\\''") + "'";
  env[existingKey] = [flags, '-isysroot', quotedPath].filter(Boolean).join(' ');
}

function signingFile(root, value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('missing ' + label);
  const file = path.resolve(root, value);
  if (!fs.lstatSync(file).isFile()) throw new Error(label + ' must be an ordinary file');
  return file;
}

export function resolveNshPackageOptions(root, target, input, baseEnvironment = process.env) {
  const { arch, abi, format, sign, profile, keystore, keyAlias, assetUrl } = input;
  const args = [];
  const env = { ...baseEnvironment };
  delete env.NSH_KEYSTORE_PASSWORD;
  const signingDefault = { macos: 'ad-hoc', 'ios-simulator': 'ad-hoc', ios: 'unsigned-device', android: 'development-key' };
  let signing = signingDefault[target] ?? 'not-applicable';
  if (arch !== undefined) {
    if (target !== 'macos' || !['arm64', 'x86_64', 'universal'].includes(arch)) throw new Error('--arch requires a supported macOS architecture');
    args.push('--arch', arch);
  }
  if ((abi !== undefined || format !== undefined || keystore !== undefined || keyAlias !== undefined) && target !== 'android') {
    throw new Error('Android ABI, format and signing options require --target android');
  }
  const abis = target === 'android'
    ? (Array.isArray(abi) ? abi.flatMap(value => String(value).split(',')) : abi ?? androidAbis.slice(0, 2))
    : undefined;
  if (target === 'android') {
    if (!Array.isArray(abis) || !abis.length || new Set(abis).size !== abis.length || abis.some(value => !androidAbis.includes(value))) {
      throw new Error('unsupported or duplicate Android ABI');
    }
    if (format !== undefined && !['apk', 'aab'].includes(format)) throw new Error('Android format must be apk or aab');
    for (const value of abis) args.push('--abi', value);
    if (format) args.push('--format', format);
    if (keystore !== undefined || keyAlias !== undefined) {
      if (typeof keyAlias !== 'string' || !keyAlias.trim() || !baseEnvironment.NSH_KEYSTORE_PASSWORD) {
        throw new Error('Android release signing requires --keystore, --key-alias and NSH_KEYSTORE_PASSWORD');
      }
      args.push('--keystore', signingFile(root, keystore, 'Android keystore'), '--key-alias', keyAlias);
      env.NSH_KEYSTORE_PASSWORD = baseEnvironment.NSH_KEYSTORE_PASSWORD;
      signing = 'release-keystore';
    }
  }
  if (sign !== undefined || profile !== undefined) {
    if (target !== 'ios' || typeof sign !== 'string' || !sign.trim() || sign === '-') {
      throw new Error('iOS device signing requires --target ios, --sign and --profile');
    }
    args.push('--sign', sign, '--profile', signingFile(root, profile, 'iOS provisioning profile'));
    signing = 'provisioning-profile';
  }
  if (assetUrl !== undefined) {
    let parsed;
    try { parsed = new URL(assetUrl); } catch { throw new Error('invalid Web asset URL'); }
    if (target !== 'web' || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('--asset-url requires a Web HTTP(S) base URL without credentials, query or fragment');
    }
    args.push('--asset-url', assetUrl);
  }
  const bundleFormat = { macos: 'app.tar.gz', windows: 'zip', linux: 'tar.gz', android: format ?? 'apk',
    ios: signing === 'provisioning-profile' ? 'ipa' : 'app.tar.gz', 'ios-simulator': 'app.tar.gz', web: 'web.tar.gz' }[target];
  return { args, env, signing, abis, bundleFormat, arch: arch === 'x86_64' ? 'x64' : arch };
}
