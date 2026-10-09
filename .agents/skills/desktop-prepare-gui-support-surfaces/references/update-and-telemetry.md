# GUI 固定本地支持基线与能力路由

## 固定界面与配置状态

- `/settings` 是 GUI 初始化固定路由，始终展示当前应用名和带单个小写 `v` 的权威打包版本、中文/英文和浅色/深色/跟随系统；只为 profile 启用的系统通知与开机自启增加 Rust-only 宿主开关，不预置统计或隐私控件。所有 GUI 正式构建通过发布专用 `--config` 把根 `release-notes.json` 映射成候选内同名资源；中性调试构建不使用该配置。仅当初始化选择关于页时，才向单一合并的 `invoke_handler` 暴露 `check_for_updates` 与 `load_release_notes` 两个窄命令；手动“检查更新”和更新状态位于 `/about`，旁边的“更新日志”按钮从 schema v2 资源本地展示最近 10 版，每版功能优化/问题修复各最多 10 个完整 `zh-CN`/`en-US` 翻译对，标题和正文跟随当前 i18n locale 且未知语言回退 `en-US`，版本只带一个小写 `v`；读取失败只展示本地失败与重试，不回退到编译时数组或网络。
- 所选关于页存在更新入口不等于远程能力已启用。中性初始化把更新状态显示为 `NotConfigured` 并禁用检查按钮，本地更新日志按钮仍可用；两个按钮的事件只绑定各自元素，更新区父容器不代理。未选择关于页时不得建立隐藏手动入口，但这同样不授权远程能力。只有产品明确启用统计后才另建产品级明确同意界面；默认所有出站请求计数必须为零。
- 用户语言与主题选择由 GUI adapter 本地持久化，分别覆盖系统语言/主题探测结果；主题选择 `auto` 时继续跟随系统。更新状态和统计同意不得写入 shared core 的权威业务存储。
- 官方 updater Rust plugin、`NotConfigured` 状态控制器与受管任务所有权是所有 GUI 的固定基线；缺少 endpoint、发布公钥、channel 或 target 任一必填事实时仍为 `NotConfigured` 且零出站。产品明确启用远程更新时才创建 `docs/GUI_SUPPORT_SURFACES.md`，并增加真实 endpoint/公钥/channel/target 配置、必要的窄 capability 和非空测试，不再重复添加已存在的 plugin 依赖。产品启用统计上报时也才创建该文档并增加其传输依赖、权限、配置与测试；不得为 Draft scaffold 填写虚假 endpoint 或发布事实。

## 条件能力

远程更新与强更的唯一执行合同在 [$desktop-enable-gui-updates](../../desktop-enable-gui-updates/SKILL.md) 与其 [更新合同](../../desktop-enable-gui-updates/references/update-contract.md)。

统计上报的唯一执行合同在 [$desktop-add-gui-telemetry](../../desktop-add-gui-telemetry/SKILL.md) 与其 [统计合同](../../desktop-add-gui-telemetry/references/telemetry-contract.md)。只有实际启用对应能力才加载；初始化保持零出站，不预置统计控件。

## 固定界面回归

- UI：版本在所选侧栏与设置页可见，选择关于页时也在关于页可见；底部按已选赞助、固定设置、已选关于生成；语言与三态主题切换持久化；所选关于页的 `NotConfigured` 不触发请求，未选时没有隐藏入口。
