#!/usr/bin/env node
/** 统一最终安装包名称；只生成名称，不移动产物或改写候选证据。 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** 保留已确认的展示名与空格；拒绝无法跨 Windows/macOS 安全使用的文件名字符。 */
export function installerArtifactName({ productName, version, platform, arch }) {
  if (typeof productName !== 'string' || !productName || productName !== productName.trim()
      || !productName.isWellFormed() || /[\x00-\x1f\x7f\\/:*?"<>|]/u.test(productName)) {
    throw new Error('invalid installer product display name');
  }
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
    throw new Error('installer version must be the raw stable Cargo version');
  }
  const architecture = new Map([['x86_64', 'x64'], ['x64', 'x64'], ['aarch64', 'arm64'], ['arm64', 'arm64']]).get(arch);
  const system = new Map([['windows', ['Windows', 'exe']], ['macos', ['macOS', 'dmg']]]).get(platform);
  if (!architecture || !system) throw new Error('unsupported installer platform or architecture');
  return `${productName}_${version}_${architecture}-setup for ${system[0]}.${system[1]}`;
}

/** CLI 只返回 JSON 文件名；调用方在最终字节验证后复制，并用同一名称生成侧车证据。 */
export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    'product-name': { type: 'string' }, version: { type: 'string' }, platform: { type: 'string' }, arch: { type: 'string' },
  } });
  const filename = installerArtifactName({ productName: values['product-name'], version: values.version, platform: values.platform, arch: values.arch });
  process.stdout.write(JSON.stringify({ filename }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`Installer name: ${error.message}\n`); process.exitCode = 1; }
}
