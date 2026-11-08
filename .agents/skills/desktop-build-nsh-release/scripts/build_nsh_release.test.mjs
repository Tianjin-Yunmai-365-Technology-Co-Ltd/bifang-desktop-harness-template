/** 构建前失败关闭、真实文件头与输出范围回归。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNshToolchain,buildNshRelease,inventory,nonemptyTuiTestCount,packageFacts,releaseNoteBuildInputs,safeOutputPath,tuiHostExecutableFromCargo,validateNshArtifacts } from './build_nsh_release.mjs';
import { renderDocument } from '../../desktop-prepare-release/scripts/release_notes.mjs';

/** 临时包只用于拒绝畸形输入，不能充当运行验证。 */
function fixture(run){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nsh-package-test-')));try{run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

/** 新顶层 NSH 包使用独立成员和类别事实；旧 GUI/NSH 包仍可读。 */
test('package_facts_accepts_top_level_nsh_and_legacy_gui_nsh',()=>fixture(root=>{
  const metadata=(interfaces,member,extra)=>({workspace_root:root,workspace_members:['member-id'],packages:[{id:'member-id',name:`sample_tool_${member}`,manifest_path:path.join(root,`sample_tool_${member}`,'Cargo.toml'),version:'0.1.0'}],metadata:{'agent-first-harness':{'project-id':'sample_tool',interfaces,'target-platforms':['macos','android','web'],...extra}}});
  const modern=metadata(['nsh'],'nsh',{'nsh-targets':['desktop','mobile','web']});
  assert.equal(packageFacts(root,modern,'web').gui,path.join(root,'sample_tool_nsh'));
  assert.equal(packageFacts(root,modern,'android').modern,true);
  assert.equal(packageFacts(root,modern,'macos').modern,true);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['desktop','tui','mobile','web']}),'macos'),/TUI is temporarily unavailable/u);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['desktop','tui','mobile','web']}),'tui'),/TUI is temporarily unavailable/u);
  const terminal=metadata(['nsh'],'nsh',{'nsh-targets':['tui'],'target-platforms':['macos']});
  assert.throws(()=>packageFacts(root,terminal,'tui'),/TUI is temporarily unavailable/u);
  assert.throws(()=>packageFacts(root,terminal,'macos'),/TUI is temporarily unavailable/u);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['tui','mobile','web']}),'macos'),/TUI is temporarily unavailable/u);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['desktop','web']}),'macos'),/do not match/u);
  assert.throws(()=>packageFacts(root,modern,'linux'),/not selected/u);
  const legacy=metadata(['gui'],'gui',{'gui-framework':'nsh'});
  assert.equal(packageFacts(root,legacy,'macos').modern,false);
}));

/** 所有受支持目标绑定正式版 Git pin，拒绝预览、旧 CLI 与混合依赖。 */
test('nsh_toolchain_requires_matching_released_cli_and_runtime',()=>fixture(root=>{
  const preview='beeb9fc7707e0d4a195a4f7274f77b30e134c500';
  const stable='e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
  const manifest=revision=>`[workspace]\nmembers = []\n[workspace.dependencies]\nnsh-core = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\nnsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\n[workspace.metadata.agent-first-harness]\ninterfaces = ["nsh"]\n`;
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview));
  assert.throws(()=>assertNshToolchain(root,['tui'],'nsh 0.4.0 (beeb9fc)'),/TUI is temporarily unavailable/u);
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.4.0 (beeb9fc)'),/pinned official v0\.4\.0 stable runtime/u);
  assert.throws(()=>assertNshToolchain(root,['desktop','tui'],'nsh 0.4.0 (e626a8d)'),/TUI is temporarily unavailable/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable));
  assert.throws(()=>assertNshToolchain(root,['tui'],'nsh 0.4.0 (e626a8d)'),/TUI is temporarily unavailable/u);
  assert.equal(assertNshToolchain(root,['web'],'nsh 0.4.0 (e626a8d)'),stable);
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.4.0 (beeb9fc)'),/do not match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview).replace(`nsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${preview}" }`,''));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.4.0 (e626a8d)'),/must all match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview).replace('[workspace.metadata.agent-first-harness]',`nsh-engine = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${stable}" }\n[workspace.metadata.agent-first-harness]`));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.4.0 (e626a8d)'),/must all match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview).replace('[workspace.metadata.agent-first-harness]','nsh-engine = { workspace = true }\n[workspace.metadata.agent-first-harness]'));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.4.0 (e626a8d)'),/pinned official NSH Git runtime/u);
}));

