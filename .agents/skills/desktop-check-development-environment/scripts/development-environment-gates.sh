#!/bin/sh
set -eu

# MSRV 的唯一事实来源见 docs/RUST_CLI_TEMPLATE.md；修改此值时必须同步更新 development-environment-gates.ps1。
MIN_RUST_MAJOR=1
MIN_RUST_MINOR=95
NODE_REQUIREMENT='^24.15.0 || >=26.0.0'
PNPM_REQUIREMENT='>=11.24.0'
PNPM_INSTALL_REQUIREMENT='pnpm@>=11.24.0'
GIT_REQUIREMENT='>=2.0.0'
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
GIT_CHANGED=existing
NODE_CHANGED=existing
PNPM_CHANGED=existing
NODE_BIN_DIR=
PNPM_BIN_DIR=
CARGO_BIN_DIR=
GIT_BIN_DIR=
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

# 验证现有或新装 Rust 为 stable；可证明低于 MSRV 时返回升级需求。
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
    RUST_VERSION=$rust_text
    CARGO_VERSION=$cargo_text
    if [ "$rust_major" -lt "$MIN_RUST_MAJOR" ] || {
        [ "$rust_major" -eq "$MIN_RUST_MAJOR" ] && [ "$rust_minor" -lt "$MIN_RUST_MINOR" ];
    }; then
        RUST_STATUS=upgrade-required
        return
    fi
    RUST_STATUS=passed
}

# 验证 Node.js 落在 Vite 基线的非连续范围内；低版本与 25.x 返回升级需求。
validate_node() {
    node_path=$1
    node_text=$("$node_path" --version 2>/dev/null) || fail 23 "Node.js 探测失败"
    node_release=$(printf '%s\n' "$node_text" | sed 's/^v//')
    case "$node_release" in
        *-*|*+*) fail 23 "现有 Node.js 不是可识别的稳定发布版：$node_text" ;;
        *.*.*) ;;
        *) fail 23 "无法识别 Node.js 发布版本：$node_text" ;;
    esac
    node_major=$(printf '%s\n' "$node_release" | awk -F. '{print $1}')
    node_minor=$(printf '%s\n' "$node_release" | awk -F. '{print $2}')
    node_patch=$(printf '%s\n' "$node_release" | awk -F. '{print $3}')
    case "$node_major:$node_minor:$node_patch" in
        *[!0-9:]*|::*|*::|*::*:*) fail 23 "无法识别 Node.js 发布版本：$node_text" ;;
    esac
    node_compatible=0
    if [ "$node_major" -eq 24 ] && {
        [ "$node_minor" -gt 15 ] || { [ "$node_minor" -eq 15 ] && [ "$node_patch" -ge 0 ]; };
    }; then
        node_compatible=1
    elif [ "$node_major" -ge 26 ]; then
        node_compatible=1
    fi
    NODE_VERSION=$node_text
    if [ "$node_compatible" -eq 1 ]; then
        NODE_STATUS=passed
    else
        NODE_STATUS=upgrade-required
    fi
}

# 验证 pnpm 满足声明下界；可证明低于下界时返回升级需求。
validate_pnpm() {
    pnpm_path=$1
    pnpm_text=$(PATH=$PROBE_PATH:$PATH "$pnpm_path" --version 2>/dev/null) || fail 28 "pnpm 探测失败"
    case "$pnpm_text" in
        *-*|*+*) fail 28 "现有 pnpm 不是可识别的稳定发布版：$pnpm_text" ;;
        *.*.*) ;;
        *) fail 28 "无法识别 pnpm 发布版本：$pnpm_text" ;;
    esac
    pnpm_major=$(printf '%s\n' "$pnpm_text" | awk -F. '{print $1}')
    pnpm_minor=$(printf '%s\n' "$pnpm_text" | awk -F. '{print $2}')
    pnpm_patch=$(printf '%s\n' "$pnpm_text" | awk -F. '{print $3}')
    case "$pnpm_major:$pnpm_minor:$pnpm_patch" in
        *[!0-9:]*|::*|*::|*::*:*) fail 28 "无法识别 pnpm 发布版本：$pnpm_text" ;;
    esac
    PNPM_VERSION=$pnpm_text
    if [ "$pnpm_major" -lt 11 ] || {
        [ "$pnpm_major" -eq 11 ] && [ "$pnpm_minor" -lt 24 ];
    }; then
        PNPM_STATUS=upgrade-required
        return
    fi
    PNPM_STATUS=passed
}

