import { findMatchingDelimiter, sanitizeRustSource } from './gui-lifecycle-source-analysis.mjs';

/** Rust 普通/原始字符串保留完整边界，raw 内容不经过 JSON 转义解释。 */
function stringAt(source) {
  const raw = /^r(#*)"/u.exec(source);
  if (raw) {
    const end = source.indexOf(`"${raw[1]}`, raw[0].length);
    if (end < 0) throw new Error('invalid raw title string');
    return { literal: source.slice(0, end + 1 + raw[1].length), value: source.slice(raw[0].length, end) };
  }
  const literal = /^"(?:\\.|[^"\\])*"/u.exec(source)?.[0];
  return literal ? { literal, value: JSON.parse(literal) } : null;
}

/** 字符串与注释先等长屏蔽，原始字符串内的括号不会改变参数边界。 */
function matching(source, index, open, close) {
  return findMatchingDelimiter(sanitizeRustSource(source, true), index, open, close);
}

/** 按最外层逗号拆分受限 format! 参数，字符串和嵌套调用内部保持完整。 */
function argumentsOf(source) {
  const items = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const string = stringAt(source.slice(index));
    if (string) {
      index += string.literal.length - 1;
    } else if ('([{'.includes(source[index])) {
      const close = { '(': ')', '[': ']', '{': '}' }[source[index]];
      const end = matching(source, index, source[index], close);
      if (end < 0) throw new Error('invalid title argument');
      index = end;
    } else if (source[index] === ',') { items.push(source.slice(start, index).trim()); start = index + 1; }
  }
  const last = source.slice(start).trim();
  if (last) items.push(last);
  return items;
}

/** 只解析展示表达式和字段绑定；未知写法失败关闭，不执行 Rust 或猜测业务逻辑。 */
export function validateTauriMetadataTitle(commandSource, errors) {
  try {
    const source = sanitizeRustSource(commandSource);
    const metadata = [...source.matchAll(/\bAppMetadata\s*\{/gu)].at(-1);
    if (!metadata) throw new Error('missing metadata');
    const open = source.indexOf('{', metadata.index);
    const close = matching(source, open, '{', '}');
    const fields = new Map(argumentsOf(source.slice(open + 1, close)).map(field => {
      const pair = /^([A-Za-z_]\w*)\s*:\s*([\s\S]+)$/u.exec(field);
      return pair ? [pair[1], pair[2]] : [field, field];
    }));
    const bindings = new Map([...source.matchAll(/\blet\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/gu)].map(match => [match[1], match[2].trim()]));
    const name = fields.get('application_name');
    const resolve = (expression, seen = new Set()) => {
      const value = expression?.trim();
      if (!value || seen.has(value)) throw new Error('unresolved title field');
      const string = stringAt(value);
      if (string && string.literal === value) return string.value;
      if (/^env!\s*\(\s*"CARGO_PKG_VERSION"\s*\)$/u.test(value)) return '<VERSION>';
      if (value === name) return '<NAME>';
      if (bindings.has(value)) return resolve(bindings.get(value), new Set([...seen, value]));
      throw new Error('unsupported title field: ' + value);
    };
    const expectedName = resolve(name);
    if (!expectedName.trim() || resolve(fields.get('version')) !== '<VERSION>' || resolve(fields.get('contact_channel')) !== 'QQ' || resolve(fields.get('contact_value')) !== '2222980') throw new Error('invalid authoritative title fields');
    const title = fields.get('title');
    if (!/^format!\s*\(/u.test(title ?? '')) throw new Error('title must use the authoritative fields in format!');
    const titleOpen = title.indexOf('(');
    const titleClose = matching(title, titleOpen, '(', ')');
    if (title.slice(titleClose + 1).trim()) throw new Error('unexpected title suffix');
    const [literal, ...args] = argumentsOf(title.slice(titleOpen + 1, titleClose));
    const string = stringAt(literal);
    if (!string || string.literal !== literal) throw new Error('invalid title format string');
    const format = string.value;
    const named = new Map();
    const positional = [];
    for (const argument of args) {
      const match = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/u.exec(argument);
      if (match) named.set(match[1], match[2]); else positional.push(argument);
    }
    let next = 0;
    const used = new Set();
    const output = format.replace(/\{([^{}]*)\}/gu, (_, key) => {
      const reference = key === '' ? String(next++) : key;
      const expression = /^\d+$/u.test(reference) ? positional[Number(reference)] : named.get(reference) ?? reference;
      used.add(reference);
      return resolve(expression);
    });
    if (/[{}]/u.test(format.replace(/\{[^{}]*\}/gu, '')) || positional.some((_, index) => !used.has(String(index))) || [...named.keys()].some(key => !used.has(key))) throw new Error('unsupported or unused title arguments');
    if (output !== `${expectedName} v<VERSION> QQ:2222980`) throw new Error('wrong title fields or order');
  } catch (error) { errors.push(`Tauri Title 必须为应用名称 v应用版本 QQ:2222980：${error.message}`); }
}
