/** 构建前失败关闭、真实文件头与输出范围回归。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { buildNshRelease,inventory,releaseNoteBuildInputs,safeOutputPath,validateNshArtifacts } from './build_nsh_release.mjs';
import { renderDocument } from '../../desktop-prepare-release/scripts/release_notes.mjs';

/** 临时包只用于拒绝畸形输入，不能充当运行验证。 */
function fixture(run){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nsh-package-test-')));try{run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('tracked_resolution_and_unanswered_candidate_selection_fail_before_build',()=>fixture(root=>{
  fs.writeFileSync(path.join(root,'Cargo.toml'),'[workspace.metadata.agent-first-harness]\ndependency-lock-policy = "tracked"\n');
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web'}),/explicit e2e/u);
  assert.throws(()=>buildNshRelease({root,mode:'candidate',target:'web',e2e:'disabled'}),/reason/u);
  assert.throws(()=>buildNshRelease({root,target:'web'}),/does not propagate tracked locks/u);
  assert.equal(fs.readdirSync(root).length,1);
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
