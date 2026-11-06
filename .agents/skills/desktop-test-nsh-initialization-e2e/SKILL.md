---
name: desktop-test-nsh-initialization-e2e
description: 在 NSH 中性下游基线前执行非空 Rust/NSH 测试、真实本机打包与 Computer Use 初始化检查，完成后删除本入口。
---

# NSH 初始化真实检查

只在根 Cargo `interfaces = ["nsh"]` 且尚未裁剪/创建唯一基线时调用；旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 的既有下游按原事实读取。不消费候选 E2E 偏好，不生成产品验收结论。先读 `nsh-targets`、具体目标平台和 `$desktop-add-nsh-adapter` 的运行时引用；只有选择桌面时读取生成的 `docs/GUI_APP_PROFILE.md`。

1. `cargo test --workspace --all-targets --all-features` 必须非空；`nsh check` 与 `nsh test App.test.tsx` 必须通过。NSH 渲染树验证真实组件，但不能替代所选目标的真实运行。固定 NSH 0.4.0 没有 TUI 运行或打包目标，`nsh-targets` 含 `tui` 时立即失败关闭。
2. 选择桌面时运行 `nsh package <NSH目录> --target <已选本机桌面> --out <忽略的唯一临时目录>`，启动实际 app；使用 Computer Use 检查双语标题、设置、Light/Dark/System、所选侧栏展开折叠、条件关于/赞助页面和禁用入口缺席。点击控件周围不得触发；切页保留状态，真正退出后会话重置，已保存界面偏好保持。关闭最后窗口必须结束；若宿主默认行为不同，修正原生宿主后重跑，不把仅关窗当退出。
3. 选择 Web 时运行实际 `nsh package --target web`，用本地静态服务器和浏览器检查完整包、窄屏、按钮及主题。选择移动时以可用模拟器/设备执行真实构建与安装；不可用设备/宿主明确 Not verified，不能把桌面或 headless 测试当移动通过。用户要求全流程时持续修复可执行范围；不可得硬前置如签名/目标宿主如实报告。
4. 仅选择桌面时核对六项不可用宿主能力保持 disabled，无依赖/界面占位；初始壳层不发送通知、注册登录项或系统热键。还原本次修改的偏好，退出本次进程，保留脱敏的工程测试证据。测试专用夹具不得伪装正式品牌或产品。

初始化编排继续复制规范、保留适用 Skills、建立受保护版本状态、裁掉初始化目录和本 Skill，最后创建独立 main 唯一基线与 clean 工作树。缺少真实本机观察时不得宣称初始化 E2E 通过。后续最终候选使用 `$desktop-test-final-artifact-e2e`。
