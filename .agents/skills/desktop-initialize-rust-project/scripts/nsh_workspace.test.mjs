/** 验证真实生成文件、core 保护、能力失败关闭与跨平台事实。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createNshWorkspace } from './create_nsh_workspace.mjs';
import { addNshAdapter } from '../../desktop-add-nsh-adapter/scripts/add_nsh_adapter.mjs';
import { renderNshAdapterFiles,NSH_REVISION,NSH_UNAVAILABLE } from '../../desktop-add-nsh-adapter/scripts/nsh_adapter_files.mjs';
import { sourceSnapshot } from '../../desktop-build-nsh-release/scripts/build_nsh_release.mjs';
import { initialize,check } from '../../desktop-manage-version/scripts/version_gate.mjs';

/** 明确测试身份与配置，不冒充用户的初始化确认。 */
const options=()=>({projectId:'sample_tool',nameZh:'测试工具',nameEn:'Test Tool',owner:'Engineering Fixture',nshTargets:['desktop','web'],targetPlatforms:['macos','web'],profile:{system_tray:'disabled',system_notification:'disabled',autostart:'disabled',about_page:'disabled',sponsor_page:'disabled',single_instance:'disabled',deep_link:'disabled',global_shortcut:'disabled',sidebar_mode:'compact'}});
/** 使用 canonical 临时路径，与 macOS /tmp 链接分开。 */
function fixture(run){const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'nsh-test-')));try{return run(parent);}finally{fs.rmSync(parent,{recursive:true,force:true});}}

test('application_ids_are_valid_for_android_and_apple_without_collisions',()=>{
  const projectIds=['sample_tool','sampletool','sample_1','sample_p1','a_0_b','a'.repeat(64)];
  const ids=projectIds.map(projectId=>JSON.parse(renderNshAdapterFiles({...options(),projectId}).get(`${projectId}_nsh/nsh.json`)).id);
  assert.equal(new Set(ids).size,projectIds.length);
  for(const id of ids){assert.match(id,/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u);assert.ok(id.length<=255);}
  assert.equal(ids[0],'com.psample.ptool.app');
});

test('unavailable_capabilities_reject_before_writing_and_disabled_pages_have_no_files',()=>fixture(parent=>{
  for(const field of NSH_UNAVAILABLE){const input=options();input.profile[field]='enabled';assert.throws(()=>createNshWorkspace(path.join(parent,'new'),input),/unavailable/u);assert.equal(fs.existsSync(path.join(parent,'new')),false);}
  const files=renderNshAdapterFiles(options());
  assert.equal([...files.keys()].some(file=>/sponsor|about\.tsx|build\.rs/u.test(file)),false);
  assert.equal(files.get('sample_tool_nsh/Cargo.toml').includes('sample_tool_core.workspace = true'),true);
  const withAbout=options();withAbout.profile.about_page='enabled';
  const aboutFiles=renderNshAdapterFiles(withAbout);
  assert.ok(aboutFiles.has('sample_tool_nsh/build.rs'));
  assert.match(aboutFiles.get('sample_tool_nsh/about.tsx'),/Scaffold\.releaseNotes/u);
  assert.match(aboutFiles.get('sample_tool_nsh/src/lib.rs'),/harness_release_notes_zh\.txt/u);
  assert.doesNotMatch(aboutFiles.get('sample_tool_nsh/App.tsx'),/__ABOUT_/u);
}));

