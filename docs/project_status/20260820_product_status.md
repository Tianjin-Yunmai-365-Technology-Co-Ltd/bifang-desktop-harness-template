# 项目状态

> 记忆日期：2026-08-20

## 当前阶段

- 产品规格：Approved；core-first、薄适配器、事件触发项目记忆、Rust `400/800`、前端 `500/1000`、其他人工维护文本 `500/2000` 的分层行数门禁，以及 Rust/GUI 固定技术栈与收敛的中文声明注释门禁继续有效。日常只执行各类硬上限；建议区间和 `TODO`/`FIXME`/`HACK` 只在明确发布且当次 `reviewSelection: enabled` 时集中复核。
- 当时计划已完成上述同步；旧计划按当前“只保留最新快照”规则由后续计划取代，入口见 [`docs/work_plan/README.md`](../work_plan/README.md)。本任务不产生新的里程碑验收结论。
- 既有里程碑：Rust 技术选型源码候选 `f7b84169eea647f157d27a6dc579f61417001fd0` 的 `Milestone accepted` 历史结论继续有效；本次修改不改写该候选或其验证证据。
- 发布状态：`Unreleased`。本次不创建候选、tag、源码归档、签名、公证、发布渠道上传或正式发布。

## 已完成基线

- Rust 能力事实包含 Axum + Tower/Tower HTTP、config-rs/notify、tracing-subscriber/appender 和默认关闭的 OpenTelemetry；OpenAPI、GraphQL、MongoDB/Redis 与本地认证组合仍按真实能力触发，不进入中性依赖。
- Tauri React 前端固定基线包含 Vite、TanStack 文件路由、严格 TypeScript、ESLint/Prettier、Vitest/Testing Library 和 Mantine 设计规范；公开配置、前端日志汇入 Rust tracing 与最终 `dist` 扫描只在真实消费者出现时落实。
- Rust 下游保留 workspace-aware 中文声明注释检查器；GUI 下游条件保留 TypeScript Compiler AST 检查器。两者都采用精确范围、位置诊断和失败关闭，只证明注释存在，不自动生成套话，语义质量继续由人工或 Agent 复核。
- 所有接口无关业务、领域校验、用例编排和稳定错误继续由共享 core 实现并测试；CLI/TUI/MCP/GUI 只保留运行时、协议、展示、交互和结果映射职责。

## 本次完成工作

- 完成来源锁、提交历史和当前模板工作树的三方溯源；锁点前 84 个 Skill 文件均已收敛，锁点后 3 个 Skill 提交的 16 个文件全部映射，没有未解释通用工程候选。
- 2026-08-20 当时已补齐 Homebrew `llvm`/`lld` 拆包环境门禁和 `notarytool` Keychain profile 公证探测，并以专项非空回归覆盖安装、损坏环境、授权 profile 与混合凭据拒绝；这只记录签名启用分支仍可消费的能力。当前 macOS 发布默认 `disabled/not-requested`，不运行身份、凭据或 profile 探测，只有已批准持久配置、本次主动要求或渠道硬要求才启用完整签名、公证与 stapling。
- 2026-08-20 当时已固化 DMG Finder 最终字节只读布局检查，并把同一当前候选重验传播到构建、里程碑验收、发布准备和验证事实源。当前 unsigned 分支不签名、公证或 stapling；启用分支的任何布局后处理仍强制重新签名、公证、stapling、摘要与验收，且 `system_notification = enabled` 的 macOS 产品在签名仍关闭时必须于提交/测试/bundle 前失败关闭。
- 新增按需、逐项批准的 `$desktop-prepare-gui-support-surfaces`，明确 core/GUI 所有权、出站白名单、秘密引用、隐私同意、生命周期、i18n/无障碍和负向测试；非 GUI 初始化裁剪，产品实例文档由升级器保护。
- 按用户确认建立共享产品家族品牌例外：条件 Skill 完整携带固定三档赞助价格、品牌联系人、中英文文案、两张支付二维码、更新 banner 和暂未使用小图；媒体清单对 13 个文件记录 MIME、尺寸、字节数、SHA-256、用途、敏感性和内部专有复用边界。
- 新增 About/Sponsor/Media/Banner React/Mantine 模板与产品实例文档模板。赞助页采用响应式布局和主题令牌；支付码具备明确替代文本；本地视频契约强制 controls、字幕、文字稿和无 autoplay，但来源没有已跟踪视频，因此没有伪造视频制品。
- GUI 初始化保留完整品牌源包，应用 bundle 只接收已选界面所需资源；升级器把 Skill、模板、配置、i18n、manifest 和媒体视为同一 conditional 能力，同时继续保护下游产品实例与本地决定。
- 全量 141 条 Python 回归、Harness validator 的 128 个必需文件与 24 份 Skill、统一行数门禁、中性 Rust workspace 注释门禁、隔离前端严格 TypeScript/Prettier/31 个 TypeScript 声明门禁/7 条 Vitest，以及 13 张图片的逐字节、摘要、尺寸、解码和视觉检查全部通过；来源身份、固定服务、秘密和绝对路径扫描为零命中。

## 未运行与剩余风险

- 本标准任务不构建真实 DMG/NSIS，不运行启动冒烟、Computer Use E2E、Windows/Linux 运行验证、签名、公证、发布归档或发布渠道。
- 本轮 DMG helper 使用隔离模拟挂载回归，尚未对新生成的真实 DMG 做前向验证；Keychain profile 与 xwin 变化也未在新的真实下游候选上执行，保持 `Unverified`。
- 可选 GUI 支持界面尚未由本 Harness 真实生成到另一个下游并完成其完整 lint/validator/Vite/Tauri 构建，保持 `Unverified`；本轮只在隔离前端中验证模板本身，不等同真实应用候选验收。
- 本轮没有访问支付码所指向的真实支付渠道，也没有执行订单、支付状态、权益或账户逻辑；固定价格、联系人和支付码是用户确认的当前品牌事实，后续变更仍需品牌负责人复核。品牌媒体仅获产品家族内部专有复用，不授予公共再许可。
- 来源没有已跟踪视频；当前只提供未来本地视频的无障碍与隐私契约，实际视频加入前仍需确认版权、字幕、文字稿和 poster。
- 当前没有新的 `release/` 归档、SHA-256、manifest 或 Git tag，不声明正式发布 `Ready`。

## 下一步

1. 在后续真实 GUI 下游需求中调用 `$desktop-prepare-gui-support-surfaces`，只选择需要的关于/赞助/更新视觉表面，并验证实际 bundle、构建和零出站默认行为。
2. 品牌价格、联系人、支付码或媒体发生变化时，由品牌负责人确认后同步更新 profile、i18n、manifest、摘要和模板回归；新增视频时同时提供权利证明、字幕、文字稿与 poster。
3. 在后续 Tauri 里程碑候选中取得 xwin、Keychain profile 与最终 DMG Finder 布局的真实前向证据；只有用户另行要求版本或发布准备时才进入 `$desktop-prepare-release`，当前保持 `Unreleased`。