# Git 是所有初始化路径的基础工具；低于 2.0.0 时返回升级需求。
validate_git() {
    git_path=$1
    git_text=$("$git_path" --version 2>/dev/null) || fail 29 "Git 探测失败"
    git_release=$(printf '%s\n' "$git_text" | awk '{print $3}')
    git_major=$(printf '%s\n' "$git_release" | awk -F. '{print $1}')
    git_minor=$(printf '%s\n' "$git_release" | awk -F. '{print $2}')
    git_patch=$(printf '%s\n' "$git_release" | awk -F. '{print $3}')
    case "$git_major:$git_minor:$git_patch" in
        *[!0-9:]*|::*|*::|*::*:*) fail 29 "现有 Git 不是可识别的稳定发布版：$git_text" ;;
    esac
    GIT_VERSION=$git_text
    if [ "$git_major" -ge 2 ]; then
        GIT_STATUS=passed
    else
        GIT_STATUS=upgrade-required
    fi
}

# Linux 包管理器需要提权时只使用既有 sudo；不下载或安装新的包管理器。
run_git_package_manager() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
        return
    fi
    sudo_path=$(find_tool sudo 2>/dev/null || true)
    [ -n "$sudo_path" ] || fail 29 "安装 Git 需要既有 sudo 或管理员权限"
    "$sudo_path" "$@"
}

# 只通过宿主已有的受管包管理器安装或升级 Git，完成后由主流程重新探测。
install_git() {
    requested_change=$1
    git_host_os=$(uname -s 2>/dev/null) || fail 29 "无法为 Git 安装探测操作系统"
    case "$git_host_os" in
        Darwin)
            brew_path=$(find_tool brew 2>/dev/null || true)
            if [ -z "$brew_path" ]; then
                for brew_candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
                    if [ -x "$brew_candidate" ] && [ ! -d "$brew_candidate" ]; then
                        brew_path=$brew_candidate
                        break
                    fi
                done
            fi
            [ -n "$brew_path" ] || fail 29 "macOS 安装 Git 需要既有 Homebrew；门禁不会自动安装 Homebrew"
            printf '正在通过既有 Homebrew 安装或升级 Git。\n' >&2
            "$brew_path" install git || fail 29 "Homebrew 安装 Git 失败"
            brew_git_prefix=$($brew_path --prefix git 2>/dev/null || true)
            if [ -n "$brew_git_prefix" ] && [ -d "$brew_git_prefix/bin" ]; then
                GIT_BIN_DIR=$brew_git_prefix/bin
                PROBE_PATH=$brew_git_prefix/bin:$PROBE_PATH
            fi
            ;;
        Linux)
            git_manager=
            for manager_name in apt-get dnf yum zypper apk pacman; do
                manager_path=$(find_tool "$manager_name" 2>/dev/null || true)
                if [ -n "$manager_path" ]; then
                    git_manager=$manager_name
                    break
                fi
            done
            [ -n "$git_manager" ] || fail 29 "Linux 安装 Git 需要受支持的既有系统包管理器（apt-get/dnf/yum/zypper/apk/pacman）"
            printf '正在通过既有 %s 安装或升级 Git。\n' "$git_manager" >&2
            case "$git_manager" in
                apt-get)
                    run_git_package_manager "$manager_path" update || fail 29 "apt-get 更新软件包索引失败"
                    run_git_package_manager "$manager_path" install -y git || fail 29 "apt-get 安装 Git 失败"
                    ;;
                dnf|yum) run_git_package_manager "$manager_path" install -y git || fail 29 "$git_manager 安装 Git 失败" ;;
                zypper) run_git_package_manager "$manager_path" --non-interactive install git || fail 29 "zypper 安装 Git 失败" ;;
                apk) run_git_package_manager "$manager_path" add --no-cache git || fail 29 "apk 安装 Git 失败" ;;
                pacman) run_git_package_manager "$manager_path" --sync --needed --noconfirm git || fail 29 "pacman 安装 Git 失败" ;;
            esac
            ;;
        *) fail 29 "不支持在此 Unix 操作系统自动安装 Git：$git_host_os" ;;
    esac
    GIT_CHANGED=$requested_change
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

