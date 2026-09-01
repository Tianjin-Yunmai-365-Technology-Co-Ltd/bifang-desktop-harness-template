import fs from "node:fs";
import path from "node:path";

import { collectFiles } from "./gui-lifecycle-source-analysis.mjs";

const FRONTEND_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const SPONSOR_MEDIA_FILES = [
  "arrow.png",
  "bg.jpg",
  "icon1.png",
  "icon2.png",
  "icon3.png",
  "icon4.png",
  "img1.png",
  "img2.png",
  "img3.png",
  "pay1.png",
  "pay2.png",
  "select.png",
];

const CAPABILITY_PERSISTENCE_TOKENS = {
  systemNotification: [
    "system_notification",
    "systemnotification",
    "notification_enabled",
    "notificationenabled",
  ],
  autostart: [
    "autostart",
    "auto_start",
    "open_at_login",
    "openatlogin",
  ],
  globalShortcut: [
    "global_shortcut",
    "globalshortcut",
    "shortcut_binding",
    "shortcutbinding",
    "configured_chord",
    "configuredchord",
  ],
};

const PERSISTENCE_PATTERNS = [
  /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\s*\(/u,
  /\batom(?:WithStorage)?\s*\(/u,
  /\buseQuery\s*\(/u,
  /queryClient\.(?:setQueryData|getQueryData|setQueriesData|getQueryState|setQueryDefaults|invalidateQueries|removeQueries)\s*\(/u,
];

const normalizePersistenceText = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/gu, "");

function semanticIdentifierWords(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(Boolean);
}

function isShortcutSurfaceIdentifier(identifier) {
  const words = semanticIdentifierWords(identifier);
  const joined = words.join("");
  return (
    words.some((word) => /^(?:shortcuts?|hotkeys?|keybindings?)$/u.test(word)) ||
    joined.includes("keycapture")
  );
}

/** 提取代码标识符并忽略注释与字符串，避免注释中的示例误触空契约门禁。 */
function javascriptIdentifiers(sourceText) {
  const identifiers = [];
  let index = 0;
  while (index < sourceText.length) {
    if (sourceText.startsWith("//", index)) {
      const end = sourceText.indexOf("\n", index + 2);
      index = end < 0 ? sourceText.length : end;
      continue;
    }
    if (sourceText.startsWith("/*", index)) {
      const end = sourceText.indexOf("*/", index + 2);
      index = end < 0 ? sourceText.length : end + 2;
      continue;
    }
    const character = sourceText[index];
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      index += 1;
      let escaped = false;
      while (index < sourceText.length) {
        const current = sourceText[index];
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (/[A-Za-z_$]/u.test(character)) {
      let end = index + 1;
      while (end < sourceText.length && /[A-Za-z0-9_$]/u.test(sourceText[end])) {
        end += 1;
      }
      identifiers.push(sourceText.slice(index, end));
      index = end;
      continue;
    }
    index += 1;
  }
  return identifiers;
}

function localeKeys(localeText) {
  return [
    ...localeText.matchAll(/"([^"\r\n]+)"\s*:/gu),
    ...localeText.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*:/gmu),
  ].map((match) => match[1]);
}

function containsCapabilityPersistence(sourceText, persistenceTokens) {
  const lines = sourceText.split(/\r?\n/u);
  const normalizedTokens = persistenceTokens.map((token) =>
    normalizePersistenceText(token),
  );
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!PERSISTENCE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }
    const windowStart = Math.max(0, index - 3);
    const windowEnd = Math.min(lines.length, index + 4);
    const window = lines.slice(windowStart, windowEnd).join("\n");
    const normalizedWindow = normalizePersistenceText(window);
    if (normalizedTokens.some((token) => normalizedWindow.includes(token))) {
      return true;
    }
  }
  return false;
}

