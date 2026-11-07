#!/usr/bin/env node
/** Build a Mixed TSX bundle and run the selected native desktop host. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const platformName = { darwin: 'macos', win32: 'windows', linux: 'linux' };

export function desktopDevCommands(root, metadata, platform = process.platform) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('root must be absolute');
  if (path.resolve(metadata?.workspace_root ?? '') !== root) throw new Error('Cargo workspace root mismatch');
  const facts = metadata?.metadata?.['agent-first-harness'];
  const id = facts?.['project-id'];
  const target = platformName[platform];
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(id ?? '') ||
      !Array.isArray(facts?.interfaces) || !facts.interfaces.includes('nsh') ||
      !Array.isArray(facts?.['nsh-targets']) || !facts['nsh-targets'].includes('desktop') ||
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

function execute(step, env = process.env) {
  const result = spawnSync(step.command, step.args, { cwd: step.cwd, env, stdio: 'inherit', windowsHide: false });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${step.command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${step.command} exited with status ${result.status}`);
}

export function runNshDesktop(root) {
  root = fs.realpathSync(path.resolve(root));
  const result = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Cargo metadata failed: ${result.error?.message ?? result.stderr?.trim() ?? ''}`);
  const plan = desktopDevCommands(root, JSON.parse(result.stdout));
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
