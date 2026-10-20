# Tauri Linux 本地试包与宿主要点

本引用只服务 `$desktop-build-tauri-local-install` 的 Linux 路线，并供 Tauri 下游排查 Linux 专属问题。它沉淀中性机制，不授权安装系统包、提权、签名、发布或运行应用；Linux 候选与运行结论仍须另行取证。

## 范围

- 原生 Linux GNU 宿主，只构建与宿主同架构的 x64 或 ARM64；不交叉编译、不在 macOS/Windows 上生成 Linux 包。
- 格式为未签名 `.deb` 与 AppImage。RPM、Flatpak、Snap 与 musl 未接入。
- 本地试包标注 `local-install-test`，不进入 `release/`、不读写发布日志，也不改变正式候选中 Linux 的 `Unverified` 状态。

## 平台配置

Tauri 2 把与主 `tauri.conf.json` 同目录的 `tauri.linux.conf.json` 合并进主配置；传统布局在 `src-tauri/`，Cargo/config 同置布局才在 GUI 根。对象逐键合并，数组整体替换；资源 map 与资源数组不能混为一谈。依据：[平台配置与合并](https://v2.tauri.app/develop/configuration-files/#platform-specific-configuration)（核对：2026-10-20）。Linux 专属配置示例：

~~~json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "targets": ["deb", "appimage"],
    "linux": { "deb": { "depends": ["libayatana-appindicator3-1"] } }
  }
}
~~~

- 托盘：不要假定运行时 `TrayIconBuilder` 一定会让当前 bundler 自动识别 AppIndicator。检查实际 deb 的 `Depends`，只在 profile 启用托盘时补足当前实现需要的运行库；上例是采用 Ayatana 的情况，不是所有产品无条件启用托盘。包内声明不证明目标桌面有可见托盘。
- 资源：许可证、第三方声明和本地更新日志这类随包文件要逐项声明 Linux 映射，不要从其他平台推断。

## 宿主依赖

构建需要 WebKitGTK 4.1 与 GTK3 的开发包。Debian/Ubuntu 上对应 Tauri 2 官方前置条件：`build-essential curl wget file libxdo-dev libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`（核对日期：2026-10-20，见 [Tauri 2 前置条件](https://v2.tauri.app/start/prerequisites/#linux)）。初始化后的构建不做例行预检：先运行真实命令，只有失败且诊断明确指向缺包时，才交给 `$desktop-check-development-environment` 处理。安装系统包需要用户明确授权，不能静默提权。

## 非 ASCII 产品名与 Debian 安装标识

bundler 用 `productName` 派生 deb 的 `Package:` 字段。中文等非 ASCII 产品名会生成 `dpkg` 拒绝解析的值，导致无法安装。处理方式：

1. 保留 `productName` 作为窗口和桌面项的显示名，不为了打包把它改成 ASCII。
2. 构建完成后运行 `scripts/normalize_tauri_deb.mjs`，传入产品已批准的稳定 ASCII 安装标识。它只替换 `Package:` 一行，二次解包后逐项核对 payload 的路径、类型、权限、链接目标与摘要，以及其他控制文件全部不变，再分别原子重命名规范包和 `.sha256`、`.inspection.json` 侧车。原始 Tauri 包保留在 `target/release/bundle/deb/` 供复核；证明范围和失败恢复见下文。
3. 用 `--require-depends` 把本产品必需的运行库写成门禁，例如 `libwebkit2gtk-4.1-0`、`libgtk-3-0`，启用托盘时再加实际使用的 AppIndicator 库。必需库只接受独立直接依赖；`A | B` 允许仅安装其中之一，不能证明 B 必定存在。这里只核对名称声明，不证明可安装性、版本满足或动态链接成功。依据：[Debian Policy 7.1](https://www.debian.org/doc/debian-policy/ch-relationships.html#syntax-of-relationship-fields)（核对：2026-10-20）。

AppImage 不受 Debian 包名约束，直接使用 Tauri 输出。

## 运行时与测试

用户/XDG 目录、卷枚举与排除、条件 `TMPDIR`、取消、托盘恢复、自启、WebView origin 和应用 command ACL 的唯一知识入口是 [Linux 运行时与测试边界](../../desktop-add-gui-adapter/references/linux-runtime.md)。不要用打包或纯函数测试替代真实桌面证据。

## helper 的适用边界

- 当前只定位默认 `target/release/bundle/deb/`；配置了 `CARGO_TARGET_DIR`、`build.target-dir` 或显式 target 的其他输出布局时先停止，不能回退选择旧包。
- payload 比较只覆盖路径、类型、权限位、链接目标及普通文件摘要；不证明 uid/gid、硬链接拓扑、xattr/ACL 全部保留。重打包使用 `--root-owner-group`；需特殊 ownership 的包不适用。
- deb 与两个侧车分别原子 rename，整个集合没有事务提交保证。中途失败后视为未完成，重新核对包摘要与 inspection 的对应关系；不得消费残留或旧侧车。
- helper 面向本机本次可信 Tauri 输出，不是任意下载包的安全沙箱。它仍使用同步 `dpkg-deb` 和全文件 hash，未设子进程超时；不能推断有界内存、取消或不可信包处理能力。
- 更早发行版的兼容范围取决于构建基线、glibc/WebKitGTK 等实际依赖，AppImage 也不代表任意发行版可运行。依据：[Tauri Debian limitations](https://v2.tauri.app/distribute/debian/#limitations)（核对：2026-10-20）。

## 本地试包命令

在项目根执行；`<gui-root>` 来自根 Cargo metadata 的 `gui-root`：

以下示例假定产品发现测试需要且项目目录确实位于允许的文件系统，才设置 `TMPDIR`；无此要求时使用测试原有临时目录。全新 checkout 在直接编译 GUI crate 前，如 `frontendDist` 尚不存在，先执行项目声明的前端生产构建。

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