/** 桌面插件统一由 Rust 拥有，WebView 不得安装 JS 插件或取得插件 ACL。 */
export function validateRustOnlyDesktopCapabilities(guiRoot, profile, errors, readers) {
  const { collectOptionalTexts, readTextFile } = readers;
  const packagePath = path.join(guiRoot, "package.json");
  if (fs.existsSync(packagePath)) {
    const packageText = readTextFile(packagePath);
    for (const plugin of [
      "@tauri-apps/plugin-deep-link",
      "@tauri-apps/plugin-global-shortcut",
      "@tauri-apps/plugin-notification",
      "@tauri-apps/plugin-os",
      "@tauri-apps/plugin-autostart",
      "@tauri-apps/plugin-updater",
      "@tauri-apps/plugin-window-state",
    ]) {
      if (packageText.includes(plugin)) {
        errors.push(`GUI WebView 不得安装 Rust-only 能力的 JS 插件：${plugin}`);
      }
    }
  }
  const capabilityTexts = collectOptionalTexts(
    path.join(guiRoot, "src-tauri", "capabilities"),
    new Set([".json", ".toml"]),
  ).join("\n");
  for (const prefix of [
    "deep-link:",
    "global-shortcut:",
    "notification:",
    "os:",
    "autostart:",
    "updater:",
    "window-state:",
  ]) {
    if (capabilityTexts.includes(prefix)) {
      errors.push(`GUI WebView 不得获得 Rust-only 插件 ACL：${prefix}`);
    }
  }
  if (!profile.systemNotification && capabilityTexts.includes("notification")) {
    errors.push("未选择系统通知时 capability 不得保留通知权限残留");
  }
  if (!profile.autostart && capabilityTexts.includes("autostart")) {
    errors.push("未选择开机自启时 capability 不得保留自启权限残留");
  }
  if (!profile.deepLink && capabilityTexts.includes("deep-link")) {
    errors.push("未选择深链接时 capability 不得保留深链接权限残留");
  }
  if (!profile.globalShortcut && capabilityTexts.includes("global-shortcut")) {
    errors.push("未选择全局快捷键时 capability 不得保留快捷键权限残留");
  }
}

/** 检查中英文原生托盘文案均被复制到真实 GUI。 */
export function validateLocales(localeTexts, errors) {
  const hasChinese = localeTexts.some(
    (text) => text.includes("show_window") && text.includes("quit") && text.includes("显示窗口") && text.includes("退出"),
  );
  const hasEnglish = localeTexts.some(
    (text) => text.includes("show_window") && text.includes("quit") && text.includes("Show Window") && text.includes("Quit"),
  );
  if (!hasChinese) {
    errors.push("缺少同时包含 show_window/quit 的中文托盘资源");
  }
  if (!hasEnglish) {
    errors.push("缺少同时包含 show_window/quit 的英文托盘资源");
  }
}

/** 判断前端源码是否包含一个精确的静态路由字面量。 */
function containsRouteLiteral(sourceText, route) {
  return [`"${route}"`, `'${route}'`, `\`${route}\``].some((literal) =>
    sourceText.includes(literal),
  );
}

