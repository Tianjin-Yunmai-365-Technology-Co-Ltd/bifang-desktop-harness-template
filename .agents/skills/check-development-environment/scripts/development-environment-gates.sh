#!/bin/sh
set -eu

# MSRV 的唯一事实来源见 docs/RUST_CLI_TEMPLATE.md；修改此值时必须同步更新 development-environment-gates.ps1。
MIN_RUST_MAJOR=1
MIN_RUST_MINOR=90
MODE=install
INTERFACES=
FRONTEND_REQUIRED=0

# 输出稳定的命令入口说明，避免调用方误把只读模式当成首次开发安装模式。
usage() {
    printf '%s\n' "用法：development-environment-gates.sh [--install-missing|--check-only] --interfaces CLI,TUI,MCP,GUI"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --install-missing) MODE=install ;;
        --check-only) MODE=check ;;
        --interfaces)
            [ "$#" -ge 2 ] || { usage >&2; exit 2; }
            INTERFACES=$2
            shift
            ;;
        --help|-h) usage; exit 0 ;;
        *) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

normalized_interfaces=$(printf '%s' "$INTERFACES" | tr '[:lower:]' '[:upper:]' | tr -d ' ')
for interface in $(printf '%s' "$normalized_interfaces" | tr ',' ' '); do
    case "$interface" in
        CLI|TUI|MCP|GUI) ;;
        *) printf '不支持的接口：%s\n' "$interface" >&2; usage >&2; exit 2 ;;
    esac
done
case ",$normalized_interfaces," in
    *,GUI,*) FRONTEND_REQUIRED=1 ;;
esac

PROBE_PATH=${AFH_PREREQ_PATH:-${PATH}}
RUST_CHANGED=existing
NODE_CHANGED=existing
PNPM_CHANGED=existing
NODE_BIN_DIR=
PNPM_BIN_DIR=
CARGO_BIN_DIR=
TEMP_DIR=

# 只清理本进程通过 mktemp 创建的下载目录，不触碰安装目标或用户已有文件。
cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        find "$TEMP_DIR" -depth -delete 2>/dev/null || true
    fi
}
trap cleanup EXIT HUP INT TERM

# 以稳定退出码终止门禁，让 Agent 能区分缺失、版本、下载和校验失败。
fail() {
    code=$1
    shift
    printf '错误：%s\n' "$*" >&2
    exit "$code"
}

# 仅在门禁探测路径中解析工具，隔离测试可因此隐藏机器已有环境。
find_tool() {
    tool_name=$1
    old_ifs=$IFS
    IFS=:
    for tool_dir in $PROBE_PATH; do
        [ -n "$tool_dir" ] || tool_dir=.
        if [ -x "$tool_dir/$tool_name" ] && [ ! -d "$tool_dir/$tool_name" ]; then
            printf '%s\n' "$tool_dir/$tool_name"
            IFS=$old_ifs
            return 0
        fi
    done
    IFS=$old_ifs
    return 1
}

# 下载官方 HTTPS 制品；file URL 只在显式测试开关下用于隔离测试夹具。
download() {
    source_url=$1
    destination=$2
    case "$source_url" in
        https://*) curl --proto '=https' --tlsv1.2 -fsSL "$source_url" -o "$destination" ;;
        file://*)
            [ "${AFH_ALLOW_FILE_URLS:-0}" = 1 ] || fail 24 "file URL 已禁用"
            curl -fsSL "$source_url" -o "$destination"
            ;;
        *) fail 24 "不支持的下载 URL 协议：$source_url" ;;
    esac
}

