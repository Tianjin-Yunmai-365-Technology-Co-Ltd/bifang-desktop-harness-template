> 官方资料核对日期：2026-09-04（沿用原参考核对日期；本次仅整理现有合同）

本文件是 [构建 Skill](../SKILL.md) 的条件执行合同；`scripts/` 路径均相对该 Skill 根目录。共享的选择冻结、版本、测试、锁策略、manifest 与原子提交仍按主流程执行。

## Windows 原生 x64 NSIS

- Tauri 官方 Windows 安装器文档规定，在 Windows 原生宿主运行 `tauri build` 会构建并打包 Windows 应用；`--bundles nsis` 可把格式收窄为 NSIS，`--target x86_64-pc-windows-msvc` 明确绑定 x64 MSVC 目标。
- 原生路线直接使用项目本地 Tauri CLI，不传 `--runner cargo-xwin`。`cargo-xwin` 只属于 macOS/Linux 交叉回退，不能出现在 Windows 原生命令中。
- 发布候选必须显式合并 `src-tauri/tauri.release.conf.json`；仅供本机检查的开发试包则不合并发布配置，并显式使用 `--no-sign`，避免误用项目签名配置。
- Windows 原生编译成功不等于安装、SmartScreen、UAC、注册表、WebView2 或 GUI 交互已经通过。未真实安装和运行时，发布候选的 `runtimeVerification` 仍为 `Unverified`；本地试包固定为 `Not run`。
- Authenticode 只在项目已有批准的非交互签名配置、工具和凭据来源时执行；开始后失败必须停止。渠道允许 unsigned 时使用 `--no-sign` 并明确风险，不能索取、生成或打印证书私钥。

官方来源：

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [Tauri CLI build options](https://v2.tauri.app/reference/cli/)

## 执行候选构建

9. Windows 原生 x64 候选只能在 Windows x64 宿主执行。PowerShell 中设置 `$env:CI = "true"`，再使用 `pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --config src-tauri/tauri.release.conf.json`；本分支禁止 `--runner cargo-xwin`，固定记录 `buildMode: native`。渠道允许 unsigned 且没有已批准签名配置时显式追加 `--no-sign` 并记录原因；已有批准的非交互 Authenticode 配置时才允许签名，开始后失败必须停止。输出从真实构建输出或 Cargo 元数据发现，并运行 `node .agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs bytes --source release-notes.json --bundled <discovered-resource>` 对应用资源更新日志做逐字节比较。构建成功不证明安装或运行；在最终候选 E2E/验收真实执行安装和运行之前，固定记录 `runtimeVerification: Unverified`。
