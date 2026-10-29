import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { FIXED_METADATA_LOCALE_RUNTIME_FIXTURE_SOURCE as fixture } from './gui-fixed-ipc-contract.fixture.mjs';
import { validateFixedIpcRuntimeContract } from './gui-fixed-ipc-runtime-contract.mjs';
import { withFixture } from './verify-gui-lifecycle-contract.fixture.mjs';
import { verifyGuiLifecycleContract } from './verify-gui-lifecycle-contract.mjs';

/** 通过真实固定 IPC 入口验证，不能只测一个未被调用的标题 helper。 */
function errorsFor(source) {
  const errors = [];
  validateFixedIpcRuntimeContract(source, errors);
  return errors;
}

test('tauri_metadata_title_accepts_complete_inline_and_positional_formats', () => {
  assert.deepEqual(errorsFor(fixture), []);
  assert.deepEqual(errorsFor(fixture.replace('format!("Sample Application v{version} QQ:2222980")', 'format!("{} v{} {}:{}", "Sample Application", version, "QQ", "2222980")')), []);
  const dynamic = fixture.replace('let version = env!', 'let application_name = app.package_info().name.as_str();\n    let version = env!')
    .replace('application_name: "Sample Application",', 'application_name,')
    .replace('Sample Application v{version} QQ:2222980', '{application_name} v{version} QQ:2222980');
  assert.deepEqual(errorsFor(dynamic), []);
  const raw = fixture.replace('format!("Sample Application v{version} QQ:2222980")', 'format!(r#"Sample Application v{version} QQ:2222980"#)')
    .replace('application_name: "Sample Application"', 'application_name: r#"Sample Application"#');
  assert.deepEqual(errorsFor(raw), []);
});

test('tauri_metadata_title_rejects_missing_fields_wrong_order_and_stale_values', () => {
  for (const title of ['v{version} QQ:2222980', 'Sample Application QQ:2222980', 'Sample Application v{version}', 'QQ:2222980 v{version} Sample Application', 'Sample Application v{version} QQ:0000000', 'Other Application v{version} QQ:2222980', 'Sample Application vv{version} QQ:2222980']) {
    const source = fixture.replace('Sample Application v{version} QQ:2222980', title) + '\n// title: format!("Sample Application v{version} QQ:2222980")\n';
    assert.match(errorsFor(source).join('\n'), /Tauri Title 必须为应用名称 v应用版本 QQ:2222980/, title);
  }
});

test('tauri_metadata_title_rejects_wrong_positional_order_and_contact_fields', () => {
  for (const source of [
    fixture.replace('format!("Sample Application v{version} QQ:2222980")', 'format!("{} v{} QQ:2222980", version, "Sample Application")'),
    fixture.replace('contact_value: "2222980"', 'contact_value: "0000000"'),
    fixture.replace('contact_channel: "QQ"', 'contact_channel: "Email"'),
  ]) assert.match(errorsFor(source).join('\n'), /Tauri Title 必须为应用名称 v应用版本 QQ:2222980/);
});

/** 实际初始化结构门禁必须消费标题校验结果，不能只保留一个孤立 helper。 */
test('tauri_initialization_gate_rejects_an_incomplete_actual_metadata_title', () => {
  withFixture(({ root, guiRoot }) => {
    const file = path.join(guiRoot, 'src-tauri/src/lifecycle.rs');
    const source = fs.readFileSync(file, 'utf8');
    const changed = source.replace('Sample Application v{version} QQ:2222980', 'v{version}');
    assert.notEqual(source, changed);
    fs.writeFileSync(file, changed);
    assert.match(verifyGuiLifecycleContract(root, 'sample_gui').join('\n'), /Tauri Title 必须为应用名称 v应用版本 QQ:2222980/);
  });
});
