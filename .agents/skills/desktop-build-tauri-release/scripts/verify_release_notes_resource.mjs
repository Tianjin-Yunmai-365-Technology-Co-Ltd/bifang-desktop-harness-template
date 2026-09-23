#!/usr/bin/env node

/** 验证 Tauri 发布配置和候选内更新日志与根事实逐字节一致。 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_CONFIG = path.join("src-tauri", "tauri.release.conf.json");
export const ROOT_CARGO_SOURCE_MAPPING = "../release-notes.json";
export const CONVENTIONAL_CARGO_SOURCE_MAPPING = "../../release-notes.json";
export const RESOURCE_TARGET = "release-notes.json";

export class ResourceVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResourceVerificationError";
  }
}

class CommandLineError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandLineError";
  }
}

function statWithoutFollowing(target) {
  try {
    return lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return null;
    }
    throw error;
  }
}

function requireRegularFile(target, label) {
  const stat = statWithoutFollowing(target);
  if (stat === null || stat.isSymbolicLink() || !stat.isFile()) {
    throw new ResourceVerificationError(`${label} must be a regular non-symlink file`);
  }
}

function requireDirectory(target, label) {
  const stat = statWithoutFollowing(target);
  if (stat === null || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ResourceVerificationError(`${label} must be a regular directory`);
  }
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function loadJsonObject(target) {
  requireRegularFile(target, "release config");
  let value;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(target));
    value = JSON.parse(text);
  } catch {
    throw new ResourceVerificationError("release config must be valid UTF-8 JSON");
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new ResourceVerificationError("release config root must be an object");
  }
  return value;
}

function isRegularFile(target) {
  const stat = statWithoutFollowing(target);
  return stat !== null && !stat.isSymbolicLink() && stat.isFile();
}

function cargoRootAndSourceMapping(guiRoot) {
  const rootManifest = path.join(guiRoot, "Cargo.toml");
  const conventionalManifest = path.join(guiRoot, "src-tauri", "Cargo.toml");
  const rootExists = isRegularFile(rootManifest);
  const conventionalExists = isRegularFile(conventionalManifest);
  if (rootExists === conventionalExists) {
    throw new ResourceVerificationError(
      "GUI root must contain exactly one supported Cargo manifest location",
    );
  }
  return rootExists
    ? [guiRoot, ROOT_CARGO_SOURCE_MAPPING]
    : [path.dirname(conventionalManifest), CONVENTIONAL_CARGO_SOURCE_MAPPING];
}

export function verifyConfig(projectRoot, guiRoot) {
  requireDirectory(projectRoot, "project root");
  requireDirectory(guiRoot, "GUI root");
  const canonicalProject = path.resolve(projectRoot);
  const canonicalGui = path.resolve(guiRoot);
  const relativeGui = path.relative(canonicalProject, canonicalGui);
  if (relativeGui === ".." || relativeGui.startsWith(`..${path.sep}`) || path.isAbsolute(relativeGui)) {
    throw new ResourceVerificationError("GUI root must stay inside project root");
  }

  const config = loadJsonObject(path.join(canonicalGui, RELEASE_CONFIG));
  const [cargoRoot, sourceMapping] = cargoRootAndSourceMapping(canonicalGui);
  const resources = config.bundle && typeof config.bundle === "object" && !Array.isArray(config.bundle)
    ? config.bundle.resources
    : undefined;
  const validResources = resources
    && typeof resources === "object"
    && !Array.isArray(resources)
    && Object.keys(resources).length === 1
    && resources[sourceMapping] === RESOURCE_TARGET;
  if (!validResources) {
    throw new ResourceVerificationError(
      "release config resources must contain only the fixed release-notes mapping",
    );
  }

  const source = path.resolve(cargoRoot, sourceMapping);
  const expectedSource = path.join(canonicalProject, RESOURCE_TARGET);
  if (source !== expectedSource) {
    throw new ResourceVerificationError(
      "release config source must resolve to project release-notes.json",
    );
  }
  requireRegularFile(source, "source release notes");
  return sha256(readFileSync(source));
}

export function verifyBytes(source, bundled) {
  requireRegularFile(source, "source release notes");
  requireRegularFile(bundled, "bundled release notes");
  const sourceBytes = readFileSync(source);
  const bundledBytes = readFileSync(bundled);
  if (!sourceBytes.equals(bundledBytes)) {
    throw new ResourceVerificationError("bundled release notes bytes do not match the source");
  }
  return sha256(sourceBytes);
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const allowedOptions = command === "config"
    ? new Set(["--project-root", "--gui-root"])
    : command === "bytes"
      ? new Set(["--source", "--bundled"])
      : null;
  if (allowedOptions === null) {
    throw new CommandLineError("command must be config or bytes");
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (!allowedOptions.has(option)) {
      throw new CommandLineError(`unsupported argument for ${command}: ${option ?? "<missing>"}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new CommandLineError(`${option} requires a value`);
    }
    values.set(option, value);
  }
  const required = command === "config"
    ? ["--project-root", "--gui-root"]
    : ["--source", "--bundled"];
  for (const option of required) {
    if (!values.has(option)) {
      throw new CommandLineError(`${option} is required`);
    }
  }
  return { command, values };
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`release-notes.resource.error=${error.message}\n`);
    return 2;
  }
  try {
    const { command, values } = parsed;
    const digest = command === "config"
      ? verifyConfig(values.get("--project-root"), values.get("--gui-root"))
      : verifyBytes(values.get("--source"), values.get("--bundled"));
    process.stdout.write(
      `release-notes.resource.valid=true check=${command} sha256=${digest} path=${RESOURCE_TARGET}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`release-notes.resource.error=${error.message}\n`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
