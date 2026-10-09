---
name: desktop-enable-gui-updates
description: 在 Tauri 产品明确启用远程更新或强更时配置真实更新 profile、签名与受管状态机；初始化 updater 固定基线继续零出站，不由本入口重复安装。
---

# 启用 GUI 远程更新

仅 `interfaces` 含 GUI 且 `gui-framework = "tauri"`（既有 GUI 缺省兼容 Tauri）适用；GPUI updater 当前 unavailable，不套用 Tauri 插件。完整读取 [更新合同](references/update-contract.md)、[Rust 基线](../../../docs/RUST_CLI_TEMPLATE.md) 与当前受保护 GUI profile。

## 执行

1. 核对产品已批准启用更新、平台/渠道与副作用范围。缺失产品事实先在终端下游确认，Harness 源不收集真实 endpoint、公钥或凭据。直接实施先进入 `$desktop-implement-change`；已在其流程时复用上下文。
2. 复用 `$desktop-add-gui-updater` 已有的固定 plugin、`NotConfigured` 控制器与根级门。缺少任一必填事实仍 `NotConfigured`、零出站；保留 Skill 不启用远程更新。按 `$desktop-prepare-gui-support-surfaces` 创建或更新受保护 `docs/GUI_SUPPORT_SURFACES.md` 的出站清单，事实只存此处，不复制到通用模板。
3. 按合同绑定 HTTPS origin/路径、target/arch/channel、公钥、认证策略、超时/大小/并发与失败语义。私钥只用已批准安全运行时引用，客户端不得包含长期发布者秘密。官方 updater 的签名验证不可关闭，签名制品生成与候选安装验证仍属于构建/验收流程。
4. shared core 处理严格 SemVer 与认证事实的状态转换；adapter 拥有单飞检查、下载/安装与有界关闭回收；React 不比较版本。不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 只允许安装或安全退出，普通页面不挂载；检查/认证失败默认 fail-open，不能伪装为最新版，例外须独立批准离线与恢复风险。
5. 使用原支持 Skill 已有 `MandatoryUpdateGate`、更新展示与可选 banner 资产，只按批准视觉接线，不复制媒体或品牌来源。没有关于页时不增加隐藏手动入口，但根级强更门不依赖关于页。运行合同规定的受影响非空 core、adapter 与 UI 回归，再返回同一实施流程。

## 输出

报告真实配置状态、出站与签名引用、core/adapter/UI 归属、所有权和失败语义、实际回归与未验证安装平台。不执行生产检查、发布更新、安装或打包来代替独立授权；强更可用只能由真实安装候选证据证明。