/** 按初始化选择验证固定页面、可选页面、侧栏接线和赞助媒体。 */
export function validateFrontendInitializationContract(guiRoot, profile, errors, readers) {
  const { collectOptionalTexts, readBinaryFile, readTextFile } = readers;
  const sourceRoot = path.join(guiRoot, "src");
  if (!fs.existsSync(sourceRoot)) {
    errors.push("GUI 前端缺少 src 源码目录");
    return "";
  }
  const sourceFiles = collectFiles(sourceRoot, FRONTEND_SOURCE_EXTENSIONS);
  if (sourceFiles.length === 0) {
    errors.push("GUI 前端源码为空");
    return "";
  }
  const sourceEntries = sourceFiles.map((filePath) => ({
    relativePath: path.relative(sourceRoot, filePath).split(path.sep).join("/"),
    text: readTextFile(filePath),
  }));
  const sourceText = sourceEntries.map((entry) => entry.text).join("\n");

  if (!containsRouteLiteral(sourceText, "/settings")) {
    errors.push("GUI 固定基线缺少 /settings 路由");
  }
  if (!sourceEntries.some((entry) => /(?:^|\/)settings(?:[./-]|$)/iu.test(entry.relativePath))) {
    errors.push("GUI 固定基线缺少设置页运行时组件");
  }

  const localeText = collectOptionalTexts(
    sourceRoot,
    new Set([".json", ".yaml", ".yml"]),
  ).join("\n");
  const capabilitySettings = [
    {
      enabled: profile.systemNotification,
      label: "系统通知",
      runtimeTokens: [
        "system_notification",
        "systemNotification",
        "set_system_notification_enabled",
      ],
      testName: "system_notification_switch_rolls_back_after_denial",
      translationKey: "system_notification_title",
    },
    {
      enabled: profile.autostart,
      label: "开机自启",
      runtimeTokens: ["autostart", "get_autostart_enabled", "set_autostart_enabled"],
      testName: "autostart_switch_rolls_back_after_failure",
      translationKey: "autostart_title",
    },
  ];
  for (const capability of capabilitySettings) {
    const hasRuntime = capability.runtimeTokens.some((token) =>
      sourceText.includes(token),
    );
    const hasTranslation = localeText.includes(capability.translationKey);
    const hasRollbackTest = sourceText.includes(capability.testName);
    if (capability.enabled) {
      if (!hasRuntime || !sourceText.includes("Switch")) {
        errors.push(`选择${capability.label}时设置页必须接入自身 Switch 与窄命令`);
      }
      if (!hasTranslation) {
        errors.push(`选择${capability.label}时缺少条件设置翻译键`);
      }
      if (!hasRollbackTest) {
        errors.push(`选择${capability.label}时缺少失败回滚前端回归：${capability.testName}`);
      }
    } else {
      if (hasRuntime) {
        errors.push(`未选择${capability.label}时不得保留设置页运行时`);
      }
      if (hasTranslation) {
        errors.push(`未选择${capability.label}时不得保留设置翻译键`);
      }
      if (hasRollbackTest) {
        errors.push(`未选择${capability.label}时不得保留专属前端测试`);
      }
    }
    const persistenceTokens =
      capability.label === "系统通知"
        ? CAPABILITY_PERSISTENCE_TOKENS.systemNotification
        : CAPABILITY_PERSISTENCE_TOKENS.autostart;
    if (containsCapabilityPersistence(sourceText, persistenceTokens)) {
      errors.push(`不得将${capability.label}状态持久化到 WebView 层（localStorage/sessionStorage/Jotai atom/TanStack Query）`);
    }
  }

  const shortcutActions = profile.globalShortcutActions;
  const fixedShortcutActions = shortcutActions.filter(
    (action) => action.bindingPolicy === "fixed",
  );
  const configurableShortcutActions = shortcutActions.filter(
    (action) => action.bindingPolicy === "user-configurable",
  );
  const globalShortcutMutationTokens = [
    "load_global_shortcut_bindings",
    "save_global_shortcut_bindings",
    "begin_global_shortcut_capture",
    "end_global_shortcut_capture",
  ];
  const globalShortcutRuntimeTokens = [
    "get_global_shortcut_statuses",
    "get_global_shortcut_status",
    ...globalShortcutMutationTokens,
  ];
  const hasGlobalShortcutRuntime = globalShortcutRuntimeTokens.some((token) =>
    sourceText.includes(token),
  );
  const hasGlobalShortcutTranslation = localeText.includes("global_shortcut");
  if (!profile.globalShortcut) {
    if (
      hasGlobalShortcutRuntime ||
      hasGlobalShortcutTranslation ||
      sourceText.includes("global_shortcut_") ||
      sourceText.includes("globalShortcut")
    ) {
      errors.push("未选择全局快捷键时不得保留绑定状态、录制运行时或翻译键");
    }
  } else if (shortcutActions.length === 0) {
    const emptySurfaceIdentifiers = [
      ...sourceEntries.map((entry) => entry.relativePath),
      ...sourceEntries.flatMap((entry) => javascriptIdentifiers(entry.text)),
      ...localeKeys(localeText),
    ];
    const shortcutSurface = emptySurfaceIdentifiers.find((identifier) =>
      isShortcutSurfaceIdentifier(identifier),
    );
    if (
      sourceText.includes("CommandOrControl+Shift+Space") ||
      hasGlobalShortcutRuntime ||
      hasGlobalShortcutTranslation ||
      shortcutSurface
    ) {
      errors.push(`空全局快捷键动作契约不得生成默认 chord、快捷键运行时、编辑 UI 或翻译键${shortcutSurface ? `：${shortcutSurface}` : ""}`);
    }
  } else {
    if (
      !sourceText.includes("get_global_shortcut_statuses") ||
      !sourceText.includes("registered") ||
      !hasGlobalShortcutTranslation
    ) {
      errors.push("非空全局快捷键动作必须逐项显示 Rust 返回的真实 registered 状态");
    }
    for (const action of shortcutActions) {
      if (!sourceText.includes(action.id)) {
        errors.push(`全局快捷键前端缺少已声明动作：${action.id}`);
      }
    }
    for (const action of fixedShortcutActions) {
      if (!sourceText.includes(action.defaultChord)) {
        errors.push(`fixed 全局快捷键前端必须只读显示已声明 chord：${action.id}`);
      }
    }
    if (
      fixedShortcutActions.length > 0 &&
      configurableShortcutActions.length === 0 &&
      globalShortcutMutationTokens.some((token) => sourceText.includes(token))
    ) {
      errors.push("fixed 全局快捷键必须保持只读，不得接入保存或录制命令");
    }
    if (
      fixedShortcutActions.length > 0 &&
      configurableShortcutActions.length > 0 &&
      (!sourceText.includes("bindingPolicy") || !sourceText.includes("fixed"))
    ) {
      errors.push("混合快捷键界面必须按 bindingPolicy 区分 fixed 只读项与 user-configurable 录制项");
    }
    if (configurableShortcutActions.length > 0) {
      for (const token of globalShortcutMutationTokens) {
        if (!sourceText.includes(token)) {
          errors.push(`user-configurable 全局快捷键前端缺少 Rust 窄路径：${token}`);
        }
      }
    }
  }
  if (
    containsCapabilityPersistence(
      sourceText,
      CAPABILITY_PERSISTENCE_TOKENS.globalShortcut,
    )
  ) {
    errors.push("不得将全局快捷键绑定持久化到 WebView 层（localStorage/sessionStorage/Jotai atom/TanStack Query）");
  }

  for (const page of [
    { enabled: profile.aboutPage, label: "关于页", route: "/about", token: "about" },
    { enabled: profile.sponsorPage, label: "赞助页", route: "/sponsor", token: "sponsor" },
  ]) {
    const hasRoute = containsRouteLiteral(sourceText, page.route);
    const pagePathPattern = new RegExp(`(?:^|/)${page.token}(?:[./-]|$)`, "iu");
    const hasComponent = sourceEntries.some((entry) => pagePathPattern.test(entry.relativePath));
    if (page.enabled) {
      if (!hasRoute) errors.push(`选择${page.label}时缺少 ${page.route} 路由`);
      if (!hasComponent) errors.push(`选择${page.label}时缺少运行时组件`);
    } else {
      if (hasRoute) errors.push(`未选择${page.label}时不得保留 ${page.route} 路由`);
      if (hasComponent) errors.push(`未选择${page.label}时不得保留运行时组件`);
    }
  }

  const mode = profile.sidebarMode;
  const sidebarText = sourceEntries
    .filter((entry) => /(?:^|\/)(?:AppShell|AppSidebar)[^/]*\.(?:[cm]?[jt]sx?)$/u.test(entry.relativePath))
    .map((entry) => entry.text)
    .join("\n");
  const selectedModePattern = new RegExp(
    `(?:\\bsidebarMode\\s*(?::[^=;]+)?=|\\bmode\\s*=|\\bmode\\s*:)\\s*["']${mode}["']`,
    "u",
  );
  if (!selectedModePattern.test(sidebarText)) {
    errors.push(`GUI 前端未把 sidebar_mode = ${mode} 接入实际侧栏`);
  }
  if (mode === "compact") {
    for (const [label, pattern] of [
      ["80px 固定宽度", /\bcompact\s*:\s*80\b/u],
      ["36px Logo", /\bcompact\s*:\s*36\b/u],
      ["6px 内容内边距", /(?:COMPACT_PADDING|compactPadding)[A-Z_a-z]*\s*=\s*6\b/u],
      ["8px 身份与菜单区间距", /(?:SECTION_GAP|sectionGap)[A-Z_a-z]*\s*=\s*8\b/u],
      ["22px 图标", /APP_SIDEBAR_NAV_ICON_SIZE_PX\s*=\s*22\b/u],
      ["11px 名称", /(?:FONT_SIZE|fontSize)[A-Z_a-z]*\s*=\s*11\b/u],
      ["1.25 名称行高", /(?:LINE_HEIGHT|lineHeight)[A-Z_a-z]*\s*=\s*1\.25\b/u],
      ["56px 菜单项最小高度", /(?:MIN_HEIGHT|minHeight)[A-Z_a-z]*\s*=\s*56\b/u],
      ["4px 菜单项垂直内边距", /(?:PADDING_BLOCK|paddingBlock)[A-Z_a-z]*\s*=\s*4\b/u],
      ["4px 图标名称间距", /(?:ITEM_GAP|itemGap)[A-Z_a-z]*\s*=\s*4\b/u],
      ["图标在上、名称在下", /icon-above-label/u],
      ["NavLink 纵向布局", /flexDirection\s*:\s*(?:compact\s*\?\s*)?["']column["']/u],
      ["NavLink 水平居中", /alignItems\s*:\s*["']center["']/u],
      ["NavLink 左右零内边距", /paddingInline\s*:\s*(?:[^,\n?]+\?\s*)?0\b/u],
      ["left section 零边距", /marginInline\s*:\s*(?:[^,\n?]+\?\s*)?0\b/u],
      ["body 可见溢出", /overflow\s*:\s*(?:compact\s*\?\s*)?["']visible["']/u],
      ["名称块级显示", /display\s*:\s*(?:compact\s*\?\s*)?["']block["']/u],
      ["名称完整宽度", /width\s*:\s*(?:compact\s*\?\s*)?["']100%["']/u],
      ["名称自动水平外边距", /marginInline\s*:\s*(?:compact\s*\?\s*)?["']auto["']/u],
      ["名称居中", /textAlign\s*:\s*(?:compact\s*\?\s*)?["']center["']/u],
      ["侧栏固定定位", /position\s*:\s*["']fixed["']/u],
      ["侧栏 100dvh 高度", /height\s*:\s*["']100dvh["']/u],
      ["侧栏右侧 1px 边框", /borderInlineEnd\s*:\s*["'][^"']*1px/u],
      ["AppShell navbar 复用宽度常量", /navbar\s*=\s*\{\{[^}]*width\s*:\s*(?:APP_SIDEBAR_WIDTHS|widths)\.compact/u],
      ["AppShell Navbar 零内边距", /AppShell\.Navbar[^>]*\bp=\{0\}/u],
      ["NavLink 自身 active", /<NavLink\b[^>]*\bactive=/u],
      ["菜单项完整 aria-label", /<NavLink\b[^>]*\baria-label=/u],
    ]) {
      if (!pattern.test(sidebarText)) errors.push(`精简侧栏缺少${label}契约`);
    }
    if (/(?:inlineSize|width)\s*:\s*["'`][^"'`]*(?:em|ch)\b/u.test(sidebarText)) {
      errors.push("精简侧栏名称不得使用固定 em/ch 占位盒");
    }
  } else {
    for (const [label, pattern] of [
      ["248px 展开宽度", /\bdetailedExpanded\s*:\s*248\b/u], ["76px 收起宽度", /\bdetailedCollapsed\s*:\s*76\b/u],
      ["72px 展开 Logo", /\bdetailedExpanded\s*:\s*72\b/u], ["44px 收起 Logo", /\bdetailedCollapsed\s*:\s*44\b/u],
      ["22px 菜单图标", /APP_SIDEBAR_NAV_ICON_SIZE_PX\s*=\s*22\b/u], ["1.75 图标描边", /APP_SIDEBAR_ICON_STROKE_WIDTH\s*=\s*1\.75\b/u],
      ["44px 展开菜单项最小高度", /APP_SIDEBAR_DETAILED_NAV_ITEM_MIN_HEIGHT_PX\s*=\s*44\b/u], ["18px 折叠按钮图标", /APP_SIDEBAR_COLLAPSE_ICON_SIZE_PX\s*=\s*18\b/u],
      ["默认展开", /DEFAULT_DETAILED_SIDEBAR_COLLAPSED\s*=\s*false\b/u], ["固定折叠偏好键", /APP_SIDEBAR_COLLAPSED_STORAGE_KEY\s*=\s*["']app\.sidebar\.detailed\.collapsed["']/u],
      ["固定本地 Logo", /APP_SIDEBAR_LOGO_PATH\s*=\s*["']\/app-identity\/logo\.png["']/u], ["严格 true 才收起", /localStorage\.getItem\([^)]*APP_SIDEBAR_COLLAPSED_STORAGE_KEY[^)]*\)\s*===\s*["']true["']/u],
      ["自身折叠按钮", /\bActionIcon\b/u], ["折叠按钮自身事件", /<ActionIcon\b(?=[^>]*data-testid\s*=\s*["']app-sidebar-collapse-toggle["'])(?=[^>]*onClick\s*=)[^>]*>/u],
      ["展开向左折叠图标", /\bIconChevronLeft\b/u], ["收起向右展开图标", /\bIconChevronRight\b/u],
      ["收起名称 Tooltip", /<Tooltip\b/u],
      ["Tooltip 右侧显示", /<Tooltip\b[^>]*\bposition\s*=\s*["']right["']/u], ["Tooltip 延迟常量", /APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS\s*=\s*0\b/u],
      ["Tooltip 无延迟", /<Tooltip\b[^>]*\bopenDelay\s*=\s*\{(?:0|APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS)\}/u],
      ["独立折叠偏好", /localStorage\.(?:getItem|setItem)\s*\(/u],
      ["展开图标文字布局", /icon-with-label/u], ["收起纯图标布局", /icon-only/u],
      ["收起不渲染名称", /label\s*=\s*\{[^}]*\?\s*undefined\s*:/u],
      ["展开横向菜单", /flexDirection\s*:\s*["']row["']/u],
      ["展开横向 sm padding", /px\s*=\s*\{[^}]*\?\s*0\s*:\s*["']sm["']\s*\}/u],
      ["收起 section 零边距", /marginInline\s*:\s*[^,}\n]*\?\s*0\s*:/u],
      ["菜单项自身 active", /<NavLink\b[^>]*\bactive=/u], ["菜单项完整 aria-label", /<NavLink\b[^>]*\baria-label=/u],
      ["侧栏固定定位", /position\s*:\s*["']fixed["']/u], ["侧栏 100dvh 高度", /height\s*:\s*["']100dvh["']/u],
      ["侧栏右侧 1px 边框", /borderInlineEnd\s*:\s*["'][^"']*1px/u],
      ["详细身份区 xs padding", /app-sidebar-identity["'][^>]*\bp\s*=\s*(?:["']xs["']|\{[^}]*["']xs["'][^}]*\})/u],
      ["AppShell 读取折叠偏好", /useState\s*\(\s*readDetailedSidebarCollapsed\s*\)/u],
      ["共享详细宽度计算", /detailedSidebarNavbarWidth\s*\(\s*detailedSidebarCollapsed\s*\)/u],
      ["AppShell 固定 detailed", /data-mode\s*=\s*["']detailed["']/u],
      ["运行时固定 detailed", /mode\s*=\s*["']detailed["']/u],
      ["Mantine navbar 同步宽度", /navbar\s*=\s*\{\{[^}]*width\s*:\s*navbarWidth/u],
      ["可观察 navbar 同步宽度", /data-navbar-width\s*=\s*\{navbarWidth\}/u],
      ["AppShell Navbar 零内边距", /AppShell\.Navbar[^>]*\bp=\{0\}/u],
      ["侧栏通知 AppShell", /onCollapsedChange\s*=\s*\{handleCollapsedChange\}/u],
      ["AppShell 更新状态", /setDetailedSidebarCollapsed\s*\(\s*nextCollapsed\s*\)/u],
    ]) {
      if (!pattern.test(sidebarText)) errors.push(`详细侧栏缺少${label}契约`);
    }
    if (/app-sidebar-identity["'][^>]*\bonClick\s*=/u.test(sidebarText)) {
      errors.push("详细侧栏身份区父级不得代理折叠点击");
    }
  }

  const sponsorRoot = path.join(guiRoot, "public", "brand-support", "sponsor");
  if (profile.sponsorPage) {
    for (const filename of SPONSOR_MEDIA_FILES) {
      const assetPath = path.join(sponsorRoot, filename);
      try {
        readBinaryFile(assetPath);
      } catch (error) {
        errors.push(`选择赞助页时缺少完整本地媒体 ${filename}：${error.message}`);
      }
    }
  } else if (fs.existsSync(sponsorRoot)) {
    errors.push("未选择赞助页时不得保留 public/brand-support/sponsor 运行时媒体目录");
  }
  return sourceText;
}
