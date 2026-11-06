---
name: desktop-build-nsh-release
description: 独立构建 NSH 桌面、Android、iOS 与 Web 包，区分本地工程试包与 clean 已发布源码候选，复用通用版本、日志和候选证据门禁。
---

# 构建 NSH 包

仅 `gui-framework = "nsh"`。先读项目 RELEASE、Agent Policy 构建段与 `$desktop-add-nsh-adapter` 的运行时引用。全局 `nsh` CLI 与项目 Cargo runtime 必须匹配参考 revision；不自动下载工具，不运行原移动客户端脚本。

- `local`：允许未发布源码，完整非空 workspace 测试、NSH 检查与真实渲染树测试后打包到忽略的 `target/nsh-packaging/`；不安装/启动，不消费候选 E2E，不创建发布事实。
- `candidate`：`$desktop-manage-version check --phase build`（构建不得提升版本）、clean 已发布默认主分支/tag/上下文及双语日志。构建前复用当前明确 E2E 选择，否则询问一次；当前请求明确全流程测试则启用。最终包后才进入 `$desktop-verify-delivery`；pending 与 Unverified 不等于 accepted。

```sh
pnpm run nsh:package --mode local --target macos
pnpm run nsh:package --mode candidate --target web --e2e enabled
```

helper：`scripts/build_nsh_release.mjs --root <根> --mode local|candidate --target macos|windows|linux|android|ios|ios-simulator|web [--e2e enabled|disabled]`。目标必须属于持久平台；iOS 模拟器属于 ios。桌面原生构建只在对应宿主，iOS 只在 macOS。移动 SDK、Rust wasm target、LLVM、JDK/Android SDK/NDK 均由实际失败后按环境流程恢复，不按普通任务自动安装。

macOS 默认 ad-hoc app；Windows zip；Linux tar.gz；Android APK 默认开发签名；iOS 模拟器 ad-hoc app、设备未签名 app；Web 完整静态目录。当前 helper 只产出这些本地可审查格式；正式 Android 签名、iOS IPA/渠道签名需使用官方 CLI 明确身份、keystore/profile 和既有渠道门禁，不传秘密到命令日志，不把开发签名当分发许可。没有签名身份的本地验证仍可运行。Windows/Linux 未测试宿主不报通过。

生成到唯一暂存目录，测试后、打包后复核源码与资源快照，拒绝中途漂移；不覆盖旧批次。候选根 `release/nsh-<目标>-<批次>/` 包含官方包、release-notes.json、双语许可证和 manifest。关于页的日志使用编译期 `HARNESS_RELEASE_NOTES_ZH` 与 `HARNESS_RELEASE_NOTES_EN` 嵌入；外层 sidecar 的字节与根日志一致。不要声称 sidecar 是 NSH 内部资源。manifest 列出实际所有文件摘要、源码、工具版本、目标、签名边界和 E2E 选择，初始 `milestoneAcceptance: pending`、`runtimeVerification: Unverified`。

通用 Git 发布仍由 `$desktop-prepare-release` 完成本地 merge/tag；本 Skill 不提交、不推送、不改版本。Git 发布后的 local_package 先运行生命周期 `check-post-release --action local_package`，再调用 candidate。远程构建必须另行复核已推送 release 分支/tag。

NSH 0.4.0 的官方生成 runtime workspace 不支持传递 --locked；当前 helper 对 dependency-lock-policy=tracked 在任何编译前失败关闭。默认 ignored 保持正常解析；不得私自修改项目锁策略。

候选显式关闭 E2E 时同时传 --e2e-reason 与 --e2e-risk，分别记录本次原因和剩余风险。NSH 渲染测试运行整个 GUI 目录的完整套件，不限默认 App.test.tsx。

iOS v0.4.0 名称兼容：官方 CLI 将展示名过滤成 ASCII 执行文件名；结果忽略大小写等于 nsh 时，会与包内 nsh 资源目录冲突。helper 只为该情形使用临时内部名称，恢复原始 CFBundleName/CFBundleDisplayName 与 app 目录后，模拟器重新 ad-hoc 签名并严格验证；设备 app 继续 unsigned，不改变公开身份或使用生产证书。
