# 项目 Skills 索引

本索引按职责定位 Skill。真正的执行条件、输入和验证步骤只在对应 `SKILL.md` 与其按需引用中定义；先从根 [AGENTS.md](../../AGENTS.md) 判断任务，再读取命中的 Skill。`.agents/skills/<名称>/SKILL.md` 是实例化、裁剪和升级使用的稳定路径，因此分类不改变目录层级。下游只保留已选接口适用的 Skill；初始化专用 Skill 在基线前裁剪。

## Skills 索引

### 创建与身份

固定表单、工程准备、所选接口初始化、身份及初始化验收。创建流程见 [项目创建索引](../../docs/PROJECT_CREATION.md)。

- [`$desktop-instantiate-project`](desktop-instantiate-project/SKILL.md)、[`$desktop-initialize-rust-project`](desktop-initialize-rust-project/SKILL.md)、[`$desktop-check-development-environment`](desktop-check-development-environment/SKILL.md)、[`$desktop-rename-project-identity`](desktop-rename-project-identity/SKILL.md)。
- [`$desktop-test-gui-initialization-e2e`](desktop-test-gui-initialization-e2e/SKILL.md)、[`$desktop-test-gpui-initialization-e2e`](desktop-test-gpui-initialization-e2e/SKILL.md)、[`$desktop-test-nsh-initialization-e2e`](desktop-test-nsh-initialization-e2e/SKILL.md)：仅在相应初始化路径使用。

### 接口适配

每个接口 Skill 只处理共享 core 到所选宿主的接线；NSH 与 CLI、MCP、DESKTOP 平级。

- [`$desktop-add-cli-adapter`](desktop-add-cli-adapter/SKILL.md)、[`$desktop-add-mcp-adapter`](desktop-add-mcp-adapter/SKILL.md)、[`$desktop-add-gui-adapter`](desktop-add-gui-adapter/SKILL.md)、[`$desktop-add-gpui-adapter`](desktop-add-gpui-adapter/SKILL.md)、[`$desktop-add-nsh-adapter`](desktop-add-nsh-adapter/SKILL.md)。

### 桌面能力与呈现

先由 Cargo 的接口和框架选择定位能力。`desktop-add-gui-*` 与 Mantine 只适用于 Tauri；共享支持页资产适用于 Tauri 与 NSH 桌面。身份 Skill 只用于 DESKTOP/NSH desktop，i18n 抽取 Skill 只用于 Tauri/GPUI；NSH 的语言接线由自身 adapter 负责。GPUI、NSH 的宿主能力各读其适配器合同。

- [`$desktop-add-gpui-autostart`](desktop-add-gpui-autostart/SKILL.md)、[`$desktop-add-gui-autostart`](desktop-add-gui-autostart/SKILL.md)、[`$desktop-add-gui-deep-link`](desktop-add-gui-deep-link/SKILL.md)、[`$desktop-add-gui-dialog`](desktop-add-gui-dialog/SKILL.md)、[`$desktop-add-gui-global-shortcut`](desktop-add-gui-global-shortcut/SKILL.md)。
- [`$desktop-add-gui-single-instance`](desktop-add-gui-single-instance/SKILL.md)、[`$desktop-add-gui-system-locale`](desktop-add-gui-system-locale/SKILL.md)、[`$desktop-add-gui-system-notifications`](desktop-add-gui-system-notifications/SKILL.md)、[`$desktop-add-gui-system-tray`](desktop-add-gui-system-tray/SKILL.md)、[`$desktop-add-gui-window-state`](desktop-add-gui-window-state/SKILL.md)。
- [`$desktop-prepare-gui-app-identity`](desktop-prepare-gui-app-identity/SKILL.md)、[`$desktop-prepare-gui-support-surfaces`](desktop-prepare-gui-support-surfaces/SKILL.md)、[`$desktop-extract-i18n-strings`](desktop-extract-i18n-strings/SKILL.md)、[`$mantine-list-view`](mantine-list-view/SKILL.md)。

### 开发与架构

日常实现、结构整理、具体 I/O 能力与有证据的依赖、性能和 core 边界工作。

