# NSH 初始化接线

仅在顶层 `interfaces = ["nsh"]` 时完整读取。NSH 是与 CLI、MCP、DESKTOP 平级的下一代全平台开发框架；中央 [初始化流程](../SKILL.md) 负责唯一表单、环境、共享 core、裁剪和独立 Git 基线，本引用负责已选 NSH 子目标的接线。

## 子目标与能力

表单可选 desktop/mobile/web/tui 并派生系统平台；全部采用正式 v0.5.1 提交 `224d9a795c7ac9d10d75750de9351adac5549675` 与匹配 CLI。完整读取 [$desktop-add-nsh-adapter](../../desktop-add-nsh-adapter/SKILL.md) 及其 [运行时与能力](../../desktop-add-nsh-adapter/references/runtime-and-capabilities.md)。所有目标共用 Mixed TSX 和 Rust core。仅 desktop 按[唯一表单合同](../../desktop-instantiate-project/references/initialization-form.md#字段阶段与顺序)询问适用问题并写入九字段桌面 profile：官方多窗口固定提供；托盘、单实例、深链接按选择接入，深链接要求单实例；自启、通知与 OS 全局快捷键在中性模板固定关闭。选择 NSH 时，官方 `nsh`、`nsh-design-guides` 随脚手架自动安装到项目 `.agents/skills/`。

## 工程与测试

确认表单后复核全局 `nsh --version` 及实际可执行路径。缺失或不匹配时按项目环境流程准备对应官方发布版本。再建立仅含共享 core 的工作区，写入已确认的 `target-platforms` 和单行 `interfaces = []`，保留 core 的异步 `scaffold_status` API。`nsh-targets`、`gui-framework` 和 `docs/GUI_APP_PROFILE.md` 保持缺席。随后由 NSH adapter 的 add-only helper 写入 `interfaces = ["nsh"]`、`nsh-targets`、适用的九字段 profile 与 adapter；纯净工程回归可用源专用 `scripts/create_nsh_workspace.mjs`，但它不能代替完整实例化的复制、身份、策略和 Git 收尾。desktop 复用已选择的 Logo；工程临时夹具必须标记中性。运行非空 Rust workspace、NSH check/test 与 [$desktop-test-nsh-initialization-e2e](../../desktop-test-nsh-initialization-e2e/SKILL.md) 后才可裁剪；不得把 NSH runner 的临时嵌套 workspace 当成产品根。

## 返回中央流程

保留 NSH adapter/build Skill、适用的桌面支持页资产，以及通用生命周期、版本、发布与升级规则；NSH 批次产物由自身构建 Skill 取证，不保留只支持 CLI/Tauri 扁平目录的制品收集 Skill。删除 Tauri/Mantine 专属 Skills。删除源专用初始化器和本次 NSH 初始化 E2E，重写下游地图并清理失效引用，然后才创建独立 `main` 唯一基线。不能生成 Tauri 配置或前端，也不能运行 Tauri 初始化 E2E；终端下游不得保留 `create_nsh_workspace` 或继续派生项目。

新 NSH 的 desktop、mobile、Web 均走官方 `nsh package`；TUI 只支持官方运行与测试，0.5.1 没有 TUI 打包目标。组合工程的移动/Web 包通过临时工作区副本隔离桌面窗口、单实例和模板恢复协议。裁剪预览按已选 NSH 类别列出各自证据引用，并复核实际 Mixed 文件、依赖版本和开发命令。正式签名、设备运行和目标宿主验证分别取证；初始化不执行候选构建。
