# Tauri 桌面 GUI 基线

仅在明确的下游请求通过 GUI 范围闸门后阅读本参考。同时阅读 GUI 所属的 [React 前端基线](react-frontend-baseline.md)。

## 固定默认值

- 将 Tauri 2 与现有 Rust 共享核心及 Tokio 适配器标准配合使用。
- 复用 Tauri 基于 Tokio 的单例异步运行时，并以普通 `async fn` 实现自定义命令；不得创建嵌套 Tokio 运行时。
- 使用 Mantine UI、TanStack Router、TanStack Query 和 Jotai 打包本地 React + TypeScript 前端。
- 不得加载远程内容。
- 保持 Tauri Rust 边界轻薄：验证输入、调用核心并映射有类型的结果。
- 调用时解析并锁定最新、彼此兼容的稳定 Tauri/前端版本；验证 Rust MSRV、Node/pnpm 策略和目标平台 WebView。
- 使用 pnpm 作为前端包管理器，并要求存在 `$check-development-environment` 提供的当前宿主 Node.js 和 pnpm 证据。
- 固定前端同时适用于中性 `Draft` 脚手架和已批准产品。不得根据页面数量把它替换为普通 HTML/ES 模块或其他框架。

## 必需设计输入

记录：

- `docs/GUI_APP_PROFILE.md` 中已批准的应用显示名称、主窗口标题、简短说明、应用标识符和用户选择的图标来源；
- 已批准的人类使用场景，以及选择桌面界面的原因；
- 最小窗口、页面、路由、导航和操作；
- 空、加载、成功、验证、冲突和失败状态；
- 键盘顺序、快捷键、焦点行为、标签和无障碍验收；
- 适用时的稳定 ID、选择语义、批处理范围、搜索、排序和分页；
- 刷新、并发修改、取消和恢复行为；
- 必需的文件系统、进程、通知、Shell、托盘、启动或更新器访问；
- 当前平台打包目标，以及保持 `Unverified` 的其他平台。

## 安全与架构规则

- 为打包内容定义明确 CSP。
- 只向命名窗口/WebView 授予能力，并且只包含必需权限和作用域。
- 保持禁用远程 URL 访问。
- 窄 Rust 命令能够执行已批准操作时，不得公开通用文件系统或 Shell 访问。
- 持久数据、迁移、并发控制和业务验证必须由共享核心/存储层负责。
- 使用 TanStack Query 负责有类型的异步命令结果和失效；Jotai 只负责跨组件共享的客户端交互。绝不能把 Query/核心数据复制到 atom 中。
- 从真实应用状态展示权威版本、状态、时间戳和错误。
- 提交前明确展示破坏性操作和批处理操作范围。
- I/O、等待、计时器、进程和命令到核心的调用保持异步。只有测量确认的 CPU 密集工作才可考虑 `tauri::async_runtime::spawn_blocking` 或其他已批准线程边界，并提供明确的所有权、取消、并发上限和资源预算证据。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。

## 最低证据

- Rust 命令测试覆盖核心成功路径和最高风险失败路径。
- 前端测试覆盖 Mantine 交互、路由、查询生命周期、Jotai 转换和真实失败展示。
- 检查纯键盘使用和适用的无障碍语义。
- 能力/权限配置拒绝未经批准的 WebView 调用。
- GUI/其他适配器并发访问时观察到相同数据且不发生损坏。
- 锁定的前端生产构建和锁定的 Tauri 构建都成功。
- 缺少签名身份、证书、公证凭据或更新器密钥不阻断允许 unsigned 的本地构建或里程碑冒烟；使用 `--no-sign` 并记录 unsigned。macOS Developer ID 直接分发一旦签名，必须在候选摘要前完成公证与 ticket stapling；禁止只签名未公证的中间态。
- macOS 宿主的原生 DMG 与 Windows x64 NSIS 候选使用 `$build-tauri-release`。Windows 交叉路线只使用 cargo-xwin + NSIS，拒绝 MSI，并把 Windows runtime 保持为 `Unverified`。
- 真实打包应用或发布模式应用能在当前平台启动并渲染关键路由。
- 每个声称支持的安装器或原生平台都有实际构建和已验收里程碑证据。只有持久策略或硬要求选中冒烟/E2E 时才要求相应证据；否则记录 `Not run` 和风险。

## 例外与推荐边界

Tauri 2 和固定 React 前端技术栈是硬规则。替换它们必须记录硬规则例外，其中包含未满足的约束、风险、替代证据和恢复/迁移标准。

插件、伴随进程、托盘行为、自动启动、更新器、更宽泛的平台 API、包管理器、构建工具、表单/图标/图表包和测试框架仍是项目特定选择。只有存在已批准需求，并同步依赖、安全、打包和测试变更时，才能增加或推荐。

官方运行时和签名参考：

- [Tauri 异步运行时](https://docs.rs/tauri/latest/tauri/async_runtime/)
- [Tauri 分发与签名](https://v2.tauri.app/distribute/)
- [Tauri Windows 安装包与 macOS 交叉构建](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Windows 签名行为](https://v2.tauri.app/distribute/sign/windows/)
- [Linux 签名行为](https://v2.tauri.app/distribute/sign/linux/)
