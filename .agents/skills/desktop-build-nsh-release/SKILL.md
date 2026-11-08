---
name: desktop-build-nsh-release
description: 独立构建 NSH 桌面、Android、iOS、Web 包及 TUI 本机预览归档；区分本地工程试包与 clean 已发布源码候选，TUI 预览不充当正式候选。
---

# 构建 NSH 包

新下游仅顶层 `interfaces = ["nsh"]`，并读取 `nsh-targets` 与具体 `target-platforms`；旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。先读项目 RELEASE、Agent Policy 构建段与 `$desktop-add-nsh-adapter` 的运行时引用。固定官方 main 预览 revision 的 TUI 支持 `nsh run/test --target tui`，但官方暂无 TUI release runner/package 目标。全局 `nsh` CLI 与项目根 Cargo 的 `nsh-core`、`nsh-base` 及其他 NSH Git 依赖必须固定同一受支持 revision，`nsh --version` 的短 SHA 必须匹配；选择 TUI 必须使用该 main 预览 revision，未选 TUI 必须使用正式 0.4.0 revision。旧 0.4.0 TUI 失败关闭；不自动下载工具，不运行原移动客户端脚本。

- `local`：允许未发布源码，完整非空 workspace 测试、NSH 检查与真实渲染树测试后打包到忽略的 `target/nsh-packaging/`；不安装/启动，不消费候选 E2E，不创建发布事实。
- `candidate`：`$desktop-manage-version check --phase build`（构建不得提升版本）、clean 已发布默认主分支/tag/上下文及双语日志。构建前复用当前明确 E2E 选择，否则询问一次；当前请求明确全流程测试则启用。最终包后才进入 `$desktop-verify-delivery`；pending 与 Unverified 不等于 accepted。

```sh
node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root . --mode local --target macos
node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root . --mode local --target tui
node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root . --mode candidate --target web --e2e enabled
```

helper：`scripts/build_nsh_release.mjs --root <根> --mode local|candidate --target macos|windows|linux|android|ios|ios-simulator|web|tui [--e2e enabled|disabled]`。目标必须属于持久平台及对应 `nsh-targets` 分类；iOS 模拟器属于 ios。`nsh-targets` 可以同时含 TUI，其他已选目标仍各自构建；`--target tui` 只允许 `local` 本机预览，`candidate` 在缺少官方 release runner 时明确阻断。桌面和 TUI 原生构建只在对应宿主，iOS 只在 macOS。移动 SDK、Rust wasm target、LLVM、JDK/Android SDK/NDK 均由实际失败后按环境流程恢复，不按普通任务自动安装。

新顶层 NSH 的 desktop/mobile/Web/TUI 全部使用 Mixed TSX 界面与共享 Rust core。desktop 使用自定义原生宿主：读取唯一九字段 `docs/GUI_APP_PROFILE.md`，多窗口固定提供；托盘、自启、单实例、深链接只按启用字段编入宿主，深链接要求单实例；系统通知与 OS 全局快捷键必须 disabled。桌面先运行 `nsh build --release` 形成 bundle，再构建 Cargo 宿主 bin，并按生成器约定装配资源。macOS 形成 ad-hoc 签名 `.app` 和 `application.tar.gz`；Windows 形成应用目录及 zip；Linux 形成应用目录及 tar.gz。启用深链接时打包相应 OS 注册声明或脚本。TUI 本地预览先经生成的 `run_nsh_tui.mjs --test` 验证真实 Mixed 渲染，再由 `nsh build --release` 生成 app-specific `.nsh/rust/tui-host`，将该开发宿主用 Cargo release 编译，与完整 bundle 装入原生终端预览归档。组合工程测试和构建均使用忽略的便携入口剔除桌面 `capabilities.host`，并由该入口导入专用 `App.tui.tsx`，避免把桌面 host 调用写进终端 bundle；保持原 `nsh.json` 字节不变，不得直接在原成员上运行 TUI。manifest 明确 `previewOnly`、`officialReleaseRunner: false`、`runtimeVerification: Unverified`。宿主可执行文件只从本次 Cargo JSON `compiler-artifact.executable` 定位，避免 `build.target` 覆盖时误取旧二进制。提取后按 manifest 的 `tuiPreview.launch` 从归档根目录启动并执行真实终端检查；这不是官方 TUI 发布包，不得作为正式候选验收。旧 GUI/NSH 元数据仅走既有官方打包兼容路径，不改写旧下游。Android APK 默认开发签名；iOS 模拟器 ad-hoc app、设备未签名 app；Web 完整静态目录，这些仍由官方 `nsh package` 生成。若同一工程还选择 desktop，构建 helper 会在忽略的暂存目录创建独立 Mixed 入口，剔除 `capabilities.host` 后再让官方宿主组包；直接对组合工程调用官方 mobile/Web `nsh package` 不能证明桌面宿主权限已隔离。当前 helper 只产出这些本地可审查格式；正式 Android 签名、iOS IPA/渠道签名需使用官方 CLI 明确身份、keystore/profile 和既有渠道门禁，不传秘密到命令日志，不把开发签名当分发许可。没有签名身份的本地验证仍可运行。Windows/Linux 未测试宿主不报通过。

