import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assembleNshDesktopPackage, prepareNshPortableEntry, readNshDesktopProfile } from './nsh_desktop_package.mjs';

function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-desktop-package-')));
  const gui = path.join(root, 'sample_tool_nsh');
  const stage = path.join(root, 'stage');
  const targetDirectory = path.join(root, 'target');
  const out = path.join(gui, '.nsh', 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(targetDirectory, 'release'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify({ name: '示例 & App', id: 'com.psample.ptool.app', version: '0.1.0', build: 1 }));
  for (const name of ['bundle.js', 'app.json', 'capabilities.json']) fs.writeFileSync(path.join(out, name), name);
  fs.writeFileSync(path.join(targetDirectory, 'release', 'sample_tool_nsh_host'), 'host bytes');
  fs.writeFileSync(path.join(targetDirectory, 'release', 'sample_tool_nsh_host.exe'), 'MZ host bytes');
  const fields = { system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled', about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled', deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed' };
  const writeProfile = values => fs.writeFileSync(path.join(root, 'docs', 'GUI_APP_PROFILE.md'), `\`\`\`gui-initialization-config\n${Object.entries(values).map(([key, value]) => `${key}: ${value}`).join('\n')}\n\`\`\`\n`);
  writeProfile(fields);
  try { run({ root, gui, stage, targetDirectory, out, fields, writeProfile }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('desktop_profile_rejects_duplicates_and_unsupported_capabilities', () => fixture(({ root, fields, writeProfile }) => {
  assert.equal(readNshDesktopProfile(root).deep_link, 'disabled');
  writeProfile({ ...fields, deep_link: 'enabled' });
  assert.throws(() => readNshDesktopProfile(root), /inconsistent/u);
  writeProfile({ ...fields, system_notification: 'enabled' });
  assert.throws(() => readNshDesktopProfile(root), /unsupported/u);
  writeProfile(fields);
  fs.appendFileSync(path.join(root, 'docs', 'GUI_APP_PROFILE.md'), '```gui-initialization-config\n```\n');
  assert.throws(() => readNshDesktopProfile(root), /exactly one/u);
}));

test('macos_custom_host_package_binds_mixed_bundle_and_conditional_scheme', () => fixture(({ root, gui, stage, targetDirectory, fields, writeProfile }) => {
  const profile = readNshDesktopProfile(root);
  const value = assembleNshDesktopPackage({ gui, stage, target: 'macos', id: 'sample_tool', profile, targetDirectory });
  assert.equal(fs.readFileSync(path.join(value.application, 'Contents/Resources/nsh/bundle.js'), 'utf8'), 'bundle.js');
  let plist = fs.readFileSync(path.join(value.application, 'Contents/Info.plist'), 'utf8');
  assert.match(plist, /示例 &amp; App/u);
  assert.doesNotMatch(plist, /CFBundleURLTypes|CFBundleTypeRole/u);
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  writeProfile({ ...fields, single_instance: 'enabled', deep_link: 'enabled' });
  const enabled = assembleNshDesktopPackage({ gui, stage, target: 'macos', id: 'sample_tool', profile: readNshDesktopProfile(root), targetDirectory });
  plist = fs.readFileSync(path.join(enabled.application, 'Contents/Info.plist'), 'utf8');
  assert.match(plist, /app-sample-tool/u);
  assert.match(plist, /<key>CFBundleTypeRole<\/key><string>Viewer<\/string>/u);
}));

test('linux_host_package_rejects_missing_registration_and_bundle_symlinks', () => fixture(({ root, gui, stage, targetDirectory, out, fields, writeProfile }) => {
  writeProfile({ ...fields, single_instance: 'enabled', deep_link: 'enabled' });
  assert.throws(() => assembleNshDesktopPackage({ gui, stage, target: 'linux', id: 'sample_tool', profile: readNshDesktopProfile(root), targetDirectory }), /ENOENT/u);
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  fs.mkdirSync(path.join(gui, 'scripts'));
  fs.writeFileSync(path.join(gui, 'scripts/register-deeplink-linux.sh'), '#!/bin/sh\n');
  const result = assembleNshDesktopPackage({ gui, stage, target: 'linux', id: 'sample_tool', profile: readNshDesktopProfile(root), targetDirectory });
  assert.ok(fs.existsSync(path.join(result.application, 'register-deeplink-linux.sh')));
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  fs.symlinkSync(path.join(out, 'bundle.js'), path.join(out, 'linked-bundle'));
  fs.mkdirSync(path.join(out, 'assets'));
  fs.symlinkSync(path.join(out, 'bundle.js'), path.join(out, 'assets', 'linked'));
  assert.throws(() => assembleNshDesktopPackage({ gui, stage, target: 'linux', id: 'sample_tool', profile: readNshDesktopProfile(root), targetDirectory }), /symlink/u);
}));

test('windows_host_package_uses_sibling_bundle_and_rejects_identity_escape', () => fixture(({ root, gui, stage, targetDirectory }) => {
  const profile = readNshDesktopProfile(root);
  const result = assembleNshDesktopPackage({ gui, stage, target: 'windows', id: 'sample_tool', profile, targetDirectory });
  assert.equal(fs.readFileSync(path.join(result.application, 'nsh/bundle.js'), 'utf8'), 'bundle.js');
  assert.ok(fs.existsSync(path.join(result.application, 'sample_tool_nsh_host.exe')));
  assert.equal(fs.existsSync(path.join(result.application, 'register-deeplink-windows.ps1')), false);
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify({ name: '../escape', id: 'com.psample.ptool.app', version: '0.1.0' }));
  assert.throws(() => assembleNshDesktopPackage({ gui, stage, target: 'macos', id: 'sample_tool', profile, targetDirectory }), /identity/u);
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify({ name: 'Safe', id: 'com.other.app', version: '0.1.0' }));
  assert.throws(() => assembleNshDesktopPackage({ gui, stage, target: 'macos', id: 'sample_tool', profile, targetDirectory }), /identity/u);
}));

test('portable_entry_keeps_mixed_core_and_excludes_desktop_host_permissions', () => fixture(({ gui, stage }) => {
  const original = { name: 'Example', id: 'com.psample.ptool.app', version: '0.1.0', rust: '.', capabilities: { host: ['window.open'], speech: true } };
  fs.writeFileSync(path.join(gui, 'App.tsx'), 'mount(() => null);\n');
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify(original));
  const entry = prepareNshPortableEntry(gui, stage);
  const portable = JSON.parse(fs.readFileSync(path.join(entry, 'nsh.json'), 'utf8'));
  assert.equal(portable.rust, path.relative(entry, gui).split(path.sep).join('/'));
  assert.deepEqual(portable.capabilities, { speech: true });
  assert.match(fs.readFileSync(path.join(entry, 'App.tsx'), 'utf8'), /import "\.\.\//u);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(gui, 'nsh.json'), 'utf8')), original);
  fs.rmSync(entry, { recursive: true, force: true });
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify({ ...original, root: 'App' }));
  assert.throws(() => prepareNshPortableEntry(gui, stage), /Mixed/u);
}));
