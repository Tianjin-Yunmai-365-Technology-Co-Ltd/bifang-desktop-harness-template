# GPUI 初始化接线

仅在已选择 DESKTOP 且 `gui-framework = "gpui"` 时完整读取。中央 [初始化流程](../SKILL.md) 拥有表单、环境、共享 core、测试后的裁剪与唯一 Git 基线；本引用只负责 GPUI 特有的工程接线。不得加载 Tauri 插件、React/Mantine、Tauri 图标/DMG 或 Tauri 初始化 E2E。

## 依赖、资产与能力

1. 分派 [$desktop-add-gpui-adapter](../../desktop-add-gpui-adapter/SKILL.md)，根 workspace 的 `gpui-kit = "0.8.1"` 与 `rust-i18n = "4.2.4"` 是兼容下界，GUI member 只用 `workspace = true` 并直接依赖同一 core。Node.js/pnpm 是工程工具；生成的项目根脚本负责真实开发和验证。
2. 完整读取该 Skill 的 [依赖基线](../../desktop-add-gpui-adapter/references/dependency-baseline.md) 与 [原生能力](../../desktop-add-gpui-adapter/references/native-capabilities.md)：前者确定最小 features 与启用条件，后者拥有配置移交和官方 API 限制。复用统一表单已确认的九字段配置；新项目默认含 Linux，深链接、系统托盘和 OS 全局快捷键均为 `unavailable`/`disabled`。既有不含 Linux 的旧项目仍按受保护的平台和 profile 判断托盘与快捷键。配置协助只复用表单中的移交意愿，产品动作在终端下游确认。
3. 三个原始 Logo 候选的展示和选择规则仍由 [$desktop-prepare-gui-app-identity](../../desktop-prepare-gui-app-identity/SKILL.md) 执行；GPUI adapter 拥有其资源路径和图标，不调用 Tauri icon 或 DMG 复制。只有用户明确授权的工程验证临时项目可用参考中性图，必须报告其用途，不能当作正式身份验收。

## 工作区入口

全新 GPUI 工程使用源专用 wrapper：

```text
node .agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.mjs --target <已确认的绝对空目标> --project-id <id> --name-zh <中文名> --name-en <英文名> --owner <负责人> --system-tray <enabled|disabled> --system-notification <enabled|disabled> --autostart <enabled|disabled> --single-instance <enabled|disabled> --global-shortcut <enabled|disabled> --about-page <enabled|disabled> --sponsor-page <enabled|disabled> --sidebar-mode <compact|detailed> --target-platforms <逗号分隔平台> --logo <已选择PNG>
```

该 wrapper 只创建中性 core/GUI、Cargo/profile 与无 npm 第三方依赖的根 `package.json` 工程入口，不设置 Git、Agent 策略或产品需求；剩余门禁仍按中央流程执行。只有已明确批准中性图标的工程验证可省略 `--logo`。已有共享 core 时使用 adapter Skill 的 add-only 入口，不整包覆盖。

## 返回中央流程

[$desktop-test-gpui-initialization-e2e](../../desktop-test-gpui-initialization-e2e/SKILL.md) 在非空 Rust 测试后执行实际 `cargo build` 与真实 Computer Use，检查本机窗口、侧栏、设置、语言/主题、条件关于/赞助和五项已选能力。托盘成功才关闭隐藏，失败或禁用则关闭退出；自启测试恢复原状态，空热键合同证明零注册。通知横幅若仍依赖打包与授权，应如实标记待验证；回收隔离偏好和进程。该初始化 E2E 不形成候选验收结论。

成功后返回中央第 13 步裁剪：保留 GPUI adapter、`$desktop-build-gpui-release`、项目本地 `$gpui-kit`/`$gpui-kit-design-guides`、通用工程 Skills 和适用身份规则；删除 Tauri adapter、条件能力/支持页/打包/初始化 E2E Skills、`$mantine-list-view` 与 React/TypeScript 专属门禁。源专用 wrapper、`create_gpui_workspace.test.mjs` 和 `assets/core/` 必须删除，保留 renderer、add-only helper 及其回归；升级按对应 tombstone 防止恢复。未通过测试、E2E 或裁剪核对时，不创建 Git 基线。
