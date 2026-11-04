# 项目本地 Archify

依赖是完整的 [Archify 官方 Skill 包](https://github.com/tt-a1i/archify)，并非 npm 同名库。官方路径核对日期：2026-11-04。安装只在执行技术提取而当前项目缺少该包时触发，不随 Harness 初始化预装或自动升级。

在工作区根执行：

```text
node .agents/skills/desktop-extract-technical-docs/scripts/install_archify.mjs --project-root .
```

helper 优先复用 `.agents/skills/archify/` 或`.harness/skills/archify/`；缺少时从当前 `CODEX_HOME/skills/archify`、用户 `.agents/skills/archify` 或 `.codex/skills/archify` 复制完整包到`.harness/skills/archify/`。JSON 返回实际路径、版本和来源。它使用 Node 标准库，不安装项目包、不改全局环境，也不覆盖已有目录。

出现 `archify-source-missing` 时，读取官方仓库的当前发布/安装说明，确认包含 `SKILL.md`、`bin/archify.mjs` 和 `package.json` 的实际包目录。使用 Git 将官方仓库取得到系统临时目录，再显式传包目录：

```text
node .agents/skills/desktop-extract-technical-docs/scripts/install_archify.mjs --project-root . --source <已核对的完整包目录>
```

不要把整个上游仓库当成 Skill 包。保留包内 LICENSE 和第三方声明；记录实际 upstream revision（网络取回时）、来源及版本到 `knowledge/dependencies.md`。不引入第三方下载库，不执行安装包提供的 shell 脚本，不升级已有包。网络或源不可用时报告实际阻断及已交付文档范围。

安装器在提交安装前检查架构工作流必需资源与 CLI 的 `--help` 加载，拒绝缺失资源、符号链接和冲突目标；该检查不代替图的 finalize。若已有损坏/不兼容包，保留并报告，不能把失败解释为“缺失”然后覆盖。安装成功后读取返回路径的 `SKILL.md`，使用返回路径内的 CLI；隔离包由本 Skill 显式加载，不依赖宿主自动发现。

`.harness/skills/archify/` 是按需安装的第三方资产，由根 `.gitignore` 排除；新下游必须保留该忽略项，初始化不复制此目录。受管升级保护本地包和 `knowledge/`，不会以 Harness 内容覆盖它们。
