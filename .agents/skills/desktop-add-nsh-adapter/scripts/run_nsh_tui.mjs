#!/usr/bin/env node
/** Run, test, or check a Mixed NSH app with the pinned main-preview CLI. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertNshToolchain } from '../../desktop-build-nsh-release/scripts/build_nsh_release.mjs';
import { prepareNshPortableEntry } from '../../desktop-build-nsh-release/scripts/nsh_desktop_package.mjs';

const platformName = { darwin: 'macos', win32: 'windows', linux: 'linux' };

/** Validate selected target and workspace identity before invoking the CLI. */
export function tuiDevCommands(root, metadata, platform = process.platform) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('root must be absolute');
  if (path.resolve(metadata?.workspace_root ?? '') !== root) throw new Error('Cargo workspace root mismatch');
  const facts = metadata?.metadata?.['agent-first-harness'];
  const id = facts?.['project-id'];
  const target = platformName[platform];
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(id ?? '') ||
      !Array.isArray(facts?.interfaces) || facts.interfaces.length !== 1 || facts.interfaces[0] !== 'nsh' ||
      !Array.isArray(facts?.['nsh-targets']) || !facts['nsh-targets'].includes('tui') ||
      !target || !Array.isArray(facts?.['target-platforms']) || !facts['target-platforms'].includes(target)) {
    throw new Error('current OS is not a selected NSH TUI target');
  }
  const member = `${id}_nsh`;
  const gui = path.join(root, member);
  if (!metadata.packages?.some(item => item.name === member && path.resolve(item.manifest_path) === path.join(gui, 'Cargo.toml'))) throw new Error('NSH Mixed member is missing');
  if (!fs.existsSync(path.join(gui, 'nsh.json')) || !fs.existsSync(path.join(gui, 'App.tsx'))) throw new Error('Mixed NSH app entry is missing');
  return { gui, combined: facts['nsh-targets'].includes('desktop') };
}

/** The CLI and every declared NSH Cargo crate must share the preview revision. */
export function requirePreviewToolchain(root, metadata, version) {
  const targets = metadata?.metadata?.['agent-first-harness']?.['nsh-targets'];
  return assertNshToolchain(root, targets, version);
}

function execute(command, args, cwd, capture, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, ...(capture ? { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 } : { stdio: 'inherit' }), windowsHide: false });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}: ${result.stderr?.trim() ?? ''}`);
  return result.stdout;
}

export function tuiCliArgs(mode, entry) {
  if (!['run', 'test', 'check'].includes(mode) || typeof entry !== 'string' || !path.isAbsolute(entry)) throw new Error('invalid TUI CLI mode or entry');
  return mode === 'check' ? ['check', entry] : [mode, entry, '--target', 'tui'];
}

export function runNshTui(root, mode = 'run') {
  root = fs.realpathSync(path.resolve(root));
  const metadata = JSON.parse(execute('cargo', ['metadata', '--no-deps', '--format-version', '1'], root, true));
  const plan = tuiDevCommands(root, metadata);
  requirePreviewToolchain(root, metadata, execute('nsh', ['--version'], root, true));
  if (mode === 'check') {
    execute('nsh', tuiCliArgs(mode, plan.gui), root);
    return;
  }
  let stage;
  try {
    let entry = plan.gui;
    if (plan.combined) {
      const target = path.join(root, 'target');
      fs.mkdirSync(target, { recursive: true });
      stage = fs.mkdtempSync(path.join(target, '.nsh-tui-'));
      entry = prepareNshPortableEntry(plan.gui, stage, { terminal: true });
      if (mode === 'test') fs.copyFileSync(path.join(plan.gui, 'App.tui.test.tsx'), path.join(entry, 'App.tui.test.tsx'));
    }
    const env = plan.combined ? { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target') } : process.env;
    execute('nsh', tuiCliArgs(mode, entry), root, false, env);
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' }, test: { type: 'boolean' }, check: { type: 'boolean' } } });
    if (!values.root) throw new Error('requires --root <workspace>');
    if (values.test && values.check) throw new Error('--test and --check are mutually exclusive');
    runNshTui(values.root, values.test ? 'test' : values.check ? 'check' : 'run');
  } catch (error) {
    process.stderr.write(`NSH TUI preview: ${error.message}\n`);
    process.exitCode = 1;
  }
}
