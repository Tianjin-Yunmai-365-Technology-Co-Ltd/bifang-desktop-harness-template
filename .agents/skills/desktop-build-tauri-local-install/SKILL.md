---
name: desktop-build-tauri-local-install
description: 在 Windows 原生宿主构建仅供本机安装检查的 Tauri 2 x64 NSIS 试包，不升级为发布候选，也不触发提交、发布日志或 E2E。
---

# 构建 Windows 本地安装试包

为开发中的 Tauri GUI 生成一个明确非发布、非候选的 Windows x64 NSIS 试包。用户只说“构建”“打包”“首次安装试一下”或“本地安装包”，且没有明确提出发布、候选、分发或交付时，使用本 Skill；不得把该意图升级为 `$desktop-prepare-release` 或 `$desktop-build-tauri-release`。

## 工作流程

1. 读取根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]`，要求 `target-platforms` 包含且当前只构建 `windows`，`interfaces` 包含 `gui`；缺失、空数组、非法值或与请求冲突时停止，不从旧对话、目录名或当前宿主猜测。要求当前宿主为原生 Windows x64、项目根是独立 Git 顶层目录、存在可解析 HEAD、从 `gui-root` 解析的真实 GUI 根目录（未声明时为 `<project-id>_gui`）、前端 `package.json` 和项目本地 Tauri CLI。记录 HEAD 与 `git status --porcelain=v1 --untracked-files=all` 是否为空；允许从 dirty 工作树生成本地试包，但必须在结果中明确列出 `sourceTreeState: dirty` 和不可复现风险，不得自动暂存、提交、清理或改写用户变化。
2. 本地试包不进入发布流程：不得调用 `$desktop-prepare-release`，不得生成、读取、校验或改写 `release-notes.json`，不得传 `--config src-tauri/tauri.release.conf.json`，不得创建、刷新或写入项目根 `release/`，不得生成候选 manifest、Changelog、Product Status、Work Plan 或 Verification，也不得计算或提升版本。
3. 初始化后的构建不做例行环境预检。先用当前环境运行真实命令；只有命令已经失败且脱敏诊断明确指向受管 Windows GUI 工具链缺失或不兼容时，才调用 `$desktop-check-development-environment` 的精确恢复路线并重试原失败命令一次。代码、测试、依赖解析、网络或配置错误不得伪装成环境问题。
4. 前端依赖尚未安装或 CI 新检出时，先从根 Cargo 元数据读取 `dependency-lock-policy` 并用 `project_lock_policy.mjs` 对实际 `rust-test-manifests` 与 `gui-root` 执行 `assertDependencyLocks`。缺省或 `ignored` 使用 `pnpm install --no-frozen-lockfile`，本地生成的锁文件不作为门禁；显式 `tracked` 要求实际 Cargo workspace 的 `Cargo.lock` 和 GUI 根的 `pnpm-lock.yaml` 为受 Git 跟踪且未被忽略的普通文件，并使用 `pnpm install --frozen-lockfile`。打包前运行全部非空单元测试。Rust 对 `rust-test-manifests` 的每个实际工作区分别确认并运行非空全量单元测试；默认根工作区使用 `cargo test --workspace --all-targets --all-features -- --list` 与 `cargo test --workspace --all-targets --all-features`，独立工作区使用对应 `--manifest-path <path>` 的等价命令；`tracked` 时每条 Cargo 测试命令在 `-- --list` 前追加 `--locked`；前端运行 `package.json` 声明的完整非 watch 单元测试套件并确认非空。不得自动追加格式、lint、类型、全仓治理、冒烟或 E2E。
5. 在已解析的 GUI 根目录下以 PowerShell 执行原生未签名 NSIS 构建，禁止 `cargo-xwin`、MSI、`all` bundle 和交叉宿主：

   ```powershell
   $env:CI = "true"
   pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --no-sign
   ```

   `tracked` 时把 `-- --locked` 追加在上述 Tauri 命令末尾，传给其 Cargo runner；`ignored` 不追加。若用 Cargo metadata 定位输出，`tracked` 也必须为该调用追加 `--locked`。[Tauri 2 CLI build](https://v2.tauri.app/reference/cli/#build) 的尾部参数会传给 runner（核对日期：2026-09-29）。
   从 Tauri 真实输出或 Cargo 元数据定位唯一 `target/x86_64-pc-windows-msvc/release/bundle/nsis/` 安装程序，不猜测产品名。不得启动应用、运行安装程序、请求 UAC、修改注册表或写入系统目录；真实安装和交互测试需要用户另行明确请求，并进入适用的 E2E/验收边界。
6. 报告真实命令、Rust/前端测试数量、HEAD、`sourceTreeState`、试包绝对路径、大小和 SHA-256，并固定标注 `artifactPurpose: local-install-test`、`releaseCandidate: false`、`signingStatus: unsigned`、`E2E: Not run`、`runtimeVerification: Not run`。不得使用 `pending`/`accepted` 候选状态，不得声称可发布、可分发、已安装、已验收或已验证运行时。

## 边界

- 本 Skill 不询问 E2E 开/关；该选择只属于明确的发布候选流程。
- 本 Skill 不授权 Git 提交、签名、上传、发布、安装或运行。构建成功只表示得到了本机未签名试包。
- 用户明确要求“发布候选”时转到 `$desktop-build-tauri-release`；用户明确要求“准备并构建发布”时转到 `$desktop-prepare-release`，不得把普通本地试包称为任务升级。
