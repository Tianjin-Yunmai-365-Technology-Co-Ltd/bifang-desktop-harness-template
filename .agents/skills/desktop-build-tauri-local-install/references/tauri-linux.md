# Tauri Linux 本地试包与宿主要点

本引用只服务 `$desktop-build-tauri-local-install` 的 Linux 路线，并供 Tauri 下游排查 Linux 专属问题。它沉淀中性机制，不授权安装系统包、提权、签名、发布或运行应用；Linux 候选与运行结论仍须另行取证。

## 范围

- 原生 Linux GNU 宿主，只构建与宿主同架构的 x64 或 ARM64；不交叉编译、不在 macOS/Windows 上生成 Linux 包。
- 格式为未签名 `.deb` 与 AppImage。RPM、Flatpak、Snap 与 musl 未接入。
- 本地试包标注 `local-install-test`，不进入 `release/`、不读写发布日志，也不改变正式候选中 Linux 的 `Unverified` 状态。

## 平台配置

Tauri 2 会自动把 GUI 根下的 `tauri.linux.conf.json` 合并进主配置。Linux 专属的 bundle 目标、运行库依赖和资源映射写在这里，不改动其他平台：

~~~json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "targets": ["deb", "appimage"],
    "linux": { "deb": { "depends": ["libayatana-appindicator3-1"] } }
  }
}
~~~

- 托盘：应用在运行时用 `TrayIconBuilder` 创建托盘时，bundler 不会把 AppIndicator 运行库加入 deb 的 `Depends`。只要产品启用了托盘，就必须像上面这样显式声明，否则在未预装该库的系统上安装后托盘缺失。
- 资源：许可证、第三方声明和本地更新日志这类随包文件要逐项声明 Linux 映射，不要从其他平台推断。

## 宿主依赖

构建需要 WebKitGTK 4.1 与 GTK3 的开发包。Debian/Ubuntu 上对应 Tauri 2 官方前置条件：`build-essential curl wget file libxdo-dev libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`（核对日期：2026-10-20，见 [Tauri 2 前置条件](https://v2.tauri.app/start/prerequisites/#linux)）。初始化后的构建不做例行预检：先运行真实命令，只有失败且诊断明确指向缺包时，才交给 `$desktop-check-development-environment` 处理。安装系统包需要用户明确授权，不能静默提权。

## 非 ASCII 产品名与 Debian 安装标识

bundler 用 `productName` 派生 deb 的 `Package:` 字段。中文等非 ASCII 产品名会生成 `dpkg` 拒绝解析的值，导致无法安装。处理方式：

1. 保留 `productName` 作为窗口和桌面项的显示名，不为了打包把它改成 ASCII。
2. 构建完成后运行 `scripts/normalize_tauri_deb.mjs`，传入产品已批准的稳定 ASCII 安装标识。它只替换 `Package:` 一行，二次解包后逐项核对 payload 的路径、类型、权限、链接目标与摘要，以及其他控制文件全部不变，再原子写出规范包和 `.sha256`、`.inspection.json` 侧车。原始 Tauri 包保留在 `target/release/bundle/deb/` 供复核。
3. 用 `--require-depends` 把本产品必需的运行库写成门禁，例如 `libwebkit2gtk-4.1-0`、`libgtk-3-0`，启用托盘时再加 `libayatana-appindicator3-1`；缺任何一项都失败关闭。

AppImage 不受 Debian 包名约束，直接使用 Tauri 输出。

## 测试与发现逻辑

- 临时目录：部分发行版把 `/tmp` 挂载为 tmpfs。产品若按“已确认本地卷”过滤扫描范围，tmpfs 上的测试夹具会被排除，导致测试失败或静默为空。Linux 上运行测试时，把 `TMPDIR` 指向项目所在持久磁盘的忽略目录，例如 `target/test-tmp`。
- 用户数据隔离：Linux 默认目录发现常读取 `$HOME` 与 XDG 目录。测试必须使用合成的用户根和临时 XDG 目录，不得读取真实用户数据；双次枚举的测试不能依赖真实会话的创建时序。
- 平台目录表：把“某平台有哪些优先目录”写成接收 OS 标识的纯函数，并放在 core，这样任意宿主都能测试 Windows、macOS 与 Linux 全部分支；adapter 只负责把相对路径拼到真实用户根下，并做文件系统检查。

## WebView 与权限

- 资产 origin：Windows WebView2 以 `http://tauri.localhost` 提供应用，Linux WebKitGTK 与 macOS 使用 `tauri://localhost`。CSP 的 `connect-src` 要精确列出实际 origin，不能为某个平台放宽成通配源或裸 `http:`/`https:`。
- 命令权限闭合：每新增一个 Tauri command，都要同时更新 `build.rs` 的命令清单、capability 的 `allow-*` 条目和权限契约测试。缺任何一处，真实 IPC 都会在运行时拒绝调用；单元测试直接调用 Rust 函数时无法发现这个问题。

## 本地试包命令

在项目根执行；`<gui-root>` 来自根 Cargo metadata 的 `gui-root`：

~~~sh
mkdir -p target/test-tmp
TMPDIR="$PWD/target/test-tmp" cargo test --workspace --all-targets --all-features
pnpm --dir <gui-root> test
(cd <gui-root> && CI=true pnpm tauri build --bundles deb,appimage --no-sign)
node .agents/skills/desktop-build-tauri-local-install/scripts/normalize_tauri_deb.mjs \
  --project-root . --package-name <ascii-package-name> \
  --require-depends libwebkit2gtk-4.1-0 --require-depends libgtk-3-0
~~~

依赖锁策略为 `tracked` 时，按主 Skill 的规定给 Cargo 测试和 Tauri 构建追加 `--locked`。规范化只在产品名会生成非法包名时需要；产品名本身已经是合法 Debian 包名时直接使用 Tauri 输出。

## 维护与验证入口

修改 helper 时运行 `node --test .agents/skills/desktop-build-tauri-local-install/scripts/normalize_tauri_deb.test.mjs`。该测试覆盖包名语法、控制字段替换、依赖判定、payload 比较与参数门禁；真实 `dpkg-deb` 打包只在 Linux 宿主执行，其他宿主上须如实报告未执行。
