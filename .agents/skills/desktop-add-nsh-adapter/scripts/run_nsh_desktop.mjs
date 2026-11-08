#!/usr/bin/env node
/** 构建 Mixed TSX bundle 并启动已选原生桌面宿主。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertNshToolchain } from '../../desktop-build-nsh-release/scripts/build_nsh_release.mjs';

const platformName = { darwin: 'macos', win32: 'windows', linux: 'linux' };

/** 从 Cargo 元数据生成当前宿主的桌面开发步骤，并拒绝暂不可用目标。 */
export function desktopDevCommands(root, metadata, platform = process.platform) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('root must be absolute');
  if (path.resolve(metadata?.workspace_root ?? '') !== root) throw new Error('Cargo workspace root mismatch');
  const facts = metadata?.metadata?.['agent-first-harness'];
  const selected = facts?.['nsh-targets'];
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some(target => !['desktop', 'mobile', 'web'].includes(target))) {
    throw new Error('NSH desktop targets are invalid or unavailable; TUI is temporarily unavailable');
  }
  const id = facts?.['project-id'];
  const target = platformName[platform];
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(id ?? '') ||
      !Array.isArray(facts?.interfaces) || facts.interfaces.length !== 1 || facts.interfaces[0] !== 'nsh' ||
      !selected.includes('desktop') ||
      !target || !Array.isArray(facts?.['target-platforms']) || !facts['target-platforms'].includes(target)) {
    throw new Error('current OS is not a selected NSH desktop target');
  }
  const member = `${id}_nsh`;
  const gui = path.join(root, member);
  const bundle = path.join(gui, '.nsh', 'out');
  const packageEntry = metadata.packages?.find(item => item.name === member && path.resolve(item.manifest_path) === path.join(gui, 'Cargo.toml'));
  if (!packageEntry?.targets?.some(item => item.kind?.includes('bin') && item.name === `${member}_host`)) throw new Error('custom NSH desktop host target is missing');
  if (!fs.existsSync(path.join(gui, 'nsh.json')) || !fs.existsSync(path.join(gui, 'App.tsx'))) throw new Error('Mixed NSH app entry is missing');
  return {
    target,
    bundle,
    build: { command: 'nsh', args: ['build', '.', '--out', bundle], cwd: gui },
    run: { command: 'cargo', args: ['run', '--package', member, '--bin', `${member}_host`], cwd: root },
  };
}

/** 以参数数组执行单步命令，失败时中止后续开发步骤。 */
function execute(step, env = process.env) {
  const result = spawnSync(step.command, step.args, { cwd: step.cwd, env, stdio: 'inherit', windowsHide: false });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${step.command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${step.command} exited with status ${result.status}`);
}

/** 运行前核对元数据与正式 CLI/Cargo pin，再构建和启动桌面宿主。 */
export function runNshDesktop(root) {
  root = fs.realpathSync(path.resolve(root));
  const result = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Cargo metadata failed: ${result.error?.message ?? result.stderr?.trim() ?? ''}`);
  const metadata = JSON.parse(result.stdout);
  const plan = desktopDevCommands(root, metadata);
  const version = spawnSync('nsh', ['--version'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (version.error || version.status !== 0) throw new Error(`NSH CLI version check failed: ${version.error?.message ?? version.stderr?.trim() ?? ''}`);
  assertNshToolchain(root, metadata.metadata['agent-first-harness']['nsh-targets'], version.stdout);
  execute(plan.build);
  if (!fs.statSync(path.join(plan.bundle, 'bundle.js')).isFile()) throw new Error('nsh build did not produce bundle.js');
  execute(plan.run, { ...process.env, NSH_BUNDLE_DIR: plan.bundle });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' } } });
    if (!values.root) throw new Error('requires --root <workspace>');
    runNshDesktop(values.root);
  } catch (error) {
    process.stderr.write(`NSH desktop development: ${error.message}\n`);
    process.exitCode = 1;
  }
}
