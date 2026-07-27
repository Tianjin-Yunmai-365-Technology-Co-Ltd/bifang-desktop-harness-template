# 技术债与已知限制

## 当前限制

| ID | 项目 | 影响 | 处理条件 | 状态 |
|---|---|---|---|---|
| LIM-001 | 产品规格曾处于 Draft | 在批准前不能视为稳定模板契约 | 已于 2026-07-21 获得项目负责人批准 | Closed |
| LIM-002 | 尚无版本事实来源 | 无法进行版本一致性检查 | Harness 模板已指定根 `Version.md`，下游 Rust 项目已指定根 `Cargo.toml`；`docs/RELEASE.md` 只保存规则 | Closed |
| LIM-003 | 模板曾无自动文档校验命令 | 已新增 `python3 scripts/validate_harness.py` 检查必需文件、Skills、链接和 workflow 关键门禁 | 后续随新规则同步维护检查项 | Closed |
| LIM-004 | 反馈入口尚未确定 | 用户无法通过持久渠道反馈 | 项目负责人指定真实入口 | Open |
| LIM-005 | P0：实例化仍缺少确定性复制/重置实现 | `$instantiate-project` 已规定路径、身份、历史与独立 Git 边界，但完整复制和重置仍依赖 Agent 逐步执行，可能在真实下游遗漏字段 | 建立跨平台确定性实例化实现，并在 Harness 内/外目标、父 Git、碰撞、符号链接和失败回滚场景前向验证 | Mitigated |
| LIM-006 | 早期验证记录缺少完整可重跑命令和工具版本 | 已在 2026-07-22 整体验收中合并旧摘要，最新 `docs/VERIFICATION.md` 记录环境、真实命令、失败重跑和未验证范围 | 后续验证继续按当前证据格式维护 | Closed |
| LIM-007 | 跨平台 workflow 只完成静态验证 | 托管 runner/action 更新或真实项目差异可能导致候选构建失败 | 首个下游项目启用 workflow 时运行三平台并记录 | Open |
| LIM-008 | 实例化、中性初始化、产品定义与实施的新完整顺序尚未在真实下游项目前向验证 | 指令边界可能遗漏 Draft 占位、名称替换、`scaffold status` 清理或项目特有交接信息 | 首个真实下游项目在不提供产品目的的前提下完成实例化与中性初始化，再运行产品定义、实施和验收后复核 | Open |
| LIM-009 | 条件开发环境自动安装尚未完成三平台原生前向验证 | Rust-only 与 GUI/WEB 条件门禁已有 Unix 隔离覆盖，但真实 pnpm registry、Windows PowerShell、权限、PATH、MSVC 和宿主架构仍可能阻断 | 在受控的 Windows、macOS、Linux 干净宿主分别运行 Rust-only 与 GUI/WEB 门禁并记录 Rust、Node.js、pnpm、MSVC 安装与复验 | Open |
| LIM-010 | prerequisite Shell、PowerShell 和 Python 脚本曾缺少完整中文业务注释 | 功能修改已为全部门禁函数、测试辅助函数和测试场景补齐中文业务注释；当前隔离/静态测试共 10 个 | 后续修改继续按 `docs/ENGINEERING_RULES.md` 同步维护 | Closed |
| LIM-011 | Windows MSVC Build Tools 自动安装尚未原生前向验证 | 当前只完成 PowerShell 静态契约与 Python 回归检查；真实签名、UAC、组织策略、磁盘、安装返回码 3010 和 workload 复探仍可能阻断 | 在受控干净 Windows 宿主运行缺失安装与复验并记录结构化输出 | Open |
| LIM-012 | 非 CLI 初始化、superpowers 关闭与 Computer Use E2E 尚无真实下游证据 | Skill 与 validator 契约成立，但无法证明跨会话策略、adapter 组合及真实最终产物交互 | 首个真实下游分别前向验证 TUI/MCP/GUI/WEB、`superpowers: disabled` 和最终产物 E2E | Open |
| LIM-013 | 固定 TUI 与 React 前端技术族尚无真实下游兼容证据 | 最新 Ratatui/tui-realm/tui-realm-stdlib 组合可能与 Rust 1.90 不兼容；React/Mantine/TanStack/Jotai 组合也可能受 Node、浏览器或 Tauri WebView 约束 | 在真实 TUI、WEB 与 GUI 下游分别解析并锁定最新兼容稳定版，完成 lint、非空测试、production/release 构建、真实产物启动和关键交互验收 | Open |
| LIM-014 | P0：非 CLI adapter 缺少可重复 scaffold 证据 | TUI/MCP/GUI/WEB Skills 只有执行规则和 references，尚无真实下游最小 scaffold、锁文件、测试与最终产物证据 | 逐接口在隔离下游前向执行；重复稳定后再决定是否把最小结构提升为受测 assets | Open |
| LIM-015 | P1：构建与跨平台发布 Skills 偏向 CLI | `$build-rust-release` 和候选 workflow 主要定位单一 CLI binary，不能完整描述 TUI、MCP host、Tauri installer 或 WEB bundle/server | 先定义统一的接口产物清单和每类只读冒烟，再泛化现有 Skills 或拆分接口发布 Skills | Open |
| LIM-016 | P1：缺少下游 Harness 迁移 Skill | 模板硬规则、事实源或 Skills 更新后，既有下游没有可审计的差异检测、选择性合并和冲突处理流程 | 至少两个真实下游出现升级需求后设计 `$upgrade-harness`，保留项目决策并拒绝覆盖本地修改 | Open |
| LIM-017 | P1：缺少统一依赖维护与供应链复核 Skill | Rust 与 React 技术族已有准入规则，但版本检查、锁文件升级、许可证/漏洞/废弃依赖和回滚证据仍分散 | 在真实 Cargo+npm 维护任务中固化 `$maintain-dependencies` 的输入、检查、变更和验证契约 | Open |
| LIM-018 | P2：跨接口安全验收入口尚未统一 | MCP、WEB、GUI 各自约束权限、CSP、网络和状态边界，但缺少一次性交付前威胁面复核和证据矩阵 | 出现首个含外部输入、网络或平台权限的真实产品时，评估新增 `$review-security` 或扩展 `$verify-delivery` | Open |
| LIM-019 | 一次性下游裁剪与 GUI identity 流程尚无真实前向证据 | 规则和 validator 可检查模板契约，但尚未证明真实下游能在自删除后保留正确地图，也未证明三种图标路径与 Tauri 平台资产都可用 | 在首个真实下游分别验证 CLI-only 与 GUI 初始化裁剪；GUI 路径验证自动生成、Plan B、上传标准化中的实际选择和最终平台图标 | Open |
| LIM-020 | bundled CLI 测试不符合精确 Rust 1.90 rustfmt | 2026-07-27 验收发现 `example_tool_cli/tests/cli.rs` 的 5 处链式调用换行导致 `cargo fmt --check` 返回 1；check、Clippy、7 个测试、release build 和真实冒烟均通过，但 Harness 完整格式门槛失败 | 在独立维护变更中按 Rust 1.90 rustfmt 更新该文件，重跑完整 asset 与 Harness 验证，并确认不覆盖用户工作 | Open |

## 记录规则

- 只记录已观察到且当前接受的问题，不收集假想重构。
- 每项必须说明影响和何时值得处理。
- 进入当前范围的项目应转入 `docs/work_plan/` 中日期最新的 `YYYYMMDD_work_plan.md`；完成后从本表关闭，但保留历史。
