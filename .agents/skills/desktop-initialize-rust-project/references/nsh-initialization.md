# NSH 初始化接线

仅在顶层 `interfaces = ["nsh"]` 时完整读取。NSH 是与 CLI、MCP、DESKTOP 平级的下一代全平台开发框架；中央 [初始化流程](../SKILL.md) 负责唯一表单、环境、共享 core、裁剪和独立 Git 基线，本引用负责已选 NSH 子目标的接线。

## 子目标与能力

表单选择 desktop/mobile/web/tui；固定 NSH 0.4.0 没有 TUI 运行或打包目标，选中即失败关闭。完整读取 [$desktop-add-nsh-adapter](../../desktop-add-nsh-adapter/SKILL.md) 及其 [运行时与能力](../../desktop-add-nsh-adapter/references/runtime-and-capabilities.md)。desktop 才询问现有九项桌面 profile，其中六项宿主能力当前 `unavailable`/`disabled`；mobile/Web 不询问桌面 profile。按已选子目标与具体平台生成桌面、Android/iOS 或 Web 工程。

## 工程与测试

中性 core 建立后使用 NSH adapter 的 add-only helper；纯净工程回归可用源专用 `scripts/create_nsh_workspace.mjs`，但它不能代替完整实例化的复制、身份、策略和 Git 收尾。desktop 复用已选择的 Logo；工程临时夹具必须标记中性。运行非空 Rust workspace、NSH check/test 与 [$desktop-test-nsh-initialization-e2e](../../desktop-test-nsh-initialization-e2e/SKILL.md) 后才可裁剪；不得把 NSH runner 的临时嵌套 workspace 当成产品根。

## 返回中央流程

保留 NSH adapter/build Skill、共享支持页资产，以及通用生命周期、版本、发布、制品收集与升级规则；删除 Tauri/Mantine/GPUI 专属 Skills。删除源专用初始化器和本次 NSH 初始化 E2E，重写下游地图并清理失效引用，然后才创建独立 `main` 唯一基线。不能生成 Tauri 配置、前端或 GPUI Kit，也不能运行其初始化 E2E；终端下游不得保留 `create_nsh_workspace` 或继续派生项目。

NSH 的 `local_package` 只表示将来可由 [$desktop-build-nsh-release](../../desktop-build-nsh-release/SKILL.md) 按目标本地构建；签名、移动设备运行与目标宿主验证仍是独立事实。初始化不执行候选构建或宣称产品完成。
