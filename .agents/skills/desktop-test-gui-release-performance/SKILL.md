---
name: desktop-test-gui-release-performance
description: 在正式打包前对 clean HEAD 的 Release profile Tauri no-bundle 运行探针执行可追溯性能门禁；所有 GUI 发布都必须运行，且不受本次 E2E 选择影响。
---

# 测试 GUI 发布候选性能

只对正式打包前生成的原生 Release profile Tauri `--no-bundle` 运行探针作性能结论。开发预览、debug、源码调用、模拟窗口、旧探针、安装包容器和 macOS xwin 交叉产物都不能证明真实发布性能。

## 准入

1. 由 GUI 构建流程在同一 clean HEAD 的全量非空测试通过后、任何 bundle/签名/公证/stapling 前调用。当前 E2E 为 `disabled` 仍必须执行本 Skill；最终候选 E2E 发生在打包后，不能替代本探针门禁。
2. 要求 manifest 以普通 basename 明确命名 `performanceProbe`，并包含 `performanceProbeKind: tauri-no-bundle-executable`、`performanceProbeBuildProfile: release`、探针自身 `performanceProbeSha256`、`sourceTreeState: clean`、40 字符 `sourceCommit`、平台、架构与 `buildMode: native`。不得把后续 DMG/NSIS 的 `installer | archive | sha256` 当作探针事实。
3. 只在探针的原生目标平台给出 `passed`。xwin NSIS 保持 `runtimeVerification: Unverified` 与 `performanceStatus: Unverified`；必须转到真实 Windows 从相同 clean HEAD 生成原生 Release 探针，不能用 macOS 采样替代。

## 固定指标

- 先执行至少 1 次不计分预热，再执行恰好 5 次冷启动；从进程启动到主窗口可见且可交互的中位数不超过 2000 ms，最大值不超过 3000 ms。
- 对至少 20 次已批准、具有可观察结果的真实界面交互采样；nearest-rank p95 不超过 100 ms，任何一次必须小于 200 ms。
- 使用浏览器 `PerformanceObserver` 记录全部不短于 50 ms 的 Long Task；任何 Long Task 必须小于 200 ms。
- 对 Tauri 主进程和全部 WebView/受管子进程组成的整棵进程树采样。连续至少 30 秒空闲 CPU 的 p95 不超过一个逻辑核的 5%；启用托盘时，关闭隐藏后的连续至少 30 秒 CPU p95 不超过 2%。
- 稳态整棵进程树 RSS 不超过 300 MiB，峰值不超过 500 MiB。完成至少 20 轮导航/交互后，RSS 增长不得超过 `max(初始 RSS × 15%, 32 MiB)`。
- 每次启动和整轮测量结束都必须关闭或回收全部受管进程。观测不可用、只采父进程、样本不足、超时或无法确认都按失败处理，不能按未发现问题处理。

## 执行

1. 读取 `docs/GUI_APP_PROFILE.md`，解析托盘是否启用。用 Computer Use 操作 no-bundle 探针；进程采样只使用平台原生只读能力和 Python 标准库，不安装全局包、不注入持久遥测、不上传数据。记录使用的进程采样器，并遮盖用户名、绝对本机路径和无关进程参数。
2. 完整阅读 [性能证据契约](references/performance-evidence-schema.md)，在项目外的独立临时目录写入原始 JSON 观测。证据绑定探针摘要/提交、clean 状态、Release profile、本次 E2E 选择、平台/架构、整进程树标记、启动/交互/Long Task、CPU/RSS、循环次数和 `allProcessesRecovered` 进程回收结论。
3. 运行：

   ```text
   python3 .agents/skills/desktop-test-gui-release-performance/scripts/validate_gui_release_performance.py --probe <release-no-bundle-executable> --manifest <build-manifest> --evidence <raw-json> --tray-enabled <enabled|disabled> --output <probe>.performance.json
   ```

   Helper 会重新计算探针摘要、拒绝安装容器字段冒充探针、核对 manifest/观测绑定、计算指标并原子写入 `passed` 或 `failed` 证据。输出已内嵌原始观测；不得把临时原始 JSON 作为 release 目录中的旁路文件。
4. 在后续安装包 manifest 中保留 `performanceStatus`、结构化 `performanceEvidence`、`performanceProbe`、`performanceProbeSha256` 和 `performanceThresholdProfile: gui-release-v1`。只有 helper 返回 0 才能记录 `performanceStatus: passed`；`e2eSelection: disabled` 不能改变该判断。

## 打包后的运行时绑定

1. 性能通过或明确 waiver 后才能打包。把将进入 bundle 的未签名运行时与探针逐字节比较，并把结果写入 `performanceRuntimeBinding`；若打包阶段重新编译、改变配置、依赖、资源接线、启动器或运行行为，必须废弃证据并从新的 clean HEAD/探针重跑。
2. 平台签名会改变运行时字节时，manifest 同时记录签名前与探针相同的运行时摘要、签名后包内运行时路径/摘要和签名验证；未改变时，最终包内运行时必须与探针逐字节相同。`$desktop-verify-delivery` 从最终包重新提取/定位运行时并核对这组绑定。DMG/NSIS 容器摘要只证明容器自身，绝不能写入 `performanceProbeSha256` 或冒充性能绑定。

## 失败、修复与豁免

1. helper 非零、无法观察或任一指标超限时，将探针记录为 `performanceStatus: failed` 并保留完整失败证据。立即返回 `$desktop-implement-change` 定位卡顿、阻塞或资源泄漏，增加本次回归并提交修复，再从新的 clean HEAD 重新构建 no-bundle 探针；新字节必须从头测量，且失败期间不得开始打包。
2. 有界修复仍不能满足门禁时，向用户展示失败指标、平台和剩余风险，询问是否继续打包。没有用户在当前请求中的明确确认就必须停止。
3. 用户明确确认后只能记录 `performanceStatus: waived`；manifest 的 `performanceWaiver` 必须包含非空原因、确认时间、确认摘要和指向原始 `failed` 证据的相对路径。豁免不把失败改写为通过，也不把 xwin 的 `runtimeVerification` 或 `performanceStatus` 改成已验证。

## 完成输出

报告精确 no-bundle 探针与自身摘要、clean 源码提交、原生环境、采样器、5 次启动、至少 20 次交互、Long Task、CPU/RSS/增长、进程回收、证据相对路径和 `passed | failed | waived`。只有 `passed` 或有明确失败证据的 `waived` 才能开始完整打包；其他结果返回开发循环。
