# 2026-07-29 Changelog

## Added

- 新增 `$run-parallel-worktrees` 项目 Skill：每个适用任务只有在用户当次明确同意后，才把可独立写入的工作单元分配给独立 Git Worktree 和 `codex/` 分支中的 Subagent。
- 新增确定性 Worktree 助手及 4 个隔离单元测试，支持只读检查、安全创建和仅对已整合干净单元的保守移除；自动 stash、commit、force remove 和删分支均不在能力范围内。
- Harness validator 新增逐任务授权、所有权隔离、前台状态节点、同步等待、安全清理和开发/发布分层验证契约。
- 新增 10 个候选 workflow 门禁单元测试，覆盖正向路径、任意命令注入、验收决策缺失或错序、Unix/Windows 打包与上传保护、打包步骤缺失、非法终态、矩阵 fail-fast 和重型验收非零失败。
- Worktree helper 新增 `guard` 子命令与 6 个边界场景，使总测试增至 10 个；错误 cwd、Git 根、detached/错误分支、空写入清单、绝对越界和符号链接逃逸均稳定拒绝。
- Harness validator 新增领域模块和真实命令入口回归测试，单一入口保持兼容并把相关测试增至 11 个。

## Changed

- Agent 在每个会修改仓库或执行交付工作的任务开始前询问一次是否启用并行模式；授权不跨任务继承。拒绝、未答复或不可安全拆分时继续单 Agent 当前工作树流程。
- Subagent 协作必须向用户公开工作单元、所有权、启动、阻塞、阶段完成、整合与验证状态，并同步等待全部必需结果；不再把整轮协作作为用户不可见的后台工作。
- 普通开发轮次继续运行非空单元测试和变更相关验证；最终产物构建、完整启动冒烟、跨平台候选、归档和人工最终复核延迟到用户发起构建或发布准备时，并在该阶段基于当前源码重新运行。
- Computer Use E2E 及同类重型、交互式或真实环境验收改为发布构建前逐项选择：只有用户当次启用或产品/渠道明确要求才运行；先构建最终产物，再在打包、上传、收集、签名或发布前执行。失败、超时、取消或选择后未执行都会阻断当前任务继续打包。
- 编译、非空单元测试、相关集成/契约、产物存在性和真实产物只读启动冒烟继续作为不可跳过的发布基础门禁；未启用且非硬要求的手动验收记录 `Not run` 与风险后可继续。
- `$instantiate-project`、`$initialize-rust-project` 明确保留下游并行协作 Skill 与逐任务授权入口；规划、实施、验收、发布、五类 adapter Skills、最终产物 E2E、工程规则、Rust 基线、验证和发布文档已同步上述边界。
- 候选 workflow 仅允许手动 dispatch，并在首次构建前要求显式确认；可选重型验收改用仓库维护的固定脚本入口，不再接受任意命令文本。矩阵启用 fail-fast，基础门禁或已选择验收未通过时，Unix、Windows 打包和上传步骤均无法继续。
- 写入型 Subagent 在编辑或暂存前必须从精确单元 Worktree 调用 helper `guard` 并声明目标；helper 检查实际 cwd、Git root、登记 Worktree、分支与符号链接解析后的目标，但不宣称替代宿主 sandbox。
- `scripts/validate_harness.py` 从 1622 行拆为 68 行兼容入口和 6 个领域模块，最大模块 682 行；保持无第三方依赖、历史命令、成功输出和 workflow 测试替换接口。

## Fixed

- 修复 bundled CLI 测试在精确 Rust 1.90 下的 5 处 rustfmt 差异；fmt、locked check、Clippy `-D warnings` 与 7 个非空测试重跑通过，LIM-020 关闭。

## Verification boundary

- Worktree 助手 4 个隔离单元测试、20 个 Skills 的 Skill Creator 校验、Python 编译检查、Harness validator 正向检查和两项隔离负向契约检查已通过。
- 候选 workflow 门禁 10 个测试、开发环境 11 个测试、身份改名 4 个测试和 Worktree 助手 4 个测试全部通过；20 个项目 Skills 全量校验、Python 编译、YAML 解析、31 个必需文件的 Harness validator 与 `git diff --check` 均通过。
- 本次技术债收口中，validator 11 个测试、Worktree helper 10 个测试、开发环境 11 个测试、身份改名 4 个测试、20 个 Skills、完整 Harness validator 和精确 Rust 1.90 fmt/check/Clippy/7 个测试全部通过；LIM-020、LIM-022 关闭，LIM-021 保持 `Mitigated`。
- 本轮不是发布准备；bundled Rust release build、最终产物启动冒烟、Computer Use E2E、真实 GitHub 三平台候选、打包、产物收集、签名、上传、发布和人工最终复核均未运行，不构成 Harness 发布就绪证据。
