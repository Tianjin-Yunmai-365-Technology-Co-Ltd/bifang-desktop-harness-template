---
name: desktop-add-gui-updater
description: 为所有 GUI 基线接入官方 updater 插件、零出站默认状态与签名发布门禁；这是固定能力，不单独询问用户。
---

# 增加 GUI 更新能力基线

该 Skill 是所有 Tauri GUI 的固定更新基线。它负责把官方 `tauri-plugin-updater = "2.11.0"`、`NotConfigured` 零出站状态机、签名制品约束和后续产品更新接线的边界固定下来。

## 工作流程

1. 只在已选择 GUI 的终端下游使用；初始化不询问该能力，profile 不记录开关。根 `[workspace.dependencies]` 声明 `tauri-plugin-updater = "2.11.0"`，GUI member 只以 `workspace = true` 继承。
2. 在中央 Builder 顺序中恰好注册一次 `.plugin(tauri_plugin_updater::Builder::new().build())`。中性初始化的 `tauri.conf.json` 必须显式写入 `plugins.updater = { endpoints: [], pubkey: "" }`，因为配置缺席会在当前插件版本被反序列化为 `null` 并使真实进程启动失败；空数组与空公钥只建立可启动的未配置状态，不提供 endpoint、签名事实或出站能力。该能力默认 Rust-only：不得安装 `@tauri-apps/plugin-updater`，不得给 WebView `updater:*` ACL；`about_page = enabled` 时把受限 `check_for_updates` command 合入唯一 `generate_handler!`，未选择关于页时不向 WebView 暴露该入口。
3. 建立应用拥有的 `UpdateController`。没有全部受保护的 endpoint、公钥、channel、target 与 arch 事实时，状态固定为 `NotConfigured`；任何检查入口必须先返回该状态，不能调用官方 `.check()`，所以首次启动与手动点击都保持零出站且不能误报“已是最新版”。
4. 配置齐全后，检查任务必须 single-flight，由应用拥有 `JoinHandle`，具备超时、取消和退出回收；失败分别返回 `Unavailable`/`InvalidMetadata`/`SignatureRejected` 等稳定状态，不能吞错或降格成 up-to-date。下载/安装仍只能使用官方 updater。
5. 对远端元数据先验证 channel/target/arch/版本与签名，再把认证后的 `minimumSupportedVersion` 交给 core 做严格 SemVer 强更判断；React 不得信任远端 `forcedUpdate` 布尔值。
6. 运行 `updater_defaults_to_not_configured_without_network`、`updater_checks_are_single_flight`、`updater_rejects_target_arch_channel_mismatch`、`updater_tasks_are_owned_and_cancelled`、`updater_failures_never_report_up_to_date` 五个非空回归。
7. 构建时仍从产品事实解析 `updaterEnabled`：false 表示保留本地基线但不生成 updater archive；true 才要求官方 archive、相邻 `.sig`、安全私钥来源与公开公钥实际验签。安装包签名与 updater archive 签名是独立门禁。

## 边界

- 该 Skill 不批准真实更新服务地址、统计、远程帮助或任何客户端秘密。
- 只有产品事实明确启用更新后，才允许从 `NotConfigured` 接成真实出站能力。
- 固定安装插件不等于发布渠道已启用更新，也不允许为通过测试写入假 endpoint、公钥、feed 或签名。

## 完成输出

报告插件/依赖下界、当前 `NotConfigured|Configured` 状态、零出站和任务所有权回归；真实更新配置、签名制品与安装验证只在对应产品/发布门禁实际执行后报告。
