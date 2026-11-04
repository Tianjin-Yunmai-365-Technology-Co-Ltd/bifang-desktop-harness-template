---
name: desktop-extract-technical-docs
description: 从当前项目的源码、配置和已有记录提取技术知识，以 knowledge/README.md 为入口，整理技术选型、依赖清单、项目架构、文件结构和当前技术债，并调用 archify 生成可交互架构图；缺失时安装项目本地 archify。
---

# 提取项目技术文档

把当前工作区的技术现状整理为可追溯的知识快照，产物统一放到该工作区根的 `knowledge/`。适用于首次提取及后续刷新；不因普通开发自动重跑。

## 工作区与事实

- 复用当前任务已确认的唯一项目根；有 Git 时核对顶层、HEAD 和工作区差异。多根工作区只处理用户指定或当前会话绑定的项目，不向父目录猜测一个 `Workspace` 文件夹。
- Harness 源只提取其工程层，明确区分模板能力、中性资产与真实下游产品。读取项目入口后按源码路径渐进取证，不运行项目、不安装项目依赖、不触发构建或发布。
- 阅读 [内容与证据合同](references/content-contract.md)。先追踪真实入口、清单、模块调用和状态写入，再编写结论。配置声明、源码存在、实际测试通过是不同证据；没有依据的选型动机、依赖解析版本和缺陷保持“待确认”。
- `knowledge/` 是派生快照，既有规格、ADR、技术债等继续是权威来源。刷新前检查现有文件，更新对应产物，保留用户附加内容；有无法合并的手写内容时保留原件，在概览说明实际更新范围，不清空整个目录。

## 固定交付入口

| 路径（相对工作区根） | 内容 |
|---|---|
| `knowledge/README.md` | 项目一句话概览、提取日期、范围、HEAD/dirty 状态、阅读导航、关键发现、未知项及图的实际检查状态 |
| `knowledge/technology.md` | 技术选型、用途、声明版本与来源；有 ADR 才写选型理由和取舍 |
| `knowledge/dependencies.md` | 各清单直接依赖、作用域、版本约束、来源；锁文件存在时另列可证明的解析版本和传递依赖范围 |
| `knowledge/architecture.md` | 系统边界、模块职责、依赖方向、主要执行/数据路径、存储与外部交互，以及交互图链接 |
| `knowledge/file-structure.md` | 按职责说明的实际目录树，注明省略项；不把构建缓存、第三方包展开成源码结构 |
| `knowledge/technical-debt.md` | 当前已登记债务、有证据的新发现、影响和处理建议，区分待确认风险与已确认问题 |
| `knowledge/diagrams/architecture.html` | 由 archify 交付的独立可交互架构图 |
| `knowledge/diagrams/architecture.json` | 与 HTML 对应的 archify candidate，便于重新生成 |

专题页都链接回 `README.md`，概览链接全部专题及 HTML。图的 delivery/finalize/browser 证据也留在 `knowledge/diagrams/`；若修复需要 review 目录，仍放在这里。文档使用可移植相对链接。

## Archify 依赖与交互图

1. 使用 [项目本地安装流程](references/archify-installation.md) 确保完整 archify 包可用。项目已有可用安装就复用；当前项目缺少时优先从已安装的用户级包复制到本项目隔离目录，没有可复用包才从官方仓库获取。不要复制单独 `SKILL.md` 代替运行时。
2. 告知用户本次使用 archify，完整读取实际安装的 `SKILL.md`。代码库图按它的 repository authoring、authoring defaults、architecture 示例与必要 schema 取证和建模；遵守其 `finalize`、失败修复与更新提示合同。本 Skill 指定的输出目录覆盖其默认 `.archify/` 目录。
3. 从工作区根调用该包的实际 `bin/archify.mjs`，候选与输出使用上表路径，首次 finalize 就传 `--repo-root <工作区根>`。不要硬编码用户主目录、全局命令或 Archify schema 字段；跟随实际版本的 Skill。
4. 文档可描述当前工作树；图的源码证据必须绑定实际提交。未提交修改影响架构时，在文档中列出差异，并明确图只覆盖哪个已提交版本；不为取证自动提交用户工作。无 Git、无 origin 或其他证据条件不足时，按 archify 合同选择诚实的非仓库证据图并标明限制，不伪造 URL、SHA 或来源。
5. 非零退出不是成功；失败时按 archify 的有界修复合同处理。无法通过时保留已完成文档、失败证据和明确的未交付状态，不用静态图或旧 HTML 冒充本次交互图。只有真实通过的收据才能写“自动检查通过”；视觉审查单独报告。

## 收尾

检查导航和相对链接确实存在，依赖清单覆盖实际发现的清单，架构结论有源码依据，债务区分事实与推断，文件树来自实际路径。确认知识目录未包含秘密、环境变量值、用户数据或认证 URL；只描述配置键和职责。

交付时链接工作区内真实的 `knowledge/README.md` 和交互图，简述范围、图的实际状态及关键未知项。提取和刷新不修改项目业务代码、原始记忆或技术债权威记录；新增本 Skill 本身的工程维护仍遵守项目开发流程。
