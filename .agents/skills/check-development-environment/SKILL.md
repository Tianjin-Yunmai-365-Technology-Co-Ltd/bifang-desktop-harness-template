---
name: check-development-environment
description: 在首次开发时检查并安装下游开发工具链；Rust 始终为必需项，GUI 还必须具备 Node.js 和 pnpm。
---

# 检查开发环境

建立开发工具链，不依赖生成下游项目后会被删除的初始化 Skills。

## 工作流程

1. 读取 `AGENTS.md`、`docs/project_status/README.md` 和日期最新的产品状态、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、已选接口记录，以及 `docs/VERIFICATION.md` 中日期最新的相关条目。
2. 必须在首次修改代码的开发任务前运行。当已选接口、MSRV、前端工具链策略、宿主系统或已记录的环境证据发生变化时，必须再次运行。当前宿主证据仍然匹配时，不得仅因开始新会话而重复运行。
3. 读取 [references/development-environment-gates.md](references/development-environment-gates.md)。在 macOS/Linux 上运行 `scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`；在 Windows 上运行 `scripts/development-environment-gates.ps1 -Interfaces <selection>`。
4. Rust 始终是阻断门禁。在 Windows 上，Rust 目标所需的 MSVC C++ 工作负载同样是阻断门禁。缺失的前置项必须从门禁编码的已验证官方来源安装，然后重新探测；绝不得静默替换现有的不兼容工具链。
5. 仅当已记录的接口选择包含 `GUI` 时，Node.js 和 pnpm 才是阻断门禁。对于不含 GUI 的项目，必须把两者都报告为 `not-required`，并且不得探测、安装、升级或添加它们。
6. 在 `docs/VERIFICATION.md` 中记录宿主、已选接口指纹、观测到的版本、安装变更、最终状态和所有未验证平台。不得记录不必要的用户主目录路径或敏感信息。
7. 必需门禁受阻时必须停止开发任务。门禁成功只授权继续开发，不构成构建、测试、产物、验收或人工复核证据。

## 持久不变量

- 本 Skill 及其脚本在下游初始化后必须保留。
- 即使 `$instantiate-project` 和 `$initialize-rust-project` 已被删除，`AGENTS.md` 仍必须把首个适用的开发任务路由到本 Skill。
- 环境结果与当前宿主及已选接口指纹绑定；不得把该结果推断到未经检查的 Windows、macOS 或 Linux 宿主。

## 完成输出

报告已选接口、必需和 `not-required` 工具、观测版本、自动安装、阻断失败、当前宿主证据位置和未验证平台。
