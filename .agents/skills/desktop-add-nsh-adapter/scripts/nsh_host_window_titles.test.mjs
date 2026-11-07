import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { nshHostMethods, renderNshHostFiles } from './nsh_host_files.mjs';

const options = {
  projectId: 'sample_tool', nameZh: '测试工具', nameEn: 'Test Tool',
  nshTargets: ['desktop'], targetPlatforms: ['windows', 'linux'],
  profile: {
    system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
    about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
    deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'compact',
  },
};

test('Windows and Linux hosts synchronize only the caller window title', () => {
  const files = renderNshHostFiles(options);
  const methods = nshHostMethods(options);
  assert.ok(methods.includes('window.setTitle'));
  const windows = files.get('sample_tool_nsh/src/windows_host.rs');
  const calls = files.get('sample_tool_nsh/src/windows_calls.rs');
  const linux = files.get('sample_tool_nsh/src/linux_host.rs');
  assert.match(windows, /"window\.setTitle"/u);
  assert.match(windows, /fn set_window_title\(&mut self, id: u64, title: &str\) -> Result<bool, String>/u);
  assert.match(windows, /SetWindowTextW\(entry\.view\.hwnd\(\), PCWSTR\(text\.as_ptr\(\)\)\)/u);
  assert.match(calls, /"window\.setTitle" => \{/u);
  assert.match(calls, /\.set_window_title\(sender, title\)/u);
  assert.match(linux, /"window\.setTitle"/u);
  assert.match(linux, /entry\.window\.set_title\(Some\(title\)\)/u);
  assert.match(linux, /\.set_window_title\(sender, title\)/u);
  for (const [name, source] of [['windows_host.rs', windows], ['windows_calls.rs', calls], ['linux_host.rs', linux]]) {
    const format = spawnSync('rustfmt', ['--edition', '2024', '--emit', 'stdout', '--config', 'skip_children=true'], { input: source, encoding: 'utf8' });
    assert.equal(format.status, 0, `${name}: ${format.stderr}`);
  }
});
