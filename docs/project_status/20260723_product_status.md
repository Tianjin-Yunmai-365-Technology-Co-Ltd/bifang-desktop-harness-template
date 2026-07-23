# 项目状态

> 记忆日期：2026-07-23

## 当前阶段

- 产品规格：Approved
- 当前变更：ADR-20260722-013 与 ADR-20260723-001 至 ADR-20260723-005 已实施、验证并完成人工审批
- 当前计划：见 [`docs/work_plan/20260723_work_plan.md`](../work_plan/20260723_work_plan.md)
- 模板本身：无具体产品代码或最终应用产物

## 已完成

- 项目负责人已于 2026-07-23 明确要求“完成所有人工审批”，并完成 ADR-20260722-013、ADR-20260723-001 至 ADR-20260723-005、当前验证证据和剩余风险的人工复核；结论与边界已写入 `docs/VERIFICATION.md`。
- 项目负责人进一步确认其余验证已在其他设备测试通过，并授权批准全部项目；外部设备结果记为 `Passed（项目负责人报告）`，环境、命令、输出与制品校验值尚未归档。
- 人工复核前已重跑当前 macOS 完整验证闭环：18 个 Skills、Harness validator、11 个开发环境隔离测试、精确 Rust 1.90 fmt/check/Clippy、7 个测试、release build 与真实成功/失败 CLI 冒烟均通过。
- 已实施 ADR-20260723-005：CLI/TUI/MCP 使用 Tokio current-thread async 入口，GUI 复用 Tauri Tokio runtime；仅测量确认的 CPU 密集任务才考虑线程边界。
- GUI 本地 build/test/smoke 不再强制签名材料，真实分发渠道签名保持独立门禁；官方 Tauri runtime 与平台签名资料已链接到 GUI baseline。
- `$collect-release-artifacts` 改为安全清理并刷新根 `release/`，初始化及两份 `.gitignore` 均纳入 `/release/`；相关构建和发布 Skills 已统一交接。
- 9 个受影响 Skill 的结构校验、Python 语法、Harness validator、精确 Rust 1.90 asset 的格式/Clippy/7 个测试/release build/真实冒烟和隔离 release 清理收集测试均通过。
- 已实施 ADR-20260723-004：初始化收尾创建唯一的本地基线 commit，并验证独立 top-level、`main`、空 remote 与空 porcelain；实例化完整排除 ADR、Changelog、Product Spec、Work Plan。
- 五个受影响 Skill 的结构校验、Python 语法、Harness validator 和隔离父仓库内独立 Git clean 判定通过；真实完整下游与 Windows/Linux 后续由项目负责人报告在其他设备测试通过，详细证据尚未归档。
- 已实施 ADR-20260723-003：Product Spec、Product Status、Work Plan 已迁移到三个日期目录，并建立同日持续整理、新日继承综合和最新文件为当前事实的索引规则。
- `AGENTS.md`、README、工程规则、12 个直接受影响的项目 Skills、技术债入口和 Harness validator 已同步新路径；旧三份单文件已删除。
- Python 语法、Harness 正向验证和隔离负向验证通过；错误日期命名、缺失合法正文与旧单文件回归均被确定性拒绝。
- 已新增独立 `$check-development-environment`；门禁资产已移出初始化 Skill，Rust 始终检查，GUI/WEB 条件增加 Node.js 与 pnpm。
- 已新增 `$prepare-gui-app-identity`，规定 GUI 首次开发资料和三种图标路径。
- 已在实例化/初始化契约中规定 scaffold 验证后裁剪下游派生能力，并在 `AGENTS.md` 建立永久 Skills/约束地图。
- 已实施 ADR-20260723-001：产品规格、Rust 基线、POSIX/PowerShell 门禁、隔离测试、bundled Cargo asset、候选 workflow、发布检查和技术债统一使用 Rust 1.90 MSRV。
- 已全量复审当前 18 个项目 Skills、UI 元数据、references 和全部当前文档；通用 Skills 从项目声明读取 MSRV，未保留 Rust 1.85 的当前兼容入口。
- Harness validator 已增加 Rust 1.90 一致性硬门禁；11 个前置门禁隔离测试证明 1.90.0 是下限而非精确锁，1.91.0、1.97.1 和未来 2.0.0 stable 均通过，1.89.0 被阻断。
- bundled Rust asset 已在 macOS arm64 使用精确 Rust 1.90.0 完成 locked check、Clippy、7 个测试、release build 与真实成功/失败冒烟。
- 完成全量文档、当前 18 个项目 Skills、UI 元数据、references、开发环境脚本、bundled Rust asset 与候选 workflow 的整体验收。
- 方法论文档已改为验证 Shared Core 与实际所选接口闭环；Rust CLI 发布 Skills 的适用边界、superpowers 重复询问和 Python 可选验证语义已同步。
- 当前描述回归门禁正向与隔离负向检查通过；bundled Rust asset 当前已在 macOS arm64 使用精确 MSRV 1.90 完整验证。
- 下游实例化与直接 Rust 初始化要求独立 Git top-level 和 `main`；新约束将收尾改为唯一的本地初始化基线 commit，并以空 remote 和空 porcelain 状态证明 clean。
- 实例化不再复制或预创建 ADR、Changelog、Product Spec、Work Plan；产品定义、计划和实施 Skills 分别在首次真实使用时创建对应记忆。
- 新增保守 `.gitignore`，Harness validator 已覆盖 Git 命令、top-level/分支/基线提交/clean 状态语义和旧规则回归。
- 当前 18 个项目 Skills 已完成覆盖审计；后续增强按 P0/P1/P2 登记为 LIM-005、LIM-014 至 LIM-019。
- TUI 已固定为 Ratatui + tui-realm + tui-realm-stdlib；WEB 与 GUI 前端已固定为 React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai。
- 三个 adapter Skills、TUI/React/GUI references、产品/工程事实源和 Harness validator 已同步固定技术族、状态职责、版本核验与硬规则例外语义。
- 下游接口模型已改为 CLI/TUI/MCP/GUI/WEB 独立可选，无选择时默认 CLI。
- 新增独立 CLI、TUI、WEB、最终产物 E2E Skills；MCP/GUI 已解除 CLI 前置。
- 初始化 Skill 已加入接口询问、superpowers 持久策略与五类 Skill 分派。
- Windows PowerShell 门禁已加入 MSVC Build Tools 自动安装与复探实现。

