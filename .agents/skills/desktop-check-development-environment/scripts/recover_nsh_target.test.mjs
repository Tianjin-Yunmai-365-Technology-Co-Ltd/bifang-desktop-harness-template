/** 目标恢复只接受受限 Rust 标准库操作，未知参数在启动工具前失败。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {targetRecoveryOptions,recoverNshTarget} from './recover_nsh_target.mjs';

test('nsh_recovery_defaults_to_read_only_and_rejects_install_scope_expansion',()=>{
  assert.deepEqual(targetRecoveryOptions([]),{target:'wasm32-unknown-unknown',install:false});
  assert.deepEqual(targetRecoveryOptions(['--install-missing']),{target:'wasm32-unknown-unknown',install:true});
  assert.deepEqual(targetRecoveryOptions(['--target','armv7-linux-androideabi','--install-missing']),{target:'armv7-linux-androideabi',install:true});
  for(const args of [['--toolchain','nightly'],['--target','arbitrary'],['install','anything']]) assert.throws(()=>targetRecoveryOptions(args));
  assert.throws(()=>recoverNshTarget({target:'arbitrary',install:true}),/unsupported/u);
  assert.throws(()=>recoverNshTarget({target:'wasm32-unknown-unknown',install:'yes'}),/boolean/u);
});
