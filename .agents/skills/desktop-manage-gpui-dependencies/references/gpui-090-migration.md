# GPUI Kit 0.9.0 迁移参考

核对日期：2026-11-05。本参考供明确采用 Kit 0.9.0 的依赖任务按需读取，记录官方发布源码中的变化和可复用的兼容检查方法。中性 renderer 的当前声明仍取 [依赖矩阵](dependency-matrix.md)；本文件不修改生成器默认值、产品设计或任何下游的兼容状态。

## 依赖与平台条件

Kit 0.9.0 的默认 features 是 `component` 与 `assets`，普通应用可通过 `gpui_kit::*` 使用匹配的 GPUI 重导出，无需额外加入一份 GPUI。`test-support` 只放 GUI 成员的 dev-dependencies，不扩散到生产依赖或 core。GPUI Fast 是可选后端，采用 0.9.0 不要求同时切换渲染后端。来源：[Kit manifest](https://github.com/longbridge/gpui-kit/blob/v0.9.0/crates/kit/Cargo.toml)、[安装指南](https://gpui-kit.com/docs/installation/)。

默认 GPUI snapshot 的 core/platform/web、宏等对应族由 Kit 发布清单精确约束为 `=0.3.11`。它们不能各自漂移，也不能为统一外观版本强行合并互不兼容的传递 API 族。具体成员、平台 features 和额外依赖以目标项目实际解析图及 [Kit workspace manifest](https://github.com/longbridge/gpui-kit/blob/v0.9.0/Cargo.toml)为准；默认后端变化见 [0.9.0 发布说明](https://github.com/longbridge/gpui-kit/releases/tag/v0.9.0)。

官方 0.9.0 安装指南列明 macOS 15+、Windows 10+；同步检查目标项目的打包最低系统声明。若保留更低声明，必须有独立的目标系统依据，当前新系统宿主通过不能证明旧系统兼容。指南中的 Rust 1.92+ 针对官方仓库当前锁定图（Linux 依赖包含 `oo7 0.6.0`）；Kit 0.9.0 包清单本身没有声明 `rust-version`。这不替代下游自己的 MSRV，也不代表用当前 stable 通过即已实测最低编译器。来源：[安装指南的平台与 Rust 条件](https://gpui-kit.com/docs/installation/)、[Kit manifest](https://github.com/longbridge/gpui-kit/blob/v0.9.0/crates/kit/Cargo.toml)。

先区分清单范围、当次 resolved 版本和 path/vendor 内容身份。锁策略为 `ignored` 时，一次 Cargo.lock 解析不是永久 pin；若特定补丁只支持一个兼容区间，范围限制必须对应真实锚点和回归证据，不把它推广为所有模板依赖一律精确锁定。

## 应用 API 与测试观察点

| 触点 | 0.9.0 / 默认 0.3.11 的处理 |
| --- | --- |
| 主题构造 | `Theme`、`ThemeToken`、`ThemeColor`、`ThemeConfig`、`MotionTokens` 等公共主题结构带 `#[non_exhaustive]`。跨 crate 使用默认值或公开构造器后赋字段；带 `..Default::default()` 的结构体字面量仍不可用。`ThemeToken::new(color, background)` 接收 `Hsla` 与 `Background`。 |
| 滚动事件 | 使用 `ScrollEvent` 与 `on_scroll`。`ScrollWheelEvent` / `on_scroll_wheel` 是弃用兼容入口；新事件增加 `source`，默认 `ScrollSource::Pointer` 同时涵盖滚轮和触控板，`Touch` 为独立类别。完整事件字面量需补字段或以默认值构造；保留 Bubble、命中和传播语义。 |
| 静态快捷键 | `Keystroke::parse(source: &'static str)` 返回 `Result<Self, InvalidKeystrokeError>`；`KeyBinding::new<A: Action>(keystrokes: &'static str, action: A, context: Option<&str>)` 返回 `Self`，解析错误会 panic。只用于静态输入与明确修饰键。 |
| 动态快捷键 | `Keystroke::parse_with_os(source: &str, os: OperatingSystem)` 返回同类 `Result`；需要宿主语义或 `secondary-` 时传真实 OS。绑定使用 `KeyBinding::load`，按源码传入 action、已解析 context predicate、键位等价选择、action input 与 `&App`，处理返回错误。0.3.11 没有 `Keystroke::try_parse`，不得泄漏字符串来满足静态生命周期。 |
| Dialog 几何观察 | 外框 ElementId 从旧整数 `0usize` 变为 `"surface"`，可在 `"dialog"` 下定位 surface。ElementId 路径中的 `"dialog"` 覆盖窗口，`"dialog-0"` 属于焦点陷阱范围；surface 同时设置独立的 `debug_selector("dialog-{layer_ix}")`，官方测试使用 `debug_bounds("dialog-0")` 获取首层外框。区分 ElementId 与 debug selector，保留原边界、尺寸、居中及严格容差断言。 |

对应官方源码：[Theme](https://github.com/longbridge/gpui-kit/blob/v0.9.0/crates/component/src/theme/mod.rs)、[ThemeToken](https://github.com/longbridge/gpui-kit/blob/v0.9.0/crates/component/src/theme/theme_color.rs)、[Dialog](https://github.com/longbridge/gpui-kit/blob/v0.9.0/crates/component/src/dialog/dialog.rs)。GPUI 0.3.11 发布包记录的 Zed 来源为 `f816e1f9263e3a8ef63c4baaa02e1441ce1c6038`，可对照 [Keystroke](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/platform/keystroke.rs)、[KeyBinding](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/keymap/binding.rs)、[ScrollEvent](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/interactive.rs)与 [div 事件入口](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/elements/div.rs)；补丁仍以实际发布归档及其摘要为权威。

## 已有 vendor 补丁的联合迁移

仅已有本地兼容层或真实问题需要时采用，继续遵守 [兼容补丁合同](compatibility.md)。升级原样归档、版本元数据、文件集合、许可证和 SHA-256 后，逐项重新生成并核对；锚点不匹配即停止，不修改 registry 缓存，不手改生成物，也不放宽替换规则。

- 把 Scene 公共结构、Apple/Metal、Windows/HLSL、WGPU/WGSL 的字段、对齐、常量和 Shader 当作同一 ABI 合同迁移；字体、命中与 AX 补丁同时重新定位，不能只更新根 core 包。
- 0.3.11 的 view cache 已记录 opacity，并在判等中按位比较。合并旧 subtree/scope 缓存补丁时保留新增字段、比较、读取和写回；不能把旧结构整段覆盖回去而丢失官方失效条件。
- 旧 `tile.tile_id` 上下文已变化，按当前结构核对 `tile.texture_id.index`。atlas tile、纹理、Scene 与提交中的 GPU 工作分别拥有寿命，不能由字段替换推断资源回收正确。
- Windows 的 debug 运行时 Shader 与 release FXC 路径并非 0.3.11 新增。两条编译路径和 resize/device-loss 的缓存清理都须保留，macOS 编译不验证这些路径的 GPU 行为。
- vendor manifest 显式列出的集成测试 wrapper 必须真实存在并进入生成文件集合。`include!` 输入若首行含模块内文档 `//!`，须按已有 crate-root 文档边界调整受管生成输入或 wrapper，避免 E0753；不要直接编辑原样归档或生成输出来消除报错。

## DPI 与文件系统回归

GPUI 0.3.8 与 0.3.11 的 `round_half_toward_zero` 使用相同公式：`(value.abs() - 0.5).ceil().copysign(value)`。显式尺寸先乘 DPI、吸附设备像素再除 DPI；布局完成后绝对边界两端还会分别吸附。不能把这个行为替换为通常的 `.round()`，也不能把显式尺寸只视为未量化的逻辑像素。0.3.11 来源：[舍入工具](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/util.rs)、[Taffy 尺寸与边界](https://github.com/zed-industries/zed/blob/f816e1f9263e3a8ef63c4baaa02e1441ce1c6038/crates/gpui/src/taffy.rs)。

规范算例：125% DPI 下，30 逻辑像素先得到 37.5 设备像素，半值向零舍入为 37，回到 29.6 逻辑像素。几何测试应从已知输入、独立舍入公式与变换次序推导期望值，再与实际观察比较；不得把被测生产变换当作预期值来源，或扩大容差来掩盖错误。

macOS 临时目录可能经 `/var` 等符号链接进入真实目录。受限路径测试先 canonicalize 独立临时根，再构造允许的 fixture；生产环境拒绝符号链接、路径越界或不受信目标的策略保持原要求，不能为了测试通过而放宽。

## 证据边界

按本次触及内容运行真实、非空回归，分别报告来源与生成摘要、API/ABI 编译、布局和输入行为、目标后端 GPU 行为及最终产物。某一宿主的编译或单测不代表 Windows GPU、其他平台、真实窗口、安装包、最终候选或最低 MSRV 已验证；未执行范围标为 `Unverified`。下游产品的版本、参数、源码与验收原始记录继续保存在下游，不回填到本参考。