- [`$desktop-add-external-process`](desktop-add-external-process/SKILL.md)、[`$desktop-add-file-operations`](desktop-add-file-operations/SKILL.md)、[`$desktop-implement-change`](desktop-implement-change/SKILL.md)、[`$desktop-refactor-code`](desktop-refactor-code/SKILL.md)。
- [`$desktop-manage-dependencies`](desktop-manage-dependencies/SKILL.md)、[`$desktop-manage-gpui-dependencies`](desktop-manage-gpui-dependencies/SKILL.md)、[`$desktop-optimize-gpui-performance`](desktop-optimize-gpui-performance/SKILL.md)、[`$desktop-review-core-boundaries`](desktop-review-core-boundaries/SKILL.md)。

### Task 与并行

`desktop-task-workflow` 是唯一操作合同；另外三个名称只保留兼容入口。项目开关决定是否自动创建左侧 Task。

- [`$desktop-task-workflow`](desktop-task-workflow/SKILL.md)、[`$desktop-manage-user-tasks`](desktop-manage-user-tasks/SKILL.md)、[`$desktop-manage-task-worktrees`](desktop-manage-task-worktrees/SKILL.md)、[`$desktop-run-parallel-worktrees`](desktop-run-parallel-worktrees/SKILL.md)。

### 知识与决策

规格、技术快照、项目记忆各有独立触发条件和事实来源；知识分层见 [文档索引](../../docs/README.md)。

- [`$desktop-define-product`](desktop-define-product/SKILL.md)、[`$desktop-extract-technical-docs`](desktop-extract-technical-docs/SKILL.md)、[`$desktop-curate-harness-memory`](desktop-curate-harness-memory/SKILL.md)、[`$desktop-summarize-development-history`](desktop-summarize-development-history/SKILL.md)。
- [`$desktop-record-adr`](desktop-record-adr/SKILL.md)、[`$desktop-plan-change`](desktop-plan-change/SKILL.md)、[`$desktop-handoff-project`](desktop-handoff-project/SKILL.md)。

### 版本、策略与 Git

永久偏好、提交、版本与发布周期分别由精确 Skill 管理；升级只更新受管工程层。

- [`$desktop-configure-agent-policy`](desktop-configure-agent-policy/SKILL.md)、[`$desktop-configure-git-commits`](desktop-configure-git-commits/SKILL.md)、[`$desktop-manage-git-lifecycle`](desktop-manage-git-lifecycle/SKILL.md)。
- [`$desktop-manage-version`](desktop-manage-version/SKILL.md)、[`$desktop-switch-post-release-action`](desktop-switch-post-release-action/SKILL.md)、[`$desktop-upgrade-harness`](desktop-upgrade-harness/SKILL.md)。

### 构建、发布与验收

发布准备、平台打包、制品收集与最终验收按独立请求和实际接口选择；初始化 E2E 已列在创建类。制品收集 Skill 只处理 CLI/Tauri/GPUI 的扁平候选，NSH 批次由其构建 Skill 校验；Rust CLI 构建与跨平台矩阵只随 CLI 保留。

- [`$desktop-build-gpui-release`](desktop-build-gpui-release/SKILL.md)、[`$desktop-build-nsh-release`](desktop-build-nsh-release/SKILL.md)、[`$desktop-build-rust-release`](desktop-build-rust-release/SKILL.md)、[`$desktop-build-tauri-local-install`](desktop-build-tauri-local-install/SKILL.md)、[`$desktop-build-tauri-release`](desktop-build-tauri-release/SKILL.md)。
- [`$desktop-collect-release-artifacts`](desktop-collect-release-artifacts/SKILL.md)、[`$desktop-inspect-release-notes`](desktop-inspect-release-notes/SKILL.md)、[`$desktop-prepare-cross-platform-release`](desktop-prepare-cross-platform-release/SKILL.md)、[`$desktop-prepare-release`](desktop-prepare-release/SKILL.md)。
- [`$desktop-test-final-artifact-e2e`](desktop-test-final-artifact-e2e/SKILL.md)、[`$desktop-verify-delivery`](desktop-verify-delivery/SKILL.md)。
