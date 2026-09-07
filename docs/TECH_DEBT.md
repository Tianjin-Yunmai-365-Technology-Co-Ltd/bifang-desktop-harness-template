# 技术债与已知限制

## 当前限制

| 编号 | 项目 | 影响 | 处理条件 | 状态 |
|---|---|---|---|---|
| LIM-001 | 产品规格曾处于 Draft | 在批准前不能视为稳定模板契约 | 已于 2026-07-21 获得项目负责人批准 | Closed |
| LIM-002 | 尚无版本事实来源 | 无法进行版本一致性检查 | Harness 模板已指定根 `Version.md`，下游 Rust 项目已指定根 `Cargo.toml`；`docs/RELEASE.md` 只保存规则 | Closed |
| LIM-003 | 模板曾无自动文档校验命令 | 已新增 `python3 scripts/validate_harness.py` 检查必需文件、Skills、链接和工作流关键门禁 | 后续随新规则同步维护检查项 | Closed |
| LIM-004 | 反馈入口尚未确定 | 用户无法通过持久渠道反馈 | 项目负责人指定真实入口 | Open |
| LIM-005 | P0：实例化仍缺少确定性复制/重置实现 | `$desktop-instantiate-project` 已规定路径、身份、历史与独立 Git 边界，但完整复制和重置仍依赖 Agent 逐步执行，可能在真实下游遗漏字段 | 建立跨平台确定性实例化实现，并在 Harness 内/外目标、父 Git、碰撞、符号链接和失败回滚场景前向验证 | Mitigated |
| LIM-006 | 早期验证记录缺少完整可重跑命令和工具版本 | 已在 2026-07-22 整体验收中合并旧摘要，最新 `docs/VERIFICATION.md` 记录环境、真实命令、失败重跑和未验证范围 | 后续验证继续按当前证据格式维护 | Closed |
| LIM-007 | 跨平台本地构建尚无全部原生宿主验证 | CI 工作流已移除；本地结果的静态门禁不能证明各平台真实构建与运行行为 | 首个下游需要多个平台时在对应原生宿主本地构建并记录真实结果；缺失平台保持 Unverified | Open |
| LIM-008 | 实例化、中性初始化、推荐/自定义策略与事件触发路由的新完整顺序尚未在真实下游项目前向验证 | 指令边界可能遗漏 Draft 占位、名称替换、`scaffold status` 清理或项目特有交接信息；事件触发路由也可能低估风险或遗漏应触发的构建/持久计划/完整验收步骤 | 首个真实下游在无产品目的下完成实例化与中性初始化，分别走推荐/自定义策略，并在日常开发、显式构建与完整验收路径下记录 Token、耗时、误触发与漏检后复核 | Open |
| LIM-009 | 条件开发环境自动安装尚未完成三平台原生前向验证 | Rust、GUI 与 xwin 条件门禁已有 Unix 隔离覆盖，但真实 pnpm/Cargo 软件包仓库、Homebrew、cargo-xwin、Windows PowerShell、权限、PATH、MSVC 和宿主架构仍可能阻断 | 在受控的 Windows、macOS、Linux 干净宿主分别运行仅 Rust、GUI 与适用 xwin 门禁，记录 Rust、Node.js、pnpm、cargo-xwin、MSVC 安装与复验，并验证声明下界可完成真实 NSIS 路线 | Open |
| LIM-010 | 前置 Shell、PowerShell 和 Python 脚本曾缺少完整中文业务注释 | 功能修改已为全部门禁函数、测试辅助函数和测试场景补齐中文业务注释；当前隔离/静态测试共 10 个 | 后续修改继续按 `docs/ENGINEERING_RULES.md` 同步维护 | Closed |
| LIM-011 | Windows MSVC 构建工具自动安装尚未原生前向验证 | 当前只完成 PowerShell 静态契约与 Python 回归检查；真实签名、UAC、组织策略、磁盘、安装返回码 3010 和工作负载复探仍可能阻断 | 在受控干净 Windows 宿主运行缺失安装与复验并记录结构化输出 | Open |
| LIM-012 | 非 CLI 初始化、superpowers 关闭与 Computer Use E2E 尚无真实下游证据 | Skill 与校验器契约成立，但无法证明跨会话策略、适配器组合及真实最终产物交互 | 首个真实下游分别前向验证 TUI/MCP/GUI、`superpowers: disabled` 和最终产物 E2E | Open |
| LIM-013 | 固定 TUI 与 Tauri GUI React 前端技术族尚无真实下游兼容下界证据 | Ratatui 0.30.2、tuirealm/tui-realm-stdlib 4.1.0 已通过元数据筛选但尚未在 Rust 1.95 真实下游证明；React/Mantine/TanStack/Jotai 的候选下界也可能受 Node.js 或 Tauri WebView 约束 | 在真实 TUI 与 GUI 下游分别声明最新兼容稳定完整三段下界，以最低直接版本和项目最低工具链完成代码规范检查、非空测试、生产/发布构建、真实产物启动和关键交互验收，再以正常锁文件固定实际解析结果 | Open |
| LIM-014 | P0：非 CLI 适配器缺少可重复脚手架证据 | TUI/MCP/GUI Skills 只有执行规则和参考资料，尚无真实下游最小脚手架、锁文件、测试与最终产物证据 | 逐接口在隔离下游前向执行；重复稳定后再决定是否把最小结构提升为受测资产 | Open |
| LIM-015 | P1：构建与跨平台发布 Skills 仍未覆盖全部接口 | 已新增 Windows 原生 GUI x64 NSIS 本地试包与发布候选合同，并保留 macOS 原生 DMG、macOS→Windows x64 NSIS xwin、Tauri 安装包清单和 macOS 签名+公证+stapling；但 Windows 原生路线尚无真实下游前向证据，TUI、MCP、Linux GUI 与各接口只读冒烟仍未统一 | 在真实 Windows 下游执行原生 NSIS 构建、安装/运行验收和签名分支，再逐接口按已观察到的共同字段泛化矩阵；在此之前 Windows 运行/安装结论保持 `Unverified`，不得用 xwin 或静态合同代证 | Mitigated |
| LIM-016 | P1：下游 Harness 升级仍缺少真实项目前向证据 | 已交付 `$desktop-upgrade-harness`、来源/目标 Git 绑定、三方基线、最小保护清单、逐文件应用、引导与 28 个基于隔离 Git 夹具的测试；但尚未证明真实身份渲染、混合章节合并、Windows 可移植写入和长期自更新在客户下游稳定 | 至少两个真实下游分别完成有/无旧锁文件的升级并记录冲突、Windows/macOS/Linux 差异和回滚证据后评估关闭 | Mitigated |
| LIM-017 | P1：缺少统一依赖维护与供应链复核 Skill | Rust 与 React 技术族已有准入规则，但版本检查、锁文件升级、许可证/漏洞/废弃依赖和回滚证据仍分散 | 在真实 Cargo+npm 维护任务中固化 `$maintain-dependencies` 的输入、检查、变更和验证契约 | Open |
| LIM-018 | P2：跨接口安全验收入口尚未统一 | MCP 与 GUI 各自约束协议权限、CSP、WebView 能力和状态边界，但缺少一次性交付前威胁面复核和证据矩阵 | 出现首个含外部输入、网络或平台权限的真实产品时，评估新增 `$review-security` 或扩展 `$desktop-verify-delivery` | Open |
| LIM-019 | 一次性下游裁剪与 GUI 身份流程尚无真实前向证据 | 规则和校验器可检查模板契约，但尚未证明真实下游能在自删除后保留正确地图，也未证明三种图标路径与 Tauri 平台资产都可用 | 在首个真实下游分别验证仅 CLI 与 GUI 初始化裁剪；GUI 路径验证自动生成、确定性备选方案、上传标准化中的实际选择和最终平台图标 | Open |
| LIM-020 | 随附的 CLI 测试曾不符合当时声明的最低 Rust 1.90 工具链 rustfmt | 5 处链式调用已按当时工具链机械更新；fmt、锁定依赖检查、Clippy 与 7 个非空测试在 2026-07-29 重跑通过 | 后续修改继续使用根 `Cargo.toml` 当前声明的最低 MSRV 工具链运行格式门禁 | Closed |
| LIM-021 | Subagent Worktree 所有权尚未由宿主机械强制 | 辅助程序已把非重叠 repo-relative 所有权登记、guard 和 committed/uncommitted/untracked postflight 设为默认拒绝门禁，并校验 cwd、Git common-dir、登记 Worktree、分支和符号链接边界；但绕过辅助程序的宿主写入仍不能被仓库脚本阻止 | 在 Codex 宿主或沙箱层强制每个写入型 Subagent 的 cwd 与可写根，并以绕过辅助程序的故意越界场景复验 | Mitigated |
| LIM-022 | Harness 校验器曾超过软拆分阈值 | 单一入口已按 `repository`、工作流、`initialization`、`governance`、发布、`review` 等领域拆分；`initialization` 已进一步拆分为 `initialization_primary_contract.py`、`initialization_repository_contract.py`、`initialization_environment.py` 等独立职责模块 | 后续按领域维护；ADR-20260826-002 已把 Rust 收紧为 400/800、前端收紧为 500/1000，其他人工维护文本保留 500/2000，既有职责拆分保持不回并 | Closed |
| LIM-023 | 产品制品条件签名与 macOS 公证尚无真实前向证据 | 当前已定义批准提交绑定、CLI 固定非交互签名钩子、Tauri Developer ID/公证探测、签名+公证+stapling 一体状态机、失败不降级、最终字节 hash 和结构化清单证据；真实 Apple 公证服务、证书、密钥存储、组织策略、证书过期及 Windows/Linux 签名仍可能阻断 | 在不暴露凭据的受控真实下游验证 macOS 凭据缺失、完整 API Key、完整 Apple ID、签名/公证成功、签名/公证失败与渠道 required 场景，并在 Windows/Linux 补齐原生签名证据 | Open |
| LIM-024 | `$desktop-upgrade-harness` 的命令示例仍使用固定 `python3` 与 POSIX 续行符 | 升级器核心逻辑和隔离测试可跨平台运行，但 Windows PowerShell 用户不能保证直接粘贴文档命令，原生 Windows 计划/应用/记录仍未验证 | 改为当前平台可用的 Python 3 解释器与 shell-neutral 单行或分平台示例，并在 Windows 原生执行完整 plan/apply/record 闭环 | Open |
| LIM-025 | 在本次自动版本管理功能上线前已初始化的下游项目升级后缺少获取 `.harness/version-state.json` 的记录路径 | `$desktop-upgrade-harness` 的所有权清单把该文件标记为 `protected`，明确禁止升级器初始化、重算或覆盖；但能合法运行 `$desktop-manage-version init` 的初始化 Skills 在终端下游收尾时已被删除，因此此类下游升级后没有任何已记录路径能创建状态文件，`$desktop-implement-change` 第 2 步的强制 `plan` 会因状态文件缺失而失败关闭 | 首个此类下游升级时，由项目负责人明确决定并记录 ADR：升级器是否获得一次性 `init` 例外，或改为要求用户手动运行 `$desktop-manage-version init --project-root .` 完成迁移 | Open |
| LIM-026 | `$desktop-rename-project-identity` 未说明改名是否需要经过 `$desktop-manage-version` 分类 | 改名可能触发 ADR/Changelog，但 SKILL.md 未明确改名本身属于 `feature`、`maintenance` 还是完全豁免版本门禁，可能导致同一操作在不同执行下被不一致分类 | 项目负责人明确改名场景下的版本分类规则并记录 ADR，再同步更新 `$desktop-rename-project-identity` SKILL.md | Open |
| LIM-027 | 已启用的 GUI Release 性能门禁尚无三平台真实候选前向证据 | 当次选择启用或产品/渠道要求时，`$desktop-test-gui-release-performance` 已固定 clean HEAD 的 Release no-bundle 探针绑定、整进程树、启动/交互/Long Task/CPU/RSS/回收阈值、失败证据和打包后 runtime 绑定，并由标准库 helper 回归覆盖；但尚未证明不同 WebView、硬件档位、平台原生采样器和签名变换能稳定产生可比观测 | 在受控 Windows、macOS、Linux 原生 Release no-bundle 探针及其最终 bundle 分别运行已启用门禁，记录采样器、硬件基线、重复波动、探针到包内 runtime 的字节/签名绑定、失败修复与显式 waiver 路径；xwin 继续保持 `Unverified` | Open |
| LIM-028 | Codex Task setup 缺少可用的 `clientThreadId` 对账或取消桥 | `create_thread` 可能只返回尚不能传给 thread 工具的 `clientThreadId`；当前可用工具不能用它查询、取消或直接取得最终 `threadId`，宿主 setup 若不晋升会留下 queued Task/Worktree | Harness 以一次派发、`SETUP_PENDING` 有界返回、禁止重复创建/代执行和用户明确要求后才用 `list_threads` 对账缓解；待 Codex 提供稳定查询/取消接口后增加有界恢复路径和真实卡死回归 | Mitigated |
| LIM-029 | Windows 原生完整 Python 回归包含两个宿主不支持的文件系统夹具 | 标准非管理员 Windows 不能创建名称含换行符的文件，也可能没有创建符号链接的权限，因此 `python -B -m unittest discover -s scripts` 会在对应夹具准备阶段报告 2 个环境错误，掩盖其余回归的全绿结果 | 在不放宽生产门禁失败关闭语义的前提下，让测试先探测宿主能力，仅对已证明无法创建的夹具跳过，并在 POSIX 与具备符号链接权限的 Windows CI 持续执行原场景 | Open |

## 记录规则

- 只记录已观察到且当前接受的问题，不收集假想重构。
- 每项必须说明影响和何时值得处理。
- 进入当前范围的项目应转入 `docs/work_plan/` 中日期最新的 `YYYYMMDD_work_plan.md`；完成后从本表关闭，但保留历史。
