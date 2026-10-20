---
name: desktop-add-gpui-adapter
description: 为已明确选择 GPUI 的中性 Rust 下游建立原生桌面薄适配器，固化双语身份、三态主题、设置、条件支持页、侧栏与按需托盘/通知/自启/单实例/热键，并在选完后协助配置。
---

# 增加 GPUI 原生适配器

在初始化已选择 `gui_framework = gpui`、已初始化下游明确批准增加 GPUI 接口，或维护既有 GPUI 壳层/能力时使用。默认桌面框架仍为 Tauri。GPUI 原生视图使用 Rust；根 pnpm 入口运行保留的 Node 工程检查与发布工具，默认无第三方 npm 依赖，无需前端。不得混装 React、WebView 或 Tauri plugin。当前 Harness 根只维护模板和工程规则，不能把产品业务写入这里。

GPUI 下游创建时安装项目本地官方 `$gpui-kit` 与 `$gpui-kit-design-guides`。界面设计、组件、布局、主题、状态与可见文案按后者读取 Design Guides；架构、Entity 所有权、事件、异步、API 和测试按前者读取 Coding Guides 及命中 references。只读取本次需要的深层主题，不全量加载参考文档。两套 Skill 的 `source.json` 固定来源 revision、大小与 SHA-256，`LICENSE-APACHE` 保留许可，`HARNESS-INTEGRATION.md` 解释原始跨 Skill/仓库引用。用户指令与本项目约束优先，官方知识不改变已确认的模板尺寸、功能范围、依赖或验收责任；API 必须与项目实际依赖版本核对。安装知识不运行远程代码，也不增加全局或运行时依赖。

## 按职责装配

依赖整理、版本升级与本地兼容补丁使用 `$desktop-manage-gpui-dependencies`；当前产品先取根 Cargo，初始化才读 [renderer 依赖快照](references/dependency-baseline.md)，不按旧下界降级产品。性能请求使用 `$desktop-optimize-gpui-performance`。

初始化及运行时/能力接线读 [runtime-and-native](references/runtime-and-native.md)；侧栏/关于/赞助页变更读 [shell-surfaces](references/shell-surfaces.md)；根 pnpm 脚本或开发循环变更读 [workspace-tooling](references/workspace-tooling.md)。只读取命中主题，保留九字段、禁用裁剪与已有产品接线。

已有 GPUI GUI 新增、调整或禁用通知、托盘或全局快捷键时，再读 [既有 GUI 能力增量接线](references/existing-gui-capabilities.md)，按引用完成后返回同一实施流程，不执行下面新增接口的生成步骤；保留产品定制，不重跑拒绝已有 GUI 的 add-only helper。自启继续交 `$desktop-add-gpui-autostart`。

Linux 窗口、托盘恢复、任务栏/Dock、自启、通知或后台热键变更，再读 [Linux 原生宿主方案](references/linux-native.md)。其中记录可复用机制及验证边界；当前中性 renderer 仍拒绝 Linux 托盘和后台热键生成，完整登录命令校验、旧项迁移和隐藏启动协调也未生成。已有下游实现与历史候选通过不改变这些事实。

1. 按 `AGENTS.md` 读取当前任务命中的工程与 Rust 规范；GUI 设计只读 `docs/design_standards/README.md` 与 `docs/design_standards/gpui_gui.md`。初次中性初始化复用初始化器已经确认的身份、接口、目标平台和九项 GUI profile，不要求 Product Spec、ADR、Work Plan、版本分类或发布上下文。初始化后新增接口才按 `$desktop-manage-version` 处理已批准 feature。

2. 初始化框架与能力选择只复用唯一表单的已确认结果；缺失答案继续等待，不由本 Skill 应用默认。九项 profile 保持原顺序：`system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode`。托盘、系统通知、自启、单实例与全局快捷键允许 enabled/disabled，只按选择生成依赖和实现。深链接仍 unavailable/disabled；托盘和后台热键当前限 macOS/Windows，目标含 Linux 时显式 enabled 在写入前失败关闭。关于/赞助页分别允许 `enabled` 或 `disabled`；侧栏为 `compact` 或 `detailed`。全部选择结束后必须读取 [原生能力与配置询问](references/native-capabilities.md)，汇总已选能力并询问配置协助；具体产品配置留到终端下游唯一根目录，不在 Harness 源收集业务内容。

3. 普通初始化继续复用三个原始 Logo 候选 → 用户选择 → 只验证并标准化所选项的流程；GPUI 只消费已选择的普通 PNG，不生成 Tauri 平台图标。工程验证可在用户明确授权时使用本 Skill 自绘的中性 SVG 或明确给定 PNG，并在 profile 中标记工程夹具，不能冒充正式品牌确认。双语展示名称必须来自同一确认结果；至少一种来自用户，另一种可按初始化流程翻译。不得把 machine ID 当英文展示名称。

