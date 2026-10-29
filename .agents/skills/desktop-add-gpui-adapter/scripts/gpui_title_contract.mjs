#!/usr/bin/env node
/** 校验原生标题的固定字段、顺序与启动/刷新接线，不执行 Rust 或依赖源码关键词。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertRealPath } from './gpui_adapter_files.mjs';

/** 保留字符串为单个 token，跳过空白和嵌套注释，避免注释中的正确代码充当实现。 */
function tokens(source) {
  const result = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    if (/^\s/u.test(rest)) { index += 1; continue; }
    if (rest.startsWith('//')) { index = source.indexOf('\n', index); if (index < 0) break; continue; }
    if (rest.startsWith('/*')) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth) {
        if (source.startsWith('/*', index)) { depth += 1; index += 2; }
        else if (source.startsWith('*/', index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth) throw new Error('unterminated Rust comment');
      continue;
    }
    const raw = /^(?:br|r)(#*)"/u.exec(rest);
    if (raw) {
      const end = source.indexOf(`"${raw[1]}`, index + raw[0].length);
      if (end < 0) throw new Error('unterminated Rust raw string');
      const value = source.slice(index, end + 1 + raw[1].length);
      result.push(value); index += value.length; continue;
    }
    const value = /^(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\.|[^'\\])'|[A-Za-z_]\w*|[^\s])/u.exec(rest)?.[0];
    if (!value || (rest[0] === '"' && !value.endsWith('"'))) throw new Error('invalid Rust title source');
    result.push(value); index += value.length;
  }
  return result;
}

/** 提取唯一的真实函数体，字符串中的花括号与伪造声明不参与匹配。 */
function body(source, name, maskStrings = false) {
  const items = tokens(source);
  const starts = items.flatMap((value, index) => value === 'fn' && items[index + 1] === name ? [index] : []);
  if (starts.length !== 1) throw new Error(`requires exactly one ${name} function`);
  const start = items.indexOf('{', starts[0]);
  let depth = 1;
  let end = start + 1;
  for (; end < items.length && depth; end += 1) {
    if (items[end] === '{') depth += 1;
    if (items[end] === '}') depth -= 1;
  }
  if (start < 0 || depth) throw new Error(`invalid ${name} function body`);
  return items.slice(start + 1, end - 1).map(value => maskStrings && /^(?:"|(?:br|r)#*")/u.test(value) ? '<literal>' : value).join('');
}

/** 固定生成契约要求唯一公式，且主窗口创建和语言刷新都调用同一实现。 */
export function validateGpuiTitleSources({ title, main, shell }, errors = []) {
  try {
    const expected = 'format!("{} {} QQ:2222980", application_name.trim(), display_version(version))';
    if (body(title, 'format_window_title') !== tokens(expected).join('')) errors.push('GPUI title must be application name, vVersion, QQ:2222980 in that order');
    if (body(title, 'display_version') !== tokens('format!("v{}", version.trim().trim_start_matches([\'v\', \'V\']))').join('')) errors.push('GPUI title version must have exactly one lowercase v');
    if (body(title, 'window_title') !== tokens('format_window_title(application_name(locale), env!("CARGO_PKG_VERSION"))').join('')) errors.push('GPUI title must use the current locale and Cargo version');
    if (!/^iflocale=="zh-CN"\{"(?:\\.|[^"\\])+"\}else\{"(?:\\.|[^"\\])+"\}$/u.test(body(title, 'application_name'))) errors.push('GPUI title requires confirmed Chinese and English names');
    const entry = body(main, 'main', true);
    const initial = 'titlebar:Some(TitlebarOptions{title:Some(window_title::window_title(preferences.locale()).into()),..Default::default()})';
    const windowOptions = /gpui_kit::open_window\(WindowOptions\{([\s\S]*?)\},cx,/u.exec(entry)?.[1] ?? '';
    if (!tokens(main).some((value, index, items) => value === 'mod' && items[index + 1] === 'window_title' && items[index + 2] === ';') || !windowOptions.includes(initial) || (entry.match(/\btitle:/gu) ?? []).length !== 1 || (entry.match(/gpui_kit::open_window\(/gu) ?? []).length !== 1) errors.push('GPUI initial window title must use the complete shared title');
    const render = body(shell, 'render', true);
    if (!render.startsWith('window.set_window_title(&crate::window_title::window_title(self.locale));') || (render.match(/set_window_title\(/gu) ?? []).length !== 1) errors.push('GPUI rendered window title must use the complete shared title');
  } catch (error) { errors.push(`GPUI title contract: ${error.message}`); }
  return errors;
}

/** 检查标准 GUI member 中的实际源码，拒绝缺失文件、链接和含糊目标。 */
export function validateGpuiTitleFiles(rootValue) {
  const root = path.resolve(rootValue);
  assertRealPath(root);
  const members = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.endsWith('_gui') && fs.existsSync(path.join(root, entry.name, 'Cargo.toml')));
  if (members.length !== 1) throw new Error('GPUI title requires exactly one GUI member');
  const sources = {};
  for (const [key, relative] of Object.entries({ title: 'window_title.rs', main: 'main.rs', shell: 'app/mod.rs' })) {
    const file = path.join(root, members[0].name, 'src', relative);
    assertRealPath(file);
    if (!fs.lstatSync(file).isFile()) throw new Error(`GPUI title source must be a regular file: ${relative}`);
    sources[key] = fs.readFileSync(file, 'utf8');
  }
  return validateGpuiTitleSources(sources);
}

/** CLI 失败返回非零状态，供下游 validate 汇总。 */
export function main(argv = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args: argv, options: { root: { type: 'string', default: process.cwd() } }, allowPositionals: false });
    const errors = validateGpuiTitleFiles(values.root);
    for (const error of errors) process.stderr.write(`${error}\n`);
    return errors.length ? 1 : 0;
  } catch (error) { process.stderr.write(`GPUI title contract: ${error.message}\n`); return 1; }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main();
