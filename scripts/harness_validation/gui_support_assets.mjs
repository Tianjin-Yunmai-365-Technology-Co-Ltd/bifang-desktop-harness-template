import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { fail, relativePath } from "./core.mjs";

const SAFE_RELATIVE_PATH = /^[A-Za-z0-9._/-]+$/u;

export const EXPECTED_MEDIA = new Map([
  ["media/sponsor/arrow.png", "brand-optional-currently-unreferenced"],
  ["media/sponsor/bg.jpg", "brand-presentation"],
  ["media/sponsor/icon1.png", "brand-optional-currently-unreferenced"],
  ["media/sponsor/icon2.png", "brand-optional-currently-unreferenced"],
  ["media/sponsor/icon3.png", "brand-optional-currently-unreferenced"],
  ["media/sponsor/icon4.png", "brand-optional-currently-unreferenced"],
  ["media/sponsor/img1.png", "brand-presentation"],
  ["media/sponsor/img2.png", "brand-presentation"],
  ["media/sponsor/img3.png", "brand-presentation"],
  ["media/sponsor/pay1.png", "sensitive-payment-qr"],
  ["media/sponsor/pay2.png", "sensitive-payment-qr"],
  ["media/sponsor/select.png", "brand-optional-currently-unreferenced"],
  ["media/updater/banner.jpg", "brand-presentation"],
]);

const EXPECTED_ABOUT_KEYS = new Set([
  "version", "contact_author_title", "support_thanks", "studio", "contact_label",
  "update_title", "check_for_updates", "release_notes", "disclaimer_title",
  "disclaimer_1", "disclaimer_2", "disclaimer_3",
]);

const EXPECTED_ABOUT_COPY = {
  "zh-CN": {
    studio: "守城工作室",
    disclaimer_title: "免责声明",
    disclaimer_1: "本软件/服务仅供学习研究和合法合规使用，严禁用于任何违反中华人民共和国法律法规的活动",
    disclaimer_2: "用户在使用本软件/服务过程中的所有行为及其后果由用户自行承担全部法律责任，与开发者、运营方无关",
    disclaimer_3: "您下载、安装、使用本软件/服务即视为已充分阅读、理解并同意接受本声明的全部内容",
  },
  "en-US": {
    studio: "Shoucheng Studio",
    disclaimer_title: "Disclaimer",
    disclaimer_1: "This software/service is for learning, research, and lawful use only. Any activity that violates the laws of the People’s Republic of China is strictly prohibited.",
    disclaimer_2: "Users are solely responsible for all actions taken while using this software/service and their consequences. The developers and operators bear no legal liability.",
    disclaimer_3: "Downloading, installing, or using this software/service means you have read, understood, and accepted this disclaimer in full.",
  },
};

const EXPECTED_LOCAL_UI_COPY = {
  "zh-CN": { navigation: { about: "关于", settings: "设置", sponsor: "赞助" }, tray: { show_window: "显示窗口", quit: "退出" } },
  "en-US": { navigation: { about: "About", settings: "Settings", sponsor: "Sponsor" }, tray: { show_window: "Show Window", quit: "Quit" } },
};

const EXPECTED_RELEASE_NOTES_COPY = {
  "zh-CN": { entry_title: "更新日志 {{date}} {{version}}", feature_optimizations: "功能优化", bug_fixes: "问题修复" },
  "en-US": { entry_title: "Release notes {{date}} {{version}}", feature_optimizations: "Feature optimizations", bug_fixes: "Bug fixes" },
};

const EXPECTED_FIXED_UI_KEYS = {
  sidebar: ["application_navigation", "collapse", "expand", "logo_alt", "version"],
  settings: [
    "autostart_description", "autostart_error", "autostart_title", "autostart_unknown",
    "capability_disabled", "capability_enabled", "capability_error_title", "capability_pending",
    "capability_retry", "capability_unknown", "capability_unknown_title", "title", "language_title",
    "language_description", "language_zh_cn", "language_en_us", "theme_title", "theme_description",
    "theme_light", "theme_dark", "theme_system", "system_notification_description",
    "system_notification_error", "system_notification_title", "system_notification_unknown",
  ],
  updater: [
    "banner_alt", "status_not_configured", "status_idle", "status_checking", "status_up_to_date",
    "status_optional_update", "status_required_update", "status_failed", "current_version",
    "available_version", "required_badge", "required_title", "required_description",
    "version_transition", "install_update", "exit_application",
  ],
  release_notes: ["dialog_title", "entry_title", "feature_optimizations", "bug_fixes", "loading", "load_failed", "retry", "empty", "none"],
};

