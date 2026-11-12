# 终端下游创建流程

本页是 Harness 上游的阶段导航，不另定义问句、默认值、复制范围或通过条件。实际执行从 [实例化 Skill](../.agents/skills/desktop-instantiate-project/SKILL.md) 开始，并按其引用加载精确合同。创建完成的下游不保留本页和派生入口。

| 阶段 | 负责入口 | 形成的结果 |
|---|---|---|
| 识别源与范围 | [根入口](../AGENTS.md)、[实例化 Skill](../.agents/skills/desktop-instantiate-project/SKILL.md) | 区分 Harness 源与终端下游；产品需求留待下游根目录处理 |
| 收集与确认 | [唯一表单合同](../.agents/skills/desktop-instantiate-project/references/initialization-form.md)、`initialization_form.mjs`、[目标路径解析器](../.agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs) | 固定字段、条件选择、唯一目标根与绑定确认的汇总；确认前零写入 |
| 冻结并准备工程层 | [确定性准备合同](../.agents/skills/desktop-instantiate-project/references/deterministic-instantiation.md)、`instantiate_project.mjs`、`instantiation_files.mjs` | 从受管源文件生成计划，再按同一摘要复制、重置身份和策略；尚未完成初始化 |
| 建立中性工作区 | [Rust 初始化 Skill](../.agents/skills/desktop-initialize-rust-project/SKILL.md) 与实际选择的 [接口 Skill 索引](../.agents/skills/README.md) | 共享 core、所选薄适配器、Cargo 平台/接口事实、适用桌面配置与版本状态 |
| 检查真实脚手架 | [Rust 初始化 Skill](../.agents/skills/desktop-initialize-rust-project/SKILL.md)、所选 Tauri/NSH 初始化 E2E Skill | 相关非空测试和适用本机调试构建/Computer Use 结果；脚手架结果不等于产品候选验收 |
| 裁剪为终端项目 | [确定性裁剪合同](../.agents/skills/desktop-instantiate-project/references/deterministic-instantiation.md)、`finalize_instantiation.mjs`、`instantiation_pruning.mjs` | 删除一次性入口和未选能力，重建与实际保留 Skills 一致的下游 `AGENTS.md`；仍为 pre-Git |
| 建立独立基线 | [Rust 初始化 Skill](../.agents/skills/desktop-initialize-rust-project/SKILL.md)、[本地提交身份 Skill](../.agents/skills/desktop-configure-git-commits/SKILL.md) | 在唯一目标根建立独立 `main`、唯一中性基线提交和干净工作区 |
| 后续工程升级 | [升级 Skill](../.agents/skills/desktop-upgrade-harness/SKILL.md)、[所有权策略](../.agents/skills/desktop-upgrade-harness/references/ownership-policy.md) | 根据受保护 Cargo 选择和所有权清单预览适用候选，保护产品代码、策略、身份和记忆 |

## 资料如何随项目移动

- [实例化文件选择](../.agents/skills/desktop-instantiate-project/scripts/instantiation_files.mjs) 决定初次固定复制范围；[裁剪](../.agents/skills/desktop-initialize-rust-project/scripts/instantiation_pruning.mjs) 决定终端保留集合；[升级接口筛选](../.agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_interfaces.mjs) 与[所有权清单](../.agents/skills/desktop-upgrade-harness/references/ownership-manifest.json) 决定后续传播。改动路径或分类时须同时核对这四处和相应回归。
- `.agents/skills/<name>/SKILL.md` 是当前发现、复制、裁剪和升级所依赖的稳定路径。分类见 [Skills 索引](../.agents/skills/README.md)，不通过移动顶层目录表达分类。
- 源 Harness 的日期记忆、时间版本、发布/验证事实及忽略的 `knowledge/` 技术快照不进入中性下游。下游完成基线后，在其唯一根目录按真实事件定义产品、实施功能与生成自己的记录。
