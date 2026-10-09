---
name: desktop-test-gpui-initialization-e2e
description: 在 GPUI 中性下游初始化基线提交前执行真实本机调试构建与 Computer Use，验证已选壳层及原生能力；不作为最终候选验收，初始化后删除。
---

# GPUI 初始化 E2E

仅由新下游初始化流程调用，独立于 `e2e_hint`，不得用候选构建的 E2E 选择跳过。读取 [GPUI 标准](../../../docs/design_standards/gpui_gui.md)、[adapter Skill](../desktop-add-gpui-adapter/SKILL.md) 及其 [原生能力合同](../desktop-add-gpui-adapter/references/native-capabilities.md)，不加载 Tauri 插件/ACL 或前端检查。

## 执行

1. 确认唯一终端下游根、根 Cargo 的 GPUI/GUI/目标平台和真实 GUI member/binary。新实例化此时不得提前 Git 初始化；已有自身 Git 时顶层必须精确匹配，父仓库不是目标边界。
2. 使用 [profile 解析器](../desktop-add-gpui-adapter/scripts/gpui_profile.mjs) 核验唯一九字段、固定顺序、深链接 disabled、空中性快捷键合同和实际身份。只消费已经确认的选择，不补写、默认或重问。
3. 先确认测试发现非空，再运行 `pnpm run test` 与真实 `cargo build --workspace`；tracked 时先核验锁，改用显式 `cargo test --workspace --all-targets --all-features --locked` 与 `cargo build --workspace --locked`，不得把裸 pnpm 脚本当冻结解析。按 Cargo JSON 构建消息或真实 metadata 定位实际可执行文件，不猜 target 路径。失败修复本范围后重跑，不以源码检查替代构建。
4. 当前模板没有偏好目录 override，不能改写 HOME。确认无其他同 ID 进程后，对精确应用 ID 的偏好目录做可恢复快照与受控隔离；若项目已有真实隔离入口才使用它，无法安全隔离/恢复则阻断。单实例探针共用同一受控目录，日志按真实平台路径观察并保留本次证据。启动实际调试进程并持有句柄；最多等待 60 秒直到窗口可见。Computer Use 观察 Logo/动态双语标题、实际版本、窗口尺寸/恢复、语言与三态主题、所选侧栏与折叠、设置和条件关于/赞助页；分别点击控件与周围区域，确认动作不串扰。
5. 按选择验证五项能力：托盘实际创建才关闭隐藏，否则最后窗口关闭退出；单实例只恢复窗口；通知偏好默认关闭，不自动发产品通知；自启读取真实状态、错误/重试与显式切换后复读；空快捷键合同零注册，只有已批准安全绑定才触发真实按键。禁用项核对实现/依赖/词典/入口缺席。深链接、updater/dialog unavailable 如实报告，不虚构通过。
6. 关闭和重启观察偏好恢复、owned worker/进程回收与最终日志真实刷新。切换自启前保存原登录项完整可恢复事实（存在性、目标/参数、平台开关，必要时精确 plist 或当前用户注册表值）；无法取得快照则不执行切换，不把只读/单测记为切换通过。无论成功失败，先退出并回收 owned worker/进程，再恢复原登录项和偏好原字节/值并复读，仅清理本次 owned 快捷键和测试目录，不碰其他登录项；恢复失败阻断基线。调试进程不能证明已安装签名候选的通知横幅或打包权限，单列 `Unverified`。
7. 报告真实本机结果、截图/观察、退出与恢复证据。完成后交初始化器裁剪本 Skill 与源专用入口，再创建唯一基线提交；已初始化下游不得恢复它。最终候选另走 `$desktop-test-final-artifact-e2e`，不将本结果写成候选通过。

## 输出

列出九项配置、实际测试/二进制、观察结果、OS 状态恢复、残留检查及未验证平台。某已选能力无法观察或判定时保持初始化未完成。
