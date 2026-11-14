/** 构建前失败关闭、真实文件头与输出范围回归。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNshToolchain,buildNshRelease,inventory,packageFacts,passingNshCases,releaseNoteBuildInputs,safeOutputPath,validateNshArtifacts } from './build_nsh_release.mjs';
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
  assert.equal(packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['desktop','tui','mobile','web']}),'macos').modern,true);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['tui'],'target-platforms':['macos']}),'macos'),/target capability is not selected/u);
  assert.throws(()=>packageFacts(root,modern,'tui'),/unsupported NSH packaging target/u);
  assert.throws(()=>packageFacts(root,metadata(['nsh'],'nsh',{'nsh-targets':['desktop','web']}),'macos'),/target-platforms mismatch/u);
  assert.throws(()=>packageFacts(root,modern,'linux'),/not selected/u);
  const legacy=metadata(['gui'],'gui',{'gui-framework':'nsh'});
  assert.equal(packageFacts(root,legacy,'macos').modern,false);
  const invalidLegacy=metadata(['gui'],'gui',{'gui-framework':'nsh','nsh-targets':['tui']});
  assert.throws(()=>packageFacts(root,invalidLegacy,'macos'),/requires NSH workspace/u);
}));

/** 新旧正式版均要求版本、提交及 CLI 精确匹配。 */
test('nsh_toolchain_requires_matching_released_cli_and_runtime',()=>fixture(root=>{
  const preview='beeb9fc7707e0d4a195a4f7274f77b30e134c500';
  const stable='224d9a795c7ac9d10d75750de9351adac5549675';
  const previous='f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1';
  const dependency=(version,revision)=>`{ version = "${version}", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }`;
  const manifest=(revision,version='0.5.1')=>`[workspace]\nmembers = []\n[workspace.dependencies]\nnsh-core = ${dependency(version,revision)}\nnsh-base = ${dependency(version,revision)}\n[workspace.metadata.agent-first-harness]\ninterfaces = ["nsh"]\n`;
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.1 (beeb9fc)'),/pinned official stable runtime/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable));
  assert.equal(assertNshToolchain(root,['web'],'nsh 0.5.1 (224d9a7)'),stable);
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.0 (f4d68f7)'),/do not match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(previous,'0.5.0'));
  assert.equal(assertNshToolchain(root,['web'],'nsh 0.5.0 (f4d68f7)'),previous);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable,'0.5.0'));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.1 (224d9a7)'),/pinned official stable runtime/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable).replace(/^nsh-base.*$/mu,''));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.0 (f4d68f7)'),/must all match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable).replace('[workspace.metadata.agent-first-harness]',`nsh-engine = ${dependency('0.5.0',previous)}\n[workspace.metadata.agent-first-harness]`));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.1 (224d9a7)'),/must all match/u);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview).replace('[workspace.metadata.agent-first-harness]','nsh-engine = { workspace = true }\n[workspace.metadata.agent-first-harness]'));
  assert.throws(()=>assertNshToolchain(root,['web'],'nsh 0.5.0 (f4d68f7)'),/pinned official NSH Git runtime/u);
}));

