# NSH 初始化接线

仅在顶层 `interfaces = ["nsh"]` 时完整读取。NSH 是与 CLI、MCP、DESKTOP 平级的下一代全平台开发框架；中央 [初始化流程](../SKILL.md) 负责唯一表单、环境、共享 core、裁剪和独立 Git 基线，本引用负责已选 NSH 子目标的接线。

## 子目标与能力

表单仅选择 desktop/mobile/web 并派生完整目标平台集合；全部使用正式 0.4.0 固定提交 `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3` 与匹配 CLI。TUI 暂不可用，选择或保留 `tui` 时失败关闭。完整读取 [$desktop-add-nsh-adapter](../../desktop-add-nsh-adapter/SKILL.md) 及其 [运行时与能力](../../desktop-add-nsh-adapter/references/runtime-and-capabilities.md)。各子目标均采用 Mixed TSX 界面、Rust native module 与共享 core 调用。仅 desktop 询问九项桌面 profile：多窗口固定支持；托盘、自启、单实例和深链接按选择接线，深链接要求单实例；系统通知与 OS 全局快捷键明确不可用。mobile/Web 不询问桌面 profile，也不生成自定义桌面宿主。

## 工程与测试

先建立仅含共享 core 的工作区，写入已确认的 `target-platforms` 和单行 `interfaces = []`，保留 core 的异步 `scaffold_status` API。`nsh-targets`、`gui-framework` 和 `docs/GUI_APP_PROFILE.md` 保持缺席。随后由 NSH adapter 的 add-only helper 写入 `interfaces = ["nsh"]`、`nsh-targets`、适用的九字段 profile 与 adapter；纯净工程回归可用源专用 `scripts/create_nsh_workspace.mjs`，但它不能代替完整实例化的复制、身份、策略和 Git 收尾。desktop 复用已选择的 Logo；工程临时夹具必须标记中性。运行非空 Rust workspace、NSH check/test 与 [$desktop-test-nsh-initialization-e2e](../../desktop-test-nsh-initialization-e2e/SKILL.md) 后才可裁剪；不得把 NSH runner 的临时嵌套 workspace 当成产品根。

## 返回中央流程

保留 NSH adapter/build Skill、适用的桌面支持页资产，以及通用生命周期、版本、发布与升级规则；NSH 批次产物由自身构建 Skill 取证，不保留只支持 CLI/Tauri 扁平目录的制品收集 Skill。删除 Tauri/Mantine 专属 Skills。删除源专用初始化器和本次 NSH 初始化 E2E，重写下游地图并清理失效引用，然后才创建独立 `main` 唯一基线。不能生成 Tauri 配置或前端，也不能运行 Tauri 初始化 E2E；终端下游不得保留 `create_nsh_workspace` 或继续派生项目。

NSH 的 `local_package` 只表示将来可由 [$desktop-build-nsh-release](../../desktop-build-nsh-release/SKILL.md) 按目标本地构建；组合工程的移动/Web 打包须用临时 Mixed 入口移除桌面 host 权限。签名、移动设备运行与目标宿主验证仍是独立事实。初始化不执行候选构建或宣称产品完成。