const FORBIDDEN_PRODUCT_KEYS = new Set([
  "appCode", "appId", "app_name", "app_tagline", "baseUrl", "endpoint", "productId",
  "productName", "route", "secret", "telemetry",
]);

function display(filePath) {
  return relativePath(filePath);
}

function setEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function objectEqual(left, right) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function walkKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const child of value) walkKeys(child, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      walkKeys(child, keys);
    }
  }
  return keys;
}

function jpegDimensions(data) {
  let position = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (position + 4 <= data.length) {
    if (data[position] !== 0xff) {
      position += 1;
      continue;
    }
    while (position < data.length && data[position] === 0xff) position += 1;
    if (position >= data.length) break;
    const marker = data[position++];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (position + 2 > data.length) break;
    const length = data.readUInt16BE(position);
    if (length < 2 || position + length > data.length) break;
    if (sof.has(marker) && length >= 7) return [data.readUInt16BE(position + 5), data.readUInt16BE(position + 3)];
    position += length;
  }
  throw new Error("JPEG has no readable SOF dimensions");
}

function imageFacts(filePath) {
  const data = fs.readFileSync(filePath);
  let mimeType;
  let width;
  let height;
  if (data.length >= 24 && data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    mimeType = "image/png";
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
  } else if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) {
    mimeType = "image/jpeg";
    [width, height] = jpegDimensions(data);
  } else {
    throw new Error("unsupported or corrupt image signature");
  }
  return { height, mimeType, sha256: crypto.createHash("sha256").update(data).digest("hex"), sizeBytes: data.length, width };
}

function safeManifestPath(value) {
  return typeof value === "string"
    && SAFE_RELATIVE_PATH.test(value)
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && !value.includes("\\");
}

/** 锁定项目负责人批准的品牌联系人、价格和资源结构。 */
export function validateBrandProfile(errors, profile, filePath) {
  if (profile.schemaVersion !== 1 || profile.scope !== "shared-product-family-brand") fail(errors, `brand support profile schema/scope drifted: ${display(filePath)}`);
  if (profile.publicBasePath !== "/brand-support") fail(errors, `brand support public base path drifted: ${display(filePath)}`);
  const contacts = profile.contacts;
  if (!contacts || typeof contacts !== "object" || Array.isArray(contacts)) {
    fail(errors, `brand support contacts are missing: ${display(filePath)}`);
  } else {
    for (const [role, expected] of Object.entries({ windowTitle: "2222980", support: "2222980" })) {
      const contact = contacts[role];
      if (!contact || typeof contact !== "object" || Array.isArray(contact) || contact.channel !== "QQ" || contact.value !== expected) fail(errors, `brand support ${role} contact drifted: ${display(filePath)}`);
    }
  }
  const sponsor = profile.sponsor;
  if (!sponsor || typeof sponsor !== "object" || Array.isArray(sponsor)) {
    fail(errors, `brand sponsor profile is missing: ${display(filePath)}`);
    return;
  }
  const prices = Array.isArray(sponsor.tiers) ? sponsor.tiers.filter((tier) => tier && typeof tier === "object" && !Array.isArray(tier)).map((tier) => tier.price) : [];
  if (JSON.stringify(prices) !== JSON.stringify([19, 199, 1999])) fail(errors, `brand sponsor prices must remain 19/199/1999: ${display(filePath)}`);
  const payments = Array.isArray(sponsor.payments) ? sponsor.payments.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => item.image) : [];
  if (JSON.stringify(payments) !== JSON.stringify(["sponsor/pay1.png", "sponsor/pay2.png"])) fail(errors, `brand sponsor payment QR mapping drifted: ${display(filePath)}`);
  if (sponsor.background !== "sponsor/bg.jpg") fail(errors, `brand sponsor background mapping drifted: ${display(filePath)}`);
  const expectedOptional = new Set(["sponsor/arrow.png", "sponsor/icon1.png", "sponsor/icon2.png", "sponsor/icon3.png", "sponsor/icon4.png", "sponsor/select.png"]);
  if (!Array.isArray(profile.optionalAssets) || !setEqual(new Set(profile.optionalAssets), expectedOptional)) fail(errors, `brand support optional small-image set is incomplete: ${display(filePath)}`);
  if (!profile.updater || typeof profile.updater !== "object" || Array.isArray(profile.updater) || profile.updater.banner !== "updater/banner.jpg") fail(errors, `brand updater banner mapping drifted: ${display(filePath)}`);
  const forbidden = [...walkKeys(profile)].filter((key) => FORBIDDEN_PRODUCT_KEYS.has(key)).sort();
  if (forbidden.length > 0) fail(errors, `brand profile contains downstream product fields ${JSON.stringify(forbidden)}: ${display(filePath)}`);
}