## 正在进行

- 当前没有待完成的人工审批。
- ADR-20260723-001 至 ADR-20260723-005 的实现、当前 macOS 验证和人工复核已完成；其他设备验证由项目负责人报告通过，不再构成人工审批缺口。

## 外部验证与仍待归档

- Windows/Linux 原生环境门禁、Windows MSVC、真实 pnpm、真实下游裁剪、GUI 图标路径、非 CLI adapters、多接口组合、固定技术族兼容性、独立 Git 初始化和跨平台 Rust 1.90：`Unverified`（项目负责人报告已在其他设备测试通过，但设备信息与逐项输出尚未归档，未构成可核验证据，不计入 `Passed`）。
- superpowers 跨会话、Computer Use E2E、GUI unsigned build、真实多平台签名门禁和根 `release/` 真实结果收集：`Unverified`（项目负责人报告已在其他设备测试通过，但源码 commit、命令、截图和制品校验值尚未归档，未构成可核验证据，不计入 `Passed`）。
- P0：确定性实例化实现与非 CLI adapter 前向 scaffold 仍待完善。
- P1：跨接口发布、下游 Harness 迁移和统一依赖维护仍待设计。
- P2：跨接口安全验收入口仍待首个真实高权限产品触发。
- 反馈入口尚未确定。

## 下一步

1. 如需形成可独立审计的 `Verified` 结论，归档其他设备的系统版本、源码 commit、逐项命令、结果输出、截图或制品校验值。
2. 在下一自然日验证 Harness 三类项目记忆从前一份综合生成完整新快照。
3. 按 P0/P1/P2 的范围闸门分别规划尚未实现的未来能力。

## 最近交接

- bundled `rust-lib-cli` asset 继续作为默认 CLI 路径证据，不代表下游必须选择 CLI。
- CLI 契约只在接口选择包含 CLI 时适用。
- `docs/AGENT_POLICY.md` 是 superpowers 策略唯一来源；当前 Harness 模板值为 `enabled`，下游初始化必须询问并写入自己的选择。
- 当前工作目录没有 Git 元数据，无法形成 commit 或 dirty-worktree 证据。
- 当前全部人工审批已完成；其他设备测试由项目负责人报告通过，详细证据未归档的边界必须在后续审计中保留。
