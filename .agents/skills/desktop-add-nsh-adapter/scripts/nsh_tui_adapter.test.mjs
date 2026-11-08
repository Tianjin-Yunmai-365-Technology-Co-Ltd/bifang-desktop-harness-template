import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NSH_REVISION, NSH_TUI_PREVIEW_REVISION, normalizeNshOptions, nshDependencies, nshPackageScripts, nshRevisionForTargets, renderNshAdapterFiles } from './nsh_adapter_files.mjs';
import { requirePreviewToolchain, tuiCliArgs, tuiDevCommands } from './run_nsh_tui.mjs';

const profile = Object.freeze({
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed',
});
const base = { projectId: 'sample_tool', nameZh: '示例工具', nameEn: 'Sample Tool', owner: 'test-owner' };

test('new NSH projects without TUI retain the released v0.4.0 revision', () => {
  const desktop = { ...base, targetPlatforms: ['macos'], nshTargets: ['desktop'], profile };
  const mobileWeb = { ...base, targetPlatforms: ['android', 'web'], nshTargets: ['mobile', 'web'] };
  assert.equal(NSH_REVISION, 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3');
  assert.equal(nshRevisionForTargets(desktop.nshTargets), NSH_REVISION);
  for (const options of [desktop, mobileWeb]) {
    assert.match(nshDependencies(options), new RegExp(NSH_REVISION, 'u'));
    assert.doesNotMatch(nshDependencies(options), new RegExp(NSH_TUI_PREVIEW_REVISION, 'u'));
  }
  assert.match(nshDependencies(desktop), new RegExp(`nsh-engine = \\{[^\\n]*${NSH_REVISION}`, 'u'));
});

test('pure TUI uses the pinned Mixed core without desktop host or profile', () => {
  const options = { ...base, targetPlatforms: ['macos'], nshTargets: ['tui'] };
  assert.deepEqual(normalizeNshOptions(options).nshTargets, ['tui']);
  const files = renderNshAdapterFiles(options);
  assert.ok(files.has('sample_tool_nsh/App.tui.test.tsx'));
  assert.ok(files.has('sample_tool_nsh/src/lib.rs'));
  assert.equal(JSON.parse(files.get('sample_tool_nsh/nsh.json')).rust, '.');
  assert.equal(JSON.parse(files.get('sample_tool_nsh/nsh.json')).capabilities, undefined);
  assert.ok(!files.has('docs/GUI_APP_PROFILE.md'));
  assert.ok(!files.has('sample_tool_nsh/src/bin/sample_tool_nsh_host.rs'));
  assert.match(files.get('sample_tool_nsh/App.tsx'), /String\(platform\.idiom\) !== "terminal"/u);
  assert.match(files.get('sample_tool_nsh/App.tsx'), /page\(\) === "settings" && !nativeDesktop/u);
  assert.match(nshDependencies(options), new RegExp(NSH_TUI_PREVIEW_REVISION, 'u'));
  const scripts = nshPackageScripts('sample_tool', ['tui'], ['macos']);
  assert.equal(scripts.dev, 'node .agents/skills/desktop-add-nsh-adapter/scripts/run_nsh_tui.mjs --root .');
  assert.equal(scripts['nsh:test'], scripts['nsh:test:tui']);
  assert.equal(scripts['nsh:check'], scripts.dev + ' --check');
  const entry = path.resolve('app');
  assert.deepEqual(tuiCliArgs('test', entry), ['test', entry, '--target', 'tui']);
  assert.deepEqual(tuiCliArgs('check', entry), ['check', entry]);
  assert.throws(() => tuiCliArgs('check', 'relative/app'), /invalid TUI CLI mode/u);
});

test('desktop and TUI share the native OS but terminal entry stays isolated', () => {
  const options = { ...base, targetPlatforms: ['macos'], nshTargets: ['desktop', 'tui'], profile };
  const files = renderNshAdapterFiles(options);
  assert.ok(files.has('docs/GUI_APP_PROFILE.md'));
  assert.ok(JSON.parse(files.get('sample_tool_nsh/nsh.json')).capabilities.host.length > 0);
  assert.match(files.get('sample_tool_nsh/App.tsx'), /String\(platform\.idiom\) !== "terminal"/u);
  assert.match(files.get('sample_tool_nsh/App.tui.tsx'), /page\(\) === "settings" && !nativeDesktop/u);
  assert.ok(files.has('sample_tool_nsh/App.tui.tsx'));
  assert.doesNotMatch(files.get('sample_tool_nsh/App.tui.tsx'), /from "\.\/desktop"|host\.call|nsh\/desktop|desktopOnly/u);
  assert.match(files.get('sample_tool_nsh/App.tsx'), /from "\.\/App\.shared"/u);
  assert.match(files.get('sample_tool_nsh/App.tui.tsx'), /from "\.\/App\.shared"/u);
  assert.match(files.get('sample_tool_nsh/App.shared.tsx'), /Scaffold\.status\(\)/u);
  assert.match(files.get('sample_tool_nsh/App.shared.tsx'), /export function HomeContent/u);
  assert.doesNotMatch(files.get('sample_tool_nsh/App.shared.tsx'), /host\.call|nsh\/desktop/u);
  const scripts = nshPackageScripts('sample_tool', options.nshTargets, options.targetPlatforms);
  assert.match(scripts.dev, /run_nsh_desktop/u);
  assert.match(scripts['dev:tui'], /run_nsh_tui/u);
  assert.match(scripts['nsh:test:tui'], /--test$/u);
  assert.equal(scripts['nsh:test'], 'nsh test sample_tool_nsh');
  assert.equal(scripts['nsh:check'], scripts['dev:tui'] + ' --check');
  assert.match(nshDependencies(options), new RegExp(NSH_TUI_PREVIEW_REVISION, 'u'));
  assert.match(nshDependencies(options), new RegExp(`nsh-engine = \\{[^\\n]*${NSH_TUI_PREVIEW_REVISION}`, 'u'));
  assert.doesNotMatch(nshDependencies(options), new RegExp(NSH_REVISION, 'u'));
  assert.throws(() => normalizeNshOptions({ ...options, targetPlatforms: ['android'] }), /target-platforms mismatch/u);
  assert.throws(() => normalizeNshOptions({ ...base, targetPlatforms: ['android'], nshTargets: ['tui'] }), /target-platforms mismatch/u);
  assert.throws(() => normalizeNshOptions({ ...base, targetPlatforms: ['macos'], nshTargets: ['tui'], profile }), /profile requires desktop/u);
  assert.throws(() => normalizeNshOptions({ ...base, targetPlatforms: ['macos'], nshTargets: ['tui'], logo: '/missing/logo.png' }), /logo selection requires desktop/u);
});

test('terminal dev entry requires matching selected OS and preview CLI revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-tui-entry-'));
  try {
    const gui = path.join(root, 'sample_tool_nsh');
    fs.mkdirSync(gui);
    for (const name of ['Cargo.toml', 'nsh.json', 'App.tsx']) fs.writeFileSync(path.join(gui, name), 'fixture');
    const metadata = {
      workspace_root: root,
      metadata: { 'agent-first-harness': { 'project-id': 'sample_tool', interfaces: ['nsh'], 'nsh-targets': ['desktop', 'tui'], 'target-platforms': ['macos'] } },
      packages: [{ name: 'sample_tool_nsh', manifest_path: path.join(gui, 'Cargo.toml') }],
    };
    const manifest = rev => `[workspace.dependencies]\nnsh-core = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${rev}" }\nnsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${rev}" }\n`;
    fs.writeFileSync(path.join(root, 'Cargo.toml'), manifest(NSH_TUI_PREVIEW_REVISION));
    assert.deepEqual(tuiDevCommands(root, metadata, 'darwin'), { gui, combined: true });
    assert.throws(() => tuiDevCommands(root, metadata, 'linux'), /not a selected NSH TUI target/u);
    assert.throws(() => requirePreviewToolchain(root, metadata, 'nsh 0.4.0 (e626a8d)'), /do not match/u);
    assert.equal(requirePreviewToolchain(root, metadata, `nsh 0.4.0 (${NSH_TUI_PREVIEW_REVISION.slice(0, 7)})`), NSH_TUI_PREVIEW_REVISION);
    fs.writeFileSync(path.join(root, 'Cargo.toml'), manifest(NSH_REVISION));
    assert.throws(() => requirePreviewToolchain(root, metadata, `nsh 0.4.0 (${NSH_TUI_PREVIEW_REVISION.slice(0, 7)})`), /pinned official main preview/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('wrapper process rejects a released CLI and checks the original combined TS config', { skip: process.platform === 'win32' }, () => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-tui-wrapper-')));
  try {
    const root = path.join(parent, 'project');
    const gui = path.join(root, 'sample_tool_nsh');
    const bin = path.join(parent, 'bin');
    const nativePlatform = process.platform === 'darwin' ? 'macos' : 'linux';
    fs.mkdirSync(path.join(gui, 'src'), { recursive: true });
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(root, 'Cargo.toml'), `[workspace]\nmembers = ["sample_tool_nsh"]\nresolver = "3"\n[workspace.dependencies]\nnsh-core = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${NSH_TUI_PREVIEW_REVISION}" }\nnsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${NSH_TUI_PREVIEW_REVISION}" }\n[workspace.metadata.agent-first-harness]\nproject-id = "sample_tool"\ninterfaces = ["nsh"]\nnsh-targets = ["tui"]\ntarget-platforms = ["${nativePlatform}"]\n`);
    fs.writeFileSync(path.join(gui, 'Cargo.toml'), '[package]\nname = "sample_tool_nsh"\nversion = "0.1.0"\nedition = "2024"\n');
    fs.writeFileSync(path.join(gui, 'src/lib.rs'), 'pub fn ready() -> bool { true }\n');
    fs.writeFileSync(path.join(gui, 'nsh.json'), '{"rust":".","capabilities":{"host":["probe"]}}\n');
    fs.writeFileSync(path.join(gui, 'App.tsx'), 'export default function App() { return null; }\n');
    fs.writeFileSync(path.join(gui, 'App.tui.tsx'), 'export default function TerminalApp() { return null; }\n');
    fs.writeFileSync(path.join(gui, 'App.tui.test.tsx'), 'export default true;\n');
    const fake = path.join(bin, 'nsh');
    fs.writeFileSync(fake, '#!/usr/bin/env node\nprocess.stdout.write("nsh 0.4.0 (e626a8d)\\n");\n', { mode: 0o755 });
    const wrapper = fileURLToPath(new URL('./run_nsh_tui.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [wrapper, '--root', root, '--test'], {
      cwd: root, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /NSH CLI and Cargo runtime revision do not match/u);
    assert.doesNotMatch(result.stderr, /Unknown encoding/u);
    fs.writeFileSync(path.join(root, 'Cargo.toml'), fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8').replace('nsh-targets = ["tui"]', 'nsh-targets = ["desktop", "tui"]'));
    fs.writeFileSync(path.join(gui, 'tsconfig.json'), '{}\n');
    fs.writeFileSync(fake, '#!/usr/bin/env node\nconst fs = require("node:fs");\nif (process.argv[2] === "--version") process.stdout.write("nsh 0.4.0 (beeb9fc)\\n");\nelse if (process.argv[2] === "check" && process.argv[3] === process.env.EXPECTED_GUI && fs.existsSync(process.env.EXPECTED_GUI + "/tsconfig.json")) fs.writeFileSync(process.env.CHECK_MARKER, "checked");\nelse process.exitCode = 2;\n', { mode: 0o755 });
    const marker = path.join(parent, 'checked');
    const check = spawnSync(process.execPath, [wrapper, '--root', root, '--check'], {
      cwd: root, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, EXPECTED_GUI: gui, CHECK_MARKER: marker }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'checked');
    assert.equal(fs.existsSync(path.join(root, 'target')), false);
    fs.writeFileSync(fake, '#!/usr/bin/env node\nconst fs = require("node:fs");\nconst path = require("node:path");\nif (process.argv[2] === "--version") process.stdout.write("nsh 0.4.0 (beeb9fc)\\n");\nelse if (process.argv[2] === "test" && process.argv[4] === "--target" && process.argv[5] === "tui" && process.env.CARGO_TARGET_DIR === process.env.EXPECTED_TARGET && fs.readFileSync(path.join(process.argv[3], "App.tsx"), "utf8").includes("App.tui.tsx") && !JSON.parse(fs.readFileSync(path.join(process.argv[3], "nsh.json"), "utf8")).capabilities?.host) fs.writeFileSync(process.env.CHECK_MARKER, "tested");\nelse process.exitCode = 2;\n', { mode: 0o755 });
    const testRun = spawnSync(process.execPath, [wrapper, '--root', root, '--test'], {
      cwd: root, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, EXPECTED_TARGET: path.join(root, 'target'), CHECK_MARKER: marker }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(testRun.status, 0, testRun.stderr);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'tested');
    assert.deepEqual(fs.readdirSync(path.join(root, 'target')), []);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
