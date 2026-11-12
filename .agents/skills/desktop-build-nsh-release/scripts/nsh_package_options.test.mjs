import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addNshIosBindgenSdk, resolveNshPackageOptions } from './nsh_package_options.mjs';

test('uses official Android and iOS package arguments with explicit signing inputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-options-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  fs.writeFileSync(path.join(root, 'audit-key.jks'), 'fixture only');
  fs.writeFileSync(path.join(root, 'audit.mobileprovision'), 'fixture only');
  const environment = {NSH_KEYSTORE_PASSWORD:'fixture-password'};
  const ordinary = resolveNshPackageOptions(root, 'android', {}, environment);
  assert.equal(ordinary.env.NSH_KEYSTORE_PASSWORD, undefined);
  assert.equal(ordinary.bundleFormat, 'apk');
  const android = resolveNshPackageOptions(root, 'android', {
    abi:['arm64-v8a,x86_64'], format:'aab', keystore:'audit-key.jks', keyAlias:'audit',
  }, environment);
  assert.deepEqual(android.abis, ['arm64-v8a','x86_64']);
  assert.equal(android.bundleFormat, 'aab');
  assert.equal(android.signing, 'release-keystore');
  assert.equal(android.env.NSH_KEYSTORE_PASSWORD, 'fixture-password');
  assert.ok(!android.args.some(arg => arg.includes('fixture-password')));
  const ios = resolveNshPackageOptions(root, 'ios', {sign:'Fixture Identity',profile:'audit.mobileprovision'});
  assert.equal(ios.bundleFormat, 'ipa');
  assert.equal(ios.signing, 'provisioning-profile');
  assert.throws(()=>resolveNshPackageOptions(root, 'ios-simulator', {sign:'Fixture Identity',profile:'audit.mobileprovision'}),/requires --target ios/u);
  assert.throws(()=>resolveNshPackageOptions(root, 'linux', {format:'aab'}),/requires|require --target android/u);
});

test('selects the iOS SDK for the correct Rust target and preserves explicit bindgen settings', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh SDK '));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  const env = {BINDGEN_EXTRA_CLANG_ARGS:'-DAPP=1'};
  addNshIosBindgenSdk('ios-simulator', env, sdk => {
    assert.equal(sdk, 'iphonesimulator');
    return root;
  });
  assert.equal(env.BINDGEN_EXTRA_CLANG_ARGS_aarch64_apple_ios_sim, `-DAPP=1 -isysroot '${root}'`);
  assert.equal(env.BINDGEN_EXTRA_CLANG_ARGS_aarch64_apple_ios, undefined);
  const key = 'BINDGEN_EXTRA_CLANG_ARGS_aarch64-apple-ios';
  env[key] = '-isysroot /selected/sdk';
  const unused = () => assert.fail('unexpected SDK lookup');
  addNshIosBindgenSdk('ios', env, unused);
  addNshIosBindgenSdk('android', env, unused);
  assert.equal(env[key], '-isysroot /selected/sdk');
});
