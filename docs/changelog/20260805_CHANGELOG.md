# 2026-08-05 变更记录

## 新增

- 新增可随 `$implement-change` 保留到下游的 `check_core_first.py`：基于只读 `cargo metadata` 检查唯一共享 core、adapter 直接依赖 core、core 反向依赖、adapter 横向依赖和 core 接口框架依赖；检查真实 workspace package 身份与可达闭包，拒绝 registry 同名 crate 和中间 workspace crate 绕过，同时支持依赖重命名与 target-specific 依赖，不用代码行数或分支数量判断薄层。
- Harness validator 新增独立 core-first 契约模块，校验权威规则、执行 Skills、四类 adapter 提示、中性 Rust 资产和确定性 TOML 依赖方向；动态读取中性资产全部 workspace members，并新增正负向回归覆盖规则删除、重命名依赖、反向/横向依赖、接口框架、同名 registry、目标特定和中间 crate 绕过。
- 新增可传播到下游的统一文件行数检查器及专属回归：使用 Git NUL 清单覆盖已跟踪和未忽略文本，400 行通过、401 行失败；Git/读取/UTF-8 判断错误失败关闭，工具生成锁文件按封闭分类排除。
- Harness validator 把单文件 400 行检查升级为硬失败门禁；升级器要求候选完整传播行数与 core-first 两个检查器及各自测试。

## 变更

- Harness 当前工程版本从 `202607301002` 提升为上海时区时间版本 `202608051301`；发布状态继续保持 `Unreleased`，本次不创建标签、源码归档或正式发布。
- Core-first 现在是所有下游的强制架构规则：接口/宿主无关的业务规则、领域校验、默认值、用例编排、状态转换、稳定错误、权限和持久化策略必须由 core 实现并测试，即使当前只有一个 adapter 也同样适用。
- CLI/TUI/MCP/GUI 统一收窄为薄适配层，只拥有运行时装配、语法/协议结构、展示/纯交互状态、调用 core 和结果映射；所有公开业务操作都要记录“adapter 操作 → core API → core 测试”。
- 明确系统托盘、窗口/WebView、通知、自动启动、终端焦点/按键/恢复、MCP stdio 和 CLI 退出码等接口/平台机制留在对应 adapter，但其触发的业务效果仍调用 core。输入检查也明确拆分为 adapter 的协议结构检查与 core 的领域语义判断。
- 产品定义、计划、实施、验收、初始化和四类 adapter Skills 及默认提示已经同步 core-first；文件和外部命令能力参考也禁止在不同 adapter 重复业务流程。
- 项目记忆改为严格按独立事件触发：普通缺陷修复、纯重构、格式整理、测试补强和内部清理只在最终回复与测试/CI 中报告；复杂度仍可独立建立 Work Plan，安全、发布、长期决定和审计门禁保持有效。
- Changelog 不再使用普通缺陷修复分类；仅修复或纯重构的 PATCH 发布允许没有 Changelog，但仍必须保留版本、源码提交、候选清单、Verification 和适用人工复核。
- Verification 与 Harness 方法论改为稳定根索引加职责分卷；历史验证失败、人工签署和方法论正文完整保留，初始化与升级所有权同步覆盖分卷目录。

## 验证

- 默认 Harness Python 回归 111 条通过，其中包含行数/core-first 检查器专属回归、项目记忆正反向规则、文档分卷事实守恒和既有治理/发布/工作流门禁；28 条 Harness 升级器隔离 Git 回归另行通过。
- 统一行数检查器扫描全部 Git 可见人工维护文本，当前零个文件超过 400 行；400/401、隐藏/空格/换行路径、已跟踪/未忽略文件、二进制、符号链接、生成锁文件、Git/读取失败和退出码 0/1/2 均有回归。
- 中性 Rust 资产在精确 Rust 1.90.0 下通过 `cargo fmt --all -- --check`、Clippy `-D warnings` 和 7 条非空测试；core-first 检查器对真实资产依赖图通过。
- 完整 Harness validator 通过 88 个必需文件、21 个 Skills、Markdown 链接、初始化/升级/发布既有门禁，以及项目记忆、400 行和 core-first 门禁；软行数提示已移除，当前无非阻断审查警告。
- 未生成或验证真实下游的 TUI/MCP/GUI、Windows/Linux 行为、候选、冒烟、E2E 或发布物；这些范围保持 `Unverified`。