# 验证现有或新装 Rust 为满足 MSRV 的 stable，禁止自动替换旧版或预发布工具链。
validate_rust() {
    rustc_path=$1
    cargo_path=$2
    rust_text=$("$rustc_path" --version 2>/dev/null) || fail 21 "rustc 探测失败"
    cargo_text=$("$cargo_path" --version 2>/dev/null) || fail 21 "cargo 探测失败"
    rust_release=$(printf '%s\n' "$rust_text" | awk '{print $2}')
    case "$rust_release" in
        *-*) fail 21 "现有 Rust 工具链不是 stable：$rust_release" ;;
        *.*.*) ;;
        *) fail 21 "无法识别 Rust 发布版本：$rust_release" ;;
    esac
    rust_major=$(printf '%s\n' "$rust_release" | awk -F. '{print $1}')
    rust_minor=$(printf '%s\n' "$rust_release" | awk -F. '{print $2}')
    rust_patch=$(printf '%s\n' "$rust_release" | awk -F. '{print $3}')
    case "$rust_major:$rust_minor:$rust_patch" in
        *[!0-9:]*|::*|*::|*::*:*) fail 21 "无法识别 Rust 发布版本：$rust_release" ;;
    esac
    if [ "$rust_major" -lt "$MIN_RUST_MAJOR" ] || {
        [ "$rust_major" -eq "$MIN_RUST_MAJOR" ] && [ "$rust_minor" -lt "$MIN_RUST_MINOR" ];
    }; then
        fail 21 "现有 Rust $rust_release 低于 MSRV $MIN_RUST_MAJOR.$MIN_RUST_MINOR.0"
    fi
    RUST_VERSION=$rust_text
    CARGO_VERSION=$cargo_text
}

# 将 Unix 宿主映射到 Rust 官方 rustup-init target；Linux libc 无法确定时停止而不猜测。
host_rustup_target() {
    rust_host_os=$(uname -s 2>/dev/null) || fail 22 "无法为 rustup 探测操作系统"
    rust_host_arch=$(uname -m 2>/dev/null) || fail 22 "无法为 rustup 探测 CPU 架构"
    case "$rust_host_os" in
        Darwin)
            case "$rust_host_arch" in
                x86_64|amd64) rustup_target=x86_64-apple-darwin ;;
                arm64|aarch64) rustup_target=aarch64-apple-darwin ;;
                *) fail 22 "rustup 不支持此 macOS 架构：$rust_host_arch" ;;
            esac
            ;;
        Linux)
            rust_libc=
            if command -v getconf >/dev/null 2>&1 && getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
                rust_libc=gnu
            else
                ldd_text=$(ldd --version 2>&1 || true)
                case "$ldd_text" in
                    *musl*|*MUSL*) rust_libc=musl ;;
                    *glibc*|*GLIBC*|*GNU*) rust_libc=gnu ;;
                esac
            fi
            if [ -z "$rust_libc" ]; then
                for musl_loader in /lib/ld-musl-*.so.1 /usr/lib/ld-musl-*.so.1; do
                    if [ -e "$musl_loader" ]; then rust_libc=musl; break; fi
                done
            fi
            [ -n "$rust_libc" ] || fail 22 "无法确定 rustup 所需的 Linux libc"
            case "$rust_host_arch" in
                x86_64|amd64) rustup_target=x86_64-unknown-linux-$rust_libc ;;
                arm64|aarch64) rustup_target=aarch64-unknown-linux-$rust_libc ;;
                *) fail 22 "rustup 不支持此 Linux 架构：$rust_host_arch" ;;
            esac
            ;;
        *) fail 22 "rustup 不支持此 Unix 操作系统：$rust_host_os" ;;
    esac
}

