---
name: desktop-add-gpui-adapter
description: 为已明确选择 GPUI 的中性 Rust 下游建立原生桌面薄适配器，固化双语身份、三态主题、设置、条件关于与赞助页、精简或详细侧栏及真实关闭退出。
---

# 增加 GPUI 原生适配器

只在初始化已选择 `gui_framework = gpui`，或已初始化下游明确批准增加 GPUI 接口时使用。默认桌面框架仍为 Tauri；用户选择 GPUI 后不得混装 React、WebView、Tauri plugin 或 pnpm。当前 Harness 根只维护模板和工程规则，不能把产品业务写入这里。

## 最小工作流程

1. 按 `AGENTS.md` 读取当前任务命中的工程与 Rust 规范；GUI 设计只读 `docs/design_standards/README.md` 与 `docs/design_standards/gpui_gui.md`。初次中性初始化复用初始化器已经确认的身份、接口、目标平台和九项 GUI profile，不要求 Product Spec、ADR、Work Plan、版本分类或发布上下文。初始化后新增接口才按 `$desktop-manage-version` 处理已批准 feature。
2. 框架由独立问题选择：`1. Tauri（默认；未回答时使用）`、`2. GPUI`。九项 profile 保持原顺序：`system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode`。GPUI 的六项原生可选能力目前明确为 `unavailable`，只能保存 `disabled`，不得安装依赖、注册占位回调或伪造已实现状态。关于/赞助页分别允许 `enabled` 或 `disabled`；侧栏为 `compact` 或 `detailed`。选择 GPUI 不得继续询问这些 unavailable 能力是否启用。
3. 普通初始化继续复用三个原始 Logo 候选 → 用户选择 → 只验证并标准化所选项的流程；GPUI 只消费已选择的普通 PNG，不生成 Tauri 平台图标。工程验证可在用户明确授权时使用本 Skill 自绘的中性 SVG 或明确给定 PNG，并在 profile 中标记工程夹具，不能冒充正式品牌确认。双语展示名称必须来自同一确认结果；至少一种来自用户，另一种可按初始化流程翻译。不得把 machine ID 当英文展示名称。
4. 固定直接依赖只包含根 `[workspace.dependencies]` 的 `gpui-kit = "0.7.1"`、`rust-i18n = "4.2.0"`、`sys-locale = "0.3.2"`。前者提供原生 GPUI、Kit 组件和图标，第二项编译嵌入双语词典，第三项提供真实系统语言。GUI member 使用 `workspace = true` 并直接依赖 `<id>_core`；core 不依赖任何 GUI 或异步运行时。GPUI Kit 自身 ABI 对齐的精确传递版本由上游负责，不在 Harness 中复制一组来源不明的 pins。
5. 本 Skill 只面向已有共享 core 的下游。使用 [scripts/add_gpui_adapter.mjs](scripts/add_gpui_adapter.mjs) 的 `addGpuiAdapter(options)`，必须验证已有根 Cargo、直接 core member、项目/目标平台身份，没有 GUI 且依赖无冲突，随后仅增加 GUI/profile 并定点合并 root Cargo；不创建或覆盖 core、不创建 Git、不写 Agent Policy 或 Product Spec。复杂或多行 Cargo 数组目前失败关闭，按明确人工合并处理。保留的 [scripts/gpui_adapter_files.mjs](scripts/gpui_adapter_files.mjs) 仅导出 `renderGpuiAdapterFiles(options)` 返回 GUI/profile 文件的纯 Map，没有创建 workspace/core 的写入能力。全新中性工程的源专用流程由源专用初始化器负责，终端下游不得通过本入口继续派生项目。
6. 根 `[workspace.metadata.agent-first-harness]` 固定记录 `gui-framework = "gpui"`，`interfaces` 含 `gui`，`target-platforms` 来自实际选择。GUI 代码放 `<id>_gui/src/`；有子文件的模块使用 `<module>/mod.rs`。壳层 Entity 只拥有页面、语言、主题与设备侧栏偏好；业务状态、值域、权限、错误和跨调用编排仍属于 core。事件绑定在实际 Button 自身，适配器不执行 CLI 或解析 CLI 输出。
7. 原生窗口第一次或无效状态使用 1440×900、最小 960×640、居中且可调整。后续只恢复有效、与当前显示器相交的尺寸/位置/最大化；不恢复全屏/最小化/隐藏。没有托盘时不拦截关闭，最后窗口关闭必须实际退出进程。GPUI 事件循环留在同步主线程；模板不需要 Tokio，不得为壳层另建或嵌套 runtime。未来业务需要后台异步执行时，复用该适配器拥有的 runtime，不能把整个 GPUI loop 放进 `#[tokio::main]` 或 `block_on` 根任务。
8. 固定设置页包含当前语言名称/实际包版本、中文/英文/跟随系统与浅色/深色/跟随系统三态主题。默认语言来自 `sys_locale::get_locale()`，未知语言回退英文；系统主题观察真实 `WindowAppearance`，显式选择覆盖。标题从同一双语名称、Cargo 包版本和受管品牌联系人生成，仅一个小写 `v`。主题使用 Kit 的完整语义颜色，视图不散落判断深浅。设备偏好用有限白名单文本，在事件循环前有界读取；渲染和 handler 零磁盘 I/O。后台有界合并队列写同目录临时文件并替换，事件循环退出后等待最后快照完成。
9. compact 为 80px、6px 内容内边距、36px Logo、22px 图标、56px 全宽居中竖排名称，完全没有折叠按钮或折叠翻译键。detailed 为展开 248px、收起 76px、72px/44px Logo、22px 图标、44px 菜单行与 Tooltip，折叠为独立设备偏好。功能菜单向下增长；底部按已选赞助 → 设置 → 已选关于生成。原生列表页使用 GPUI 的类型化实体/组件设计，不要求 Mantine、TanStack 或 Jotai；需要跨页面保留的会话视图选择由进程内实体持有，不能持久化业务数据副本。
10. `about_page: enabled` 才生成 `app/about.rs`、枚举/导航/展示状态与词典键；页面包含当前应用、负责人、品牌联系方式、免责声明、更新日志入口和真实不可用更新状态。中性基线未实现 GPUI updater，按钮明确反馈 unavailable/零出站，不能伪装已安装 Tauri updater 或检查成功；没有发布记录时显示真实空状态。发布后增加实际更新日志读取属于后续明确需求，不能提前捏造发布条目。`about_page: disabled` 不生成不可达页面或翻译。
11. `sponsor_page: enabled` 才生成原生三档权益卡片、宽窗三列/窄窗一列、独立支付区、完整赞助媒体和词典；源码布局参考优化过的 gpui-demo，但内容来自本 Skill 自含的 Harness 受管品牌源：[assets/brand-support](assets/brand-support)。固定品牌、价格、联系方式、支付二维码与免责声明是已有批准的产品家族例外；媒体逐字节校验 `media-manifest.json` 的大小/SHA-256，不复制 gpui-demo 的业务、凭据、Logo 或远端地址。二维码只静态展示，不授权支付、订单或权益自动化。禁用时没有 sponsor 代码、词典、媒体或相关运行时资源。媒体子集的来源和许可责任见 [assets/brand-support/SOURCE.md](assets/brand-support/SOURCE.md)。
12. GPUI 当前固定宿主基线与 Tauri 分开报告：真实系统语言、三态主题、受限窗口恢复、最后窗口关闭退出已经实现；updater 与通用原生 dialog 当前 `unavailable`，没有 Tauri plugin、ACL 或伪造实现。新增这些真实宿主能力必须单独建立可复用实现、测试和当前平台的可观察证据，再调整 capability facts；不能用 stub 提升为 supported。
13. 运行本次 add-only 回归 `node --test .agents/skills/desktop-add-gpui-adapter/scripts/add_gpui_adapter.test.mjs`。源专用全新工作区 wrapper、对应测试和 core 模板仅由初始化器拥有，初始化完成与升级时裁掉，不得从终端下游恢复。真实初始化执行非空 `cargo test --workspace --all-targets --all-features` 与 `cargo build --workspace`，锁策略遵循根 Cargo 事实；首次当前宿主初始化必须通过 Computer Use 观察窗口、Logo/标题/双语、三态主题、所选侧栏、设置/条件支持页、关闭退出与重启偏好。这些是 debug 原生初始化验证，不冒充发布候选、签名、安装包或跨平台验收。未执行平台如实报告。

