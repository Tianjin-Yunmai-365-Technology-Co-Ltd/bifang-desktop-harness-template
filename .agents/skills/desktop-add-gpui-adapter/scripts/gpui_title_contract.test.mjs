import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderGpuiAdapterFiles } from './gpui_adapter_files.mjs';
import { validateGpuiTitleFiles, validateGpuiTitleSources } from './gpui_title_contract.mjs';

const identity = { projectId: 'title_tool', nameZh: '标题工具', nameEn: 'Title Utility', owner: 'Owner', sponsorPage: 'disabled' };
const checker = fileURLToPath(new URL('./gpui_title_contract.mjs', import.meta.url));

/** 使用真实 renderer 输出，避免用手写简化夹具掩盖模板或接线漂移。 */
function generated(options = {}) {
  const files = renderGpuiAdapterFiles({ ...identity, ...options });
  return { files, sources: { title: files.get('title_tool_gui/src/window_title.rs'), main: files.get('title_tool_gui/src/main.rs'), shell: files.get('title_tool_gui/src/app/mod.rs') } };
}

/** 两种侧栏和支持页裁剪均不得裁掉必需标题。 */
test('generated_gpui_titles_are_complete_in_each_shell_mode', () => {
  for (const sidebarMode of ['compact', 'detailed']) {
    for (const aboutPage of ['enabled', 'disabled']) {
      assert.deepEqual(validateGpuiTitleSources(generated({ sidebarMode, aboutPage }).sources), []);
    }
  }
});

/** 缺少任一字段、顺序颠倒、QQ 值错误或额外前缀都必须失败。 */
test('gpui_gate_rejects_missing_fields_wrong_order_and_wrong_contact', () => {
  const { sources } = generated();
  const original = 'format!("{} {} QQ:2222980", application_name.trim(), display_version(version))';
  for (const replacement of [
    'format!("{} QQ:2222980", display_version(version))',
    'format!("{} QQ:2222980", application_name.trim())',
    'format!("{} {}", application_name.trim(), display_version(version))',
    'format!("QQ:2222980 {} {}", application_name.trim(), display_version(version))',
    'format!("{} {} QQ:2222980", display_version(version), application_name.trim())',
    'format!("{} {} QQ:0000000", application_name.trim(), display_version(version))',
    'format!("{} v{} QQ:2222980", application_name.trim(), display_version(version))',
  ]) {
    const title = sources.title.replace(original, replacement) + `\n// ${original}\n`;
    assert.notEqual(title, sources.title);
    assert.match(validateGpuiTitleSources({ ...sources, title }).join('\n'), /application name, vVersion, QQ:2222980 in that order/, replacement);
  }
});

/** 注释中的正确接线不能替代真实启动与刷新调用，权威版本也不能被写死。 */
test('gpui_gate_rejects_disconnected_windows_and_stale_versions', () => {
  const { sources } = generated();
  for (const [key, from, to] of [
    ['main', 'window_title::window_title(preferences.locale())', '"Title Utility"'],
    ['shell', 'crate::window_title::window_title(self.locale)', 'self.name()'],
    ['title', 'env!("CARGO_PKG_VERSION")', '"1.0.0"'],
    ['title', 'version.trim().trim_start_matches([\'v\', \'V\'])', 'version'],
  ]) {
    const changed = sources[key].replace(from, to) + `\n/* ${from} */\n`;
    assert.notEqual(changed, sources[key]);
    assert.ok(validateGpuiTitleSources({ ...sources, [key]: changed }).length, key);
  }
});

/** 普通字符串里的正确源码也不能代替真实初始标题接线。 */
test('gpui_gate_does_not_accept_string_literal_wiring_decoys', () => {
  const { sources } = generated();
  const main = sources.main
    .replace('titlebar: Some(TitlebarOptions { title: Some(window_title::window_title(preferences.locale()).into()), ..Default::default() })', 'titlebar: Some(TitlebarOptions::default())')
    .replace('fn main() -> std::process::ExitCode {', 'fn main() -> std::process::ExitCode {\nlet _ = "titlebar:Some(TitlebarOptions{title:Some(window_title::window_title(preferences.locale()).into()),..Default::default()})";');
  assert.match(validateGpuiTitleSources({ ...sources, main }).join('\n'), /initial window title/);
  const unused = sources.main
    .replace('titlebar: Some(TitlebarOptions { title: Some(window_title::window_title(preferences.locale()).into()), ..Default::default() })', 'titlebar: Some(TitlebarOptions::default())')
    .replace('fn main() -> std::process::ExitCode {', 'fn main() -> std::process::ExitCode {\nlet _ = WindowOptions { titlebar: Some(TitlebarOptions { title: Some(window_title::window_title(preferences.locale()).into()), ..Default::default() }), ..Default::default() };');
  assert.match(validateGpuiTitleSources({ ...sources, main: unused }).join('\n'), /initial window title/);
});

/** 命令行真实读取生成文件，标题被删改后必须返回非零状态。 */
test('gpui_title_cli_rejects_invalid_or_missing_actual_source', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gpui-title-cli-'));
  try {
    const { files } = generated();
    for (const relative of ['Cargo.toml', 'src/window_title.rs', 'src/main.rs', 'src/app/mod.rs']) {
      const file = path.join(root, 'title_tool_gui', relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, files.get(`title_tool_gui/${relative}`));
    }
    assert.deepEqual(validateGpuiTitleFiles(root), []);
    const invoke = () => spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(invoke().status, 0);
    const title = path.join(root, 'title_tool_gui/src/window_title.rs');
    fs.writeFileSync(title, fs.readFileSync(title, 'utf8').replace(' QQ:2222980', ''));
    assert.equal(invoke().status, 1);
    fs.unlinkSync(title);
    assert.equal(invoke().status, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/** 独立编译并执行生成的纯 Rust 标题测试，直接证明输出而不构建 GPUI。 */
test('generated_rust_title_regressions_execute_against_the_real_formatter', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gpui-title-rust-'));
  try {
    const { files } = generated();
    for (const name of ['window_title.rs', 'window_title_test.rs']) fs.writeFileSync(path.join(root, name), files.get(`title_tool_gui/src/${name}`));
    const binary = path.join(root, process.platform === 'win32' ? 'title-tests.exe' : 'title-tests');
    const compiled = spawnSync('rustc', ['--edition=2024', '--test', path.join(root, 'window_title.rs'), '-o', binary], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, CARGO_PKG_VERSION: '7.8.9' } });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
    const tested = spawnSync(binary, [], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(tested.status, 0, tested.stdout + tested.stderr);
    assert.match(tested.stdout, /3 passed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
