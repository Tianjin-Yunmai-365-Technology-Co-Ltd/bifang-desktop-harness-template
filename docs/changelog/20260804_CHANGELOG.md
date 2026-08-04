# 2026-08-04 变更记录

## 修复

- Harness 校验器现在把 Git 在 Windows 工作树中产生的 CRLF workflow 签出规范化为受审 LF 内容后再计算 SHA-256，避免把安全的行尾转换误判为模板篡改。
- Windows 上校验 Unix 环境门禁脚本时改读 Git 索引中的 `100755` 模式；macOS/Linux 仍检查真实文件系统执行位，跨平台来源门禁不再因 Windows 无法表示 POSIX 执行位而误报失败。

## 验证

- 新增两条跨平台签出回归，覆盖 CRLF workflow 成功路径、Git 可执行位成功路径和普通非可执行文件失败路径。
- 完整 Harness 校验器与既有 44 条校验器回归通过；未运行冒烟、E2E 或发布验收。