/** 旧 GUI/NSH 元数据仍可识别，但预览 pin 必须在任何构建测试前失败。 */
test('legacy_gui_nsh_build_requires_released_cargo_pin',()=>fixture(root=>{
  const stable='e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
  const preview='beeb9fc7707e0d4a195a4f7274f77b30e134c500';
  const manifest=revision=>`[workspace]\nmembers = ["sample_tool_gui"]\n[workspace.dependencies]\nnsh-core = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\nnsh-base = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\n[workspace.metadata.agent-first-harness]\nproject-id = "sample_tool"\ninterfaces = ["gui"]\ngui-framework = "nsh"\ntarget-platforms = ["web"]\n`;
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview));
  const bin=path.join(root,'fake-bin');fs.mkdirSync(bin);
  const metadataFile=path.join(root,'metadata.json'),marker=path.join(root,'cargo-test-called');
  fs.writeFileSync(metadataFile,JSON.stringify({workspace_root:root,workspace_members:['member-id'],packages:[{id:'member-id',name:'sample_tool_gui',manifest_path:path.join(root,'sample_tool_gui','Cargo.toml'),version:'0.1.0'}],metadata:{'agent-first-harness':{'project-id':'sample_tool',interfaces:['gui'],'gui-framework':'nsh','target-platforms':['web']}}}));
  fs.writeFileSync(path.join(bin,'cargo'),'#!/usr/bin/env node\nconst fs=require("node:fs");\nif(process.argv[2]==="metadata") process.stdout.write(fs.readFileSync(process.env.NSH_FAKE_METADATA));\nelse { fs.writeFileSync(process.env.NSH_FAKE_TEST_MARKER,"called"); process.exitCode=7; }\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'nsh'),'#!/usr/bin/env node\nif(process.argv[2]==="--version") process.stdout.write("nsh 0.4.0 (e626a8d)\\n");\nelse process.exitCode=8;\n',{mode:0o755});
  const script=fileURLToPath(new URL('./build_nsh_release.mjs',import.meta.url));
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NSH_FAKE_METADATA:metadataFile,NSH_FAKE_TEST_MARKER:marker};
  const invoke=()=>spawnSync(process.execPath,[script,'--root',root,'--target','web'],{cwd:root,env,encoding:'utf8',timeout:30_000});
  const blocked=invoke();
  assert.equal(blocked.status,1,blocked.stderr);
  assert.match(blocked.stderr,/pinned official v0\.4\.0 stable runtime/u);
  assert.equal(fs.existsSync(marker),false);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable));
  const accepted=invoke();
  assert.equal(accepted.status,1,accepted.stderr);
  assert.match(accepted.stderr,/cargo failed \(7\)/u);
  assert.equal(fs.readFileSync(marker,'utf8'),'called');
}));

test('tracked_resolution_and_unanswered_candidate_selection_fail_before_build',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'Cargo.toml'),'[workspace.metadata.agent-first-harness]\ndependency-lock-policy = "tracked"\n');
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web'}),/explicit e2e/u);
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web',e2e:'disabled'}),/reason/u);
  assert.throws(()=>buildNshRelease({root,target:'web'}),/does not propagate tracked locks/u);
  assert.equal(fs.readdirSync(root).length,1);
}));

/** TUI 不论本地试包或候选均须在执行任何构建命令前拒绝。 */
test('tui_build_rejects_before_creating_build_state',()=>fixture(root=>{
  for (const mode of ['local','candidate']) assert.throws(()=>buildNshRelease({root,mode,target:'tui',e2e:'enabled'}),/TUI is temporarily unavailable/u);
  assert.equal(fs.readdirSync(root).length,0);
}));

