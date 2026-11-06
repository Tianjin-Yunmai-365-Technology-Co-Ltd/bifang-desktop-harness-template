#!/usr/bin/env node
/** 仅在真实 NSH Web/Android 构建缺失目标后，恢复当前 Rust 工具链的标准库。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

/** 解析已确认受支持目标，不接受任意安装参数或其他工具。 */
export function targetRecoveryOptions(argv) {
  const {values}=parseArgs({args:argv,options:{'install-missing':{type:'boolean',default:false},target:{type:'string',default:'wasm32-unknown-unknown'}},strict:true});
  if(!['wasm32-unknown-unknown','armv7-linux-androideabi'].includes(values.target)) throw new Error('unsupported NSH recovery target');
  return {install:values['install-missing'],target:values.target};
}
/** 仅执行 rustup/rustc，保留当前 stable 与全局标准根，不升级或改 PATH。 */
function rust(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.status!==0)throw new Error(`${command} failed: ${result.stderr?.slice(-2000)}`);return result.stdout.trim();}
/** 缺失默认只报告；写入模式安装后复读实际路径与目标。 */
export function recoverNshTarget({install,target}) {
  if(!['wasm32-unknown-unknown','armv7-linux-androideabi'].includes(target)) throw new Error('unsupported NSH recovery target');
  if(typeof install!=='boolean') throw new Error('install selection must be boolean');
  const installed=()=>rust('rustup',['target','list','--installed']).split(/\r?\n/u);
  let changed=false;
  if(!installed().includes(target)) {
    if(!install) return {target,status:'missing',changed};
    rust('rustup',['target','add',target]);changed=true;
  }
  if(!installed().includes(target))throw new Error('Rust target installation was not confirmed');
  const libdir=rust('rustc',['--print','target-libdir','--target',target]);
  if(!fs.statSync(libdir).isDirectory())throw new Error('target standard library directory missing');
  return {target,status:'passed',changed,rustVersion:rust('rustc',['--version']),targetLibdir:libdir};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{process.stdout.write(JSON.stringify(recoverNshTarget(targetRecoveryOptions(process.argv.slice(2))))+'\n');}
  catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
}
