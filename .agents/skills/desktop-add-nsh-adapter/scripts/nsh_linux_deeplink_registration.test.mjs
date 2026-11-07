import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { renderNshHostFiles } from './nsh_host_files.mjs';

const profile = {
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'enabled',
  deep_link: 'enabled', global_shortcut: 'disabled', sidebar_mode: 'compact',
};

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-linux-registration-'));
  const packageRoot = path.join(root, 'package');
  const applications = path.join(root, 'data', 'applications');
  const tools = path.join(root, 'tools');
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  fs.mkdirSync(applications, { recursive: true });
  fs.mkdirSync(tools);
  fs.writeFileSync(path.join(packageRoot, 'bin', 'sample_tool_nsh_host'), '', { mode: 0o755 });
  fs.writeFileSync(path.join(tools, 'xdg-mime'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  // Exercise Linux `mv -T` semantics on non-Linux test hosts too.
  const mvImpl = path.join(tools, 'mv.cjs');
  fs.writeFileSync(mvImpl, [
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    "if (args.length !== 4 || args[0] !== '-fT' || args[1] !== '--') process.exit(2);",
    "try { fs.renameSync(args[2], args[3]); } catch { process.exit(1); }",
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(tools, 'mv'), '#!/bin/sh\nexec "$NSH_TEST_NODE" "$NSH_TEST_MV_IMPL" "$@"\n', { mode: 0o755 });
  const options = {
    projectId: 'sample_tool', nameZh: '测试工具', nameEn: 'Test Tool',
    nshTargets: ['desktop'], targetPlatforms: ['linux'], profile,
  };
  const script = renderNshHostFiles(options).get('sample_tool_nsh/scripts/register-deeplink-linux.sh');
  const registration = path.join(packageRoot, 'register-deeplink-linux.sh');
  fs.writeFileSync(registration, script);
  const entry = path.join(applications, 'app-sample-tool.desktop');
  const run = () => spawnSync('/bin/sh', [registration], {
    encoding: 'utf8',
    env: {
      ...process.env, XDG_DATA_HOME: path.dirname(applications),
      PATH: `${tools}${path.delimiter}${process.env.PATH ?? ''}`,
      NSH_TEST_NODE: process.execPath, NSH_TEST_MV_IMPL: mvImpl,
    },
  });
  return { root, applications, entry, run };
}

test('Linux registration replaces an existing entry symlink without modifying its target', () => {
  const { root, applications, entry, run } = fixture();
  try {
    const sentinel = path.join(root, 'sentinel.desktop');
    fs.writeFileSync(sentinel, 'keep this file\n');
    fs.symlinkSync(sentinel, entry);
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep this file\n');
    assert.equal(fs.lstatSync(entry).isFile(), true);
    const registered = fs.readFileSync(entry, 'utf8');
    assert.match(registered, /^\[Desktop Entry\]/u);
    assert.match(registered, /MimeType=x-scheme-handler\/app-sample-tool;/u);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fs.readFileSync(entry, 'utf8'), registered);
    assert.deepEqual(fs.readdirSync(applications), ['app-sample-tool.desktop']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux registration leaves no temporary entry when the destination is a directory', () => {
  const { root, applications, entry, run } = fixture();
  try {
    fs.mkdirSync(entry);
    const result = run();
    assert.notEqual(result.status, 0);
    assert.equal(fs.lstatSync(entry).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(applications), ['app-sample-tool.desktop']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux registration replaces a directory symlink instead of writing inside its target', () => {
  const { root, applications, entry, run } = fixture();
  try {
    const sentinel = path.join(root, 'sentinel-directory');
    fs.mkdirSync(sentinel);
    fs.symlinkSync(sentinel, entry, 'dir');
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.lstatSync(entry).isFile(), true);
    assert.deepEqual(fs.readdirSync(sentinel), []);
    assert.deepEqual(fs.readdirSync(applications), ['app-sample-tool.desktop']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
