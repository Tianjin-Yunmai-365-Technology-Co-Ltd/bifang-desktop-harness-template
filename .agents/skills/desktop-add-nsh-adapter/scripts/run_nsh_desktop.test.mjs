import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { desktopDevCommands } from './run_nsh_desktop.mjs';

function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-desktop-dev-')));
  const gui = path.join(root, 'sample_tool_nsh');
  fs.mkdirSync(gui);
  fs.writeFileSync(path.join(gui, 'nsh.json'), '{}');
  fs.writeFileSync(path.join(gui, 'App.tsx'), '');
  const metadata = {
    workspace_root: root,
    metadata: { 'agent-first-harness': { 'project-id': 'sample_tool', interfaces: ['nsh'], 'nsh-targets': ['desktop'], 'target-platforms': ['macos', 'windows', 'linux'] } },
    packages: [{ name: 'sample_tool_nsh', manifest_path: path.join(gui, 'Cargo.toml'), targets: [{ name: 'sample_tool_nsh_host', kind: ['bin'] }] }],
  };
  try { return run(root, metadata); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('development runs the custom host after building the Mixed bundle', () => fixture((root, metadata) => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const plan = desktopDevCommands(root, metadata, platform);
    assert.deepEqual(plan.build.args, ['build', '.', '--out', path.join(root, 'sample_tool_nsh', '.nsh', 'out')]);
    assert.equal(plan.build.cwd, path.join(root, 'sample_tool_nsh'));
    assert.deepEqual(plan.run.args, ['run', '--package', 'sample_tool_nsh', '--bin', 'sample_tool_nsh_host']);
    assert.equal(plan.run.cwd, root);
  }
}));

test('development rejects unselected platforms and missing custom host', () => fixture((root, metadata) => {
  assert.throws(() => desktopDevCommands(root, metadata, 'android'), /not a selected NSH desktop target/u);
  metadata.metadata['agent-first-harness']['target-platforms'] = ['macos'];
  assert.throws(() => desktopDevCommands(root, metadata, 'win32'), /not a selected NSH desktop target/u);
  metadata.packages[0].targets = [];
  assert.throws(() => desktopDevCommands(root, metadata, 'darwin'), /custom NSH desktop host target is missing/u);
}));