/** 测试摘要来自 stderr；零测试、失败和未识别输出均不能写入通过证据。 */
test('tui_test_summary_requires_nonempty_passing_assertions',()=>{
  assert.equal(nonemptyTuiTestCount('\u001b[32m✓ 2 tests: 2 passed, 0 failed (4m 54s)\u001b[0m'),2);
  assert.equal(nonemptyTuiTestCount('✓ 1 test: 1 passed, 0 failed (2m 37s)'),1);
  for(const result of ['✓ 0 tests: 0 passed, 0 failed','✓ 2 tests: 1 passed, 1 failed','no tests found']) assert.throws(()=>nonemptyTuiTestCount(result),/nonempty passing/u);
});

/** 目标 triple 改写输出目录时，只能采用本次 Cargo JSON 报告的专属宿主可执行文件。 */
test('tui_host_uses_current_cargo_artifact_executable_path',()=>fixture(root=>{
  const packageId='path+file:///generated/tui-host#nsh-app-sample-tui-host@0.0.0';
  const binName='nsh-app-sample-tui-host';
  const executable=path.join(root,'target','aarch64-apple-darwin','release',binName);
  const message={reason:'compiler-artifact',package_id:packageId,target:{name:binName,kind:['bin']},executable};
  const other={...message,package_id:'registry+other'};
  assert.equal(tuiHostExecutableFromCargo([other,message].map(value=>JSON.stringify(value)).join('\n'),packageId,binName),executable);
  assert.throws(()=>tuiHostExecutableFromCargo(JSON.stringify(other),packageId,binName),/exactly one current/u);
  assert.throws(()=>tuiHostExecutableFromCargo([message,message].map(value=>JSON.stringify(value)).join('\n'),packageId,binName),/exactly one current/u);
  assert.throws(()=>tuiHostExecutableFromCargo(JSON.stringify({...message,executable:null}),packageId,binName),/no executable path/u);
}));

/** 本地 TUI 预览至少保留可运行宿主、Mixed bundle 与配套元数据，拒绝残缺和伪造文件头。 */
test('tui_preview_requires_generated_host_bundle_and_archive',()=>fixture(root=>{
  const app=path.join(root,'sample_tool-tui');fs.mkdirSync(app);
  fs.writeFileSync(path.join(app,'bundle.js'),'console.log("preview")');
  fs.writeFileSync(path.join(app,'app.json'),'{}');
  fs.writeFileSync(path.join(app,'bundle.js.map'),'{}');
  const magic=process.platform==='win32'?Buffer.from([77,90,0,0]):process.platform==='darwin'?Buffer.from([207,250,237,254]):Buffer.from([127,69,76,70]);
  const host=path.join(app,'nsh-app-sample_tool_nsh-tui-host'+(process.platform==='win32'?'.exe':''));
  fs.writeFileSync(host,magic);
  const archive=path.join(root,'sample_tool-tui-preview.'+(process.platform==='win32'?'zip':'tar.gz'));
  fs.writeFileSync(archive,process.platform==='win32'?Buffer.from([80,75,3,4,...Array(18).fill(0)]):Buffer.from([31,139,0,0]));
  assert.equal(validateNshArtifacts(root,'tui').length,5);
  fs.rmSync(path.join(app,'bundle.js.map'));
  assert.throws(()=>validateNshArtifacts(root,'tui'),/source map/u);
  fs.writeFileSync(path.join(app,'bundle.js.map'),'{}');
  fs.writeFileSync(host,'not an executable');
  assert.throws(()=>validateNshArtifacts(root,'tui'),/host executable/u);
}));

