import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".harness", "node_modules", "target", "dist", "release"]);

/** 递归枚举受管文件，拒绝源码树中的符号链接。 */
export function collectFiles(directory, extensions) {
  const results = [];
  const visit = (current) => {
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`受管目录不得包含符号链接：${current}`);
    }
    if (stats.isFile()) {
      if (extensions.has(path.extname(current))) {
        results.push(current);
      }
      return;
    }
    if (!stats.isDirectory()) {
      return;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      visit(path.join(current, entry.name));
    }
  };
  visit(directory);
  return results.sort();
}

/** 屏蔽 Rust 注释，并可同时屏蔽字符串；保留换行和字符宽度供顺序检查使用。 */
export function sanitizeRustSource(sourceText, maskStrings = false) {
  const masked = (text) => text.replace(/[^\r\n]/gu, " ");
  let result = "";
  let index = 0;
  while (index < sourceText.length) {
    if (sourceText.startsWith("//", index)) {
      const end = sourceText.indexOf("\n", index + 2);
      const boundary = end < 0 ? sourceText.length : end;
      result += masked(sourceText.slice(index, boundary));
      index = boundary;
      continue;
    }
    if (sourceText.startsWith("/*", index)) {
      let depth = 1;
      let end = index + 2;
      while (end < sourceText.length && depth > 0) {
        if (sourceText.startsWith("/*", end)) {
          depth += 1;
          end += 2;
        } else if (sourceText.startsWith("*/", end)) {
          depth -= 1;
          end += 2;
        } else {
          end += 1;
        }
      }
      result += masked(sourceText.slice(index, end));
      index = end;
      continue;
    }
    const rawPrefix = sourceText.slice(index).match(/^(?:br|r)(#*)"/u);
    if (rawPrefix) {
      const terminator = `"${rawPrefix[1]}`;
      const contentStart = index + rawPrefix[0].length;
      const closing = sourceText.indexOf(terminator, contentStart);
      const end = closing < 0 ? sourceText.length : closing + terminator.length;
      const literal = sourceText.slice(index, end);
      result += maskStrings ? masked(literal) : literal;
      index = end;
      continue;
    }
    if (sourceText[index] === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < sourceText.length) {
        const character = sourceText[end];
        end += 1;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') break;
      }
      const literal = sourceText.slice(index, end);
      result += maskStrings ? masked(literal) : literal;
      index = end;
      continue;
    }
    result += sourceText[index];
    index += 1;
  }
  return result;
}

/** 去除 TOML 行尾注释，同时保留字符串中的井号。 */
function stripTomlComments(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => {
      let quote = null;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (quote && character === "\\") {
          escaped = true;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = quote === character ? null : quote ?? character;
          continue;
        }
        if (!quote && character === "#") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

/** 提取一个 TOML 表正文，不把后续表误算进当前配置。 */
export function tomlSection(text, sectionName) {
  const lines = stripTomlComments(text).split(/\r?\n/u);
  const heading = `[${sectionName}]`;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return "";
  }
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/u.test(lines[index])) {
      break;
    }
    body.push(lines[index]);
  }
  return body.join("\n");
}

/** 提取 TOML 表内一个可能跨行的赋值表达式。 */
export function tomlAssignment(section, key) {
  const lines = section.split(/\r?\n/u);
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=`, "u");
  const start = lines.findIndex((line) => keyPattern.test(line));
  if (start < 0) {
    return "";
  }
  const block = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    block.push(line);
    for (const character of line) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote && character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = quote === character ? null : quote ?? character;
        continue;
      }
      if (!quote && "[{(".includes(character)) {
        depth += 1;
      } else if (!quote && "]})".includes(character)) {
        depth -= 1;
      }
    }
    if (depth <= 0 && !quote) {
      break;
    }
  }
  return block.join("\n");
}

/** 判断依赖声明是否以给定完整三段版本作为兼容下界。 */
export function cargoDependencyHasLowerBound(declaration, version) {
  if (!declaration) return false;
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:=\\s*["']${escaped}["']|\\bversion\\s*=\\s*["']${escaped}["'])`,
    "u",
  ).test(declaration);
}