/** 确保品牌文案完整且关于页没有来源产品名或功能字段。 */
export function validateBrandTranslations(errors, { zh, en, zhPath, enPath }) {
  for (const [locale, value, filePath, title, payment] of [
    ["zh-CN", zh, zhPath, "软件免费由守城工作室&飞鹰工作室维护", "2222980"],
    ["en-US", en, enPath, "Freely Maintained by Shoucheng & Feiying Studio", "2222980"],
  ]) {
    const about = value.about;
    const sponsor = value.sponsor;
    if (!about || typeof about !== "object" || Array.isArray(about) || !setEqual(new Set(Object.keys(about)), EXPECTED_ABOUT_KEYS)) {
      fail(errors, `brand about copy must contain only shared fields: ${display(filePath)}`);
    } else if (Object.entries(EXPECTED_ABOUT_COPY[locale]).some(([key, expected]) => about[key] !== expected)) {
      fail(errors, `brand author or disclaimer copy drifted: ${display(filePath)}`);
    }
    for (const [section, expected] of Object.entries(EXPECTED_LOCAL_UI_COPY[locale])) {
      if (!objectEqual(value[section], expected)) fail(errors, `brand ${section} copy drifted: ${display(filePath)}`);
    }
    for (const [section, keys] of Object.entries(EXPECTED_FIXED_UI_KEYS)) {
      const copy = value[section];
      if (!copy || typeof copy !== "object" || Array.isArray(copy) || !setEqual(new Set(Object.keys(copy)), new Set(keys))) fail(errors, `brand ${section} fixed UI keys drifted: ${display(filePath)}`);
    }
    const releaseNotes = value.release_notes;
    if (!releaseNotes || typeof releaseNotes !== "object" || Array.isArray(releaseNotes) || Object.entries(EXPECTED_RELEASE_NOTES_COPY[locale]).some(([key, expected]) => releaseNotes[key] !== expected)) fail(errors, `brand release-note fixed format drifted: ${display(filePath)}`);
    if (!sponsor || typeof sponsor !== "object" || Array.isArray(sponsor)) {
      fail(errors, `brand sponsor translations are missing: ${display(filePath)}`);
      continue;
    }
    if (sponsor.title !== title || !String(sponsor.payment_instructions ?? "").includes(payment)) fail(errors, `brand sponsor title/contact drifted: ${display(filePath)}`);
    const required = ["payment_wechat_alt", "payment_alipay_alt", "tier1_name", "tier2_name", "tier3_name", "tier1_b1", "tier2_b1", "tier3_b1"];
    if (!required.every((key) => Object.hasOwn(sponsor, key))) fail(errors, `brand sponsor translations are incomplete: ${display(filePath)}`);
    if ([...walkKeys(value)].some((key) => FORBIDDEN_PRODUCT_KEYS.has(key))) fail(errors, `brand translations contain downstream product fields: ${display(filePath)}`);
  }
}