## 已有工作区 CLI 契约

```sh
node .agents/skills/desktop-add-gpui-adapter/scripts/add_gpui_adapter.mjs \
  --target /absolute/existing/workspace \
  --project-id example_tool \
  --name-zh 示例工具 \
  --name-en 'Example Tool' \
  --owner 'Confirmed Owner' \
  --about-page enabled \
  --sponsor-page enabled \
  --sidebar-mode detailed \
  --target-platforms macos \
  --logo /absolute/selected-logo.png
```

目标必须已有身份匹配的共享 core 与 Cargo 工作区；空目录、已有 GUI、依赖冲突、profile 覆盖或目标平台漂移都失败关闭。`--logo` 省略只表示明确标注的中性工程夹具；普通产品初始化必须消费已选择 Logo。`--target-platforms` 接受与既有工作区一致且去重的 `macos,windows,linux` 子集，不把声明平台当已验证平台。支持页/侧栏使用已经确认的配置，交互选择归初始化器或已批准的新增接口请求。成功仅报告增加的文件与保留 core 事实，不把源码生成当运行验收完成。

## 完成报告

报告实际 GUI 框架、九项选择、真实依赖、系统语言/主题/窗口/关闭行为、支持页与媒体条件裁剪，以及当前宿主真实测试/E2E 结果。六项原生能力及 updater/dialog 如实标为 unavailable；未执行的跨平台构建、候选打包和签名不得称通过。