test('all_targets_use_mixed_tsx_and_real_shared_core_bridge',()=>{
  const desktop=renderNshAdapterFiles(options());
  const manifest=JSON.parse(desktop.get('sample_tool_nsh/nsh.json'));
  assert.equal(manifest.rust,'.');
  assert.equal(Object.hasOwn(manifest,'root'),false);
  assert.deepEqual(manifest.capabilities.host,['window.list','window.setTitle','window.open','window.focus','window.showAll','window.close','app.quit']);
  const source=desktop.get('sample_tool_nsh/src/lib.rs');
  assert.match(source,/\[native_module\("sample_tool\/native"\)\]/u);
  assert.match(source,/sample_tool_core::scaffold_status\(\)\s*\.await\s*\.initialized/u);
  assert.match(desktop.get('sample_tool_nsh/App.tsx'),/from "\.\/App\.shared"/u);
  assert.match(desktop.get('sample_tool_nsh/App.shared.tsx'),/Scaffold\.status\(\)/u);
  assert.match(desktop.get('sample_tool_nsh/desktop.tsx'),/Menu\.setApplicationMenu/u);
  assert.match(desktop.get('sample_tool_nsh/desktop.tsx'),/invoke<boolean>\("window\.setTitle"/u);
  assert.match(desktop.get('sample_tool_nsh/desktop.tsx'),/menu\.owner/u);
  assert.doesNotMatch(desktop.get('sample_tool_nsh/desktop.tsx'),/globalShortcut|\.shortcut\(/u);
  assert.ok(desktop.has('sample_tool_nsh/src/macos_host.rs'));
  const mobileWeb={...options(),nshTargets:['mobile','web'],targetPlatforms:['android','ios','web']};
  delete mobileWeb.profile;
  const mobile=renderNshAdapterFiles(mobileWeb);
  assert.equal(JSON.parse(mobile.get('sample_tool_nsh/nsh.json')).rust,'.');
  assert.equal(Object.hasOwn(JSON.parse(mobile.get('sample_tool_nsh/nsh.json')),'root'),false);
  assert.equal(Object.hasOwn(JSON.parse(mobile.get('sample_tool_nsh/nsh.json')),'capabilities'),false);
  assert.match(mobile.get('sample_tool_nsh/src/lib.rs'),/sample_tool_core::scaffold_status\(\)\s*\.await\s*\.initialized/u);
  assert.match(mobile.get('sample_tool_nsh/App.tsx'),/from "\.\/App\.shared"/u);
  assert.match(mobile.get('sample_tool_nsh/App.shared.tsx'),/Scaffold\.status\(\)/u);
  assert.equal(mobile.has('sample_tool_nsh/desktop.tsx'),false);
  assert.equal([...mobile.keys()].some(file=>file.includes('_host.rs')),false);
});

test('selected_desktop_capabilities_are_conditional_and_deep_links_require_single_instance',()=>{
  const invalid=options();invalid.profile.deep_link='enabled';
  assert.throws(()=>renderNshAdapterFiles(invalid),/deep_link requires single_instance/u);
  const all=options();
  for(const field of ['system_tray','single_instance','deep_link','autostart']) all.profile[field]='enabled';
  const files=renderNshAdapterFiles(all);
  const config=JSON.parse(files.get('sample_tool_nsh/nsh.json'));
  assert.deepEqual(config.capabilities.host,['window.list','window.setTitle','window.open','window.focus','window.showAll','window.close','app.quit','autostart.get','autostart.set','deepLink.takePending']);
  assert.match(files.get('sample_tool_nsh/desktop.tsx'),/autostart\.set/u);
  assert.match(files.get('sample_tool_nsh/desktop.tsx'),/deepLink\.takePending/u);
  assert.ok(files.has('sample_tool_nsh/src/deep_link.rs'));
  assert.ok(files.has('sample_tool_nsh/src/macos_autostart.rs'));
  assert.match(files.get('sample_tool_nsh/src/deep_link.rs'),/app-sample-tool:\/\/";\s*const RESTORE: &str = "restore"/u);
  assert.doesNotMatch(files.get('sample_tool_nsh/Cargo.toml'),/version = "0\.4\.0"/u);
  assert.match(files.get('sample_tool_nsh/Cargo.toml'),/nsh-platform-macos\.workspace = true/u);
});

/** 新 NSH 成员与目标层级写入 Cargo，版本镜像绑定实际 adapter 清单。 */
test('fresh_workspace_cargo_metadata_binds_nsh_to_core_and_platforms',()=>fixture(parent=>{
  const root=path.join(parent,'new');createNshWorkspace(root,options());
  const format=spawnSync('cargo',['fmt','--all','--','--check'],{cwd:root,encoding:'utf8'});
  assert.equal(format.status,0,format.stdout+format.stderr);
  const result=spawnSync('cargo',['metadata','--no-deps','--format-version','1'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const metadata=JSON.parse(result.stdout);
  assert.deepEqual(metadata.metadata['agent-first-harness'].interfaces,['nsh']);
  assert.deepEqual(metadata.metadata['agent-first-harness']['nsh-targets'],['desktop','web']);
  assert.deepEqual(metadata.metadata['agent-first-harness']['target-platforms'],['macos','web']);
  assert.equal(metadata.metadata['agent-first-harness']['gui-framework'],undefined);
  const gui=metadata.packages.find(pkg=>pkg.name==='sample_tool_nsh');assert.ok(gui.dependencies.some(dep=>dep.name==='sample_tool_core' && !dep.optional));
  assert.ok(gui.dependencies.some(dep=>dep.name==='nsh-platform-macos'));
  assert.match(fs.readFileSync(path.join(root,'Cargo.toml'),'utf8'),new RegExp('nsh-platform-macos = \\{ version = "0\\.4\\.0".*rev = "' + NSH_REVISION + '"','u'));
  initialize(root);assert.deepEqual(check(root,'build').version_mirrors,['sample_tool_nsh/nsh.json']);
  const config=path.join(root,'sample_tool_nsh/nsh.json');const originalConfig=fs.readFileSync(config,'utf8');
  fs.writeFileSync(config,originalConfig.replace('0.1.0','0.2.0'));assert.throws(()=>check(root,'build'),/version|mirror/u);fs.writeFileSync(config,originalConfig);
  const snapshot=sourceSnapshot(root);fs.mkdirSync(path.join(root,'target'));fs.writeFileSync(path.join(root,'target','cache'),'cache');assert.equal(sourceSnapshot(root),snapshot);
  fs.writeFileSync(path.join(root,'sample_tool_nsh/tokens.ts'),'changed');assert.notEqual(sourceSnapshot(root),snapshot);
  assert.throws(()=>createNshWorkspace(root,options()),/absent or empty/u);
}));

test('add_only_preserves_existing_core_and_refuses_symlink_manifests',()=>fixture(parent=>{
  const root=path.join(parent,'existing');fs.mkdirSync(path.join(root,'sample_tool_core/src'),{recursive:true});
  fs.writeFileSync(path.join(root,'Cargo.toml'),'[workspace]\nmembers = ["sample_tool_core",]\nresolver = "3"\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\n[workspace.dependencies]\nsample_tool_core = { path = "sample_tool_core" }\n[workspace.metadata.agent-first-harness]\nproject-id = "sample_tool"\ninterfaces = []\ntarget-platforms = ["macos"]\n');
  fs.writeFileSync(path.join(root,'sample_tool_core/Cargo.toml'),'[package]\nname = "sample_tool_core"\nversion.workspace = true\nedition.workspace = true\n');
  const bridgeCore='//! Existing core with an explicit NSH bridge contract.\n\npub struct ScaffoldStatus {\n    pub initialized: bool,\n    pub product_definition_required: bool,\n}\n\npub async fn scaffold_status() -> ScaffoldStatus {\n    ScaffoldStatus { initialized: true, product_definition_required: false }\n}\n';
  fs.writeFileSync(path.join(root,'sample_tool_core/src/lib.rs'),bridgeCore);
  const cargoFile=path.join(root,'Cargo.toml'),initialCargo=fs.readFileSync(cargoFile,'utf8');
  fs.writeFileSync(cargoFile,initialCargo.replace('interfaces = []','interfaces = ["cli"]'));
  assert.throws(()=>addNshAdapter(root,{...options(),nshTargets:['desktop'],targetPlatforms:['macos']}),/without an interface/u);
  assert.equal(fs.existsSync(path.join(root,'sample_tool_nsh')),false);
  fs.writeFileSync(cargoFile,initialCargo);
  fs.writeFileSync(cargoFile,initialCargo+'version-mirrors = [\n "existing.json"\n]\n');
  assert.throws(()=>addNshAdapter(root,{...options(),nshTargets:['desktop'],targetPlatforms:['macos']}),/single-line/u);
  assert.equal(fs.existsSync(path.join(root,'sample_tool_nsh')),false);
  fs.writeFileSync(cargoFile,initialCargo+'version-mirrors = []\n');
  const outside=path.join(parent,'outside.json');fs.writeFileSync(outside,'{"private":true}');fs.symlinkSync(outside,path.join(root,'package.json'));
  const desktopOptions={...options(),nshTargets:['desktop'],targetPlatforms:['macos']};
  assert.throws(()=>addNshAdapter(root,desktopOptions),/symbolic/u);assert.equal(fs.readFileSync(outside,'utf8'),'{"private":true}');assert.equal(fs.existsSync(path.join(root,'sample_tool_nsh')),false);
  fs.unlinkSync(path.join(root,'package.json'));
  fs.writeFileSync(path.join(root,'sample_tool_core/src/lib.rs'),'//! Missing bridge.\npub const EXISTING: u8 = 1;\n');
  assert.throws(()=>addNshAdapter(root,desktopOptions),/existing core must export/u);
  assert.equal(fs.existsSync(path.join(root,'sample_tool_nsh')),false);
  fs.writeFileSync(path.join(root,'sample_tool_core/src/lib.rs'),bridgeCore);
  const before=fs.readFileSync(path.join(root,'sample_tool_core/src/lib.rs'));
  addNshAdapter(root,desktopOptions);assert.deepEqual(fs.readFileSync(path.join(root,'sample_tool_core/src/lib.rs')),before);
  const metadata=spawnSync('cargo',['metadata','--no-deps','--format-version','1'],{cwd:root,encoding:'utf8'});assert.equal(metadata.status,0,metadata.stderr);
  assert.deepEqual(JSON.parse(metadata.stdout).metadata['agent-first-harness']['version-mirrors'],['sample_tool_nsh/nsh.json']);
  assert.deepEqual(JSON.parse(metadata.stdout).metadata['agent-first-harness']['nsh-targets'],['desktop']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts['nsh:check'],'nsh check sample_tool_nsh');
  assert.match(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts.dev,/run_nsh_desktop\.mjs/u);
  assert.throws(()=>addNshAdapter(root,desktopOptions),/without an interface/u);
}));

/** 非桌面 NSH 仅写内部中性 UI 默认值，不生成桌面能力 profile。 */
test('mobile_web_only_omits_desktop_profile',()=>fixture(parent=>{
  const input={...options(),nshTargets:['mobile','web'],targetPlatforms:['android','ios','web']};
  delete input.profile;
  const root=path.join(parent,'mobile');
  createNshWorkspace(root,input);
  assert.equal(fs.existsSync(path.join(root,'docs/GUI_APP_PROFILE.md')),false);
  assert.ok(fs.existsSync(path.join(root,'sample_tool_nsh/nsh.json')));
  assert.match(fs.readFileSync(path.join(root,'sample_tool_nsh/src/lib.rs'),'utf8'),/sample_tool_core::scaffold_status/u);
  assert.match(fs.readFileSync(path.join(root,'sample_tool_nsh/App.shared.tsx'),'utf8'),/Scaffold\.status/u);
  assert.throws(()=>createNshWorkspace(path.join(parent,'invalid'),{...input,profile:options().profile}),/desktop profile requires desktop/u);
}));

/** TUI 新建或组合目标都须在写入工程文件前失败关闭。 */
test('tui_workspaces_are_unavailable_before_any_write',()=>fixture(parent=>{
  const pureOptions={...options(),nshTargets:['tui'],targetPlatforms:['macos']};delete pureOptions.profile;
  const combinedOptions={...options(),nshTargets:['desktop','tui'],targetPlatforms:['macos']};
  for(const [name,input] of [['pure',pureOptions],['combined',combinedOptions]]) {
    const target=path.join(parent,name);
    assert.throws(()=>createNshWorkspace(target,input),/TUI is temporarily unavailable/u);
    assert.equal(fs.existsSync(target),false);
  }
  const invalid=path.join(parent,'invalid');
  assert.throws(()=>createNshWorkspace(invalid,{...options(),nshTargets:['desktop']}),/web target-platforms mismatch/u);
  assert.equal(fs.existsSync(invalid),false);
}));