# 下载宿主匹配的官方 rustup-init，核对发布摘要后安装或升级 stable 并加入本次复探路径。
install_rust() {
    requested_change=$1
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
    printf '正在从 %s 安装或升级 Rust stable 到 %s（PATH 将添加 %s/bin）。\n' "$release_base" "$rustup_home" "$cargo_home" >&2
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
    RUST_CHANGED=$requested_change
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

# 从官方倒序索引选择当前最新满足门禁的稳定版，用于安装或升级。
install_node() {
    requested_change=$1
    command -v curl >/dev/null 2>&1 || fail 26 "安装 Node.js 需要 curl"
    command -v tar >/dev/null 2>&1 || fail 26 "安装 Node.js 需要 tar"
    host_node_tuple
    node_dist_base=${AFH_NODE_DIST_BASE:-https://nodejs.org/dist}
    TEMP_DIR=$(mktemp -d) || fail 26 "无法创建临时目录"
    index_path=$TEMP_DIR/index.tab
    download "$node_dist_base/index.tab" "$index_path" || fail 26 "Node.js 发布版本索引下载失败"
    node_version=$(awk -F '\t' '
        NR > 1 && $1 ~ /^v[0-9]+\.[0-9]+\.[0-9]+$/ {
            raw = substr($1, 2)
            split(raw, parts, ".")
            if ((parts[1] == 24 && parts[2] >= 15) || parts[1] >= 26) {
                print $1
                exit
            }
        }
    ' "$index_path")
    [ -n "$node_version" ] || fail 26 "Node.js 发布版本索引中没有满足 $NODE_REQUIREMENT 的稳定版"
    archive_name=node-$node_version-$node_platform-$node_arch.tar.gz
    archive_path=$TEMP_DIR/$archive_name
    sums_path=$TEMP_DIR/SHASUMS256.txt
    release_base=$node_dist_base/$node_version
    printf '正在安装或升级到最新满足门禁的稳定 Node.js %s，来源为 %s，目标为用户级目录。\n' "$node_version" "$release_base" >&2
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
    NODE_CHANGED=$requested_change
    cleanup
    TEMP_DIR=
}

# 仅在 GUI 项目中通过 Node 自带 npm 安装缺失 pnpm，或升级低于门禁的 pnpm。
install_pnpm() {
    requested_change=$1
    npm_path=$(find_tool npm 2>/dev/null || true)
    [ -n "$npm_path" ] || fail 28 "为 GUI 开发安装 pnpm 需要 npm"
    pnpm_home=${AFH_PNPM_HOME:-${HOME:?必须设置 HOME}/.local/share/agent-first-pnpm}
    mkdir -p "$pnpm_home" || fail 28 "无法创建 pnpm 安装根目录"
    printf '正在从官方 npm 软件包仓库安装或升级 pnpm %s 到用户级目录。\n' "$PNPM_INSTALL_REQUIREMENT" >&2
    PATH=$PROBE_PATH:$PATH "$npm_path" install --global --prefix "$pnpm_home" "$PNPM_INSTALL_REQUIREMENT" || fail 28 "pnpm 安装失败"
    PNPM_BIN_DIR=$pnpm_home/bin
    PROBE_PATH=$PNPM_BIN_DIR:$PROBE_PATH
    PNPM_CHANGED=$requested_change
}

git_path=$(find_tool git 2>/dev/null || true)
if [ -n "$git_path" ]; then
    validate_git "$git_path"
else
    GIT_VERSION=Missing
    GIT_STATUS=missing
fi

rustc_path=$(find_tool rustc 2>/dev/null || true)
cargo_path=$(find_tool cargo 2>/dev/null || true)
if [ -n "$rustc_path" ] && [ -n "$cargo_path" ]; then
    validate_rust "$rustc_path" "$cargo_path"
else
    RUST_VERSION=Missing
    CARGO_VERSION=Missing
    RUST_STATUS=missing
fi

if [ "$FRONTEND_REQUIRED" -eq 1 ]; then
    node_path=$(find_tool node 2>/dev/null || true)
    pnpm_path=$(find_tool pnpm 2>/dev/null || true)
    if [ -n "$node_path" ]; then
        validate_node "$node_path"
    else
        NODE_VERSION=Missing
        NODE_STATUS=missing
    fi
    if [ -n "$pnpm_path" ]; then
        validate_pnpm "$pnpm_path"
    else
        PNPM_VERSION=Missing
        PNPM_STATUS=missing
    fi
else
    NODE_VERSION=Not-required
    PNPM_VERSION=Not-required
    NODE_STATUS=not-required
    PNPM_STATUS=not-required
fi

if [ "$MODE" = check ]; then
    printf 'gate.git.status=%s\n' "$GIT_STATUS"
    printf 'gate.git.requirement=%s\n' "$GIT_REQUIREMENT"
    printf 'gate.git.version=%s\n' "$GIT_VERSION"
    printf 'gate.rust.status=%s\n' "$RUST_STATUS"
    printf 'gate.rust.version=%s\n' "$RUST_VERSION"
    printf 'gate.node.status=%s\n' "$NODE_STATUS"
    printf 'gate.node.requirement=%s\n' "$NODE_REQUIREMENT"
    printf 'gate.node.version=%s\n' "$NODE_VERSION"
    printf 'gate.pnpm.status=%s\n' "$PNPM_STATUS"
    printf 'gate.pnpm.requirement=%s\n' "$PNPM_REQUIREMENT"
    printf 'gate.pnpm.version=%s\n' "$PNPM_VERSION"
    [ "$GIT_STATUS" = passed ] &&
        [ "$RUST_STATUS" = passed ] &&
        { [ "$NODE_STATUS" = passed ] || [ "$NODE_STATUS" = not-required ]; } &&
        { [ "$PNPM_STATUS" = passed ] || [ "$PNPM_STATUS" = not-required ]; } || exit 20
    exit 0
fi

if [ "$GIT_STATUS" != passed ]; then
    git_change=upgraded
    [ "$GIT_STATUS" = missing ] && git_change=installed
    install_git "$git_change"
    git_path=$(find_tool git 2>/dev/null || true)
    [ -n "$git_path" ] || fail 29 "Git 安装完成后仍无法调用 git 可执行文件"
    validate_git "$git_path"
    [ "$GIT_STATUS" = passed ] || fail 29 "Git 安装或升级后仍低于门禁 $GIT_REQUIREMENT：$GIT_VERSION"
fi

if [ "$RUST_STATUS" != passed ]; then
    rust_change=upgraded
    [ "$RUST_STATUS" = missing ] && rust_change=installed
    install_rust "$rust_change"
    rustc_path=$(find_tool rustc 2>/dev/null || true)
    cargo_path=$(find_tool cargo 2>/dev/null || true)
    [ -n "$rustc_path" ] && [ -n "$cargo_path" ] || fail 22 "Rust 安装完成后仍无法调用 rustc 和 cargo"
    validate_rust "$rustc_path" "$cargo_path"
    [ "$RUST_STATUS" = passed ] || fail 22 "Rust 安装或升级后仍低于 MSRV $MIN_RUST_MAJOR.$MIN_RUST_MINOR.0：$RUST_VERSION"
fi

if [ "$NODE_STATUS" != passed ] && [ "$NODE_STATUS" != not-required ]; then
    node_change=upgraded
    [ "$NODE_STATUS" = missing ] && node_change=installed
    install_node "$node_change"
    node_path=$(find_tool node 2>/dev/null || true)
    [ -n "$node_path" ] || fail 26 "Node.js 安装完成后仍无法调用 node 可执行文件"
    validate_node "$node_path"
    [ "$NODE_STATUS" = passed ] || fail 26 "Node.js 安装或升级后仍不满足门禁 $NODE_REQUIREMENT：$NODE_VERSION"
fi

if [ "$PNPM_STATUS" != passed ] && [ "$PNPM_STATUS" != not-required ]; then
    pnpm_change=upgraded
    [ "$PNPM_STATUS" = missing ] && pnpm_change=installed
    install_pnpm "$pnpm_change"
    pnpm_path=$(find_tool pnpm 2>/dev/null || true)
    [ -n "$pnpm_path" ] || fail 28 "pnpm 安装完成后仍无法调用 pnpm 可执行文件"
    validate_pnpm "$pnpm_path"
    [ "$PNPM_STATUS" = passed ] || fail 28 "pnpm 安装或升级后仍低于门禁 $PNPM_REQUIREMENT：$PNPM_VERSION"
fi

changed=false
[ "$GIT_CHANGED" = existing ] || changed=true
[ "$RUST_CHANGED" = existing ] || changed=true
[ "$NODE_CHANGED" = existing ] || changed=true
[ "$PNPM_CHANGED" = existing ] || changed=true

printf 'gate.git.status=passed\n'
printf 'gate.git.requirement=%s\n' "$GIT_REQUIREMENT"
printf 'gate.git.version=%s\n' "$GIT_VERSION"
printf 'gate.git.change=%s\n' "$GIT_CHANGED"
printf 'gate.rust.status=passed\n'
printf 'gate.rust.version=%s\n' "$RUST_VERSION"
printf 'gate.rust.change=%s\n' "$RUST_CHANGED"
printf 'gate.node.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 1 ] && printf passed || printf not-required)"
printf 'gate.node.requirement=%s\n' "$NODE_REQUIREMENT"
printf 'gate.node.version=%s\n' "$NODE_VERSION"
printf 'gate.node.change=%s\n' "$NODE_CHANGED"
printf 'gate.pnpm.status=%s\n' "$([ "$FRONTEND_REQUIRED" -eq 1 ] && printf passed || printf not-required)"
printf 'gate.pnpm.requirement=%s\n' "$PNPM_REQUIREMENT"
printf 'gate.pnpm.version=%s\n' "$PNPM_VERSION"
printf 'gate.pnpm.change=%s\n' "$PNPM_CHANGED"
printf 'gate.changed=%s\n' "$changed"
if [ -n "$GIT_BIN_DIR" ] || [ -n "$CARGO_BIN_DIR" ] || [ -n "$NODE_BIN_DIR" ] || [ -n "$PNPM_BIN_DIR" ]; then
    path_prepend=
    for candidate in "$PNPM_BIN_DIR" "$NODE_BIN_DIR" "$CARGO_BIN_DIR" "$GIT_BIN_DIR"; do
        [ -n "$candidate" ] || continue
        case ":$path_prepend:" in
            *":$candidate:"*) ;;
            *) [ -n "$path_prepend" ] && path_prepend=$path_prepend:$candidate || path_prepend=$candidate ;;
        esac
    done
    printf 'gate.path.prepend=%s\n' "$path_prepend"
fi
