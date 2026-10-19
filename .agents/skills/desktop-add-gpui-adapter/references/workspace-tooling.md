## 根 pnpm 工程入口

[gpui_node_tooling.mjs](../scripts/gpui_node_tooling.mjs) 的 `renderGpuiPackageJson(existingBytes = null)` 是标准库纯函数。新 `package.json` 为 `private: true`，仅声明 `engines.node = ">=24.21.0"`、`engines.pnpm = ">=12.4.1"` 和以下脚本；无 npm 依赖，无需先执行安装。已有 package 的公开性、`packageManager`、用户脚本、依赖和其他字段原样保留，只添加缺失的工程脚本与 engine。非等值同名脚本或 engine（包括更严格范围）、重复 JSON 键、非法内容及链接都在任何写入前失败；不得降低已有要求或新增精确 `packageManager` pin。add-only 在安装前复核 package/Cargo/core 快照并在失败时撤销本次文件。

| 命令 | 实际行为 |
| --- | --- |
| `pnpm dev` | [gpui_dev.mjs](../scripts/gpui_dev.mjs) 从 `packaging/gpui.json` 与 Cargo metadata 解析实际 GUI package/binary，监听工作区 Rust/Cargo、`.cargo`、词典和资源变化，防抖后增量编译并自动重启调试应用；不要求安装额外 watcher。 |
| `pnpm run validate` | [gpui_validate.mjs](../scripts/gpui_validate.mjs) 串行汇总保留的文件行数、Rust 中文声明注释和 `check_core_first.mjs --workspace-root .` 工程门禁，返回首个非零状态；不依赖源专属 runner。 |
| `pnpm run test` | `cargo test --workspace --all-targets --all-features`。 |
| `pnpm run release:inspect` | `release_git.mjs inspect --project-root .`，只读工作区快照。 |
| `pnpm run release:notes check --file release-notes.json` | 原更新日志 helper；`upsert`、`render` 及其参数仍遵守原发布 Skill。 |
| `pnpm run release:context check --project-root .` | 原发布上下文 helper；`write`、`verify` 及其必填参数保持不变。 |
| `pnpm run release:git --version <version> --release-context-sha256 <sha256>` | 原 `git_lifecycle.mjs release --project-root .`；只在明确发布授权后调用，版本与上下文摘要门禁不可省略。 |
| `pnpm run gpui:package preview --root .` | 原独立 GPUI 构建 helper；`setup`、`icons`、`build` 与 E2E/签名/候选边界仍由构建 Skill 管理。 |

升级继续把根 `package.json` 视为 protected，不由通用升级器覆盖。确认需要迁移入口后，显式运行 `node .agents/skills/desktop-add-gpui-adapter/scripts/merge_gpui_node_tooling.mjs merge --root .`；该受限迁移仅接受已有 GPUI workspace 和实际保留工具，只写 package，冲突零写入，重复调用保留文件原字节。pnpm 参数直接跟在脚本后，不添加额外 `--` 分隔。

`dev` 是原生 Rust 的保存后重编译/重启，进程内 Entity/页面临时状态随重启重置；不声明保留状态的进程内 HMR。官方 [GPUI Shell 的热重载](https://gpui-kit.com/shell/getting-started/) 属于额外 JavaScript runtime，当前纯 Rust 模板不接入该 runtime。首次启动及词典/静态资源变化时，只用 `cargo clean --package <GUI> --profile dev` 刷新所选 GUI 的调试缓存，避免旧 build.rs 或过程宏未声明外部资源依赖而重用旧字节；其余 Rust 变化使用 Cargo 增量构建。默认排除 `.git`、`.agents`、`.harness`、实际 Cargo target、`node_modules`、`release`、`dist` 与缓存，资源目录支持任意文件格式及增删。编译失败继续监听并在后续保存重试；编译期间保存追加构建且不启动过时产物。重编译前先停止 owned 应用，兼容 Windows exe 锁和单实例；Ctrl+C/SIGTERM 回收 owned 构建与应用进程。应用参数用 `pnpm dev -- <应用参数>`，按数组直传，不经额外 Shell。tracked Cargo 锁策略要求既有 Cargo.lock 并使用 `--locked`。修改开发循环运行 `node --test .agents/skills/desktop-add-gpui-adapter/scripts/gpui_dev.test.mjs`；真实 Cargo 工程回归只证明开发工具行为，不代替原生窗口或最终候选验收。