/** 读取满足 target 关键词的 Cargo dependency 表中的单项声明。 */
export function targetDependencyDeclaration(text, targetKeyword, dependency) {
  const sections = [
    ...stripTomlComments(text).matchAll(/^\s*\[([^\]]+)\]\s*$/gmu),
  ];
  for (const match of sections) {
    const sectionName = match[1];
    if (
      sectionName.includes("target.") &&
      sectionName.includes(targetKeyword)
    ) {
      const declaration = sectionName.endsWith(`.dependencies.${dependency}`)
        ? tomlSection(text, sectionName)
        : sectionName.endsWith(".dependencies")
          ? tomlAssignment(tomlSection(text, sectionName), dependency)
          : "";
      if (declaration) return declaration;
    }
  }
  return "";
}

/** 读取同时覆盖 macOS、Windows 与 Linux 的桌面 target dependency 声明。 */
export function desktopTargetDependencyDeclaration(text, dependency) {
  const sections = [
    ...stripTomlComments(text).matchAll(/^\s*\[([^\]]+)\]\s*$/gmu),
  ];
  for (const match of sections) {
    const sectionName = match[1];
    if (
      sectionName.includes("target.") &&
      sectionName.includes("macos") &&
      sectionName.includes("windows") &&
      sectionName.includes("linux")
    ) {
      const declaration = sectionName.endsWith(`.dependencies.${dependency}`)
        ? tomlSection(text, sectionName)
        : sectionName.endsWith(".dependencies")
          ? tomlAssignment(tomlSection(text, sectionName), dependency)
          : "";
      if (declaration) return declaration;
    }
  }
  return "";
}

/** 把真实 GUI 路径约束在项目根内，避免检查到错误项目。 */
export function resolveGuiRoot(rootInput, guiInput) {
  if (path.isAbsolute(guiInput)) {
    throw new Error("--gui-dir 必须是项目根相对路径");
  }
  const root = fs.realpathSync(path.resolve(rootInput));
  const requested = path.resolve(root, guiInput);
  const guiRoot = fs.realpathSync(requested);
  const relative = path.relative(root, guiRoot);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`GUI 目录必须严格位于项目根内：${guiInput}`);
  }
  if (fs.lstatSync(requested).isSymbolicLink()) {
    throw new Error(`GUI 目录不得是符号链接：${guiInput}`);
  }
  return { root, guiRoot };
}

/** 在忽略字符串与注释中的分隔符后寻找成对括号的末端。 */
function findMatchingDelimiter(sourceText, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  for (let index = openIndex; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (character === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 1;
      } else if (character === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (character === '"') {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 枚举普通 Rust 函数正文，供生命周期接线检查使用。 */
export function collectRustFunctions(sourceText) {
  const functions = [];
  const pattern = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*\(/gu;
  for (const match of sourceText.matchAll(pattern)) {
    const parameterStart = sourceText.indexOf("(", match.index);
    const parameterEnd = findMatchingDelimiter(sourceText, parameterStart, "(", ")");
    if (parameterEnd < 0) continue;
    const bodyStart = sourceText.indexOf("{", parameterEnd);
    const semicolon = sourceText.indexOf(";", parameterEnd);
    if (bodyStart < 0 || (semicolon >= 0 && semicolon < bodyStart)) continue;
    const bodyEnd = findMatchingDelimiter(sourceText, bodyStart, "{", "}");
    if (bodyEnd < 0) continue;
    functions.push({
      end: bodyEnd + 1,
      name: match[1],
      parameters: sourceText.slice(parameterStart + 1, parameterEnd),
      start: match.index,
      text: sourceText.slice(match.index, bodyEnd + 1),
    });
  }
  return functions;
}

/** 枚举指定链式方法的完整参数，避免把未接入 Builder 的死代码视为运行时实现。 */
export function collectMethodArguments(sourceText, methodName) {
  const argumentsList = [];
  const pattern = new RegExp(`\\.${methodName}\\s*\\(`, "gu");
  for (const match of sourceText.matchAll(pattern)) {
    const openIndex = sourceText.indexOf("(", match.index);
    const closeIndex = findMatchingDelimiter(sourceText, openIndex, "(", ")");
    if (closeIndex >= 0) argumentsList.push(sourceText.slice(openIndex + 1, closeIndex));
  }
  return argumentsList;
}
