---
name: desktop-test-gui-initialization-e2e
description: 在含 GUI 的下游初始化提交前，构建并启动真实本机 Tauri 调试二进制，用 Computer Use 验证侧栏居中和全部菜单路由。
---

# GUI 初始化 E2E

只用于 `$desktop-initialize-rust-project` 已完成 GUI 脚手架和相关非空单元测试、但尚未裁剪初始化能力或创建基线提交的阶段。它是选择 `GUI` 后固定执行一次的初始化门禁，不读取也不询问 `milestone_e2e`，不替代最终候选的 `$desktop-test-final-artifact-e2e`。

## 前置条件

1. 当前目录必须同时是下游项目根和独立 Git 顶层目录，GUI 目录必须精确为 `<project-id>_gui`。
2. 读取项目 `AGENTS.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/RUST_CLI_TEMPLATE.md` 和 GUI 适配器基线。随后读取并使用已安装的 `computer-use` Skill；不得用开发预览、静态 HTML、Mock、单元测试或内部函数调用代替真实桌面窗口。
3. 只允许当前宿主上的本地调试构建和只读界面操作。不得签名、打包安装器、写入 `release/`、使用发布凭据、启用远程能力或产生业务副作用。

## 工作流程

1. 在 GUI 目录使用项目锁文件运行 `pnpm tauri build --debug --no-bundle`。命令失败、超时或零产物时立即失败；只有诊断明确属于受管环境问题时，才按 `$desktop-check-development-environment` 恢复并重试原命令一次。
2. 在项目根运行 `cargo metadata --format-version 1 --no-deps`，从返回的 `target_directory`、GUI package 的唯一 binary target 和当前宿主可执行文件后缀推导真实本机调试二进制。路径必须位于该 `target_directory`，文件必须存在、是普通非符号链接文件且可执行；候选缺失或不唯一时失败。禁止用模糊 glob、旧构建或 `pnpm tauri dev` 代替。
3. 由当前 Agent 启动该真实本机调试二进制并持有子进程句柄。最多等待 60 秒，直到出现可见主窗口且进程仍存活；启动前记录时间，拒绝早于本次构建的旧二进制。启动失败、主窗口不可见、立即退出或出现崩溃对话框时失败。
4. 使用 Computer Use 读取真实窗口和可访问名称，并保存初始截图。确认侧栏初始状态为默认收起；选中的本地 Logo、所有当前渲染的功能菜单图标以及赞助、设置、关于固定图标均可见、无裁切，并分别水平居中于收起侧栏。可取得元素边界时，元素中心与侧栏内容中心的水平差不得超过 2 个 CSS 像素；只能取得截图时，必须以同一侧栏中心线逐项复核，任何可见偏移、裁切或无法判定都按失败处理。
5. 从真实界面的可访问树枚举所有当前渲染的菜单项，不得只使用预先写死的路由清单。逐项通过可见界面激活，并验证：
   - 对应项成为当前活动项；
   - 目标页面渲染非空的可访问标题或主内容；
   - 页面没有空白、崩溃、404、未匹配路由或错误占位；
   - 固定 `/sponsor`、`/settings`、`/about` 三页全部包含在枚举结果中。
6. 每次导航后确认进程仍存活。保存能证明侧栏居中和全部菜单页面可达的最小截图集，记录菜单可访问名称、目标路径或页面身份及结果。
7. 无论成功、失败、超时或取消，都必须先请求应用安全退出；若未退出，则终止当前步骤拥有的子进程，并等待其完成回收。禁止遗留 detached task、后台进程或复用到下一次初始化的窗口。

## 通过条件

以下条件必须同时满足，否则阻断初始化裁剪和 `chore: initialize project` 基线提交：

- `pnpm tauri build --debug --no-bundle` 成功生成并启动了本次构建的真实本机调试二进制；
- 主窗口在限定时间内可见，且全程没有立即退出或崩溃；
- 默认收起侧栏中的 Logo 与每一个渲染图标均水平居中、可见且无裁切；
- 可访问树中枚举出的每一个菜单链接页面都可达，且 `/sponsor`、`/settings`、`/about` 均通过；
- 当前 Skill 拥有的进程已退出并被回收。

## 结果边界

- 在初始化最终回复中报告宿主、构建命令、调试二进制绝对路径、启动结果、居中检查、逐菜单页面结果、截图和未验证平台。
- 不创建 `docs/VERIFICATION.md` 或 `docs/verification/`，不把调试二进制称为发布候选、完整验收或交付就绪。
- 本 Skill 属于初始化专用能力；通过后必须与 `$desktop-initialize-rust-project` 一同从终端下游删除，失败时则保留现场且不得创建基线提交。
