---
name: desktop-build-nsh-release
description: 独立构建 NSH 桌面、Android、iOS、Web 包；区分本地工程试包与 clean 已发布源码候选。
---

# 构建 NSH 包

新下游仅顶层 `interfaces = ["nsh"]`，并读取 `nsh-targets` 与具体 `target-platforms`；旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。先读项目 RELEASE、Agent Policy 构建段与 `$desktop-add-nsh-adapter` 的运行时引用。仅打包 desktop/mobile/web 对应的已选平台；TUI 没有官方打包目标。全局 `nsh` CLI 与项目根 Cargo 的 `nsh-core`、`nsh-base` 及其他 NSH Git 依赖必须固定正式 v0.5.0 提交 `f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1`，`nsh --version` 须显示匹配的短 SHA `f4d68f7`；不自动下载工具，不运行原移动客户端脚本。

- `local`：允许未发布源码，完整非空 workspace 测试、NSH 检查与真实渲染树测试后打包到忽略的 `target/nsh-packaging/`；不安装/启动，不消费候选 E2E，不创建发布事实。
- `candidate`：`$desktop-manage-version check --phase build`（构建不得提升版本）、clean 已发布默认主分支/tag/上下文及双语日志。构建前复用当前明确 E2E 选择，否则询问一次；当前请求明确全流程测试则启用。最终包后才进入 `$desktop-verify-delivery`；pending 与 Unverified 不等于 accepted。

```sh
node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root . --mode local --target macos
node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root . --mode candidate --target web --e2e enabled
```

helper：`scripts/build_nsh_release.mjs --root <根> --mode local|candidate --target macos|windows|linux|android|ios|ios-simulator|web [--e2e enabled|disabled]`。目标必须属于持久平台及对应 desktop/mobile/web 分类；iOS 模拟器属于 ios。桌面原生构建只在对应宿主，iOS 只在 macOS。移动 SDK、Rust wasm target、LLVM、JDK/Android SDK/NDK 均由实际失败后按环境流程恢复，不按普通任务自动安装。

新 NSH 的 desktop、mobile、Web 均走官方 `nsh package`；TUI 只支持官方运行与测试，0.5.0 没有 TUI 打包目标。组合工程先复制工作区布局，保留 Mixed 入口、Cargo 相对路径、图标与静态资源，然后从副本中移除桌面窗口、单实例和模板恢复协议。macOS 形成 ad-hoc 签名 `.app` 和 `application.tar.gz`；Windows 形成应用目录及 zip；Linux 形成应用目录及 tar.gz。深链接使用官方包声明或应用注册。Android APK 默认开发签名；iOS 模拟器 ad-hoc app、设备未签名 app；Web 输出完整静态目录。Android AAB、iOS IPA 与渠道签名使用官方打包参数。渠道上传单独执行。

生成到唯一暂存目录，测试后、打包后复核源码与资源快照，拒绝中途漂移；不覆盖旧批次。候选根 `release/<buildRun>/` 的完整 `buildRun` 为 `nsh-<target>-<uuid>`，其中包含官方包、release-notes.json、双语许可证和 manifest。关于页的“更新日志”按钮展示编译进应用的双语内容：helper 先从已校验的 schema v2 根日志按最新在前、两类各最多十条渲染到暂存文本，再用 `HARNESS_RELEASE_NOTES_ZH_PATH` 与 `HARNESS_RELEASE_NOTES_EN_PATH` 两个短路径通知 NSH 适配器的标准库 `build.rs` 复制到 `OUT_DIR`，Rust 通过 `include_str!` 嵌入；本地试包写入无已发布日志占位。外层 sidecar 的字节与根日志一致，但 sidecar 不是 NSH 内部资源；最终 E2E 必须实际点击按钮并对照同一候选内容。manifest 列出实际所有文件摘要、源码、工具版本、目标、签名边界和 E2E 选择，正式候选初始 `milestoneAcceptance: pending`、`runtimeVerification: Unverified`。

通用 Git 发布仍由 `$desktop-prepare-release` 完成本地 merge/tag；本 Skill 不提交、不推送、不改版本。Git 发布后的 `local_package` 先运行生命周期 `check-post-release --action local_package`，再由 `$desktop-switch-post-release-action` 的只读 `route` 返回本次唯一 `target`，以该目标调用 `candidate` 并复核当前批次真实产物、摘要和 manifest。成功形成一个候选即可完成本次本地打包动作；其 `pending` 不代表验收或其他平台完成。失败时不自动改选目标，只有用户明确要求另一个已选且本机可构建的目标才用 `route --interface <接口> --target <目标>` 验证。`dependency-lock-policy = "tracked"` 时生成的 NSH 运行时 workspace 尚不能传播锁，动作选择就应拒绝 `local_package`，本 helper 仍在编译前失败关闭。远程构建必须另行复核已推送 release 分支/tag。

NSH 正式 0.5.0 生成的 runtime workspace 尚未验证可传递 `--locked`；当前 helper 对 dependency-lock-policy=tracked 在任何编译前失败关闭。默认 ignored 保持正常解析；不得私自修改项目锁策略。

打包返回 `target`、`buildRun`、`bundleFormat` 和 manifest 路径。验收按同一目标与批次取件。macOS 支持 `--arch arm64|x86_64|universal`。Windows 主包为官方 ZIP，存在 Inno Setup 时额外保留官方安装器。Linux 主包为官方 tar.gz。Android 支持重复 `--abi` 与 `--format apk|aab`，未提供签名材料时使用调试密钥。经本次签名授权后，可传 `--keystore` 与 `--key-alias`，密码从 `NSH_KEYSTORE_PASSWORD` 注入。iOS 经本次签名授权后传 `--sign` 和 `--profile` 生成 IPA，模拟器独立使用 `--target ios-simulator`。Web 支持 `--asset-url` 指定静态资源地址。manifest 记录实际签名类型、Android ABI 和应用 build 编号。

候选显式关闭 E2E 时同时传 --e2e-reason 与 --e2e-risk，分别记录本次原因和剩余风险。NSH 渲染测试运行整个适配器目录的 headless 套件。打包要求官方 JUnit 中至少有一项实际通过的 TSX 测试，Rust、空套件和跳过结果不能代替它。

iOS v0.5.0 名称兼容：官方 CLI 将展示名过滤成 ASCII 执行文件名；结果忽略大小写等于 nsh 时，会与包内 nsh 资源目录冲突。helper 只为该情形使用临时内部名称，恢复原始 CFBundleName/CFBundleDisplayName 与 app 目录后，模拟器重新 ad-hoc 签名并严格验证；未签名设备 app 同样恢复展示名。需要签名 IPA 时使用不触发上游名称冲突的展示名。

iOS Mixed 打包时，helper 用 `xcrun` 解析对应 Xcode SDK，为 QuickJS bindgen 补充该 Rust 目标的 sysroot。显式 sysroot 优先，宿主测试与其他打包目标使用各自的环境。
