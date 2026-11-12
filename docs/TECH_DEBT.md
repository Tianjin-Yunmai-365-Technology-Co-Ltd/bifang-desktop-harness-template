# 技术债与已知限制

## 当前限制

| 编号 | 项目 | 影响 | 处理条件 | 状态 |
|---|---|---|---|---|
| LIM-004 | 反馈入口尚未确定 | 用户无法通过持久渠道反馈 | 项目负责人指定真实入口 | Open |
| LIM-005 | 完整实例化的原生前向证据仍不完整 | 已接入确认摘要绑定的固定快照准备、身份/策略重置与检查后终端裁剪；终端裁剪的临时文件树矩阵覆盖 CLI、Tauri、NSH desktop 和 NSH mobile/Web，准备回归另覆盖父 Git、碰撞、符号链接、漂移和失败恢复。完整适配器接线、真实 GUI 初始化检查及独立基线仍由原流程编排，隔离回归不证明真实下游初始化成功 | 在实际授权的独立下游及 Windows/macOS/Linux 宿主前向验证完整流程与恢复；本轮按用户要求仅完善 Harness，未操作真实下游 | Mitigated；2026-11-06 确定性工程操作已实现，真实原生演练 Unverified |
| LIM-007 | 跨平台工作流尚无真实运行器前向验证 | 明确请求后的三平台路由、`fail-fast: false`、Node 运行时、批准提交固定、运行器内原子刷新/候选提交、条件签名、精确制品集合与提供方取回已有静态、隔离和内嵌脚本真实文件测试，但托管运行器/Action 更新或真实项目差异仍可能导致候选构建失败 | 首个下游项目启用工作流时运行三平台并记录派发、所有运行器终态、结果取回与本地回退边界 | Open |
| LIM-008 | 实例化、中性初始化、固定 Agent 策略与事件触发路由的新完整顺序尚未在真实下游项目前向验证 | 指令边界可能遗漏 Draft 占位、名称替换、`scaffold status` 清理或项目特有交接信息；事件触发路由也可能低估风险或遗漏应触发的构建/持久计划/完整验收步骤 | 首个真实下游在无产品目的下完成实例化与中性初始化，验证系统平台零问询、非 NSH 三系统默认值、NSH 能力到平台派生、固定策略及首次发布前动作选择，并在日常开发、显式构建与完整验收路径下记录 Token、耗时、误触发与漏检后复核 | Open |
| LIM-009 | 条件开发环境自动安装与低于下界升级尚未完成三平台原生前向验证 | Rust、GUI 与 xwin 条件门禁已有隔离覆盖，但真实 Git/Node.js/pnpm/Cargo 软件包仓库、Homebrew、cargo-xwin、Windows PowerShell、权限、PATH、MSVC、宿主架构和替换正在使用的旧工具仍可能阻断 | 在受控的 Windows、macOS、Linux 宿主分别以缺失和低于下界两类环境运行仅 Rust、GUI 与适用 xwin 门禁，记录 Git、Rust、Node.js、pnpm、cargo-xwin 的 `installed` / `upgraded`、MSVC 的缺失安装与全部复验，另核对 check-only 零写入和上界/预发布/损坏拒绝，并验证声明下界可完成真实 NSIS 路线 | Open |
| LIM-011 | Windows MSVC 构建工具自动安装尚未原生前向验证 | 当前只完成 PowerShell 静态契约与 Node 回归检查；真实签名、UAC、组织策略、磁盘、安装返回码 3010 和工作负载复探仍可能阻断 | 在受控干净 Windows 宿主运行缺失安装与复验并记录结构化输出 | Open |
| LIM-012 | 非 CLI 初始化、superpowers 关闭与 Computer Use E2E 尚无真实下游证据 | Skill 与校验器契约成立，但无法证明跨会话策略、适配器组合及真实最终产物交互 | 首个真实下游分别前向验证 MCP/GUI、`superpowers: disabled` 和最终产物 E2E | Open |
| LIM-013 | 新建 Tauri 模板的最低环境证据仍不完整 | 2026-10-29 已有 macOS arm64 Tauri 下游在 Rust 1.95.0、Node 24.21.0/pnpm 12.4.1 完成精确直接下界、949 项 Rust/494 项前端回归及前端生产构建；该结果不能证明模板 Node 24.0.0 的完整前端工程、Tauri WebView 或三平台候选。TypeScript peer 上界和项目 MSRV 门禁已回灌 | 在新建 GUI 中复用满足兼容下限的 stable 完成正常依赖解析、相关非空测试、生产/发布构建及实际宿主检查；前端最低环境规则继续单独适用；保留已有下游证据的准确环境，未验证项继续独立验证 | Open；2026-10-29 已补部分证据 |
| LIM-014 | P0：非 CLI 适配器缺少可重复脚手架证据 | 非 CLI Skills 已有执行规则、参考资料及受测的中性资产。这些工程回归仍不能替代各接口真实下游的最小脚手架、依赖解析、测试和最终产物前向证据 | 逐接口在隔离下游前向执行；重复稳定后再决定是否把最小结构提升为受测资产 | Open |
| LIM-015 | P1：构建与跨平台发布 Skills 仍未覆盖全部接口 | 已新增 Windows 原生 GUI x64 NSIS 本地试包与发布候选合同，并保留 macOS 原生 DMG、macOS→Windows x64 NSIS xwin、Tauri 安装包清单和 macOS 签名+公证+stapling；Windows 原生路线尚无真实下游前向证据，MCP、Tauri Linux 正式候选与跨接口只读冒烟仍未统一 | 在真实 Windows 下游执行原生 NSIS 构建、安装/运行验收和签名分支，再逐接口按已观察到的共同字段泛化矩阵；在此之前 Windows 运行/安装结论保持 `Unverified`，不得用 xwin 或静态合同代证 | Mitigated |
| LIM-016 | P1：下游 Harness 升级仍缺少真实项目前向证据 | 已交付 `$desktop-upgrade-harness`、来源/目标 Git 绑定、三方基线、最小保护清单、逐文件应用、引导与 28 个基于隔离 Git 夹具的测试；但尚未证明真实身份渲染、混合章节合并、Windows 可移植写入和长期自更新在客户下游稳定 | 至少两个真实下游分别完成有/无旧锁文件的升级并记录冲突、Windows/macOS/Linux 差异和回滚证据后评估关闭 | Mitigated |
| LIM-017 | P1：供应链复核仍缺真实维护证据 | 已抽取 `$desktop-manage-dependencies` 统一准入、下界/特性、锁与最低环境验证；许可证/漏洞/废弃依赖和回滚证据仍待真实 Cargo+npm 维护场景固化 | 复用该入口在真实维护任务补齐供应链与回滚证据，不因文档抽取宣称完成自动化或兼容验证 | Mitigated |
| LIM-018 | P2：跨接口安全验收入口尚未统一 | MCP 与 GUI 各自约束协议权限、CSP、WebView 能力和状态边界，但缺少一次性交付前威胁面复核和证据矩阵 | 出现首个含外部输入、网络或平台权限的真实产品时，评估新增 `$review-security` 或扩展 `$desktop-verify-delivery` | Open |
| LIM-019 | 一次性下游裁剪与 GUI 身份流程尚无真实前向证据 | 规则和校验器可检查模板契约，但尚未证明真实下游能在自删除后保留正确地图，也未证明当前三候选 Logo 选择流程与 Tauri 平台资产都可用 | 在首个真实下游分别验证仅 CLI 与 GUI 初始化裁剪；GUI 路径验证三个原始候选的稳定预览、用户选择、仅所选项的后置验证/标准化与最终平台图标 | Open |
| LIM-021 | Subagent Worktree 所有权尚未由宿主机械强制 | 辅助程序已把非重叠 repo-relative 所有权登记、guard 和 committed/uncommitted/untracked postflight 设为默认拒绝门禁，并校验 cwd、Git common-dir、登记 Worktree、分支和符号链接边界；但绕过辅助程序的宿主写入仍不能被仓库脚本阻止 | 在 Codex 宿主或沙箱层强制每个写入型 Subagent 的 cwd 与可写根，并以绕过辅助程序的故意越界场景复验 | Mitigated |
| LIM-023 | 产品制品条件签名与 macOS 公证尚无真实前向证据 | 当前已定义批准提交绑定、CLI 固定非交互签名钩子、Tauri Developer ID/公证探测、签名+公证+stapling 一体状态机、失败不降级、最终字节 hash 和结构化清单证据；真实 Apple 公证服务、证书、密钥存储、组织策略、证书过期及 Windows/Linux 签名仍可能阻断 | 在不暴露凭据的受控真实下游验证 macOS 凭据缺失、完整 API Key、完整 Apple ID、签名/公证成功、签名/公证失败与渠道 required 场景，并在 Windows/Linux 补齐原生签名证据 | Open |
| LIM-024 | `$desktop-upgrade-harness` 的命令示例曾依赖宿主特定解释器选择与 POSIX 续行符 | Skill 已统一为跨平台 `node` 单行命令，plan/apply/record 不再选择额外解释器或依赖 shell 续行 | 在 Windows 原生执行一次完整 plan/apply/record 闭环，补充真实宿主证据；不得因未运行而恢复宿主特定命令 | Mitigated；2026-09-23 Node 迁移完成后仍待 Windows 原生闭环 |
| LIM-028 | Codex Task setup 缺少可用的 `clientThreadId` 对账或取消桥 | `create_thread` 可能只返回尚不能传给 thread 工具的 `clientThreadId`；当前可用工具不能用它查询、取消或直接取得最终 `threadId`，宿主 setup 若不晋升会留下 queued Task/Worktree | Harness 以一次派发、`SETUP_PENDING` 有界返回、禁止重复创建/代执行和用户明确要求后才用 `list_threads` 对账缓解；待 Codex 提供稳定查询/取消接口后增加有界恢复路径和真实卡死回归 | Mitigated |
| LIM-029 | Windows 原生完整文件系统回归曾以平台名称预判两个夹具 | 换行文件名与符号链接 Node 回归先真实创建对象，只在宿主返回明确不支持或权限错误时按精确原因 skip；创建成功必须确认真实 symlink 并继续执行原断言，生产门禁语义未放宽 | 在标准非管理员 Windows 与具备符号链接权限的 Windows CI 各运行一次完整 Node 套件，保留能力差异证据 | Mitigated；2026-09-23 平台预判冲突已解决，Windows 原生复验 Not run |
| LIM-030 | GPUI 开发循环取消回归曾遇到进程组探测 EPERM | 2026-10-10 首轮完整 Node 回归中，编译取消用例在 Cargo close 回调的 `process.kill(-pid, 0)` 抛出 EPERM；精确用例随后 4 次及完整回归重跑均通过，尚无法确认当时的进程组状态和底层原因 | 再次出现时记录 owned PID、进程组与宿主权限证据，区分关闭竞态和真实权限拒绝；不得把 EPERM 当作进程不存在或回收成功 | Retired；GPUI 路径已移除 |
| LIM-031 | Tauri deb 原生与完整元数据证据待补 | 已实现 deb/checksum/inspection 整组目录提交、旧集合保留、1 MiB 流式 hash、dpkg 五分钟/16 MiB 预算及 CLI 中断清理；相关文件/真实 Node 进程回归通过。当前仍仅适用可信本机输出及默认 target 布局，payload 比较不证明 uid/gid、硬链接拓扑、xattr/ACL，macOS 上未执行真实 dpkg 链路 | 在 Linux 原生执行保留的实际解包/重打包/规范化闭环；扩展特殊 ownership、候选或不可信包处理前另补元数据与安全取证，不把当前集合提交视为安装/运行或断电持久性证明 | Mitigated；2026-11-06 工程缺陷已修复，Linux 原生复验 Not run |
| LIM-032 | GPUI 最新兼容链仍含上游 block 0.1.6 的 future-incompatibility 警告 | 2026-10-29 在 Rust 1.98.1 检查 Kit 0.8.1 最小/全能力组合时编译通过，但 Cargo 提示该传递库未来编译器会拒绝部分代码；本轮不改写上游或强制不兼容传递版本 | 上游 GPUI/Apple 依赖链提供兼容修复后更新并使用满足兼容下限的 stable 重跑正常解析及原生编译；更高工具链实际失败时再按真实诊断处理 | Retired；GPUI 路径已移除 |
| LIM-033 | GPUI Windows Job 原生回收证据待补 | 开发循环已改为 Windows 10+/Server 2016+ 匿名 Job 控制器，创建时原子归属、最后句柄关闭回收，leader 退出后保持所有权；协议/参数/超时回归与真实 POSIX 开发循环通过，但当前 macOS 不能证明 Win32 API、嵌套 Job 与宿主权限行为 | 在 Windows 原生执行已保留的后代脱离标准流、leader 先退出、重编译、控制 EOF、控制器退出及清理失败回归；不得以协议夹具或 POSIX 结果代证 | Retired；GPUI 路径已移除（旧实现的 Windows 原生场景未复核） |
| LIM-034 | NSH TUI 暂不可用 | 正式 v0.4.0 无 TUI，先前固定 main 预览提交不作为当前支持工具链；初始化、接入、升级、构建和验收均须对 `tui` 失败关闭。历史预览代码保留不代表功能可用 | 待上游正式发布应用专属 TUI release runner/package 后，核对固定 tag、CLI/Cargo 同源、Mixed native module 和完整包，并在 macOS/Windows/Linux 目标终端分别执行运行与候选 E2E，才重新评估开放 | Open |

## 记录规则

- 只记录已观察到且当前接受的问题，不收集假想重构。
- 每项必须说明影响和何时值得处理。
- 进入当前范围后按 `$desktop-implement-change` 直接实施；仅在持久计划独立触发时转入 `docs/work_plan/` 的当前计划。完成后从本表删除，历史由 Git 保留。
