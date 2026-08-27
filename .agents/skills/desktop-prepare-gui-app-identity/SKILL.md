---
name: desktop-prepare-gui-app-identity
description: 在 GUI 初始化时生成并选择应用 Logo，并在首次产品 GUI 开发前补齐和批准窗口元数据与正式图标资产。
---

# 准备 GUI 应用身份

GUI 初始化先建立经过用户选择的应用 Logo；首次真实 GUI 开发再补齐其余面向用户的应用身份。中性脚手架仍不得据此推测产品业务。

## 工作流程

1. 先判断调用模式。由 `$desktop-initialize-rust-project` 在选择 GUI 后调用时是“初始化 Logo 模式”：只读取当前项目展示名、ASCII 标识、`AGENTS.md`、`docs/ENGINEERING_RULES.md` 与已批准的可选品牌色/源资产，不要求 Product Spec 或 Product Status。首次真实产品 GUI 开发时是“完整身份模式”：再读取最新 Product Spec、Product Status、相关 ADR 和已有 `docs/GUI_APP_PROFILE.md`，确认产品目的已经批准并只补问缺失值。
2. 初始化 Logo 模式必须实际产出正好 3 个彼此明显不同的 1024×1024 正方形无损 PNG 候选，而不是三段文字提示或同图换色。候选只使用当前项目展示名、可选视觉方向和用户有权使用的源资产；优先通过可用的图像生成能力实际生成三种方向，能力不可用或失败时使用**确定性备选方案**生成三种可辨认的字母组合/几何构图。若用户选择**用户上传**，保留原图并在不重画标志本体的前提下生成三种安全留白/底色处理。所有候选使用 sRGB、保留安全区、避免细小文字，并在 32×32 尺寸仍可辨认。
3. 把 3 个候选作为独立图片同时展示并编号，不得用拼图遮蔽细节；必须等待用户明确选择其中一个，不能静默采用第一张，也不能以中性占位图完成 GUI 初始化。选择前候选只能位于本次任务精确拥有的临时目录；选择后只把选中候选逐字节保存为 `<project-id>_gui/src-tauri/icons/app-icon-master.png`，并逐字节复制为 `<project-id>_gui/public/app-identity/logo.png`。使用项目本地真实 Tauri `icon` 命令生成平台图标集，并确认 `icons/32x32.png` 为可见的 32×32 8-bit RGBA 非交错普通文件且由 `bundle.icon` 引用；选择系统托盘时，该文件同时是托盘图标来源。拒绝的临时候选可在确认最终路径与摘要后清理，不得删除用户原始上传。
4. 初始化时创建或更新 `docs/GUI_APP_PROFILE.md`，记录状态、3 个候选与用户选择、母版/运行时/平台图标证据，以及仍待首次真实 GUI 开发确认的元数据。必须保留 `$desktop-initialize-rust-project` 已确认的唯一 `gui-initialization-config` 围栏代码块，字段恰好为 `system_tray`、`about_page`、`sponsor_page`、`single_instance`、`sidebar_mode`，四项能力只能为 `enabled`/`disabled`，侧栏只能为 `compact`/`detailed`；侧栏未选择时的 `detailed` 缺省必须已由初始化器写入，身份更新不得覆盖或再次推断这些配置。初始化基线不得残留 `pending`、临时占位图或未选择状态。
5. 完整身份模式预览初始化所选 Logo，让用户选择保留或重新走“自动生成 / 确定性备选方案 / 用户上传”的三候选流程；随后确认应用展示名称、简短描述、应用标识符或包标识符、图标方向，以及任何品牌色或源资产。主窗口标题不是自由文案：记录并预览固定公式 `{applicationName} {version} {contactChannel}:{contactValue}`，其中应用名来自本资料、版本来自权威打包元数据、联系字段来自品牌 profile 的 `contacts.windowTitle`；不得保存会漂移的手写版本标题。
6. 若批准的分发格式包含 macOS DMG，展示初始化生成的 `<project-id>_gui/src-tauri/dmg/background.png`，再让用户批准该中性基线或替换它；同时确认文案语言、660×400 DMG 安装卷窗口尺寸和应用/Applications 落点。批准基线时保留现有字节，替换时把最终 660×400 PNG 写回同一路径并重新展示。软件许可页只按产品/渠道明确要求决定；不得复用 Harness、其他产品或带第三方身份的图片。
7. 在完整身份模式补全 `docs/GUI_APP_PROFILE.md` 的已批准值、固定标题公式与权威字段来源、应用 Logo/图标来源与溯源、母版/运行时/平台路径及 SHA-256、DMG 背景路径/摘要/尺寸/落点/文案语言和未解决分发元数据。只有身份选择构成长期重要决定时才写 ADR；只有发布/完整验收、重要阻断、跨会话交接或用户要求时才更新 Product Status。
8. 将资料直接交给 `$desktop-add-gui-adapter`：选中 Logo 必须接入平台图标和侧栏顶部，当前版本紧随 Logo 下方；仅当 `system_tray: enabled` 时还接入托盘并把 `default_window_icon()` 当作必需值。更新显示名后验证平台图标、侧栏 Logo、原生标题与 `document.title`，并仅对已选关于页验证身份/版本来源。关于页、赞助页、托盘和单实例均以配置块为准，身份 Skill 不得自行启用。

## 边界

- 不得静默复用 Harness 徽标、其他产品图标、生成草稿或用户上传的低分辨率文件作为选中 Logo、正式发布图标或 DMG 背景。
- 不得虚构商标权属、商店元数据、签名身份、发布者身份或法律声明。
- 选择生成或编辑图标时，必须使用可用的图像生成或编辑能力；如果该能力不可用，则必须实际生成三种确定性备选方案，不得假装已经生成。
- 本 Skill 在 GUI 初始化时先触发 Logo 模式并在初始化后保留；首次产品 GUI 开发时进入完整身份模式，此后只有已批准的 GUI 身份发生变化时才再次触发。

## 完成输出

报告 3 个候选的预览与摘要、用户选择、母版/运行时 Logo/平台图标证据、`icons/32x32.png` 的格式/可见像素/配置引用与摘要、已批准和未解决的元数据、资料位置、打包阻断项，以及下一项 GUI 实施操作。