function mediaPaths(mediaRoot, brandRoot) {
  const output = new Set();
  if (!fs.existsSync(mediaRoot) || !fs.lstatSync(mediaRoot).isDirectory()) return output;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolute);
      else if (stat.isFile() || stat.isSymbolicLink()) output.add(path.relative(brandRoot, absolute).split(path.sep).join("/"));
    }
  };
  visit(mediaRoot);
  return output;
}

/** 逐项核对 manifest 与原始品牌图片字节。 */
export function validateBrandMediaManifest(errors, manifest, { brandRoot, path: manifestPath }) {
  if (manifest.schemaVersion !== 1 || manifest.assetCount !== 13) fail(errors, `brand media manifest schema/count drifted: ${display(manifestPath)}`);
  const approval = manifest.sourceApproval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval) || approval.approvedUse !== "internal-proprietary-harness-product-family") fail(errors, `brand media internal reuse approval is missing: ${display(manifestPath)}`);
  const policy = manifest.bundlePolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)
    || policy.guiSkillPropagation !== "complete"
    || policy.applicationBundle !== "gui-profile-selected-local-surfaces"
    || JSON.stringify(policy.defaultMediaSets) !== "[]"
    || JSON.stringify(policy.optionalMediaSets) !== '["sponsor","updater"]'
    || policy.paymentAutomationAuthorized !== false
    || policy.remoteLoadingAllowed !== false) fail(errors, `brand media bundle policy is unsafe: ${display(manifestPath)}`);
  if (!Array.isArray(manifest.assets)) {
    fail(errors, `brand media manifest assets must be a list: ${display(manifestPath)}`);
    return;
  }
  const byPath = new Map();
  for (const entry of manifest.assets) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !safeManifestPath(entry.sourcePath)) {
      fail(errors, `brand media manifest has an unsafe asset path: ${display(manifestPath)}`);
      continue;
    }
    if (byPath.has(entry.sourcePath)) {
      fail(errors, `brand media manifest duplicates ${entry.sourcePath}: ${display(manifestPath)}`);
      continue;
    }
    byPath.set(entry.sourcePath, entry);
  }
  const expectedPaths = new Set(EXPECTED_MEDIA.keys());
  const manifestPaths = new Set(byPath.keys());
  if (!setEqual(manifestPaths, expectedPaths)) {
    const missing = [...expectedPaths].filter((value) => !manifestPaths.has(value)).sort();
    const extra = [...manifestPaths].filter((value) => !expectedPaths.has(value)).sort();
    fail(errors, `brand media manifest set mismatch; missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  }
  const actual = mediaPaths(path.join(brandRoot, "media"), brandRoot);
  if (!setEqual(actual, expectedPaths)) {
    const missing = [...expectedPaths].filter((value) => !actual.has(value)).sort();
    const extra = [...actual].filter((value) => !expectedPaths.has(value)).sort();
    fail(errors, `brand media file set mismatch; missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  }
  for (const [sourcePath, classification] of EXPECTED_MEDIA) {
    const entry = byPath.get(sourcePath);
    const mediaPath = path.join(brandRoot, ...sourcePath.split("/"));
    if (!entry) continue;
    let safe = false;
    try {
      const stat = fs.lstatSync(mediaPath);
      safe = stat.isFile() && !stat.isSymbolicLink();
    } catch {
      safe = false;
    }
    if (!safe) {
      fail(errors, `missing or unsafe brand media file: ${display(mediaPath)}`);
      continue;
    }
    if (entry.classification !== classification) fail(errors, `brand media classification drifted for ${sourcePath}`);
    if (entry.bundlePath !== sourcePath.replace(/^media\//u, "")) fail(errors, `brand media bundle path drifted for ${sourcePath}`);
    let facts;
    try {
      facts = imageFacts(mediaPath);
    } catch (error) {
      fail(errors, `cannot inspect brand media ${display(mediaPath)}: ${error.message}`);
      continue;
    }
    for (const [field, actualValue] of Object.entries(facts)) {
      if (entry[field] !== actualValue) fail(errors, `brand media ${field} mismatch for ${sourcePath}`);
    }
  }
}
