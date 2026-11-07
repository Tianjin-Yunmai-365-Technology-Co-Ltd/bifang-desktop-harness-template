import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { nshHostCargoDependencies, nshHostMethods, nshHostWorkspaceDependencies, renderNshHostFiles } from './nsh_host_files.mjs';

const profile = () => ({ system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled', about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled', deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'compact' });
const options = (targetPlatforms = ['macos', 'windows', 'linux'], selected = []) => ({ projectId: 'sample_tool', nameZh: '测试工具', nameEn: 'Test Tool', nshTargets: ['desktop'], targetPlatforms, profile: Object.assign(profile(), Object.fromEntries(selected.map(key => [key, 'enabled']))) });

test('baseline emits only selected host methods and target-specific workspace dependencies', () => {
  const input = options(['macos']);
  const files = renderNshHostFiles(input);
  assert.deepEqual(nshHostMethods(input), ['window.list', 'window.open', 'window.focus', 'window.showAll', 'window.close', 'app.quit']);
  assert.deepEqual([...files.keys()].sort(), ['sample_tool_nsh/src/macos_host.rs', 'sample_tool_nsh/src/main.rs']);
  const host = files.get('sample_tool_nsh/src/macos_host.rs');
  assert.match(host, /set_ui_sets\(vec!\[nsh_base::registry\(\), sample_tool_nsh::registry\(\)\]\)/u);
  assert.match(host, /view\.load\(App::Js\(self\.bundle\.clone\(\)\)\)/u);
  assert.match(host, /menuOwner/u);
  assert.match(host, /should_terminate_after_last_window_closed\([^)]*\) -> bool \{\s*true\s*\}/u);
  assert.doesNotMatch(host, /NSH_FEATURE_|status_item|claim_instance|deepLink\.takePending|autostart\.get/u);
  assert.match(nshHostCargoDependencies(input), /nsh-platform-macos\.workspace = true/u);
  assert.doesNotMatch(nshHostCargoDependencies(input), /nsh-platform-windows|nsh-platform-linux|version =/u);
  assert.match(nshHostWorkspaceDependencies(input), /serde_json = "1\.0\.154"/u);
  assert.doesNotMatch(nshHostWorkspaceDependencies(input), /nsh-platform-windows|nsh-platform-linux/u);
});

test('all enabled renders exact route, registration scripts, and only selected native APIs', () => {
  const input = options(['macos', 'windows', 'linux'], ['system_tray', 'single_instance', 'deep_link', 'autostart']);
  const files = renderNshHostFiles(input);
  assert.deepEqual(nshHostMethods(input).slice(-3), ['autostart.get', 'autostart.set', 'deepLink.takePending']);
  assert.equal(files.size, 13);
  assert.match(files.get('sample_tool_nsh/src/deep_link.rs'), /app-sample-tool:\/\//u);
  assert.match(files.get('sample_tool_nsh/src/macos_host.rs'), /should_terminate_after_last_window_closed\([^)]*\) -> bool \{\s*false\s*\}/u);
  assert.match(files.get('sample_tool_nsh/scripts/register-deeplink-windows.ps1'), /app-sample-tool/u);
  assert.match(files.get('sample_tool_nsh/scripts/register-deeplink-linux.sh'), /scheme='app-sample-tool'/u);
  assert.match(files.get('sample_tool_nsh/scripts/register-deeplink-linux.sh'), /x-scheme-handler\/\$scheme/u);
  assert.match(nshHostWorkspaceDependencies(input), /Win32_Globalization/u);
  assert.match(nshHostWorkspaceDependencies(input), /Win32_System_DataExchange/u);
  assert.match(nshHostWorkspaceDependencies(input), /objc2-app-kit/u);
  assert.match(nshHostWorkspaceDependencies(input), /ksni/u);
  assert.match(nshHostWorkspaceDependencies(input), /ksni = \{ version = "0\.3\.7", default-features = false, features = \["blocking", "tokio"\] \}/u);
  for (const [name, source] of files) {
    assert.doesNotMatch(source, /NSH_FEATURE_|__[A-Z][A-Z_]+__/u, name);
    if (!name.endsWith('.rs')) continue;
    const format = spawnSync('rustfmt', ['--edition', '2024', '--emit', 'stdout', '--config', 'skip_children=true'], { input: source, encoding: 'utf8' });
    assert.equal(format.status, 0, `${name}: ${format.stderr}`);
  }
});

test('optional host implementations are absent when disabled', () => {
  const input = options(['windows', 'linux'], ['single_instance']);
  const files = renderNshHostFiles(input);
  assert.equal(files.has('sample_tool_nsh/src/deep_link.rs'), false);
  assert.equal(files.has('sample_tool_nsh/scripts/register-deeplink-linux.sh'), false);
  assert.doesNotMatch(files.get('sample_tool_nsh/src/windows_host.rs'), /deepLink\.takePending|COPYDATASTRUCT/u);
  assert.doesNotMatch(files.get('sample_tool_nsh/src/linux_host.rs'), /deepLink\.takePending|connect_open/u);
  assert.doesNotMatch(nshHostWorkspaceDependencies(input), /Win32_System_DataExchange/u);
  assert.throws(() => renderNshHostFiles(options(['macos'], ['deep_link'])), /requires single_instance/u);
});

test('Linux deep-link registration rejects paths that cannot be represented safely', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-linux-deeplink-'));
  try {
    const tools = path.join(root, 'tools');
    const data = path.join(root, 'data');
    fs.mkdirSync(tools);
    fs.writeFileSync(path.join(tools, 'xdg-mime'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const script = renderNshHostFiles(options(['linux'], ['single_instance', 'deep_link'])).get('sample_tool_nsh/scripts/register-deeplink-linux.sh');
    for (const suffix of ['$variable', '\nnext', '\rnext']) {
      const packageRoot = path.join(root, `package${suffix}`);
      fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'bin', 'sample_tool_nsh_host'), '', { mode: 0o755 });
      const registration = path.join(packageRoot, 'register-deeplink-linux.sh');
      fs.writeFileSync(registration, script);
      const result = spawnSync('/bin/sh', [registration], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}`, XDG_DATA_HOME: data },
      });
      assert.notEqual(result.status, 0, `unexpected success for ${JSON.stringify(suffix)}`);
      assert.match(result.stderr, /Unsupported host path/u);
      assert.equal(fs.existsSync(path.join(data, 'applications', 'app-sample-tool.desktop')), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
