---
name: desktop-test-final-artifact-e2e
description: 通过 Computer Use 对完整真实 CLI、MCP 宿主或 GUI 候选执行端到端验收；仅在当前构建明确启用或产品/渠道要求时，于最终候选形成后调用。
---

# 测试最终产物 E2E

通过真实用户或宿主使用的同一可见交互路径，验证已批准范围内的场景。

## 工作流程

1. 读取已批准成功标准、当前构建的 E2E 选择、`docs/VERIFICATION.md` 及适用接口 Skill。要求当前构建选择为 `enabled`，或存在已批准产品/渠道的 `required` 规则；`e2e_hint` 不能替代当前构建选择。
2. 要求 `$desktop-verify-delivery` 已定位与源码提交、构建身份和 manifest 绑定的完整真实最终产物。拒绝开发预览、源码调用、模拟后端、脚手架、占位内容或推测路径；没有 Work Plan 不阻断 E2E。
3. 根据批准标准定义有边界的核心成功路径和最高风险失败路径，说明前置条件、隔离且可逆的数据、预期观测、清理和超时。
4. 启动真实产物，使用已安装的 `computer-use` Skill 与 GUI、浏览器、终端或宿主界面交互。每项操作前后检查全新状态；优先使用无障碍树，只有依据最新截图才使用坐标。
5. 验证状态、输出、持久化数据或错误呈现；单独一次点击或按键不构成证据。除非另获授权，必须在凭据、支付、生产、发布或不可逆操作前停止。
6. 在 runner 临时位置形成结构化的产物/版本、源码提交、平台、步骤、预期/观测结果、适用截图、关闭、清理和通过/失败结果，遮盖敏感信息与不必要个人路径；只把这些结果交回 `$desktop-verify-delivery` 作为待原子写入的候选证据，不直接逐个改写 release manifest，也不写 tracked Verification。
7. 任何失败、超时、取消或已启用但未运行的场景都拒绝候选并返回 `$desktop-implement-change` 增加回归测试；修复后重新构建完整候选。最终容器字节变化会使旧 E2E 证据失效；若变化同时影响运行时字节、启动器、配置、依赖或行为，必须重建并重跑。只有用户要求的活动计划存在时才重开或新增 Todo。
8. 所有场景和清理结束时，对当前 `release/` 重新枚举精确文件集，并重新计算全部最终制品、相邻摘要、manifest 声明及适用包内关键资源；要求源码提交、构建身份和每项字节与 E2E 准入快照一致。不得只声称“字节变化会使证据失效”而跳过结束复算；任何变化都使本次结果失效并交回 `$desktop-verify-delivery` 拒绝状态更新，不能把新摘要倒填进旧 manifest。
9. 未实际执行的操作系统、显示环境、浏览器、终端、MCP 宿主和包格式标记为 `Unverified`；必需人工最终复核仍是独立步骤，Agent 不得代签。

## 接口覆盖

- CLI：真实二进制调用、输出流、退出状态、取消和关闭。
- MCP：批准真实宿主的发现、调用、错误、取消和干净断开。
- GUI：启动、完整用户闭环、无障碍状态、错误、持久化和干净退出。GPUI 按 `$desktop-build-gpui-release` 定位最终原生包，不使用 Tauri URL/命令；检查详细菜单左对齐、顶部折叠按钮、独立赞助内容区，以及本地日志实际写入和退出刷新。
- GUI 系统通知：仅当 `system_notification = enabled` 且当前候选运行在 macOS 时，先验证当前 `.app` 已按 manifest 的 enabled 路线完成签名；`disabled/not-requested` 或实际 unsigned 必须在读取权限前失败，不能以 E2E `disabled` 或 `Unverified` 绕过，也不能由本 Skill 补签。随后读取当前系统授权状态并选择不破坏用户决定的隔离场景。已授权时确认开关成功且持久化；明确拒绝/受限时点击开启必须打开固定 Notifications 系统设置、应用偏好保持关闭并显示稳定恢复信息；设置窗口无法打开时错误可见。`NotDetermined` 只有在用户明确允许本次权限提示时才触发请求并复读，否则记为 `Unverified`，不得为了测试重置或伪造系统授权。其他平台按其官方权限界面验证。
- GUI 更新日志：先从最终候选自身只读定位并校验 `release-notes.json`；`about_page = enabled` 时在真实应用打开关于页（Tauri `/about`；GPUI 原生导航），点击“更新日志”自身按钮，确认加载来自候选资源、按最新在前最多十版、每版固定“功能优化/问题修复”各最多十条、当前版本与全部版本仅一个小写 `v`，并验证关闭后重开仍显示同一候选事实。资源缺失/损坏的受控失败候选只在已有隔离夹具且无需破坏最终候选时验证本地错误与重试；不得改写正式候选制造失败。`about_page = disabled` 时确认关于路由、入口、命令和弹窗均缺席。

## 完成输出

报告精确产物、当前构建选择/硬要求来源、场景、可观察证据、清理、通过项、失败项和未验证范围。不得自行签署人工复核字段。

### NSH 路由

根 Cargo `interfaces = ["nsh"]` 与 `nsh-targets` 独立使用 `$desktop-build-nsh-release`；旧 `interfaces = ["gui"]` 且 `gui-framework = "nsh"` 仅按既有工程读取。复用通用本地 Git 发布、版本、双语日志和 release 上下文。当前 helper 支持所选 desktop 原生包、Android 开发签名 APK、iOS 未签名设备 app/模拟器临时签名 app，以及 Web 完整静态目录，全部使用正式 0.4.0 固定 revision 与匹配 CLI。TUI 暂不可用，含 `tui` 的元数据、构建或候选请求失败关闭；历史预览程序或归档不能进入正式候选验收。正式 IPA 与渠道签名需要另行明确身份和官方流程。不得走 Tauri 前端/NSIS 或 GPUI cargo-packager。本机不可构建目标如实阻断，不推断已验证。

NSH 最终候选证据在忽略的 release 批次目录，校验 manifest 列出的包、sidecar 日志和许可证字节及摘要；sidecar 不冒充内部资源。E2E 在最终包形成后使用真实目标宿主/设备或 Web 静态站点；每个目标独立取证，pending/Unverified 不能升级 accepted。初始化中性壳层测试不替代产品验收。

移动候选须从实际安装的应用检查顶部与底部安全区、首页/设置底栏的位置和选中态、切页以及语言和主题变化。macOS 上先通过 Computer Use 检查可操作的 Device Hub（`com.apple.dt.Devices`，若可用）与 Simulator.app；`simctl` 可以辅助安装和截图，但未见 Simulator.app 窗口不足以判定模拟器无法点击。确无可操作界面时记录已检查的工具和未验证范围，不以 headless 渲染测试替代真实交互。

NSH macOS `.app` 从候选自身的 `application.tar.gz` 隔离解包，核对解包路径、Mach-O 入口、归档与 manifest SHA-256 后才启动。Web 只从候选归档的完整静态目录提供页面；Android/iOS 必须在所选真实设备或模拟器安装并运行同一候选。仅当选择桌面且关于页启用时，点击元素自身的“更新日志”按钮，逐语言对照候选根 `release-notes.json` 的两类与版本；其 sidecar 不等于包内可定位资源，须从界面观察编译期内容。交互结束重新复算原始候选包、清单与 sidecar 字节，测试解包目录只在确认路径后清理。
