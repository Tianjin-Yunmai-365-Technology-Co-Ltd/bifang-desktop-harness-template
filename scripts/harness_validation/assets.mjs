import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readJson, sha256File } from "./core.mjs";

const BRAND_ROOT = path.join(
  ROOT,
  ".agents",
  "skills",
  "desktop-prepare-gui-support-surfaces",
  "assets",
  "brand-support",
);

/** 从 PNG/JPEG 头部读取确定性尺寸，不引入图像第三方依赖。 */
function imageDimensions(filePath, mimeType) {
  const bytes = fs.readFileSync(filePath);
  if (mimeType === "image/png") {
    const signature = "89504e470d0a1a0a";
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
      throw new Error("PNG 签名或 IHDR 不完整");
    }
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("JPEG SOI 缺失");
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) throw new Error("JPEG marker 非法");
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error("JPEG segment 越界");
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) throw new Error("JPEG SOF 不完整");
        return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
      }
      offset += length;
    }
    throw new Error("JPEG 缺少 SOF 尺寸段");
  }
  throw new Error(`不支持的 MIME: ${mimeType}`);
}

/** 验证共享品牌媒体的路径、字节、摘要、尺寸与 profile 引用。 */
export function validateBrandAssets(errors) {
  const manifestPath = path.join(BRAND_ROOT, "media-manifest.json");
  const profilePath = path.join(BRAND_ROOT, "brand-support-profile.json");
  let manifest;
  let profile;
  try {
    manifest = readJson(manifestPath);
    profile = readJson(profilePath);
  } catch (error) {
    fail(errors, error.message);
    return { assets: 0 };
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
    fail(errors, "品牌媒体 manifest schemaVersion/assets 非法");
    return { assets: 0 };
  }
  if (manifest.assetCount !== manifest.assets.length || manifest.assets.length !== 13) {
    fail(errors, `品牌媒体 assetCount 必须与 13 个资产一致，实际 ${manifest.assets.length}`);
  }
  const bundlePaths = new Set();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset !== "object") {
      fail(errors, "品牌媒体条目必须是对象");
      continue;
    }
    const sourcePath = String(asset.sourcePath ?? "");
    const absolute = path.resolve(BRAND_ROOT, sourcePath);
    const relative = path.relative(BRAND_ROOT, absolute);
    if (!sourcePath || relative.startsWith("..") || path.isAbsolute(relative)) {
      fail(errors, `品牌媒体路径越界: ${sourcePath}`);
      continue;
    }
    if (bundlePaths.has(asset.bundlePath)) fail(errors, `品牌媒体 bundlePath 重复: ${asset.bundlePath}`);
    bundlePaths.add(asset.bundlePath);
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) {
      fail(errors, `品牌媒体必须是普通非符号链接文件: ${sourcePath}`);
      continue;
    }
    const stat = fs.statSync(absolute);
    if (stat.size !== asset.sizeBytes) fail(errors, `品牌媒体字节数不匹配: ${sourcePath}`);
    if (sha256File(absolute) !== asset.sha256) fail(errors, `品牌媒体 SHA-256 不匹配: ${sourcePath}`);
    try {
      const [width, height] = imageDimensions(absolute, asset.mimeType);
      if (width !== asset.width || height !== asset.height) fail(errors, `品牌媒体尺寸不匹配: ${sourcePath}`);
    } catch (error) {
      fail(errors, `品牌媒体不可解析 ${sourcePath}: ${error.message}`);
    }
  }
  const referenced = [
    profile?.sponsor?.background,
    ...(profile?.sponsor?.tiers ?? []).map((tier) => tier.image),
    ...(profile?.sponsor?.payments ?? []).map((payment) => payment.image),
    profile?.updater?.banner,
    ...(profile?.optionalAssets ?? []),
  ].filter(Boolean);
  for (const bundlePath of referenced) {
    if (!bundlePaths.has(bundlePath)) fail(errors, `品牌 profile 引用未登记媒体: ${bundlePath}`);
  }
  for (const locale of ["zh-CN", "en-US"]) {
    try {
      const translations = readJson(path.join(BRAND_ROOT, "i18n", `${locale}.json`));
      if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
        fail(errors, `品牌 ${locale} 翻译根必须是对象`);
      }
    } catch (error) {
      fail(errors, error.message);
    }
  }
  return { assets: manifest.assets.length };
}

/** 验证中性 DMG 背景保持 660×400 且不是符号链接。 */
export function validateDmgBackground(errors) {
  const filePath = path.join(
    ROOT,
    ".agents",
    "skills",
    "desktop-initialize-rust-project",
    "assets",
    "gui",
    "macos-dmg-background.png",
  );
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("必须是普通非符号链接文件");
    const [width, height] = imageDimensions(filePath, "image/png");
    if (width !== 660 || height !== 400) fail(errors, `macOS DMG 背景必须是 660×400，实际 ${width}×${height}`);
  } catch (error) {
    fail(errors, `macOS DMG 背景无效: ${error.message}`);
  }
}

/** 组合运行所有中性二进制资产检查。 */
export function validateAssets(errors) {
  const brand = validateBrandAssets(errors);
  validateDmgBackground(errors);
  return brand;
}