4. 本 Skill 只面向已有共享 core 的下游。使用 [scripts/add_gpui_adapter.mjs](scripts/add_gpui_adapter.mjs) 的 `addGpuiAdapter(options)`，必须验证已有根 Cargo、直接 core member、项目/目标平台身份，没有 GUI 且依赖无冲突，随后增加 GUI/profile、独立 `packaging/gpui.json` 与项目内中性背景/所选 PNG 衍生图标，并定点合并 root Cargo 与根 `package.json` 工程入口；不创建或覆盖 core、不创建 Git、不写 Agent Policy 或 Product Spec。已有打包配置也必须保留，冲突时零写入失败。复杂或多行 Cargo 数组目前失败关闭，按明确人工合并处理。[scripts/gpui_adapter_files.mjs](scripts/gpui_adapter_files.mjs) 的 `renderGpuiAdapterFiles(options)` 返回上述文件的纯 Map，没有创建 workspace/core 的写入能力；打包配置和图标使用保留的 `$desktop-build-gpui-release` 标准库 renderer。普通所选 PNG 应已标准化为 256..2048 方形、8-bit RGB/RGBA、非交错格式；中性 SVG 工程夹具可以初始化，但缺少实际 PNG 时打包明确阻断。全新中性工程的源专用流程由源专用初始化器负责，终端下游不得通过本入口继续派生项目。

5. 原生能力变更运行 `node --test .agents/skills/desktop-add-gpui-adapter/scripts/gpui_native_capabilities.test.mjs`；profile 纯解析器拒绝缺字段/乱序/重复块/非法中性合同。运行本次 add-only 回归 `node --test .agents/skills/desktop-add-gpui-adapter/scripts/add_gpui_adapter.test.mjs`；变更 Node 工程入口时同时运行 [gpui_node_tooling.test.mjs](scripts/gpui_node_tooling.test.mjs)。生成的同名 `_test.rs` 使用 Kit 真实渲染树验证详细菜单左对齐、两档折叠按钮中心与侧栏边界/Logo中心对齐、跨边界部分点击、壳层无水平偏移，以及赞助模板在宽窄窗口/双语/明暗主题中的全页槽、等宽等高卡片与二维码尺寸；不以字符串扫描替代几何证据。源专用全新工作区 wrapper、对应测试和 core 模板仅由初始化器拥有，初始化完成与升级时裁掉，不得从终端下游恢复。新下游初始化由初始化器调用 `$desktop-test-gpui-initialization-e2e` 完成真实调试构建、Computer Use 与恢复；该入口基线后删除，保留的 adapter 不在已初始化下游恢复或依赖它。后续新增接口只运行本次实际需要的 Rust/宿主回归，不能冒充初始化或最终候选验收；明确 GPUI 构建/打包转交独立 `$desktop-build-gpui-release`，不混入 Tauri 管线。未执行平台如实报告。

## 已有工作区 CLI 契约

```sh
node .agents/skills/desktop-add-gpui-adapter/scripts/add_gpui_adapter.mjs \
  --target /absolute/existing/workspace \
  --project-id example_tool \
  --name-zh 示例工具 \
  --name-en 'Example Tool' \
  --owner 'Confirmed Owner' \
  --system-tray enabled \
  --system-notification enabled \
  --autostart enabled \
  --single-instance enabled \
  --global-shortcut enabled \
  --about-page enabled \
  --sponsor-page enabled \
  --sidebar-mode detailed \
  --target-platforms macos \
  --logo /absolute/selected-logo.png
```

目标必须已有身份匹配的共享 core 与 Cargo 工作区；空目录、已有 GUI、依赖冲突、profile 覆盖或目标平台漂移都失败关闭。`--logo` 省略只表示明确标注的中性工程夹具；普通产品初始化必须消费已选择 Logo。`--target-platforms` 接受与既有工作区一致且去重的 `macos,windows,linux` 子集，不把声明平台当已验证平台。支持页/侧栏使用已经确认的配置，交互选择归初始化器或已批准的新增接口请求。成功仅报告增加的文件与保留 core 事实，不把源码生成当运行验收完成。

## 完成报告

报告实际 GUI 框架、九项选择、真实依赖、系统语言/主题/窗口/关闭行为、支持页与媒体条件裁剪，以及当前宿主真实测试/E2E 结果。单列五项实际选择、配置协助答复/移交、已声明依赖与平台限制；深链接及 updater/dialog 如实标为 unavailable；未执行的跨平台构建、候选打包和签名不得称通过。