# 下载宿主匹配的官方 rustup-init，核对发布摘要后安装 stable 并加入本次复探路径。
install_rust() {
    command -v curl >/dev/null 2>&1 || fail 22 "安装 Rust 需要 curl"
    host_rustup_target
    TEMP_DIR=$(mktemp -d) || fail 22 "无法创建临时目录"
    rustup_dist_base=${AFH_RUSTUP_DIST_BASE:-https://static.rust-lang.org/rustup/dist}
    release_base=$rustup_dist_base/$rustup_target
    installer_url=$release_base/rustup-init
    checksum_url=$release_base/rustup-init.sha256
    installer_path=$TEMP_DIR/rustup-init
    checksum_path=$TEMP_DIR/rustup-init.sha256
    cargo_home=${CARGO_HOME:-${HOME:?必须设置 HOME}/.cargo}
    rustup_home=${RUSTUP_HOME:-${HOME:?必须设置 HOME}/.rustup}
    printf '正在从 %s 安装缺失的 Rust 到 %s（PATH 将添加 %s/bin）。\n' "$release_base" "$rustup_home" "$cargo_home" >&2
    download "$installer_url" "$installer_path" || fail 22 "Rust 安装器下载失败"
    download "$checksum_url" "$checksum_path" || fail 22 "Rust 安装器校验和下载失败"
    expected_sum=$(awk '{ print $1; exit }' "$checksum_path")
    [ -n "$expected_sum" ] || fail 22 "Rust 安装器校验和为空"
    actual_sum=$(sha256_file "$installer_path")
    [ "$actual_sum" = "$expected_sum" ] || fail 22 "rustup-init SHA-256 校验失败"
    chmod +x "$installer_path" || fail 22 "无法把 rustup-init 设为可执行文件"
    CARGO_HOME=$cargo_home RUSTUP_HOME=$rustup_home "$installer_path" -y --profile minimal --default-toolchain stable || fail 22 "Rust 安装失败"
    CARGO_BIN_DIR=$cargo_home/bin
    PROBE_PATH=$CARGO_BIN_DIR:$PROBE_PATH
    RUST_CHANGED=installed
    cleanup
    TEMP_DIR=
}

# 将宿主系统与 CPU 映射到 Node 官方制品命名，未知组合必须停止而非猜测。
host_node_tuple() {
    host_os=$(uname -s 2>/dev/null) || fail 23 "无法探测操作系统"
    host_arch=$(uname -m 2>/dev/null) || fail 23 "无法探测 CPU 架构"
    case "$host_os" in
        Darwin) node_platform=darwin ;;
        Linux) node_platform=linux ;;
        *) fail 23 "Node.js 不支持此 Unix 操作系统：$host_os" ;;
    esac
    case "$host_arch" in
        x86_64|amd64) node_arch=x64 ;;
        arm64|aarch64) node_arch=arm64 ;;
        *) fail 23 "Node.js 不支持此 CPU 架构：$host_arch" ;;
    esac
}

# 使用宿主已有 SHA-256 工具计算制品摘要，缺少校验能力时拒绝任何安装。
sha256_file() {
    checksum_path=$1
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$checksum_path" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$checksum_path" | awk '{print $1}'
    else
        fail 25 "校验下载制品需要 sha256sum 或 shasum"
    fi
}

