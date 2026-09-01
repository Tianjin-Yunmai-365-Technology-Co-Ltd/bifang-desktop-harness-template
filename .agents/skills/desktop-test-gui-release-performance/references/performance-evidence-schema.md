# GUI Release 性能证据契约

只在为同一 clean HEAD 生成原生 Release profile Tauri `--no-bundle` 运行探针后读取。本契约不接受 DMG、NSIS、归档或签名容器作为性能探针。

## 探针 manifest 输入

调用 helper 前，构建记录至少提供以下事实：

```json
{
  "interface": "gui",
  "performanceProbe": "example_tool_gui",
  "performanceProbeKind": "tauri-no-bundle-executable",
  "performanceProbeBuildProfile": "release",
  "performanceProbeSha256": "<64 lowercase hex>",
  "sourceCommit": "<40 lowercase hex>",
  "sourceTreeState": "clean",
  "buildMode": "native",
  "platform": "macos",
  "architecture": "aarch64",
  "performanceSelection": "enabled",
  "e2eSelection": "disabled"
}
```

`performanceSelection` 必须为 `enabled`，证明构建流程已经为当前 GUI 发布明确选择或被产品/渠道硬要求执行性能测量。`performanceProbe` 必须是普通 basename，摘要只对应该运行时可执行文件。后续安装包的 `installer`、`archive` 和 `sha256` 是不同事实，不能替代任何 `performanceProbe*` 字段。选择 `disabled` 且无硬要求时不得调用 helper，也不得生成本契约中的探针或证据。

## 原始观测输入

下面是结构示例，不是已执行验证结果。数值数组保存逐次原始观测，helper 才负责计算 median、maximum 和 nearest-rank p95。

```json
{
  "schemaVersion": 1,
  "performanceProbeSha256": "<64 lowercase hex>",
  "performanceProbeKind": "tauri-no-bundle-executable",
  "sourceCommit": "<40 lowercase hex>",
  "sourceTreeState": "clean",
  "platform": "macos",
  "architecture": "aarch64",
  "buildMode": "native",
  "buildProfile": "release",
  "performanceSelection": "enabled",
  "e2eSelection": "disabled",
  "trayEnabled": true,
  "observationAvailable": true,
  "wholeProcessTree": true,
  "probeBytesUnmodified": true,
  "allProcessesRecovered": true,
  "rendererTimingSource": "performance-observer",
  "processSampler": "platform-native whole-tree sampler",
  "warmupRuns": 1,
  "coldStartVisibleUsableMs": [1200, 1250, 1300, 1280, 1240],
  "interactions": [
    {
      "name": "approved-settings-navigation",
      "durationMs": 76,
      "observableResult": true
    }
  ],
  "longTasksMs": [58],
  "idleObservationSeconds": 30,
  "idleCpuPercentOfOneLogicalCore": [1.1, 0.8, 1.3, 0.9, 1.0],
  "hiddenTrayObservationSeconds": 30,
  "hiddenTrayCpuPercentOfOneLogicalCore": [0.5, 0.4, 0.6, 0.4, 0.5],
  "steadyRssMiB": 180,
  "peakRssMiB": 240,
  "rssBeforeCyclesMiB": 180,
  "rssAfterCyclesMiB": 198,
  "navigationInteractionCycles": 20
}
```

实际 `interactions` 至少 20 项。每项名称只描述已批准动作，不得包含用户名、业务载荷或绝对路径；`observableResult` 只有真实界面结果已确认时才为 `true`。`idleCpuPercentOfOneLogicalCore` 和适用的 `hiddenTrayCpuPercentOfOneLogicalCore` 是每个采样时点对 Tauri、WebView 和受管子进程整棵树求和后的原始值，至少各 5 项且覆盖不少于 30 秒。`longTasksMs` 只记录不短于 50 ms 的浏览器 Long Task，没有时使用空数组。

`trayEnabled: false` 时必须省略两个 `hiddenTray*` 字段；启用时二者都必需。任何观测不可用、部分进程树、探针字节变化或未回收进程都必须使用 `false`，helper 会失败关闭。

## Helper 输出与最终 manifest

Helper 输出一个 `schemaVersion: 1`、`kind: gui-release-performance` 的 JSON 对象，保留完整 `observations`、计算后的 `metrics`、固定 `thresholds`、探针绑定和 `failures`。退出码 0 只对应 `status: passed`；退出码 1 对应已原子保存的 `status: failed`。

完整打包 manifest 的 `performanceEvidence` 使用结构化对象而不是安装容器摘要：

```json
{
  "performanceSelection": "enabled",
  "performanceStatus": "passed",
  "performanceThresholdProfile": "gui-release-v1",
  "performanceProbe": "example_tool_gui",
  "performanceProbeSha256": "<probe sha256>",
  "performanceEvidence": {
    "path": "example_tool_gui.performance.json",
    "sourceCommit": "<40 lowercase hex>",
    "platform": "macos",
    "architecture": "aarch64",
    "buildMode": "native",
    "buildProfile": "release"
  },
  "performanceRuntimeBinding": {
    "stagedUnsignedRuntimeSha256": "<same probe sha256>",
    "packagedRuntimePath": "<relative runtime path>",
    "packagedRuntimeSha256": "<final runtime sha256>",
    "binding": "byte-identical"
  }
}
```

打包前 staged unsigned runtime 必须与探针逐字节相同。`binding` 只允许 `byte-identical` 或 `verified-signing-transition`：前者要求最终包内 runtime 也逐字节相同；后者必须另外保留签名前相同摘要、签名后 runtime 摘要和签名验证。最终验收重新定位包内 runtime 核对。容器 SHA-256 永远不能填入 `performanceProbeSha256`。

`waived` 继续引用原始 `failed` 输出，并增加非空原因、确认时间、用户确认摘要、已尝试修复和剩余风险；不得删除失败数组、覆盖失败证据或把 helper 输出改成 `passed`。

当次选择为 `disabled` 且无产品/渠道硬要求时，构建流程跳过整个 no-bundle 性能探针与 helper，最终 manifest 记录 `performanceSelection: disabled`、`performanceStatus: Not run`、非空原因与剩余风险，并且不得生成 `performanceProbe`、`performanceProbeSha256`、`performanceEvidence`、`performanceThresholdProfile`、`performanceWaiver` 或 `performanceRuntimeBinding`。`Not run` 不能覆盖同一候选已经产生的真实 `failed` 证据；已有失败只能修复后重建，或保留失败证据并走 `waived`。
