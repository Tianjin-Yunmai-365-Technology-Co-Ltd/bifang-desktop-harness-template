#!/usr/bin/env node
/** 派发前只读确认远端默认分支已具备 workflow_dispatch 入口。 */

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOW_PATH = ".github/workflows/release-candidate.yml";
const ASSET_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/github-release-candidate.yml");
const OID = /^[0-9a-f]{40}$/u;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DECODER = new TextDecoder("utf-8", { fatal: true });

/** 不经 shell 执行只读 Git 查询。 */
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: undefined,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", SSH_ASKPASS_REQUIRE: "never" },
    input: Buffer.alloc(0),
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Git 只读查询失败: ${args[0]}`);
  return result.stdout;
}

/** 读取远端 advertised 默认分支及其精确提交，不读取或移动远端 ref。 */
function advertisedDefault(root, remote) {
  const lines = DECODER.decode(git(root, ["ls-remote", "--symref", remote, "HEAD"])).trimEnd().split(/\r?\n/u);
  if (lines.length !== 2) throw new Error("远端 advertised 默认分支不可确认");
  const symbolic = /^ref: (refs\/heads\/[^\t\r\n]+)\tHEAD$/u.exec(lines[0]);
  const commit = /^([0-9a-f]{40})\tHEAD$/u.exec(lines[1]);
  if (!symbolic || !commit || !OID.test(commit[1])) throw new Error("远端 advertised 默认分支不可确认");
  return { branch: symbolic[1].slice("refs/heads/".length), head: commit[1] };
}

function plainFile(pathName) {
  const metadata = lstatSync(pathName);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("候选 workflow 必须是非符号链接普通文件");
  return readFileSync(pathName);
}

/** 只读取本地已存在的远端提交对象，缺失时失败关闭，不执行 fetch。 */
function workflowAtAdvertisedHead(root, head) {
  const tree = git(root, ["ls-tree", "-z", head, "--", WORKFLOW_PATH]);
  const match = /^100(?:644|755) blob ([0-9a-f]{40})\t\.github\/workflows\/release-candidate\.yml\0$/u.exec(DECODER.decode(tree));
  if (!match) throw new Error("远端默认分支缺少可派发的普通 workflow 文件");
  const contents = DECODER.decode(git(root, ["cat-file", "blob", match[1]]));
  if (!/^on:[ \t]*$/mu.test(contents) || !/^[ \t]{2}workflow_dispatch:[ \t]*(?:#.*)?$/mu.test(contents)) {
    throw new Error("远端默认分支 workflow 未启用 workflow_dispatch");
  }
}

/** 检查本地待派发 workflow、远端默认分支 workflow 与远端身份。 */
export function verifyDispatchReadiness(rootInput, remote) {
  if (!REMOTE.test(remote)) throw new Error("远端名称无效");
  const root = realpathSync(resolve(rootInput));
  if (DECODER.decode(git(root, ["rev-parse", "--show-toplevel"])).trim() !== root) {
    throw new Error("项目根必须是 Git 顶层目录");
  }
  const remotes = DECODER.decode(git(root, ["remote"])).trimEnd().split(/\r?\n/u);
  if (!remotes.includes(remote)) throw new Error("指定远端尚未配置");
  if (!plainFile(join(root, WORKFLOW_PATH)).equals(plainFile(ASSET_PATH))) {
    throw new Error("下游候选 workflow 与受审资产字节不一致");
  }
  const observed = advertisedDefault(root, remote);
  workflowAtAdvertisedHead(root, observed.head);
  const reread = advertisedDefault(root, remote);
  if (reread.branch !== observed.branch || reread.head !== observed.head) {
    throw new Error("远端 advertised 默认分支在派发预检期间漂移");
  }
  return { status: "ready", remote, defaultBranch: observed.branch, defaultHead: observed.head, workflowPath: WORKFLOW_PATH };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 4 || argv[0] !== "--project-root" || argv[2] !== "--remote") {
    process.stderr.write("usage: verify_dispatch_readiness.mjs --project-root <path> --remote <name>\n");
    return 2;
  }
  try {
    process.stdout.write(`${JSON.stringify(verifyDispatchReadiness(argv[1], argv[3]))}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