# 选择官方最新受支持 LTS，校验发行摘要后原子移动到用户级版本目录。
install_node() {
    command -v curl >/dev/null 2>&1 || fail 26 "安装 Node.js 需要 curl"
    command -v tar >/dev/null 2>&1 || fail 26 "安装 Node.js 需要 tar"
    host_node_tuple
    node_dist_base=${AFH_NODE_DIST_BASE:-https://nodejs.org/dist}
    TEMP_DIR=$(mktemp -d) || fail 26 "无法创建临时目录"
    index_path=$TEMP_DIR/index.tab
    download "$node_dist_base/index.tab" "$index_path" || fail 26 "Node.js 发布版本索引下载失败"
    node_version=$(awk -F '\t' 'NR > 1 && $10 != "-" && $10 != "" { print $1; exit }' "$index_path")
    [ -n "$node_version" ] || fail 26 "Node.js 发布版本索引中没有受支持的 LTS"
    archive_name=node-$node_version-$node_platform-$node_arch.tar.gz
    archive_path=$TEMP_DIR/$archive_name
    sums_path=$TEMP_DIR/SHASUMS256.txt
    release_base=$node_dist_base/$node_version
    printf '正在安装缺失的 Node.js %s LTS，来源为 %s，目标为用户级目录。\n' "$node_version" "$release_base" >&2
    download "$release_base/$archive_name" "$archive_path" || fail 26 "Node.js 归档下载失败"
    download "$release_base/SHASUMS256.txt" "$sums_path" || fail 26 "Node.js 校验和下载失败"
    expected_sum=$(awk -v name="$archive_name" '$2 == name { print $1; exit }' "$sums_path")
    [ -n "$expected_sum" ] || fail 26 "Node.js 校验和列表不包含 $archive_name"
    actual_sum=$(sha256_file "$archive_path")
    [ "$actual_sum" = "$expected_sum" ] || fail 26 "Node.js SHA-256 校验失败"
    node_home=${AFH_NODE_HOME:-${XDG_DATA_HOME:-${HOME:?必须设置 HOME}/.local/share}/agent-first-harness/node}
    install_dir=$node_home/$node_version
    extracted_dir=$TEMP_DIR/node-$node_version-$node_platform-$node_arch
    if [ -e "$install_dir" ]; then
        [ -x "$install_dir/bin/node" ] || fail 26 "Node.js 目标已存在但不可用：$install_dir"
    else
        mkdir -p "$node_home" || fail 26 "无法创建 Node.js 安装根目录"
        tar -xzf "$archive_path" -C "$TEMP_DIR" || fail 26 "Node.js 归档解压失败"
        [ -x "$extracted_dir/bin/node" ] || fail 26 "Node.js 归档不包含预期可执行文件"
        mv "$extracted_dir" "$install_dir" || fail 26 "无法完成 Node.js 安装"
    fi
    NODE_BIN_DIR=$install_dir/bin
    PROBE_PATH=$NODE_BIN_DIR:$PROBE_PATH
    NODE_CHANGED=installed
    cleanup
    TEMP_DIR=
}

# 仅在 GUI 项目缺失 pnpm 时，通过 Node 自带 npm 安装官方软件包仓库中的稳定 pnpm。
install_pnpm() {
    npm_path=$(find_tool npm 2>/dev/null || true)
    [ -n "$npm_path" ] || fail 28 "为 GUI 开发安装 pnpm 需要 npm"
    pnpm_home=${AFH_PNPM_HOME:-${HOME:?必须设置 HOME}/.local/share/agent-first-pnpm}
    mkdir -p "$pnpm_home" || fail 28 "无法创建 pnpm 安装根目录"
    printf '正在从官方 npm 软件包仓库把缺失的 pnpm 安装到用户级目录。\n' >&2
    PATH=$PROBE_PATH:$PATH "$npm_path" install --global --prefix "$pnpm_home" pnpm@latest || fail 28 "pnpm 安装失败"
    PNPM_BIN_DIR=$pnpm_home/bin
    PROBE_PATH=$PNPM_BIN_DIR:$PROBE_PATH
    PNPM_CHANGED=installed
}

rustc_path=$(find_tool rustc 2>/dev/null || true)
cargo_path=$(find_tool cargo 2>/dev/null || true)
if [ -n "$rustc_path" ] && [ -n "$cargo_path" ]; then
    validate_rust "$rustc_path" "$cargo_path"
    rust_missing=0
else
    rust_missing=1
    RUST_VERSION=Missing
    CARGO_VERSION=Missing
fi

if [ "$FRONTEND_REQUIRED" -eq 1 ]; then
    node_path=$(find_tool node 2>/dev/null || true)
    pnpm_path=$(find_tool pnpm 2>/dev/null || true)
    if [ -n "$node_path" ]; then
        NODE_VERSION=$("$node_path" --version 2>/dev/null) || fail 23 "Node.js 探测失败"
        node_missing=0
    else
        NODE_VERSION=Missing
        node_missing=1
    fi
    if [ -n "$pnpm_path" ]; then
        PNPM_VERSION=$("$pnpm_path" --version 2>/dev/null) || fail 28 "pnpm 探测失败"
        pnpm_missing=0
    else
        PNPM_VERSION=Missing
        pnpm_missing=1
    fi
else
    NODE_VERSION=Not-required
    PNPM_VERSION=Not-required
    node_missing=0
    pnpm_missing=0
fi

if [ "$MODE" = check ]; then
    printf 'gate.rust.status=%s\n' "$([ "$rust_missing" -eq 0 ] && printf passed || printf missing)"
    printf 'gate.rust.version=%s\n' "$RUST_VERSION"
    printf 'gate.node.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 0 ] && printf not-required || { [ "$node_missing" -eq 0 ] && printf passed || printf missing; })"
    printf 'gate.node.version=%s\n' "$NODE_VERSION"
    printf 'gate.pnpm.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 0 ] && printf not-required || { [ "$pnpm_missing" -eq 0 ] && printf passed || printf missing; })"
    printf 'gate.pnpm.version=%s\n' "$PNPM_VERSION"
    [ "$rust_missing" -eq 0 ] && [ "$node_missing" -eq 0 ] && [ "$pnpm_missing" -eq 0 ] || exit 20
    exit 0
fi

if [ "$rust_missing" -eq 1 ]; then
    install_rust
    rustc_path=$(find_tool rustc 2>/dev/null || true)
    cargo_path=$(find_tool cargo 2>/dev/null || true)
    [ -n "$rustc_path" ] && [ -n "$cargo_path" ] || fail 22 "Rust 安装完成后仍无法调用 rustc 和 cargo"
    validate_rust "$rustc_path" "$cargo_path"
fi

if [ "$node_missing" -eq 1 ]; then
    install_node
    node_path=$(find_tool node 2>/dev/null || true)
    [ -n "$node_path" ] || fail 26 "Node.js 安装完成后仍无法调用 node 可执行文件"
    NODE_VERSION=$("$node_path" --version 2>/dev/null) || fail 26 "已安装 Node.js 的探测失败"
fi

if [ "$pnpm_missing" -eq 1 ]; then
    install_pnpm
    pnpm_path=$(find_tool pnpm 2>/dev/null || true)
    [ -n "$pnpm_path" ] || fail 28 "pnpm 安装完成后仍无法调用 pnpm 可执行文件"
    PNPM_VERSION=$(PATH=$PROBE_PATH:$PATH "$pnpm_path" --version 2>/dev/null) || fail 28 "已安装 pnpm 的探测失败"
fi

changed=false
[ "$RUST_CHANGED" = installed ] && changed=true
[ "$NODE_CHANGED" = installed ] && changed=true
[ "$PNPM_CHANGED" = installed ] && changed=true

printf 'gate.rust.status=passed\n'
printf 'gate.rust.version=%s\n' "$RUST_VERSION"
printf 'gate.rust.change=%s\n' "$RUST_CHANGED"
printf 'gate.node.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 1 ] && printf passed || printf not-required)"
printf 'gate.node.version=%s\n' "$NODE_VERSION"
printf 'gate.node.change=%s\n' "$NODE_CHANGED"
printf 'gate.pnpm.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 1 ] && printf passed || printf not-required)"
printf 'gate.pnpm.version=%s\n' "$PNPM_VERSION"
printf 'gate.pnpm.change=%s\n' "$PNPM_CHANGED"
printf 'gate.changed=%s\n' "$changed"
if [ -n "$CARGO_BIN_DIR" ] || [ -n "$NODE_BIN_DIR" ] || [ -n "$PNPM_BIN_DIR" ]; then
    path_prepend=${CARGO_BIN_DIR:-}
    if [ -n "$NODE_BIN_DIR" ]; then
        [ -n "$path_prepend" ] && path_prepend=$NODE_BIN_DIR:$path_prepend || path_prepend=$NODE_BIN_DIR
    fi
    if [ -n "$PNPM_BIN_DIR" ]; then
        [ -n "$path_prepend" ] && path_prepend=$PNPM_BIN_DIR:$path_prepend || path_prepend=$PNPM_BIN_DIR
    fi
    printf 'gate.path.prepend=%s\n' "$path_prepend"
fi
