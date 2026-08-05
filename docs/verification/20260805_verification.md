# 2026-08-05 验证记录

## Harness `202608051301` 工程治理里程碑

### 候选与批准范围

- 路径：里程碑。项目负责人确认把 2026-08-05 当前全部未提交变更纳入验收，将 Harness 版本确定为 `202608051301`，并授权验收通过后提交和推送到 `origin/master`。
- 精确源码候选：`10d6a2de608587af58370282adbb0373e17648fc`，提交时间 `2026-08-05 13:16:52 +0800`，提交说明 `test: 允许验证证据持续增长`；其父提交包含 core-first、400 行门禁和版本提升主体。
- 真实候选：该提交包含完整 Harness 源树、治理与升级脚本、21 个项目 Skills、中性 Rust core+CLI 资产、版本事实和全部已触发项目记忆；不是模拟、桩、占位、开发预览或仅内部函数证据。
- 批准成功路径：core-first 与薄适配器规则一致传播；统一 400 行失败门禁可传播；升级器拆分保持来源、三方比较、路径与 TOCTOU 安全；版本事实统一为 `202608051301`。
- 最高风险失败路径：adapter 绕过 core、升级器弱化受管/保护边界、拆分丢失测试或历史证据、人工维护文本超过 400 行、版本摘要残留，以及候选提交或工作树漂移。

### 精确提交自动证据

- 环境：macOS 26.5.2（Build 25F84）arm64；Python 3.14.6；精确 MSRV `rustc 1.90.0 (1159e78c4 2025-09-14)`。
- 身份门禁：验收前后 `HEAD` 均为候选完整哈希，`git diff HEAD --exit-code`、`git diff --cached --exit-code` 和 `git status --porcelain=v1 --untracked-files=all` 均为空。
- `python3 -B -m unittest discover -s scripts -v`：111/111 通过，覆盖治理、发布、项目记忆、工作计划、工作流执行、文档分卷、行数和 core-first 正负向回归。
- `python3 -B .agents/skills/upgrade-harness/scripts/test_harness_upgrade.py -v`：28/28 通过，使用隔离 Git 夹具真实调用升级器的 plan/apply/record 路径。
- Skill Creator `quick_validate.py`：21/21 Skills 通过；21 个 `agents/openai.yaml` 解析通过；58 个 Python 文件 AST 解析和 5 个 POSIX Shell 文件语法检查通过。
- `python3 -B .agents/skills/implement-change/scripts/check_file_line_limits.py`：196 个人工维护文本文件全部不超过 400 行。
- `python3 -B scripts/validate_harness.py`：通过 88 个必需文件、21 个 Skills、本地 Markdown 链接、版本、项目记忆、里程碑、发布/构建、初始化、Worktree、core-first 和工作流门禁；0 个非阻断提示。
- 中性 Rust 资产在精确 1.90.0 上通过 `cargo fmt --all -- --check`、锁定依赖 workspace check、Clippy `-D warnings`、测试枚举、7/7 非空测试和锁定依赖 release 构建；真实 CLI 黑盒测试覆盖成功状态与未批准命令拒绝。
- `check_core_first.py` 使用精确 1.90.0 Cargo 的只读 metadata 对真实中性资产通过；`git diff --check` 通过。

### 失败修复与重跑

- 候选提交前首次默认回归为 110/111：活动计划已经声明里程碑路径，但缺少校验器要求的 `## 验证里程碑` 固定章节；完整 validator 同步失败。补齐准入、真实候选、替代品拒绝和失败回流后，默认回归与 validator 全量重跑通过。
- 首次暂存差异检查发现 9 个新拆分 Python 文件在 EOF 多一行空行；只移除多余空行，重新暂存后 `git diff --check`、行数门禁和 validator 通过，再创建候选提交。
- 首次源码候选 `fb85f7f` 的精确检查通过后，新增当日真实证据卷使“历史标题总数必须精确为 26”的守恒测试失败为 110/111。该失败重开验收：测试改为要求历史标题、复核人和审批边界数量不得低于既有基线，并继续逐项检查关键历史失败事实；全量回归通过后形成新候选 `10d6a2d`。
- 计划章节与 EOF 空行失败发生在首次候选前，证据增长断言失败发生在首次候选后的记录集成阶段；最终精确候选 `10d6a2d` 的全部必需检查一次完整通过，没有把任何失败或工作树证据改判为验收通过。

### 适用性、未执行项与结论

- Harness 根不包含具体最终产品；本候选的真实交付物是源码治理闭环、维护 CLI、校验器、Skills 和文档。产品启动冒烟与 Computer Use E2E 为 `Not applicable`，未运行且不记为通过。
- 未执行：Windows/Linux 本轮原生验证、真实下游前向升级、真实远端三平台候选矩阵、签名、公证、标签、源码归档、发布渠道上传和正式发布。对应范围保持 `Unverified` 或未发布。
- 当前版本保持 `Unreleased`；没有 `release/` 归档、SHA-256、manifest 或 Git tag，因此本结论不声明正式发布 `Ready`。
- 人工复核：项目负责人已在本次会话明确回复“确认”，批准上述范围、实际自动证据与剩余风险，并授权提交和推送；记录见 [`human_review.md`](human_review.md)。
- 里程碑结论：`Milestone accepted`。结论只绑定候选 `10d6a2de608587af58370282adbb0373e17648fc` 和本节范围。
