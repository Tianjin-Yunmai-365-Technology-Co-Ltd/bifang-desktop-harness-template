# 2026-07-30 Changelog

## Changed

- 独立 WEB adapter 已从 Harness 整体移除：不再提供 `$add-web-adapter`、WEB 初始化选项、`_web` 目录、WEB 环境触发或独立发布/E2E入口。
- Tauri GUI 的 Web 前端技术选型保持不变；React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai、pnpm 和 WebView 约束已迁入 GUI Skill 自有 baseline。
- 开发环境门禁仅在 GUI 选择时要求 Node.js 与 pnpm，并显式拒绝已移除的 `WEB` 参数。
- Harness validator 当前要求 19 个 Skills、四类接口和 GUI 自有 React baseline，并以负向契约阻止独立 WEB 回归。
- 并行 Worktree + Subagent 授权询问进一步收窄到仅代码/实现变更阶段。
- 产品定义、范围设计、实施计划设计以及既有非编码阶段不再触发并行模式询问。
- `$define-product` 与 `$plan-change` 固定单 Agent，`$implement-change` 保留编码前门禁；`$run-parallel-worktrees` 只消费当前编码任务的明确授权。
- Harness 当前版本从旧 `1.0.0` 迁移为上海时区 `YYYYMMDDHHMM` 时间版本 `202607301002`；下游产品仍使用独立 SemVer。
- Harness validator 校验仅编码阶段触发、时间版本合法性与跨事实源一致性，并拒绝旧规则回归。

## Unchanged

- 授权仍不跨任务继承；用户拒绝、未答复或任务不可安全拆分时继续单 Agent。
- 获批并行任务仍使用独立 Worktree/`codex/` 分支、写入目标 guard、前台状态更新、同步等待与保守清理。
- 开发验证、发布构建、手动验收、许可证和现有技术债状态不变；版本仍为 `Unreleased`。

## Verification boundary

- 独立 WEB 移除开发轮次通过环境门禁 12 个测试、validator 15 个测试、Python 编译、POSIX shell 语法、完整 Harness validator 和当前入口残留审计；真实 Tauri 构建与其他平台仍为 `Unverified`。
- 14 个 validator 单元测试、Python 编译、20 个 Skills 结构校验、Worktree helper 10 个测试、开发环境门禁 11 个测试、身份改名 4 个测试、完整 Harness validator 和 `git diff --check` 通过。
- 项目负责人已人工批准当前工作树全部变更；当前范围为 `Verified`，Harness 整体仍为 `Partially verified`。
- 本次不是最终产物构建或正式发布；release build、最终产物冒烟、Computer Use E2E、跨平台候选、打包、签名、tag 和发布均为 `Not run`。
