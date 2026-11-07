import assert from 'node:assert/strict';
import test from 'node:test';
import { renderNshHostFiles } from './nsh_host_files.mjs';

const profile = {
  system_tray: 'enabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'compact',
};

test('generated Linux tray drops Desktop borrow before quit and ignores stale watcher callbacks', () => {
  const host = renderNshHostFiles({
    projectId: 'sample_tool', nameZh: '测试工具', nameEn: 'Test Tool',
    nshTargets: ['desktop'], targetPlatforms: ['linux'], profile,
  }).get('sample_tool_nsh/src/linux_host.rs');
  const action = host.slice(host.indexOf('fn tray_action('), host.indexOf('struct DesktopTray'));
  assert.match(action, /let app = DESKTOP\.with\([^;]+\);\s*if let Some\(app\) = app \{\s*app\.quit\(\);/su);
  assert.doesNotMatch(action, /desktop\.app\.quit\(\)/u);
  const online = host.slice(host.indexOf('fn watcher_online('), host.indexOf('fn watcher_offline('));
  const offline = host.slice(host.indexOf('fn watcher_offline('), host.indexOf('fn bundle_path('));
  assert.match(online, /online\.load\(Ordering::Acquire\)/u);
  assert.match(offline, /online\.load\(Ordering::Acquire\)/u);
  assert.match(offline, /let hold = DESKTOP\.with\([\s\S]*?\);\s*drop\(hold\);/u);
});
