import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

/** 旧预览选择、未知目标和重复目标均不得进入桌面开发步骤。 */
test('development rejects unavailable or unknown NSH targets', () => fixture((root, metadata) => {
  const facts=metadata.metadata['agent-first-harness'];
  for(const selected of [['desktop','tui'],['desktop','future'],['desktop','desktop']]) {
    facts['nsh-targets']=selected;
    assert.throws(()=>desktopDevCommands(root,metadata,'darwin'),/invalid or unavailable/u);
  }
  facts['nsh-targets']=['desktop'];
  facts.interfaces=['gui','nsh'];
  assert.throws(()=>desktopDevCommands(root,metadata,'darwin'),/not a selected NSH desktop target/u);
}));

/** 开发包装器在构建 bundle 前核对正式 CLI 和 Cargo pin。 */
test('development checks released runtime pin before invoking the build', () => fixture((root, metadata) => {
  const stable='e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
  const preview='beeb9fc7707e0d4a195a4f7274f77b30e134c500';
  const manifest=revision=>`[workspace.dependencies]\nnsh-core = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\nnsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\n`;
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview));
  const bin=path.join(root,'fake-bin');fs.mkdirSync(bin);
  const metadataFile=path.join(root,'metadata.json'),buildMarker=path.join(root,'nsh-build-called'),runMarker=path.join(root,'cargo-run-called');
  fs.writeFileSync(metadataFile,JSON.stringify(metadata));
  fs.writeFileSync(path.join(bin,'cargo'),'#!/usr/bin/env node\nconst fs=require("node:fs");\nif(process.argv[2]==="metadata") process.stdout.write(fs.readFileSync(process.env.NSH_FAKE_METADATA));\nelse if(process.argv[2]==="run") fs.writeFileSync(process.env.NSH_FAKE_RUN_MARKER,"ran");\nelse process.exitCode=8;\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'nsh'),'#!/usr/bin/env node\nconst fs=require("node:fs"),path=require("node:path");\nif(process.argv[2]==="--version") process.stdout.write("nsh 0.4.0 (e626a8d)\\n");\nelse if(process.argv[2]==="build") { const out=process.argv[process.argv.indexOf("--out")+1]; fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,"bundle.js"),"bundle"); fs.writeFileSync(process.env.NSH_FAKE_BUILD_MARKER,"built"); }\nelse process.exitCode=8;\n',{mode:0o755});
  const script=fileURLToPath(new URL('./run_nsh_desktop.mjs',import.meta.url));
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NSH_FAKE_METADATA:metadataFile,NSH_FAKE_BUILD_MARKER:buildMarker,NSH_FAKE_RUN_MARKER:runMarker};
  const invoke=()=>spawnSync(process.execPath,[script,'--root',root],{cwd:root,env,encoding:'utf8',timeout:30_000});
  const blocked=invoke();
  assert.equal(blocked.status,1,blocked.stderr);
  assert.match(blocked.stderr,/pinned official v0\.4\.0 stable runtime/u);
  assert.equal(fs.existsSync(buildMarker),false);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable));
  const accepted=invoke();
  assert.equal(accepted.status,0,accepted.stderr);
  assert.equal(fs.readFileSync(buildMarker,'utf8'),'built');
  assert.equal(fs.readFileSync(runMarker,'utf8'),'ran');
}));