test('output_and_artifact_links_cannot_escape_root',()=>fixture(root=>{
  const outside=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nsh-outside-')));
  try{
    fs.symlinkSync(outside,path.join(root,'release'));
    assert.throws(()=>safeOutputPath(root,path.join(root,'release','candidate')),/symlink/u);
    fs.mkdirSync(path.join(root,'target'));fs.symlinkSync(outside,path.join(root,'target/nsh-packaging'));
    assert.throws(()=>safeOutputPath(root,path.join(root,'target/nsh-packaging','batch')),/symlink/u);
    fs.writeFileSync(path.join(outside,'payload'),'bytes');
    fs.symlinkSync(path.join(outside,'payload'),path.join(root,'escaped'));
    assert.throws(()=>inventory(root),/escapes/u);
    assert.throws(()=>safeOutputPath(root,path.join(outside,'candidate')),/escaped/u);
  }finally{fs.rmSync(outside,{recursive:true,force:true});}
}));

test('fake_suffixes_and_incomplete_official_packages_are_rejected',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'fake.zip.txt'),'fake');
  assert.throws(()=>validateNshArtifacts(root,'windows'),/exactly one/u);
  fs.writeFileSync(path.join(root,'app.zip'),'not a zip');
  assert.throws(()=>validateNshArtifacts(root,'windows'),/header/u);
  fs.writeFileSync(path.join(root,'index.html'),'<html></html>');
  assert.throws(()=>validateNshArtifacts(root,'web'),/incomplete/u);
  assert.throws(()=>validateNshArtifacts(root,'macos'),/Mach-O/u);
}));

test('official_named_web_directory_is_discovered_and_requires_real_wasm_header',()=>fixture(root=>{
  const site=path.join(root,'NSH 工程验证');fs.mkdirSync(site);
  fs.writeFileSync(path.join(site,'index.html'),'<!doctype html><html></html>');
  fs.writeFileSync(path.join(site,'app.js'),'export {};');
  fs.writeFileSync(path.join(site,'app.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));
  assert.equal(validateNshArtifacts(root,'web').length,3);
  fs.writeFileSync(path.join(site,'app.wasm'),'not WebAssembly');assert.throws(()=>validateNshArtifacts(root,'web'),/incomplete/u);
}));

test('large_valid_release_notes_are_transported_by_short_paths',()=>fixture(root=>{
  const notes={schemaVersion:2,releases:Array.from({length:10},(_,index)=>({
    version:`v0.${10-index}.0`,releaseDate:'2026-11-07',
    featureOptimizations:Array.from({length:10},(_,itemIndex)=>({
      'zh-CN':`第 ${index}-${itemIndex} 项：${'工'.repeat(2390)}`,
      'en-US':`Item ${index}-${itemIndex}: ${'a'.repeat(2390)}`,
    })),bugFixes:[],
  }))};
  const documentBytes=Buffer.byteLength(JSON.stringify(notes));
  assert.ok(documentBytes>900_000 && documentBytes<1024*1024,documentBytes);
  const {env,temporary}=releaseNoteBuildInputs(root,notes,{
    ...process.env,HARNESS_RELEASE_NOTES_ZH:'stale',HARNESS_RELEASE_NOTES_EN_PATH:'stale',
  });
  assert.equal(temporary.length,2);
  assert.equal(env.HARNESS_RELEASE_NOTES_ZH,undefined);
  assert.equal(env.HARNESS_RELEASE_NOTES_EN,undefined);
  assert.equal(fs.readFileSync(env.HARNESS_RELEASE_NOTES_ZH_PATH,'utf8'),renderDocument(notes,'zh-CN'));
  assert.equal(fs.readFileSync(env.HARNESS_RELEASE_NOTES_EN_PATH,'utf8'),renderDocument(notes,'en-US'));
  const child=spawnSync(process.execPath,['-e','process.stdout.write("started")'],{env,encoding:'utf8'});
  assert.equal(child.status,0,child.error?.message);
  assert.equal(child.stdout,'started');
  const local=releaseNoteBuildInputs(root,null,env);
  assert.equal(local.env.HARNESS_RELEASE_NOTES_ZH_PATH,undefined);
  assert.equal(local.env.HARNESS_RELEASE_NOTES_EN_PATH,undefined);
}));
