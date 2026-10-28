# GPUI 侧栏与条件支持页

只在初始化或修改对应机制时读取。当前产品事实优先于中性 renderer；此处保留装配合同，不触发重生成。

- compact/detailed 展示值只消费 `app/design_tokens/mod.rs`，原生颜色来自 Kit 语义主题。compact 保持持续名称且无折叠，detailed 展开图标/名称行左对齐、收起图标居中；折叠控件中心与侧栏边界及 Logo 中心同步、可点击且不占额外行，设备偏好由根实体持有。功能菜单向下增长；底部按已选赞助 → 设置 → 已选关于生成。原生列表页使用 GPUI 的类型化实体/组件设计，不要求 Mantine、TanStack 或 Jotai；跨页面会话视图由进程内实体持有，不能持久化业务数据副本。

- `about_page: enabled` 才生成 `app/about.rs`、枚举/导航/展示状态与词典键；页面包含当前应用、负责人、品牌联系方式、免责声明、双语更新日志入口和真实不可用更新状态。中性基线未实现 GPUI updater，按钮明确反馈 unavailable/零出站，不能伪装已安装 Tauri updater 或检查成功。`build.rs` 在候选工具提供 `HARNESS_GPUI_RELEASE_NOTES_RS` 时，把经过根 schema v2 校验并安全转义的最近十版 `(date, version, features zh/en, bugs zh/en)` 静态条目及原 JSON 字节复制到 Cargo `OUT_DIR`；env 与路径内容变化均触发重编译。普通开发/初始化未提供该变量时明确空状态；窗口线程不读取磁盘、JSON 或网络。禁用关于页不生成不可达页面或翻译，候选仍嵌入并打包原更新日志字节供独立 GPUI 构建 Skill 核对。

- `sponsor_page: enabled` 才生成 [固定原生赞助模板](../assets/gui/src/app/sponsor.rs)、三档权益卡片、独立支付区、完整媒体和词典。赞助页拥有完整背景/留白，父内容槽不生成额外“赞助”标题、顶部底线或内边距；页面 `flex_grow(1)`、`flex_shrink_0` 与父列滚动约束共同防止整页位移。完整居中介绍含维护边界、能力图标与 PC 说明；按中央 `app/design_tokens/sponsor.rs` 的内容断点选择三列/单列与左右/上下支付区。源码布局参考优化过的 gpui-demo，内容来自自含受管品牌源 [assets/brand-support](../assets/brand-support)。固定品牌、价格、联系方式、支付二维码与免责声明为已有批准的产品家族例外；媒体逐字节校验 `media-manifest.json` 大小/SHA-256，不复制参考应用业务、凭据、Logo 或远端地址。二维码展示尺寸来自同一媒体 Token，并保留白色扫描底与原比例，只静态展示，不授权支付自动化。禁用时 sponsor 源码/回归、词典、媒体和运行时引用全部缺席。来源和许可责任见 [SOURCE.md](../assets/brand-support/SOURCE.md)。
