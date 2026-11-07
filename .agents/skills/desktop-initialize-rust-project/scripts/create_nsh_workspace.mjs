#!/usr/bin/env node
/** 源专用中性 NSH 初始化 wrapper；初始化后删除，不能随升级传播。 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertNshPath } from '../../desktop-add-nsh-adapter/scripts/add_nsh_adapter.mjs';
import { normalizeNshOptions,nshDependencies,nshPackageScripts,renderNshAdapterFiles } from '../../desktop-add-nsh-adapter/scripts/nsh_adapter_files.mjs';

/** 初始化器仅在明确确认的空目标写入中性 core 与所选适配器。 */
export function createNshWorkspace(target,input) {
  if (!path.isAbsolute(target)) throw new Error('target must be absolute');
  assertNshPath(target);
  if (fs.existsSync(target) && (!fs.lstatSync(target).isDirectory() || fs.readdirSync(target).length)) throw new Error('target must be absent or empty');
  const options = normalizeNshOptions(input);
  const id = options.projectId;
  const files = renderNshAdapterFiles(options);
  files.set('Cargo.toml',`[workspace]\nresolver = "3"\nmembers = ["${id}_core", "${id}_nsh"]\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\nrust-version = "1.98.1"\nauthors = [${JSON.stringify(options.owner)}]\n\n[workspace.dependencies]\n${id}_core = { path = "${id}_core" }\n${nshDependencies(options)}\n\n[workspace.metadata.agent-first-harness]\nproject-id = "${id}"\ninterfaces = ["nsh"]\nnsh-targets = ${JSON.stringify(options.nshTargets)}\ntarget-platforms = ${JSON.stringify(options.targetPlatforms)}\nversion-mirrors = ["${id}_nsh/nsh.json"]\n`);
  files.set(`${id}_core/Cargo.toml`,`[package]\nname = "${id}_core"\nversion.workspace = true\nedition.workspace = true\n`);
  files.set(`${id}_core/src/lib.rs`,`//! 运行时中立共享核心；产品定义后在此建立领域规则。\n\n/// 中性工程是否完成初始化，以及产品定义是否待补充。\n#[derive(Debug, PartialEq, Eq)]\npub struct ScaffoldStatus {\n    /// 工程结构已经建立。\n    pub initialized: bool,\n    /// 产品目的和成功标准仍需定义。\n    pub product_definition_required: bool,\n}\n\n/// 返回不含业务假设或宿主副作用的工程状态。\npub async fn scaffold_status() -> ScaffoldStatus {\n    ScaffoldStatus {\n        initialized: true,\n        product_definition_required: true,\n    }\n}\n\n#[cfg(test)]\nmod tests {\n    use super::scaffold_status;\n    use std::future::Future;\n    use std::task::{Context, Poll, Waker};\n\n    #[test]\n    fn new_workspace_reports_its_neutral_core_state() {\n        let mut future = std::pin::pin!(scaffold_status());\n        let mut context = Context::from_waker(Waker::noop());\n        let Poll::Ready(status) = future.as_mut().poll(&mut context) else {\n            panic!("neutral scaffold status unexpectedly deferred");\n        };\n        assert!(status.initialized);\n        assert!(status.product_definition_required);\n    }\n}\n`);
  files.set('package.json',JSON.stringify({private:true,type:'module',engines:{node:'>=24.0.0'},scripts:nshPackageScripts(id,options.nshTargets,options.targetPlatforms)},null,2)+'\n');
  files.set('.gitignore','/target/\ntarget/\n/release/\n/.release-clean.*\n**/.nsh/\nCargo.lock\npnpm-lock.yaml\npnpm-package.lock\n/knowledge/\n/.harness/skills/archify/\n');
  const stage=fs.mkdtempSync(path.join(path.dirname(target),'.nsh-scaffold-'));
  try {
    for (const [relative,bytes] of files) { const file=path.join(stage,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,bytes,{flag:'wx'}); }
    assertNshPath(target);
    if (fs.existsSync(target)) { if (fs.readdirSync(target).length) throw new Error('target changed'); fs.rmdirSync(target); }
    fs.renameSync(stage,target);
  } catch (error) { fs.rmSync(stage,{recursive:true,force:true}); throw error; }
  return {target,interface:'nsh',nshTargets:options.nshTargets,files:[...files.keys()],productDefinitionRequired:true};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const {values}=parseArgs({options:{target:{type:'string'},options:{type:'string'}}}); if (!values.target || !values.options) throw new Error('requires target/options'); process.stdout.write(JSON.stringify(createNshWorkspace(values.target,JSON.parse(fs.readFileSync(values.options,'utf8'))))+'\n'); }
  catch(error) { process.stderr.write(`NSH initialization: ${error.message}\n`);process.exitCode=1; }
}