生成到唯一暂存目录，测试后、打包后复核源码与资源快照，拒绝中途漂移；不覆盖旧批次。候选根 `release/<buildRun>/` 的完整 `buildRun` 为 `nsh-<target>-<uuid>`，其中包含官方包、release-notes.json、双语许可证和 manifest。关于页的“更新日志”按钮展示编译进应用的双语内容：helper 先从已校验的 schema v2 根日志按最新在前、两类各最多十条渲染到暂存文本，再用 `HARNESS_RELEASE_NOTES_ZH_PATH` 与 `HARNESS_RELEASE_NOTES_EN_PATH` 两个短路径通知 NSH 适配器的标准库 `build.rs` 复制到 `OUT_DIR`，Rust 通过 `include_str!` 嵌入；本地试包写入无已发布日志占位。外层 sidecar 的字节与根日志一致，但 sidecar 不是 NSH 内部资源；最终 E2E 必须实际点击按钮并对照同一候选内容。manifest 列出实际所有文件摘要、源码、工具版本、目标、签名边界和 E2E 选择，正式候选初始 `milestoneAcceptance: pending`、`runtimeVerification: Unverified`；TUI 本地预览固定 `milestoneAcceptance: not-applicable-preview`、`runtimeVerification: Unverified`。

通用 Git 发布仍由 `$desktop-prepare-release` 完成本地 merge/tag；本 Skill 不提交、不推送、不改版本。Git 发布后的 `local_package` 先运行生命周期 `check-post-release --action local_package`，再由 `$desktop-switch-post-release-action` 的只读 `route` 返回本次唯一 `target`，以该目标调用 `candidate` 并复核当前批次真实产物、摘要和 manifest。成功形成一个候选即可完成本次本地打包动作；其 `pending` 不代表验收或其他平台完成。失败时不自动改选目标，只有用户明确要求另一个已选且本机可构建的目标才用 `route --interface <接口> --target <目标>` 验证。含 TUI 的项目因缺少官方 TUI release runner/package，发布后动作须选 `push_release_branch`；其他目标的独立构建请求仍可按各自门禁执行。`dependency-lock-policy = "tracked"` 时生成的 NSH 运行时 workspace 尚不能传播锁，动作选择就应拒绝 `local_package`，本 helper 仍在编译前失败关闭。远程构建必须另行复核已推送 release 分支/tag。

NSH 0.4.0 与固定 main 预览版的生成 runtime workspace 尚未验证可传递 --locked；当前 helper 对 dependency-lock-policy=tracked 在任何编译前失败关闭。默认 ignored 保持正常解析；不得私自修改项目锁策略。

候选显式关闭 E2E 时同时传 --e2e-reason 与 --e2e-risk，分别记录本次原因和剩余风险。NSH 渲染测试运行整个 NSH 适配器目录的完整套件，不限默认 App.test.tsx。

iOS v0.4.0 名称兼容：官方 CLI 将展示名过滤成 ASCII 执行文件名；结果忽略大小写等于 nsh 时，会与包内 nsh 资源目录冲突。helper 只为该情形使用临时内部名称，恢复原始 CFBundleName/CFBundleDisplayName 与 app 目录后，模拟器重新 ad-hoc 签名并严格验证；设备 app 继续 unsigned，不改变公开身份或使用生产证书。
