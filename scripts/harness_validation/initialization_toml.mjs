function stripComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "#") return line.slice(0, index);
  }
  return line;
}

function splitTopLevel(source, delimiter) {
  const values = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "[") square += 1;
    else if (character === "]") square -= 1;
    else if (character === "{") curly += 1;
    else if (character === "}") curly -= 1;
    else if (character === delimiter && square === 0 && curly === 0) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || square !== 0 || curly !== 0) throw new Error("unbalanced TOML value");
  values.push(source.slice(start).trim());
  return values;
}

function splitDotted(source) {
  const segments = splitTopLevel(source, ".");
  if (segments.some((segment) => segment.length === 0)) throw new Error(`invalid dotted key: ${source}`);
  return segments.map((segment) => {
    if ((segment.startsWith('"') && segment.endsWith('"'))
        || (segment.startsWith("'") && segment.endsWith("'"))) {
      return parseString(segment);
    }
    if (!/^[A-Za-z0-9_-]+$/u.test(segment)) throw new Error(`invalid bare key: ${segment}`);
    return segment;
  });
}

function parseString(source) {
  if (source.startsWith("'")) {
    if (!source.endsWith("'") || source.length < 2) throw new Error("unterminated literal string");
    return source.slice(1, -1);
  }
  if (!source.startsWith('"') || !source.endsWith('"') || source.length < 2) {
    throw new Error("unterminated basic string");
  }
  return JSON.parse(source);
}

function assignmentIndex(source) {
  let quote = null;
  let escaped = false;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "[") square += 1;
    else if (character === "]") square -= 1;
    else if (character === "{") curly += 1;
    else if (character === "}") curly -= 1;
    else if (character === "=" && square === 0 && curly === 0) return index;
  }
  return -1;
}

function parseValue(source) {
  const value = source.trim();
  if (value.startsWith('"') || value.startsWith("'")) return parseString(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?\d+(?:_\d+)*$/u.test(value)) return Number(value.replaceAll("_", ""));
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (!body) return [];
    return splitTopLevel(body, ",").filter(Boolean).map(parseValue);
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const body = value.slice(1, -1).trim();
    const result = {};
    if (!body) return result;
    for (const item of splitTopLevel(body, ",")) {
      const index = assignmentIndex(item);
      if (index < 1) throw new Error(`invalid inline table entry: ${item}`);
      setValue(result, splitDotted(item.slice(0, index).trim()), parseValue(item.slice(index + 1)));
    }
    return result;
  }
  throw new Error(`unsupported TOML value: ${value}`);
}

function tableAt(root, segments, { array = false } = {}) {
  let current = root;
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (last && array) {
      if (current[segment] === undefined) current[segment] = [];
      if (!Array.isArray(current[segment])) throw new Error(`TOML table conflict: ${segments.join(".")}`);
      const item = {};
      current[segment].push(item);
      current = item;
      return;
    }
    if (current[segment] === undefined) current[segment] = {};
    if (Array.isArray(current[segment])) current = current[segment].at(-1);
    else if (current[segment] && typeof current[segment] === "object") current = current[segment];
    else throw new Error(`TOML table conflict: ${segments.join(".")}`);
  });
  return current;
}

function setValue(root, segments, value) {
  const key = segments.at(-1);
  const table = segments.length === 1 ? root : tableAt(root, segments.slice(0, -1));
  if (Object.hasOwn(table, key)) throw new Error(`duplicate TOML key: ${segments.join(".")}`);
  table[key] = value;
}

/** Parse the scalar, array, inline-table, table, and array-table forms used by Cargo manifests. */
export function parseCargoToml(source) {
  const root = {};
  let current = root;
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = stripComment(lines[lineNumber]).trim();
    if (!line) continue;
    try {
      if (line.startsWith("[[") && line.endsWith("]]")) {
        current = tableAt(root, splitDotted(line.slice(2, -2).trim()), { array: true });
        continue;
      }
      if (line.startsWith("[") && line.endsWith("]")) {
        current = tableAt(root, splitDotted(line.slice(1, -1).trim()));
        continue;
      }
      const index = assignmentIndex(line);
      if (index < 1) throw new Error("expected key/value assignment");
      setValue(current, splitDotted(line.slice(0, index).trim()), parseValue(line.slice(index + 1)));
    } catch (error) {
      throw new Error(`line ${lineNumber + 1}: ${error.message}`);
    }
  }
  return root;
}