/** 旧 GUI/NSH 元数据仍可识别，但预览 pin 必须在任何构建测试前失败。 */
test('legacy_gui_nsh_build_requires_released_cargo_pin',()=>fixture(root=>{
  const stable='f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1';
  const preview='beeb9fc7707e0d4a195a4f7274f77b30e134c500';
  const manifest=revision=>`[workspace]\nmembers = ["sample_tool_gui"]\n[workspace.dependencies]\nnsh-core = { version = "0.5.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\nnsh-base = { version = "0.5.0", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }\n[workspace.metadata.agent-first-harness]\nproject-id = "sample_tool"\ninterfaces = ["gui"]\ngui-framework = "nsh"\ntarget-platforms = ["web"]\n`;
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(preview));
  const bin=path.join(root,'fake-bin');fs.mkdirSync(bin);
  const metadataFile=path.join(root,'metadata.json'),marker=path.join(root,'cargo-test-called');
  fs.writeFileSync(metadataFile,JSON.stringify({workspace_root:root,workspace_members:['member-id'],packages:[{id:'member-id',name:'sample_tool_gui',manifest_path:path.join(root,'sample_tool_gui','Cargo.toml'),version:'0.1.0'}],metadata:{'agent-first-harness':{'project-id':'sample_tool',interfaces:['gui'],'gui-framework':'nsh','target-platforms':['web']}}}));
  fs.writeFileSync(path.join(bin,'cargo'),'#!/usr/bin/env node\nconst fs=require("node:fs");\nif(process.argv[2]==="metadata") process.stdout.write(fs.readFileSync(process.env.NSH_FAKE_METADATA));\nelse { fs.writeFileSync(process.env.NSH_FAKE_TEST_MARKER,"called"); process.exitCode=7; }\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'nsh'),'#!/usr/bin/env node\nif(process.argv[2]==="--version") process.stdout.write("nsh 0.5.0 (f4d68f7)\\n");\nelse process.exitCode=8;\n',{mode:0o755});
  const script=fileURLToPath(new URL('./build_nsh_release.mjs',import.meta.url));
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NSH_FAKE_METADATA:metadataFile,NSH_FAKE_TEST_MARKER:marker};
  const invoke=()=>spawnSync(process.execPath,[script,'--root',root,'--target','web'],{cwd:root,env,encoding:'utf8',timeout:30_000});
  const blocked=invoke();
  assert.equal(blocked.status,1,blocked.stderr);
  assert.match(blocked.stderr,/pinned official stable runtime/u);
  assert.equal(fs.existsSync(marker),false);
  fs.writeFileSync(path.join(root,'Cargo.toml'),manifest(stable));
  fs.mkdirSync(path.join(root,'sample_tool_gui'));
  fs.writeFileSync(path.join(root,'sample_tool_gui/nsh.json'),JSON.stringify({name:'Example',id:'com.example.fixture',version:'0.1.0'}));
  const accepted=invoke();
  assert.equal(accepted.status,1,accepted.stderr);
  assert.match(accepted.stderr,/cargo failed \(7\)/u);
  assert.equal(fs.readFileSync(marker,'utf8'),'called');
  assert.deepEqual(fs.readdirSync(path.join(root,'target/nsh-packaging')),[]);
}));

test('tracked_resolution_and_unanswered_candidate_selection_fail_before_build',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'Cargo.toml'),'[workspace.metadata.agent-first-harness]\ndependency-lock-policy = "tracked"\n');
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web'}),/explicit e2e/u);
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web',e2e:'disabled'}),/reason/u);
  assert.throws(()=>buildNshRelease({root,target:'web'}),/does not propagate tracked locks/u);
  assert.equal(fs.readdirSync(root).length,1);
}));

/** 不受支持的目标在任何构建命令前被拒绝。 */
test('unsupported_target_rejects_before_creating_build_state',()=>fixture(root=>{
  for (const mode of ['local','candidate']) assert.throws(()=>buildNshRelease({root,mode,target:'tui',e2e:'enabled'}),/unsupported NSH packaging target/u);
  assert.throws(()=>validateNshArtifacts(path.join(root,'missing'),'tui'),/unsupported NSH packaging target/u);
  assert.equal(fs.readdirSync(root).length,0);
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

test('official Windows ZIP remains primary when Inno Setup and updater archives are present',()=>fixture(root=>{
  const zip = Buffer.alloc(22);
  zip.set([80,75,3,4]);
  fs.mkdirSync(path.join(root,'Example'));
  fs.writeFileSync(path.join(root,'Example/Example.exe'),'MZ runner');
  fs.writeFileSync(path.join(root,'Example-setup.exe'),'MZ installer');
  fs.writeFileSync(path.join(root,'Example.zip'),zip);
  fs.writeFileSync(path.join(root,'Example-0.1.0-x64.zip'),zip);
  assert.equal(validateNshArtifacts(root,'windows',{name:'Example'}).length,4);
  fs.unlinkSync(path.join(root,'Example/Example.exe'));
  assert.throws(()=>validateNshArtifacts(root,'windows',{name:'Example'}),/Windows runner/u);
}));

test('JUnit rejects Rust-only and skipped NSH suites despite successful process exit', () => {
  const report = suites => '<testsuites name="nsh test" tests="3" failures="0" errors="0" skipped="1" time="1.000">' + suites + '</testsuites>';
  const suite = (name, total, skipped) => `<testsuite name="${name}" tests="${total}" failures="0" errors="0" skipped="${skipped}"></testsuite>`;
  const rust = suite('workspace Cargo tests',2,0);
  assert.throws(()=>passingNshCases(report(rust+suite('App.test.tsx',1,1))),/nonempty passing/u);
  assert.equal(passingNshCases(report(rust+suite('App.test.tsx',2,1))),1);
});
